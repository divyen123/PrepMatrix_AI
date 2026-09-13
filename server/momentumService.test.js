import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { assessmentMomentumEvent, insertMomentumEvent, readMomentum, reconcileMomentum, recordSuccessfulCodeRun, resolveMomentumSchedule, syncWorkspaceMomentum, MOMENTUM_EVENTS_COLLECTION } from './momentumService.js';
import registerMomentumRoutes from './momentumRoutes.js';
import { buildClearedPlannerWorkspace } from '../src/utils/plannerHistory.js';

export function fakeMomentumDb() {
  const collections = new Map();
  return { collection(name) {
    if (!collections.has(name)) collections.set(name, []);
    const rows = collections.get(name);
    const matches = (row, filter) => Object.entries(filter).every(([key, value]) => value && typeof value === 'object' && '$in' in value ? value.$in.includes(row[key]) : row[key] === value);
    return { rows, find: (filter) => ({ toArray: async () => structuredClone(rows.filter((row) => matches(row, filter))) }), findOne: async (filter) => structuredClone(rows.find((row) => matches(row, filter)) || null), countDocuments: async (filter) => rows.filter((row) => matches(row, filter)).length,
      async updateOne(filter, update, options) {
        let row = rows.find((row) => matches(row, filter));
        if (!row && options?.upsert) { row = { ...filter, ...structuredClone(update.$setOnInsert) }; rows.push(row); Object.assign(row, structuredClone(update.$set || {})); return { upsertedCount: 1 }; }
        if (row) Object.assign(row, structuredClone(update.$set || {}));
        return { upsertedCount: 0 };
      },
      async bulkWrite(operations) { for (const { updateOne } of operations) await this.updateOne(updateOne.filter, updateOne.update, { upsert: updateOne.upsert }); },
    };
  } };
}
const scope = { userId: 'student', academicProfileId: 'profile-a' };
const now = new Date('2026-09-13T10:00:00Z');
const plan = { subjects: [{ name: 'Networks' }], schedule: [{ date: '2026-09-13', momentumToken: 'plan-one', tasks: [{ task: 'Networks - TCP/IP', id: 'tcp', topic: 'TCP/IP', subjectName: 'Networks', chapterName: 'Network models' }] }], completed: [] };

test('global task XP survives clearing and reload without duplicate awards from retries or archives', async () => {
  const db = fakeMomentumDb();
  const momentumSchedule = await syncWorkspaceMomentum(db, scope, {}, plan, now);
  const before = { ...plan, momentumSchedule };
  const finished = { ...before, completed: ['tcp'] };
  await syncWorkspaceMomentum(db, scope, before, finished, now);
  assert.equal((await readMomentum(db, scope, momentumSchedule)).global.totalXp, 10);
  const cleared = buildClearedPlannerWorkspace(finished, { id: 'archive-one', now });
  assert.equal(await syncWorkspaceMomentum(db, scope, finished, cleared, now), null);
  await syncWorkspaceMomentum(db, scope, cleared, cleared, now);
  const after = await readMomentum(db, scope, null);
  assert.equal(after.global.totalXp, 10);
  assert.equal(after.schedule.totalXp, 0);
  assert.equal(after.history.length, 1);
  assert.equal(after.history[0].title, 'TCP/IP');
  assert.match(after.history[0].detail, /Network models/);
  assert.equal(after.history[0].userId, undefined);
});

test('new schedule resets its scope, ordinary edits retain it, and task toggles cannot farm XP', async () => {
  const db = fakeMomentumDb();
  const first = resolveMomentumSchedule({}, plan, now);
  const finished = { ...plan, momentumSchedule: first, completed: ['tcp'] };
  await syncWorkspaceMomentum(db, scope, finished, { ...finished, completed: [] }, now);
  await syncWorkspaceMomentum(db, scope, { ...finished, completed: [] }, finished, now);
  assert.equal((await readMomentum(db, scope, first)).global.totalXp, 10);
  assert.equal(resolveMomentumSchedule(finished, { ...finished, schedule: [...finished.schedule, { tasks: [] }] }, now).id, first.id);
  const nextPlan = { ...plan, schedule: [{ ...plan.schedule[0], momentumToken: 'plan-two' }] };
  const nextScope = resolveMomentumSchedule(finished, nextPlan, now);
  assert.notEqual(nextScope.id, first.id);
  assert.equal((await readMomentum(db, scope, nextScope)).schedule.totalXp, 0);
});

