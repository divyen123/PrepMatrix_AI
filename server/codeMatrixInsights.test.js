import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  CODE_MATRIX_INSIGHTS_ACTIVITY, CODE_MATRIX_INSIGHTS_ATTEMPTS, createInsightAccumulator,
  insightWindow, normalizeInsightActivity, normalizeInsightAttempt, readCodeMatrixInsights,
  recordInsightActivity, recordInsightAttempt,
} from './codeMatrixInsights.js';
import { registerCodeMatrixInsightsRoutes } from './codeMatrixInsightsRoutes.js';
import { AcademicProfileScopeError, PROFILE_SCOPED_OWNED_COLLECTIONS } from './profileDataScope.js';

const now = new Date('2026-09-29T12:00:00Z');
const scope = { userId: 'student', academicProfileId: 'profile-a' };
const sessionId = randomUUID();
const attempt = (extra = {}) => ({ attemptId: randomUUID(), sessionId, language: 'python', surface: 'page', context: 'manual', revisionHash: 'a'.repeat(64), status: 'success', errorCategory: 'none', durationMs: 20, startedAt: '2026-09-29T10:00:00Z', version: 1, ...extra });
const activity = (extra = {}) => ({ activityId: randomUUID(), sessionId, language: 'python', surface: 'page', context: 'manual', startedAt: '2026-09-29T10:00:00Z', activeSeconds: 29.123, ...extra });

const valueOf = (value) => value instanceof Date ? value.getTime() : value;
function matches(row, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$expr') {
      const [left, lower] = value.$gte;
      const date = row[left.$dateToString.date.slice(1)];
      return insightWindow('all', left.$dateToString.timezone, now).dayKey(date) >= lower;
    }
    if (value && typeof value === 'object' && !(value instanceof Date)) return Object.entries(value).every(([op, operand]) => {
      if (op === '$in') return operand.includes(row[key]);
      if (op === '$lt') return valueOf(row[key]) < valueOf(operand);
      if (op === '$gte') return valueOf(row[key]) >= valueOf(operand);
      if (op === '$lte') return valueOf(row[key]) <= valueOf(operand);
      throw new Error(`Unsupported test match ${op}`);
    });
    return valueOf(row[key]) === valueOf(value);
  });
}
const sorted = (rows, spec = {}) => [...rows].sort((a, b) => {
  for (const [key, order] of Object.entries(spec)) {
    const left = valueOf(a[key]), right = valueOf(b[key]);
    if (left !== right) return left > right ? order : -order;
  }
  return 0;
});
function cursor(rows) { return { async *[Symbol.asyncIterator]() { yield* structuredClone(rows); } }; }
function fakeDb() {
  const collections = new Map();
  return { collection(name) {
    if (!collections.has(name)) collections.set(name, []);
    const rows = collections.get(name);
    return {
      rows,
      find(filter, options = {}) { return cursor(sorted(rows.filter((row) => matches(row, filter)), options.sort)); },
      async findOne(filter, options = {}) { return structuredClone(sorted(rows.filter((row) => matches(row, filter)), options.sort)[0] || null); },
      async updateOne(filter, update, options = {}) {
        let row = rows.find((record) => matches(record, filter));
        if (!row && options.upsert) {
          const existing = rows.find((record) => record._id === filter._id && filter._id);
          if (existing) { const error = new Error('duplicate'); error.code = 11000; throw error; }
          row = { ...structuredClone(filter), ...structuredClone(update.$setOnInsert || {}) }; rows.push(row);
        }
        if (row) {
          Object.assign(row, structuredClone(update.$set || {}));
          for (const [key, amount] of Object.entries(update.$inc || {})) row[key] = (Number(row[key]) || 0) + amount;
        }
        return { matchedCount: row ? 1 : 0 };
      },
      aggregate(pipeline) {
        let result = rows;
        for (const stage of pipeline) {
          if (stage.$match) result = result.filter((row) => matches(row, stage.$match));
          if (stage.$sort) result = sorted(result, stage.$sort);
          if (stage.$group) {
            const groups = new Map();
            for (const row of result) {
              const key = JSON.stringify(Object.values(stage.$group._id).map((field) => row[field.slice(1)]));
              if (!groups.has(key)) groups.set(key, { record: row });
            }
            result = [...groups.values()];
          }
          if (stage.$replaceRoot) result = result.map((row) => row.record);
        }
        return cursor(result);
      },
    };
  } };
}

