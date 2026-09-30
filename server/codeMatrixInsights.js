import { createHash } from 'node:crypto';
import { CodeMatrixError, codeMatrixObject } from './codeMatrixWorkspace.js';
import { MOMENTUM_EVENTS_COLLECTION, MOMENTUM_RULES } from './momentumService.js';

export const CODE_MATRIX_INSIGHTS_ATTEMPTS = 'codeMatrixInsightAttempts';
export const CODE_MATRIX_INSIGHTS_ACTIVITY = 'codeMatrixInsightActivity';
export const INSIGHT_LANGUAGES = Object.freeze({ python: 'Python', c: 'C', cpp: 'C++', java: 'Java', javascript: 'JavaScript', sql: 'SQL', web: 'Web preview' });
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const DAY = 86_400_000;
const STATUSES = ['success', 'error', 'timeout', 'stopped', 'environment', 'preview', 'preview_error'];
const CATEGORIES = ['none', 'syntax', 'type', 'reference', 'runtime', 'timeout', 'other'];
const MEANINGFUL = ['success', 'error', 'timeout', 'preview', 'preview_error'];
const invalid = (message) => { throw new CodeMatrixError(400, 'CODE_INSIGHTS_INVALID_REQUEST', message); };
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const percent = (success, total) => total ? Math.round(100 * success / total) : null;
const round = (number) => Math.round(number * 1000) / 1000;

function validateCommon(body, idKey, now) {
  for (const key of [idKey, 'sessionId']) if (typeof body[key] !== 'string' || !UUID.test(body[key])) invalid(`${key} must be a UUID.`);
  if (!Object.hasOwn(INSIGHT_LANGUAGES, body.language)) invalid('language is unsupported.');
  if (!['page', 'popup'].includes(body.surface)) invalid('surface must be page or popup.');
  if (!['manual', 'chat', 'placement'].includes(body.context)) invalid('context is unsupported.');
  if (typeof body.startedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(body.startedAt)) invalid('startedAt must be an ISO timestamp in UTC.');
  const startedAt = new Date(body.startedAt);
  if (!Number.isFinite(startedAt.getTime()) || startedAt > new Date(now.getTime() + 5 * 60_000) || startedAt < new Date('2026-01-01T00:00:00Z')) invalid('startedAt is outside the supported tracking period.');
  return { [idKey]: body[idKey].toLowerCase(), sessionId: body.sessionId.toLowerCase(), language: body.language, surface: body.surface, context: body.context, startedAt };
}

export function normalizeInsightAttempt(body, now = new Date()) {
  codeMatrixObject(body, ['attemptId', 'sessionId', 'language', 'surface', 'context', 'revisionHash', 'status', 'errorCategory', 'durationMs', 'startedAt', 'version'], 'attempt');
  const common = validateCommon(body, 'attemptId', now);
  if (typeof body.revisionHash !== 'string' || !/^[a-f0-9]{64}$/iu.test(body.revisionHash)) invalid('revisionHash must be a SHA-256 fingerprint.');
  if (!STATUSES.includes(body.status) || !CATEGORIES.includes(body.errorCategory)) invalid('The outcome or error category is unsupported.');
  if (body.durationMs !== null && (!Number.isFinite(body.durationMs) || body.durationMs < 0 || body.durationMs > DAY)) invalid('durationMs must be null or between zero and one day.');
  if (![1, 2].includes(body.version)) invalid('version must be 1 or 2.');
  const preview = ['preview', 'preview_error'].includes(body.status);
  if ((preview && body.language !== 'web') || (body.language === 'web' && ['success', 'error', 'timeout'].includes(body.status))) invalid('Web previews must use preview outcomes.');
  if (body.version === 2 && body.status !== 'preview_error') invalid('Only preview error updates use version 2.');
  if (body.status === 'preview_error' && body.version !== 2) invalid('Preview errors require version 2.');
  if (['success', 'preview', 'stopped', 'environment'].includes(body.status) && body.errorCategory !== 'none') invalid('This outcome must use the none error category.');
  if (['error', 'timeout', 'preview_error'].includes(body.status) && body.errorCategory === 'none') invalid('An error requires an error category.');
  return { ...common, revisionHash: body.revisionHash.toLowerCase(), status: body.status, errorCategory: body.errorCategory, durationMs: body.durationMs === null ? null : Math.round(body.durationMs), version: body.version };
}

export function normalizeInsightActivity(body, now = new Date()) {
  codeMatrixObject(body, ['activityId', 'sessionId', 'language', 'surface', 'context', 'startedAt', 'activeSeconds'], 'activity');
  const common = validateCommon(body, 'activityId', now);
  if (!Number.isFinite(body.activeSeconds) || body.activeSeconds <= 0 || body.activeSeconds > 300) invalid('activeSeconds must be greater than zero and at most 300.');
  return { ...common, activeSeconds: round(body.activeSeconds) };
}