test('assessment rewards use completed records, preserve battle amounts and never expose delayed exam scores', () => {
  const context = { momentumSchedule: { id: 'plan', startedAt: '2026-09-13T09:00:00.000Z' }, subjectName: 'Networks', title: 'Networks exam' };
  assert.equal(assessmentMomentumEvent('quiz', { _id: 'q', status: 'aborted', total: 10, answeredCount: 10 }), null);
  assert.equal(assessmentMomentumEvent('quiz', { _id: 'q', status: 'completed', total: 10, answeredCount: 1 }), null);
  const quiz = assessmentMomentumEvent('quiz', { _id: 'q', status: 'completed', subjectName: 'Maths', total: 10, answeredCount: 10, completedAt: now }, context);
  assert.equal(quiz.xp, 10);
  assert.equal(quiz.scheduleId, 'plan');
  const exam = assessmentMomentumEvent('exam', { _id: 'e', status: 'submitted', answers: { q1: 0 }, submittedAt: now, score: 38, momentumScheduleId: 'original-plan' }, context);
  assert.equal(exam.xp, 40);
  assert.equal(exam.scheduleId, 'original-plan');
  assert.equal(exam.score, undefined);
  const battle = assessmentMomentumEvent('battle', { _id: 'b', totalXp: 25, completionXp: 10, winXp: 10, perfectXp: 5, awardedAt: now }, context);
  assert.equal(battle.xp, 25);
  assert.equal(assessmentMomentumEvent('battle', { _id: 'capped', totalXp: 0 }), null);
});

test('code rewards start at the fourth success, repeat at eight, and deduplicate replayed run IDs', async () => {
  const db = fakeMomentumDb();
  const ids = Array.from({ length: 8 }, () => randomUUID());
  for (const [index, runId] of ids.entries()) {
    const result = await recordSuccessfulCodeRun(db, scope, { runId, language: 'java' }, now);
    assert.equal(result.awardedXp, (index + 1) % 4 === 0 ? 10 : 0);
    await recordSuccessfulCodeRun(db, scope, { runId, language: 'java' }, now);
  }
  const data = await readMomentum(db, scope, { id: 'plan' });
  assert.equal(data.successfulCodeRuns, 8);
  assert.equal(data.global.totalXp, 20);
  assert.equal(data.schedule.totalXp, 0);
  assert.equal(data.history.length, 2);
  await assert.rejects(recordSuccessfulCodeRun(db, scope, { runId: 'bad', language: 'java' }), /valid successful/);
  await assert.rejects(recordSuccessfulCodeRun(db, scope, { runId: randomUUID(), language: 'unsupported' }), /valid successful/);
});

test('identical event IDs and runs stay isolated between accounts and academic profiles', async () => {
  const db = fakeMomentumDb();
  const event = assessmentMomentumEvent('quiz', { _id: 'quiz', subjectName: 'Maths', status: 'completed', total: 5, answeredCount: 5 });
  await insertMomentumEvent(db, scope, event);
  await insertMomentumEvent(db, scope, { ...event, xp: 900 });
  await insertMomentumEvent(db, { ...scope, academicProfileId: 'profile-b' }, event);
  const data = await readMomentum(db, scope);
  assert.equal(data.global.totalXp, 10);
  assert.equal((await readMomentum(db, { ...scope, userId: 'another-user' })).global.totalXp, 0);
  assert.equal(db.collection(MOMENTUM_EVENTS_COLLECTION).rows.length, 2);
});