test('metadata validation rejects source/output, invalid timings and contradictory web outcomes', () => {
  assert.equal(normalizeInsightAttempt(attempt({ durationMs: null }), now).durationMs, null);
  for (const extra of [{ code: 'private source' }, { stdout: 'private output' }, { attemptId: 'bad' }, { revisionHash: 'bad' }, { durationMs: -1 }, { status: 'success', errorCategory: 'syntax' }, { status: 'preview', language: 'python' }, { status: 'success', language: 'web' }, { version: 2 }, { startedAt: '2030-01-01T00:00:00Z' }]) assert.throws(() => normalizeInsightAttempt(attempt(extra), now));
  assert.equal(normalizeInsightActivity(activity(), now).activeSeconds, 29.123);
  for (const extra of [{ activeSeconds: 0 }, { activeSeconds: 301 }, { activeSeconds: Infinity }, { code: 'private' }]) assert.throws(() => normalizeInsightActivity(activity(extra), now));
});

test('attempt replay and web error updates stay scoped and cannot downgrade or change identity', async () => {
  const db = fakeDb();
  const first = attempt({ language: 'web', status: 'preview' });
  await recordInsightAttempt(db, scope, first, now);
  await recordInsightAttempt(db, scope, first, now);
  const error = { ...first, version: 2, status: 'preview_error', errorCategory: 'reference', startedAt: '2026-09-29T11:00:00Z' };
  await recordInsightAttempt(db, scope, error, now);
  await recordInsightAttempt(db, scope, first, now);
  await recordInsightAttempt(db, { ...scope, academicProfileId: 'profile-b' }, first, now);
  await recordInsightAttempt(db, { ...scope, userId: 'another' }, first, now);
  const rows = db.collection(CODE_MATRIX_INSIGHTS_ATTEMPTS).rows;
  assert.equal(rows.length, 3);
  assert.equal(rows[0].status, 'preview_error');
  assert.equal(rows[0].version, 2);
  assert.equal(rows[0].startedAt.toISOString(), '2026-09-29T10:00:00.000Z');
  assert.equal(rows[1].status, 'preview');
  const reversed = attempt({ language: 'web', status: 'preview_error', version: 2, errorCategory: 'type' });
  await recordInsightAttempt(db, scope, reversed, now);
  await recordInsightAttempt(db, scope, { ...reversed, status: 'preview', version: 1, errorCategory: 'none' }, now);
  assert.equal(rows.at(-1).status, 'preview_error');
});

test('activity retries are immutable, scoped and never award XP', async () => {
  const db = fakeDb(); const chunk = activity();
  await recordInsightActivity(db, scope, chunk, now);
  await recordInsightActivity(db, scope, { ...chunk, activeSeconds: 300 }, now);
  await recordInsightActivity(db, { ...scope, academicProfileId: 'profile-b' }, chunk, now);
  assert.equal(db.collection(CODE_MATRIX_INSIGHTS_ACTIVITY).rows.length, 2);
  assert.equal(db.collection(CODE_MATRIX_INSIGHTS_ACTIVITY).rows[0].activeSeconds, 29.123);
  assert.equal(db.collection('momentumEvents').rows.length, 0);
  assert.ok(PROFILE_SCOPED_OWNED_COLLECTIONS.includes(CODE_MATRIX_INSIGHTS_ACTIVITY));
  assert.ok(PROFILE_SCOPED_OWNED_COLLECTIONS.includes(CODE_MATRIX_INSIGHTS_ATTEMPTS));
});

test('read deduplicates unchanged revisions, excludes runtime setup/stops, and separates historical XP', async () => {
  const db = fakeDb();
  const cases = [
    attempt({ status: 'error', errorCategory: 'syntax' }),
    attempt({ status: 'error', errorCategory: 'syntax', startedAt: '2026-09-29T10:01:00Z' }),
    attempt({ revisionHash: 'b'.repeat(64), startedAt: '2026-09-29T10:02:00Z', surface: 'popup' }),
    attempt({ revisionHash: 'c'.repeat(64), status: 'environment', durationMs: null }),
    attempt({ revisionHash: 'd'.repeat(64), status: 'stopped', durationMs: null }),
    attempt({ language: 'web', status: 'preview' }),
  ];
  for (const record of cases) await recordInsightAttempt(db, scope, record, now);
  await recordInsightAttempt(db, { ...scope, academicProfileId: 'other' }, attempt(), now);
  await recordInsightActivity(db, scope, activity({ language: 'sql', activeSeconds: 45 }), now);
  db.collection('momentumEvents').rows.push(...Array.from({ length: 4 }, (_, index) => ({ ...scope, kind: 'coding', language: 'java', xp: index === 3 ? 10 : 0, occurredAt: '2026-09-28T10:00:00Z' })));
  const data = await readCodeMatrixInsights(db, scope, { now });
  assert.equal(data.summary.attempts, 6);
  assert.equal(data.summary.meaningfulAttempts, 3);
  assert.equal(data.summary.successRate, 50);
  assert.equal(data.summary.errorsResolved, 1);
  assert.equal(data.summary.popupAttempts, 1);
  assert.equal(data.summary.activeSeconds, 45);
  assert.equal(data.languages.find((item) => item.id === 'sql').meaningfulAttempts, 0);
  assert.equal(data.languages.find((item) => item.id === 'web').successRate, null);
  assert.equal(data.languages.find((item) => item.id === 'java'), undefined);
  assert.equal(data.xp.total, 10);
  assert.equal(data.xp.successfulRuns, 4);
  assert.equal(data.xp.runsIntoReward, 0);
  assert.equal(data.xp.runsToNextReward, 4);
  assert.deepEqual(data.historicalLanguages, [{ id: 'java', label: 'Java', successfulRuns: 4 }]);
  assert.equal(data.trend.find((item) => item.date === '2026-09-28').xp, 10);
  assert.equal(data.highlights.mostConsistent, null);
  assert.equal(data.trackingSince, '2026-09-29T10:00:00.000Z');
});