export async function ensureCodeMatrixInsightsIndexes(db) {
  for (const [name, id] of [[CODE_MATRIX_INSIGHTS_ATTEMPTS, 'attemptId'], [CODE_MATRIX_INSIGHTS_ACTIVITY, 'activityId']]) {
    await db.collection(name).createIndex({ userId: 1, academicProfileId: 1, [id]: 1 }, { unique: true });
    await db.collection(name).createIndex({ userId: 1, academicProfileId: 1, startedAt: 1 });
  }
}

export async function recordInsightAttempt(db, scope, body, now = new Date()) {
  const value = normalizeInsightAttempt(body, now);
  const collection = db.collection(CODE_MATRIX_INSIGHTS_ATTEMPTS);
  const key = { ...scope, attemptId: value.attemptId };
  const document = { ...key, ...value, recordedAt: now, _id: digest([String(scope.userId), scope.academicProfileId, value.attemptId]) };
  try { await collection.updateOne(key, { $setOnInsert: document }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
  // Identity and the original start time are immutable, including reordered offline retries.
  // An arriving v1 can never replace the later runtime error attached to this preview.
  if (value.version === 2) await collection.updateOne({ ...key, version: 1, language: 'web', status: 'preview', sessionId: value.sessionId, revisionHash: value.revisionHash }, {
    $set: { version: 2, status: 'preview_error', errorCategory: value.errorCategory, durationMs: value.durationMs, updatedAt: now },
  });
  return { saved: true, attemptId: value.attemptId };
}

export async function recordInsightActivity(db, scope, body, now = new Date()) {
  const value = normalizeInsightActivity(body, now);
  const key = { ...scope, activityId: value.activityId };
  try { await db.collection(CODE_MATRIX_INSIGHTS_ACTIVITY).updateOne(key, { $setOnInsert: { ...key, ...value, recordedAt: now, _id: digest([String(scope.userId), scope.academicProfileId, value.activityId]) } }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
  return { saved: true, activityId: value.activityId };
}

export function insightWindow(range = '30d', timeZone = 'UTC', now = new Date()) {
  if (!['7d', '30d', 'all'].includes(range)) invalid('range must be 7d, 30d, or all.');
  if (typeof timeZone !== 'string' || timeZone.length > 100) timeZone = 'UTC';
  try { timeZone = new Intl.DateTimeFormat('en', { timeZone }).resolvedOptions().timeZone; }
  catch { timeZone = 'UTC'; }
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const dayKey = (value) => {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(value)).map(({ type, value: part }) => [type, part]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const today = dayKey(now);
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const start = new Date(`${today}T00:00:00Z`).getTime() - (days - 1) * DAY;
  const trendDates = Array.from({ length: days }, (_, index) => new Date(start + index * DAY).toISOString().slice(0, 10));
  return { range, timeZone, today, dayKey, startDay: range === 'all' ? null : trendDates[0], trendDates, days };
}

/** Streaming accumulator: no source/output and no growing list of execution records. */
export function createInsightAccumulator(window) {
  const summary = { attempts: 0, meaningfulAttempts: 0, practiceDays: 0, successRate: null, errorsResolved: 0, pageAttempts: 0, popupAttempts: 0, webPreviews: 0, activeSeconds: 0 };
  const days = new Set();
  const languageMap = new Map();
  const trend = new Map(window.trendDates.map((date) => [date, { date, attempts: 0, successes: 0, errors: 0, webPreviews: 0, activeSeconds: 0, xp: 0 }]));
  const recent = [];
  let recoveryGroup = '';
  let unresolvedRevision = null;
  const within = (record) => { const day = window.dayKey(record.startedAt); return day <= window.today && (!window.startDay || day >= window.startDay) ? day : null; };
  const language = (id) => {
    if (!languageMap.has(id)) languageMap.set(id, { id, label: INSIGHT_LANGUAGES[id], attempts: 0, meaningfulAttempts: 0, successes: 0, errors: 0, successRate: null, practiceDays: 0, errorsResolved: 0, activeSeconds: 0, days: new Set(), executionDays: new Set(), categories: {} });
    return languageMap.get(id);
  };
  const markDay = (lang, day) => { days.add(day); lang.days.add(day); };
  return {
    raw(record) {
      const day = within(record);
      if (!day || !Object.hasOwn(INSIGHT_LANGUAGES, record.language)) return;
      const lang = language(record.language);
      summary.attempts++; lang.attempts++;
      summary[record.surface === 'popup' ? 'popupAttempts' : 'pageAttempts']++;
      if (record.language === 'web' && ['preview', 'preview_error'].includes(record.status)) summary.webPreviews++;
      // Recovery follows chronological executions, including a return to an earlier
      // working revision. Repeated unchanged runs still do not inflate usage rates.
      if (record.language !== 'web' && ['success', 'error', 'timeout'].includes(record.status)) {
        const group = `${record.sessionId}:${record.language}`;
        if (recoveryGroup !== group) { recoveryGroup = group; unresolvedRevision = null; }
        if (record.status === 'success') {
          if (unresolvedRevision && unresolvedRevision !== record.revisionHash) { lang.errorsResolved++; summary.errorsResolved++; }
          unresolvedRevision = null;
        } else unresolvedRevision = record.revisionHash;
      }
      const item = { attemptId: record.attemptId, language: record.language, surface: record.surface, status: record.status, errorCategory: record.errorCategory, startedAt: new Date(record.startedAt).toISOString() };
      recent.push(item); recent.sort((a, b) => b.startedAt.localeCompare(a.startedAt)); if (recent.length > 12) recent.pop();
    },
    // Call in session/language/start order after grouping unchanged revisions in MongoDB.
    meaningful(record) {
      const day = within(record);
      if (!day || !MEANINGFUL.includes(record.status)) return;
      const lang = language(record.language);
      markDay(lang, day); summary.meaningfulAttempts++; lang.meaningfulAttempts++;
      const point = trend.get(day);
      if (point) point.attempts++;
      if (record.language === 'web') { if (point) point.webPreviews++; return; }
      lang.executionDays.add(day);
      if (record.status === 'success') {
        lang.successes++; if (point) point.successes++;
      } else {
        lang.errors++; if (point) point.errors++;
        lang.categories[record.errorCategory] = (lang.categories[record.errorCategory] || 0) + 1;
      }
    },
    activity(record) {
      const day = within(record);
      if (!day || !Object.hasOwn(INSIGHT_LANGUAGES, record.language)) return;
      const lang = language(record.language); markDay(lang, day);
      summary.activeSeconds += record.activeSeconds; lang.activeSeconds += record.activeSeconds;
      const point = trend.get(day); if (point) point.activeSeconds += record.activeSeconds;
    },
    xp(record) {
      const day = within({ startedAt: record.occurredAt || record.recordedAt });
      const point = day && trend.get(day); if (point) point.xp += Math.max(0, Number(record.xp) || 0);
    },
    finish() {
      const languages = [...languageMap.values()].map(({ days: languageDays, executionDays, categories, ...lang }) => ({ ...lang, activeSeconds: round(lang.activeSeconds), practiceDays: languageDays.size, executionDays: executionDays.size, successRate: lang.id === 'web' ? null : percent(lang.successes, lang.successes + lang.errors), topError: Object.entries(categories).sort((a, b) => b[1] - a[1]).map(([category, count]) => ({ category, count }))[0] || null })).sort((a, b) => b.meaningfulAttempts - a.meaningfulAttempts || b.activeSeconds - a.activeSeconds || a.label.localeCompare(b.label));
      const compiled = languages.filter((lang) => lang.id !== 'web');
      summary.practiceDays = days.size; summary.activeSeconds = round(summary.activeSeconds);
      summary.successRate = percent(compiled.reduce((sum, item) => sum + item.successes, 0), compiled.reduce((sum, item) => sum + item.successes + item.errors, 0));
      const enough = compiled.filter((lang) => lang.successes + lang.errors >= 10 && lang.executionDays >= 3);
      const consistent = enough.filter((lang) => lang.successes > 0).sort((a, b) => b.successRate - a.successRate || b.errorsResolved - a.errorsResolved)[0];
      const needs = enough.filter((lang) => lang.topError?.count >= 3).sort((a, b) => a.successRate - b.successRate || b.errors - a.errors)[0];
      const used = languages.find((lang) => lang.meaningfulAttempts > 0);
      const highlights = {
        mostUsed: used ? { language: used.id, label: used.label, detail: `${used.meaningfulAttempts} distinct revisions across ${used.practiceDays} practice ${used.practiceDays === 1 ? 'day' : 'days'}.` } : null,
        mostConsistent: consistent ? { language: consistent.id, label: consistent.label, detail: `${consistent.successRate}% of distinct revisions ran without errors. This measures execution, not solution correctness.` } : null,
        needsPractice: needs ? { language: needs.id, label: needs.label, detail: `${needs.topError.count} distinct revisions had ${needs.topError.category} errors. Review this pattern in your next practice session.` } : null,
      };
      const suggestions = [];
      if (!enough.length) suggestions.push({ title: 'Learning your pattern', detail: 'Execution insights need at least 10 distinct revisions across 3 days in a language. Keep practising to build a useful picture.' });
      if (needs) suggestions.push({ title: `Practise ${needs.label} ${needs.topError.category} errors`, detail: 'Try a small example, reproduce the error, and change one part at a time. Run it again to check the correction.' });
      if (summary.errorsResolved) suggestions.push({ title: 'Keep checking your follow-up runs', detail: `${summary.errorsResolved} error ${summary.errorsResolved === 1 ? 'sequence was' : 'sequences were'} followed by changed code that ran without errors in the same session. Check expected output to confirm the fix.` });
      if (summary.webPreviews) suggestions.push({ title: 'Check your web previews', detail: 'Preview launches count as practice. Test interactions and layout yourself; a rendered page does not establish correct behavior.' });
      suggestions.push({ title: 'Check the result as well as the run', detail: 'Use expected outputs and edge cases to verify your solutions. Successful execution alone does not measure language proficiency.' });
      return { summary, languages, highlights, suggestions, recent, trend: [...trend.values()].map((point) => ({ ...point, activeSeconds: round(point.activeSeconds) })) };
    },
  };
}

function rangeFilter(scope, window, now) {
  if (!window.startDay) return { ...scope, startedAt: { $lte: now } };
  return { ...scope, startedAt: { $gte: new Date(new Date(`${window.startDay}T00:00:00Z`).getTime() - DAY), $lte: now }, $expr: { $gte: [{ $dateToString: { date: '$startedAt', format: '%Y-%m-%d', timezone: window.timeZone } }, window.startDay] } };
}

export async function readCodeMatrixInsights(db, scope, { range = '30d', timeZone = 'UTC', now = new Date() } = {}) {
  const window = insightWindow(range, timeZone, now);
  const accumulator = createInsightAccumulator(window);
  const attempts = db.collection(CODE_MATRIX_INSIGHTS_ATTEMPTS);
  const activity = db.collection(CODE_MATRIX_INSIGHTS_ACTIVITY);
  const filter = rangeFilter(scope, window, now);
  const options = { batchSize: 200, maxTimeMS: 15_000 };
  for await (const record of attempts.find(filter, { ...options, sort: { sessionId: 1, language: 1, startedAt: 1, attemptId: 1 }, allowDiskUse: true, projection: { _id: 0, attemptId: 1, sessionId: 1, revisionHash: 1, language: 1, surface: 1, status: 1, errorCategory: 1, startedAt: 1 } })) accumulator.raw(record);
  const unique = attempts.aggregate([
    { $match: { ...filter, status: { $in: MEANINGFUL } } },
    { $sort: { startedAt: 1, attemptId: 1 } },
    { $group: { _id: { session: '$sessionId', language: '$language', revision: '$revisionHash' }, record: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$record' } },
    { $sort: { sessionId: 1, language: 1, startedAt: 1, attemptId: 1 } },
    { $project: { _id: 0, sessionId: 1, language: 1, status: 1, errorCategory: 1, startedAt: 1 } },
  ], { ...options, allowDiskUse: true });
  for await (const record of unique) accumulator.meaningful(record);
  for await (const record of activity.find(filter, { ...options, projection: { _id: 0, language: 1, activeSeconds: 1, startedAt: 1 } })) accumulator.activity(record);
  let totalXp = 0; let successfulRuns = 0;
  const historical = new Map();
  // Historical successes remain separate from the new error-rate denominators.
  for await (const record of db.collection(MOMENTUM_EVENTS_COLLECTION).find({ ...scope, kind: 'coding' }, { ...options, projection: { _id: 0, language: 1, xp: 1, occurredAt: 1, recordedAt: 1 } })) {
    totalXp += Math.max(0, Number(record.xp) || 0); successfulRuns++;
    if (Object.hasOwn(INSIGHT_LANGUAGES, record.language)) historical.set(record.language, (historical.get(record.language) || 0) + 1);
    if (record.occurredAt || record.recordedAt) accumulator.xp(record);
  }
  const firstRecords = await Promise.all([attempts.findOne(scope, { sort: { startedAt: 1 }, projection: { startedAt: 1 } }), activity.findOne(scope, { sort: { startedAt: 1 }, projection: { startedAt: 1 } })]);
  const earliest = firstRecords.filter(Boolean).map((record) => new Date(record.startedAt).toISOString()).sort()[0] || null;
  const runsIntoReward = successfulRuns % MOMENTUM_RULES.codeRunsPerReward;
  return { range, timeZone: window.timeZone, trendWindowDays: window.days, trackingSince: earliest, ...accumulator.finish(), xp: { total: totalXp, successfulRuns, runsIntoReward, runsToNextReward: MOMENTUM_RULES.codeRunsPerReward - runsIntoReward, rewardXp: MOMENTUM_RULES.coding, runsPerReward: MOMENTUM_RULES.codeRunsPerReward }, historicalLanguages: [...historical].map(([id, count]) => ({ id, label: INSIGHT_LANGUAGES[id], successfulRuns: count })).sort((a, b) => b.successfulRuns - a.successfulRuns) };
}