test('reconciliation recovers all saved sources and keeps older assessments out of a new schedule', async () => {
  const db = fakeMomentumDb();
  const momentumSchedule = { id: 'active', startedAt: '2026-09-13T00:00:00.000Z', token: 'plan-one' };
  db.collection('workspaces').rows.push({ ...scope, ...plan, completed: ['tcp'], momentumSchedule });
  db.collection('quizAttempts').rows.push({ ...scope, _id: 'old-quiz', status: 'completed', total: 5, answeredCount: 5, subjectName: 'Maths', completedAt: '2026-09-12T10:00:00Z' });
  db.collection('exams').rows.push({ ...scope, _id: 'exam', subjectName: 'Networks', title: 'Networks exam' });
  db.collection('examAttempts').rows.push({ ...scope, _id: 'attempt', examId: 'exam', status: 'submitted', answers: { q1: 1 }, submittedAt: now, momentumScheduleId: 'active' });
  db.collection('quizBattles').rows.push({ _id: 'battle', subjectName: 'Maths' });
  db.collection('quizBattleRewards').rows.push({ ...scope, _id: 'reward', battleId: 'battle', totalXp: 25, completionXp: 10, winXp: 10, perfectXp: 5, awardedAt: now });
  await reconcileMomentum(db, scope);
  await reconcileMomentum(db, scope);
  const result = await readMomentum(db, scope, momentumSchedule);
  assert.equal(result.global.totalXp, 85);
  assert.equal(result.schedule.totalXp, 75);
  assert.equal(result.history.find((entry) => entry.kind === 'exam').subject, 'Networks');
  assert.equal(result.history.find((entry) => entry.kind === 'battle').subject, 'Maths');
  assert.equal(result.history.find((entry) => entry.kind === 'study').occurredAt, null);
  assert.equal(result.history.length, 4);
});

test('momentum routes require authentication, enforce profile eligibility and serialize successful runs', async () => {
  const db = fakeMomentumDb();
  const routes = new Map();
  let queue = Promise.resolve();
  let fences = 0;
  const security = (_req, _res, next) => next();
  registerMomentumRoutes({ get: (path, ...handlers) => routes.set(`get ${path}`, handlers), post: (path, ...handlers) => routes.set(`post ${path}`, handlers) }, {
    getDb: async () => db, mutationSecurity: security,
    requireAuth: (handler) => (req, res) => req.user ? handler(req, res) : res.status(401).json({ error: 'Login required' }),
    withProfileWriteFence: (_db, req, work) => {
      fences++;
      if (req.academicProfileId === 'deleted') throw Object.assign(new Error('Profile was deleted'), { status: 409 });
      const next = queue.then(work); queue = next.catch(() => {}); return next;
    },
  });
  const request = async (method, { user = 'student', profile = 'profile-a', body } = {}) => {
    const req = { user: user && { _id: user }, academicProfileId: profile, academicProfileContext: { profile: { academicLevel: 'College' } }, body };
    const res = { statusCode: 200, headers: {}, set(key, value) { this.headers[key] = value; }, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
    const handlers = routes.get(`${method} /api/momentum${method === 'post' ? '/code-runs' : ''}`);
    await handlers.at(-1)(req, res);
    return res;
  };
  assert.equal(routes.get('post /api/momentum/code-runs')[0], security);
  assert.equal((await request('get', { user: null })).statusCode, 401);
  assert.equal((await request('post', { user: null })).statusCode, 401);
  assert.equal(fences, 0);
  assert.equal((await request('post', { body: { runId: randomUUID(), language: 'java' } })).statusCode, 403);
  db.collection('workspaces').rows.push({ ...scope, subjects: [{ name: 'Java' }] });
  const outcomes = await Promise.all(Array.from({ length: 4 }, () => request('post', { body: { runId: randomUUID(), language: 'java' } })));
  assert.deepEqual(outcomes.map((result) => result.body.awardedXp), [0, 0, 0, 10]);
  assert.equal((await request('post', { profile: 'deleted', body: { runId: randomUUID(), language: 'java' } })).statusCode, 409);
  const result = await request('get');
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(result.body.momentum.global.totalXp, 10);
  assert.equal(result.body.momentum.successfulCodeRuns, 4);
});