test('returning to an earlier working revision counts recovery without inflating distinct revisions', async () => {
  const db = fakeDb();
  for (const record of [attempt({ startedAt: '2026-09-29T08:00:00Z' }), attempt({ revisionHash: 'b'.repeat(64), status: 'error', errorCategory: 'type', startedAt: '2026-09-29T08:01:00Z' }), attempt({ startedAt: '2026-09-29T08:02:00Z' })]) await recordInsightAttempt(db, scope, record, now);
  const data = await readCodeMatrixInsights(db, scope, { now });
  assert.equal(data.summary.attempts, 3);
  assert.equal(data.summary.meaningfulAttempts, 2);
  assert.equal(data.summary.errorsResolved, 1);
});

test('practice rewards appear in XP and solved history without advancing compiler rewards', async () => {
  const db = fakeDb();
  db.collection('momentumEvents').rows.push(
    ...Array.from({ length: 3 }, (_, index) => ({ ...scope, _id: `run-${index}`, kind: 'coding', source: 'run', language: 'python', xp: 0, occurredAt: '2026-09-28T10:00:00Z' })),
    { ...scope, _id: 'solve-1', kind: 'coding', source: 'practice', questionId: 'add-two', version: 1, title: 'Add two numbers', language: 'javascript', xp: 10, occurredAt: '2026-09-29T10:00:00Z' },
    { ...scope, _id: 'solve-2', kind: 'coding', source: 'practice', questionId: 'even-odd', version: 1, title: 'Even or odd', language: 'python', xp: 10, occurredAt: '2026-08-01T10:00:00Z' },
    { ...scope, academicProfileId: 'another', kind: 'coding', source: 'practice', xp: 10, occurredAt: '2026-09-29T10:00:00Z' },
  );
  const data = await readCodeMatrixInsights(db, scope, { now });
  assert.equal(data.xp.total, 20);
  assert.equal(data.xp.practiceXp, 20);
  assert.equal(data.xp.solvedQuestions, 2);
  assert.equal(data.xp.practiceRewardXp, 10);
  assert.equal(data.xp.successfulRuns, 3);
  assert.equal(data.xp.runsIntoReward, 3);
  assert.equal(data.xp.runsToNextReward, 1);
  assert.deepEqual(data.historicalLanguages, [{ id: 'python', label: 'Python', successfulRuns: 3 }]);
  assert.equal(data.trend.find((item) => item.date === '2026-09-29').xp, 10);
  assert.deepEqual(data.xp.recentPracticeRewards, [{ id: 'solve-1', questionId: 'add-two', title: 'Add two numbers', language: 'javascript', xp: 10, occurredAt: '2026-09-29T10:00:00.000Z' }]);
  const all = await readCodeMatrixInsights(db, scope, { range: 'all', now });
  assert.equal(all.xp.recentPracticeRewards.length, 2);
});

test('timezone range boundaries and daily XP/time use calendar days; all-time keeps older totals', async () => {
  const db = fakeDb();
  // India September 23 starts at September 22 18:30 UTC, the first of seven local dates.
  await recordInsightAttempt(db, scope, attempt({ startedAt: '2026-09-22T18:29:59Z' }), now);
  await recordInsightAttempt(db, scope, attempt({ startedAt: '2026-09-22T18:30:00Z', revisionHash: 'b'.repeat(64) }), now);
  await recordInsightActivity(db, scope, activity({ startedAt: '2026-09-22T18:30:00Z' }), now);
  db.collection('momentumEvents').rows.push({ ...scope, kind: 'coding', xp: 10, language: 'python', occurredAt: '2026-09-22T18:30:00Z' });
  const data = await readCodeMatrixInsights(db, scope, { range: '7d', timeZone: 'Asia/Kolkata', now });
  assert.equal(data.summary.attempts, 1);
  assert.equal(data.trend.length, 7);
  assert.equal(data.trend[0].date, '2026-09-23');
  assert.equal(data.trend[0].activeSeconds, 29.123);
  assert.equal(data.trend[0].xp, 10);
  assert.equal(data.trackingSince, '2026-09-22T18:29:59.000Z');
  const all = await readCodeMatrixInsights(db, scope, { range: 'all', timeZone: 'Asia/Kolkata', now });
  assert.equal(all.summary.attempts, 2);
  assert.equal(all.trend.length, 90);
  assert.equal(insightWindow('7d', 'not-a-timezone', now).timeZone, 'UTC');
  assert.throws(() => insightWindow('forever', 'UTC', now));
});

test('confidence needs execution on three days; time-only days cannot qualify a language', () => {
  const build = (distinctDays) => {
    const result = createInsightAccumulator(insightWindow('30d', 'UTC', now));
    for (let index = 0; index < 10; index++) {
      const record = attempt({ revisionHash: index.toString(16).padStart(64, '0'), status: index < 3 ? 'error' : 'success', errorCategory: index < 3 ? 'reference' : 'none', startedAt: `2026-09-${27 + (distinctDays ? index % 3 : 0)}T10:00:00Z` });
      result.meaningful(record);
    }
    for (const day of [27, 28, 29]) result.activity(activity({ startedAt: `2026-09-${day}T11:00:00Z` }));
    return result.finish();
  };
  assert.equal(build(false).highlights.mostConsistent, null);
  assert.equal(build(false).highlights.needsPractice, null);
  assert.equal(build(true).highlights.mostConsistent.language, 'python');
  assert.equal(build(true).highlights.needsPractice.language, 'python');
  assert.match(build(true).highlights.mostConsistent.detail, /not solution correctness/);
});

function routeHarness({ deniedFence = false } = {}) {
  const db = fakeDb(); const routes = new Map(); let mutationCalls = 0;
  const app = Object.fromEntries(['get', 'post'].map((method) => [method, (path, ...handlers) => routes.set(`${method}:${path}`, handlers)]));
  registerCodeMatrixInsightsRoutes(app, {
    getDb: async () => db, now: () => now,
    requireAuth: (fn) => (req, res) => req.user ? fn(req, res) : res.status(401).json({ error: 'Sign in' }),
    mutationSecurity: (_req, _res, next) => { mutationCalls++; return next(); },
    withProfileWriteFence: async (_db, _req, run) => { if (deniedFence) throw new AcademicProfileScopeError(409, 'ACADEMIC_PROFILE_CHANGED', 'Profile changed'); return run(); },
  });
  return {
    db, get mutationCalls() { return mutationCalls; },
    async request({ path = 'attempts', method = 'post', user = 'student', profile = 'profile-a', body = attempt(), json = true, query = {} } = {}) {
      const req = { body, query, user: user ? { _id: user } : null, academicProfileId: profile, is: () => json };
      const res = { statusCode: 200, headers: {}, set(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
      const handlers = routes.get(`${method}:/api/code-matrix/insights${path ? `/${path}` : ''}`);
      const run = (index) => handlers[index]?.(req, res, () => run(index + 1));
      await run(0); return res;
    },
  };
}

test('routes enforce auth, profile scope, mutation security, body limit, rate limit and profile fence', async () => {
  const h = routeHarness();
  assert.equal((await h.request({ user: null })).statusCode, 401);
  assert.equal((await h.request({ profile: '' })).statusCode, 409);
  assert.equal((await h.request({ json: false })).statusCode, 415);
  assert.equal((await h.request({ body: { ...attempt(), code: 'x'.repeat(5000) } })).statusCode, 413);
  assert.equal((await h.request()).statusCode, 200);
  assert.equal(h.mutationCalls, 5);
  const read = await h.request({ method: 'get', path: '', query: { range: '7d', timezone: 'UTC' } });
  assert.equal(read.statusCode, 200);
  assert.equal(read.headers['Cache-Control'], 'no-store');
  assert.equal(read.body.insights.summary.attempts, 1);
  assert.equal((await h.request({ method: 'get', path: '', query: { range: 'invalid' } })).statusCode, 400);
  for (let index = 0; index < 90; index++) await h.request();
  assert.equal((await h.request()).statusCode, 429);
  const locked = routeHarness({ deniedFence: true });
  assert.equal((await locked.request()).statusCode, 409);
  assert.equal(locked.db.collection(CODE_MATRIX_INSIGHTS_ATTEMPTS).rows.length, 0);
});
