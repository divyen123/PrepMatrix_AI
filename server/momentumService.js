import { createHash, randomUUID } from 'node:crypto';
import { createPlannerHistoryEntry, getPreviousPlannerAnalytics, mergePlannerHistory, normalizePlannerHistory } from '../src/utils/plannerHistory.js';
import { getCodeMatrixPracticeQuestion, normalizePracticeOutput } from '../src/utils/codeMatrixPractice.js';
import { summarizeBattleRewards } from './quizBattleCore.js';

export const MOMENTUM_EVENTS_COLLECTION = 'momentumEvents';
export const MOMENTUM_RULES = Object.freeze({ study: 10, exam: 40, quiz: 10, coding: 10, practiceCoding: 10, codeRunsPerReward: 4 });
const list = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim().slice(0, 500);
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hasPlan = (workspace) => list(workspace?.schedule).some((day) => list(day?.tasks).some((task) => task?.task && !['memory_review', 'memory-decay'].includes(task.source)));
const iso = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null;

export function resolveMomentumSchedule(previous = {}, next = {}, now = new Date()) {
  if (!hasPlan(next)) return null;
  const token = text(next.schedule?.[0]?.momentumToken);
  if (hasPlan(previous) && previous.momentumSchedule?.id && (!token || token === previous.momentumSchedule.token)) return previous.momentumSchedule;
  return { id: randomUUID(), token, startedAt: now.toISOString() };
}

/** Only a newly archived copy of the server's active plan receives its trusted XP scope. */
export function enrichPlannerHistoryForArchive(previous = {}, incomingHistory = [], now = new Date(), nextWorkspace) {
  const saved = normalizePlannerHistory(previous.plannerHistory);
  const savedIds = new Set(saved.map((entry) => entry.id));
  const previousTasks = list(previous.schedule).flatMap((day) => list(day?.tasks)).filter((task) => task?.task && !['memory_review', 'memory-decay'].includes(task.source));
  const labels = new Set(previousTasks.map((task) => text(task.task)));
  let archivedCurrent = false;
  const incoming = normalizePlannerHistory(incomingHistory).map((entry) => {
    if (savedIds.has(entry.id)) return entry;
    const cleanEntry = { ...entry };
    delete cleanEntry.momentumSchedule;
    delete cleanEntry.learningInsights;
    if (!previousTasks.length || !entry.tasks.every((task) => labels.has(task.label))) return cleanEntry;
    const completed = [...list(previous.completed), ...entry.tasks.map((task) => task.label)];
    const enriched = createPlannerHistoryEntry({ ...previous, completed }, { id: entry.id, now });
    if (enriched) archivedCurrent = true;
    return enriched || cleanEntry;
  });
  if (nextWorkspace && previousTasks.length && !archivedCurrent) {
    const oldToken = text(previous.schedule?.[0]?.momentumToken || previous.momentumSchedule?.token);
    const nextToken = text(nextWorkspace.schedule?.[0]?.momentumToken);
    const replaced = !hasPlan(nextWorkspace) || (nextToken && nextToken !== oldToken);
    if (replaced) {
      const entry = createPlannerHistoryEntry(previous, { now });
      if (entry) incoming.push(entry);
    }
  }
  return mergePlannerHistory(saved, incoming);
}

export function studyMomentumEvents(workspace, scheduleId = '', now = new Date(), historical = false) {
  const current = createPlannerHistoryEntry(workspace, { id: 'current', now });
  const records = [...normalizePlannerHistory(workspace?.plannerHistory), ...(current ? [current] : [])];
  return records.flatMap((record) => record.tasks.map((task) => ({
    // A saved occurrence earns once, including after retries, rechecks or archive migration.
    key: `study:${digest([task.subjectName, task.label, task.date, task.time])}`,
    kind: 'study', xp: MOMENTUM_RULES.study, subject: task.subjectName,
    title: task.topic || task.label, detail: task.chapterTitle ? `Chapter: ${task.chapterTitle}` : 'Completed study task',
    scheduledDate: task.date, scheduleId: record.id === 'current' ? scheduleId : record.momentumSchedule?.id || '',
    occurredAt: !historical && record.id === 'current' ? now.toISOString() : null,
    recordedAt: now.toISOString(),
  })));
}

export async function insertMomentumEvent(db, scope, event) {
  const document = { ...event, ...scope, _id: digest([String(scope.userId), scope.academicProfileId, event.key]) };
  try {
    const result = await db.collection(MOMENTUM_EVENTS_COLLECTION).updateOne({ _id: document._id }, { $setOnInsert: document }, { upsert: true });
    return { event: document, inserted: Boolean(result.upsertedCount || result.upsertedId) };
  } catch (error) { if (error?.code !== 11000) throw error; return { event: document, inserted: false }; }
}

async function insertMomentumEvents(db, scope, events) {
  const unique = [...new Map(events.map((event) => [event.key, event])).values()];
  if (!unique.length) return;
  const operations = unique.map((event) => {
    const document = { ...event, ...scope, _id: digest([String(scope.userId), scope.academicProfileId, event.key]) };
    return { updateOne: { filter: { _id: document._id }, update: { $setOnInsert: document }, upsert: true } };
  });
  await db.collection(MOMENTUM_EVENTS_COLLECTION).bulkWrite(operations, { ordered: true });
}

// Called inside the existing profile write fence, before clearing/replacing the workspace.
export async function syncWorkspaceMomentum(db, scope, previous = {}, next = previous, now = new Date()) {
  const oldSchedule = previous.momentumSchedule || (hasPlan(previous) ? resolveMomentumSchedule({}, previous, now) : null);
  const momentumSchedule = resolveMomentumSchedule({ ...previous, momentumSchedule: oldSchedule }, next, now);
  const oldEvents = studyMomentumEvents(previous, oldSchedule?.id, now, true);
  const newEvents = studyMomentumEvents(next, momentumSchedule?.id || oldSchedule?.id, now);
  await insertMomentumEvents(db, scope, [...newEvents, ...oldEvents]);
  return momentumSchedule;
}

export function assessmentMomentumEvent(kind, attempt, context = {}, now = new Date()) {
  if (!attempt?._id) return null;
  let xp;
  if (kind === 'quiz') {
    if (attempt.status !== 'completed' || !(attempt.total > 0) || Number(attempt.answeredCount) < Number(attempt.total)) return null;
    xp = MOMENTUM_RULES.quiz;
  } else if (kind === 'exam') {
    if (!['submitted', 'auto_submitted'].includes(attempt.status) || !Object.keys(attempt.answers || {}).length) return null;
    xp = MOMENTUM_RULES.exam;
  } else if (kind === 'battle') {
    xp = Math.max(0, Math.trunc(Number(attempt.totalXp) || 0));
    if (!xp) return null;
  } else return null;
  const occurredAt = iso(attempt.completedAt || attempt.submittedAt || attempt.awardedAt || attempt.createdAt);
  const schedule = context.momentumSchedule;
  const scheduleId = attempt.momentumScheduleId || (occurredAt && schedule?.startedAt && occurredAt >= schedule.startedAt ? schedule.id : '');
  return { key: `${kind}:${String(attempt._id)}`, kind, xp, scheduleId,
    subject: text(attempt.subjectName || context.subjectName) || 'General study',
    title: text(kind === 'exam' ? context.title || 'Online exam completed' : kind === 'battle' ? context.title || 'Quiz Battle' : attempt.topic || 'Quiz completed'),
    detail: kind === 'battle' ? `Completion ${attempt.completionXp || 0} + win ${attempt.winXp || 0} + draw ${attempt.drawXp || 0} + perfect score ${attempt.perfectXp || 0} XP` : `${kind === 'exam' ? 'Exam' : 'Quiz'} completion reward`,
    occurredAt, recordedAt: now.toISOString() };
}

export async function awardAssessmentMomentum(db, scope, kind, attempt, context = {}) {
  const event = assessmentMomentumEvent(kind, attempt, context);
  if (event) await insertMomentumEvent(db, scope, event);
}

export async function reconcileMomentum(db, scope) {
  const workspace = await db.collection('workspaces').findOne(scope) || {};
  const momentumSchedule = await syncWorkspaceMomentum(db, scope, workspace);
  await db.collection('workspaces').updateOne(scope, { $set: { momentumSchedule } });
  const [quizzes, exams, rewards] = await Promise.all([
    db.collection('quizAttempts').find({ ...scope, status: 'completed' }).toArray(),
    db.collection('examAttempts').find({ ...scope, status: { $in: ['submitted', 'auto_submitted'] } }).toArray(),
    db.collection('quizBattleRewards').find(scope).toArray(),
  ]);
  const examDocs = exams.length ? await db.collection('exams').find({ ...scope, _id: { $in: exams.map((item) => item.examId) } }).toArray() : [];
  const battles = rewards.length ? await db.collection('quizBattles').find({ _id: { $in: rewards.map((item) => item.battleId) } }).toArray() : [];
  const assessmentEvents = [
    ...quizzes.map((attempt) => assessmentMomentumEvent('quiz', attempt, { momentumSchedule })),
    ...exams.map((attempt) => assessmentMomentumEvent('exam', attempt, { ...examDocs.find((item) => String(item._id) === String(attempt.examId)), momentumSchedule })),
    ...rewards.map((reward) => assessmentMomentumEvent('battle', reward, { ...battles.find((item) => String(item._id) === String(reward.battleId)), momentumSchedule })),
  ].filter(Boolean);
  await insertMomentumEvents(db, scope, assessmentEvents);
  return momentumSchedule;
}

export function summarizeMomentum(events = [], scheduleId = '') {
  const rewards = events.filter((event) => event.xp > 0);
  const summarize = (rows) => {
    const totalXp = rows.reduce((sum, event) => sum + event.xp, 0);
    return { totalXp, level: Math.floor(totalXp / 100) + 1, levelProgress: totalXp % 100,
      breakdown: Object.fromEntries(['study', 'exam', 'quiz', 'battle', 'coding'].map((kind) => [kind, rows.filter((event) => event.kind === kind).reduce((sum, event) => sum + event.xp, 0)])) };
  };
  return { global: summarize(rewards), schedule: summarize(rewards.filter((event) => scheduleId && event.scheduleId === scheduleId && event.kind !== 'coding')),
    successfulCodeRuns: events.filter((event) => event.kind === 'coding' && event.source !== 'practice').length,
    solvedCodeQuestions: events.filter((event) => event.kind === 'coding' && event.source === 'practice' && event.xp > 0).length,
    history: rewards.sort((a, b) => (b.occurredAt || b.recordedAt).localeCompare(a.occurredAt || a.recordedAt)).map((event) => Object.fromEntries([
      ['id', String(event._id)], ...['kind', 'source', 'questionId', 'version', 'language', 'xp', 'subject', 'title', 'detail', 'scheduledDate', 'scheduleId', 'occurredAt', 'recordedAt'].map((key) => [key, event[key]]),
    ])) };
}

export async function readMomentum(db, scope, momentumSchedule) {
  const events = await db.collection(MOMENTUM_EVENTS_COLLECTION).find(scope).toArray();
  return { ...summarizeMomentum(events, momentumSchedule?.id), scheduleId: momentumSchedule?.id || '', rules: MOMENTUM_RULES };
}

/** Reconstructs rewards as of the archive; later current-plan rewards never leak into this view. */
export async function readPreviousMomentum(db, scope, historyId) {
  const workspace = await db.collection('workspaces').findOne(scope) || {};
  const snapshot = getPreviousPlannerAnalytics(workspace.plannerHistory, historyId);
  if (!snapshot) throw Object.assign(new Error('The previous schedule is no longer available.'), { status: 404 });
  const cutoff = snapshot.archivedAt;
  const archivesAtCutoff = normalizePlannerHistory(workspace.plannerHistory).filter((entry) => entry.archivedAt <= cutoff);
  const knownPastStudy = studyMomentumEvents({ plannerHistory: archivesAtCutoff }, '', new Date(cutoff), true);
  const selectedStudy = studyMomentumEvents({ plannerHistory: [snapshot] }, '', new Date(cutoff), true);
  const selectedKeys = new Set(selectedStudy.map((event) => event.key));
  const knownKeys = new Set(knownPastStudy.map((event) => event.key));
  const [events, quizzes, exams, battleRewards] = await Promise.all([
    db.collection(MOMENTUM_EVENTS_COLLECTION).find(scope).toArray(),
    db.collection('quizAttempts').find({ ...scope, status: 'completed' }).toArray(),
    db.collection('examAttempts').find({ ...scope, status: { $in: ['submitted', 'auto_submitted'] } }).toArray(),
    db.collection('quizBattleRewards').find(scope).toArray(),
  ]);
  const pastEvents = events.filter((event) => {
    const timestamp = iso(event.occurredAt || event.recordedAt);
    return Boolean(timestamp && timestamp <= cutoff) || (event.kind === 'study' && knownKeys.has(event.key));
  });
  // Legacy completion archives prove these rewards existed, even if migration recorded them later.
  const globalEvents = new Map(pastEvents.map((event) => [event.key, event]));
  for (const event of knownPastStudy) if (!globalEvents.has(event.key)) globalEvents.set(event.key, { ...event, _id: event.key });
  // Recover saved assessment facts without writing rewards or changing the active workspace.
  const historicalContext = { momentumSchedule: snapshot.momentumSchedule };
  const assessmentEvents = [
    ...quizzes.map((attempt) => assessmentMomentumEvent('quiz', attempt, historicalContext, new Date(cutoff))),
    ...exams.map((attempt) => assessmentMomentumEvent('exam', attempt, historicalContext, new Date(cutoff))),
    ...battleRewards.map((reward) => assessmentMomentumEvent('battle', reward, historicalContext, new Date(cutoff))),
  ].filter((event) => event?.occurredAt && event.occurredAt <= cutoff);
  for (const event of assessmentEvents) {
    const saved = globalEvents.get(event.key);
    if (!saved) globalEvents.set(event.key, { ...event, _id: event.key });
    else if (!saved.scheduleId && event.scheduleId) globalEvents.set(event.key, { ...saved, scheduleId: event.scheduleId });
  }
  const rows = [...globalEvents.values()];
  const inferredIds = [...new Set(rows.filter((event) => event.kind === 'study' && selectedKeys.has(event.key)).map((event) => event.scheduleId).filter(Boolean))];
  const scheduleId = snapshot.momentumSchedule?.id || (inferredIds.length === 1 ? inferredIds[0] : '');
  const scheduleEvents = rows.filter((event) => event.kind === 'study'
    ? selectedKeys.has(event.key)
    : event.kind !== 'coding' && scheduleId && event.scheduleId === scheduleId);
  const globalSummary = summarizeMomentum(rows);
  const scheduleSummary = summarizeMomentum(scheduleEvents).global;
  const quizKeys = new Set(scheduleEvents.filter((event) => event.kind === 'quiz').map((event) => event.key));
  const quizAttempts = quizzes.filter((attempt) => quizKeys.has(`quiz:${String(attempt._id)}`)).map((attempt) => ({
    id: String(attempt._id), status: 'completed', total: attempt.total, score: attempt.score,
    subjectName: text(attempt.subjectName), createdAt: iso(attempt.createdAt), completedAt: iso(attempt.completedAt),
    momentumScheduleId: attempt.momentumScheduleId || scheduleId,
  }));
  const battleEvents = scheduleEvents.filter((event) => event.kind === 'battle');
  const battleKeys = new Set(battleEvents.map((event) => event.key));
  const start = iso(snapshot.momentumSchedule?.startedAt);
  const matchedBattleRewards = battleRewards.filter((reward) => {
    const awardedAt = iso(reward.awardedAt || reward.createdAt);
    if (!awardedAt || awardedAt > cutoff) return false;
    if (battleKeys.has(`battle:${String(reward._id)}`)) return true;
    // Capped completed battles have no XP event, but still belong to the archived period.
    return Boolean(start && snapshot.momentumSchedule?.id && awardedAt >= start
      && (!reward.momentumScheduleId || reward.momentumScheduleId === scheduleId));
  });
  const rewardKeys = new Set(matchedBattleRewards.map((reward) => `battle:${String(reward._id)}`));
  const ledgerOnlyRewards = battleEvents.filter((event) => !rewardKeys.has(event.key)).map((event) => {
    const winXp = Number(/\bwin (\d+)/u.exec(event.detail || '')?.[1] || 0);
    const drawXp = Number(/\bdraw (\d+)/u.exec(event.detail || '')?.[1] || 0);
    const perfectXp = Number(/\bperfect score (\d+)/u.exec(event.detail || '')?.[1] || 0);
    return { completed: true, totalXp: event.xp, outcome: winXp ? 'win' : drawXp ? 'draw' : '', score: perfectXp ? 10 : undefined };
  });
  const summarizedBattles = summarizeBattleRewards([...matchedBattleRewards, ...ledgerOnlyRewards]);
  const battleStats = { ...summarizedBattles, battleXp: scheduleSummary.breakdown.battle,
    badges: [...(summarizedBattles.played ? ['First Duel'] : []), ...(summarizedBattles.perfectScores ? ['Perfect Ten'] : []), ...(summarizedBattles.wins >= 3 ? ['Three Wins'] : [])] };
  return { ...globalSummary, schedule: scheduleSummary, scheduleId, rules: MOMENTUM_RULES,
    historyId: snapshot.id, asOf: cutoff, historical: true, battleStats, quizAttempts,
    incomplete: snapshot.isPartialSnapshot || !scheduleId,
    history: globalSummary.history };
}

function invalidPracticeReward() {
  return Object.assign(new Error('Pass every test case to earn this coding reward.'), { status: 400 });
}

export function validatePracticeReward(practice, language) {
  if (!practice || typeof practice !== 'object' || Array.isArray(practice)
    || typeof practice.questionId !== 'string' || practice.questionId.length > 80
    || !Number.isSafeInteger(practice.version)) throw invalidPracticeReward();
  const question = getCodeMatrixPracticeQuestion(practice.questionId);
  if (!question || question.version !== practice.version || !question.supportedLanguages.includes(language)
    || !Array.isArray(practice.results) || practice.results.length !== question.testCases.length) throw invalidPracticeReward();
  const results = new Map();
  for (const result of practice.results) {
    if (!result || typeof result !== 'object' || typeof result.id !== 'string' || result.id.length > 80
      || results.has(result.id) || result.status !== 'success' || typeof result.stdout !== 'string' || result.stdout.length > 8192) throw invalidPracticeReward();
    results.set(result.id, result);
  }
  if (!question.testCases.every((testCase) => {
    const result = results.get(testCase.id);
    return result && normalizePracticeOutput(result.stdout) === normalizePracticeOutput(testCase.expectedOutput);
  })) throw invalidPracticeReward();
  return question;
}

export async function recordSuccessfulCodeRun(db, scope, { runId, language, practice }, now = new Date()) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(runId || '') || !['python', 'c', 'cpp', 'java', 'javascript', 'sql'].includes(language)) {
    const error = new Error('A valid successful execution is required.'); error.status = 400; throw error;
  }
  if (practice !== undefined) {
    const question = validatePracticeReward(practice, language);
    const key = `coding:practice:${question.id}:${question.version}`;
    const event = { key, kind: 'coding', source: 'practice', xp: MOMENTUM_RULES.practiceCoding,
      questionId: question.id, version: question.version, scheduleId: '', subject: 'CodeMatrix',
      title: question.title, detail: `All ${question.testCases.length} test cases passed`, language,
      occurredAt: now.toISOString(), recordedAt: now.toISOString() };
    const { inserted } = await insertMomentumEvent(db, scope, event);
    return { awardedXp: inserted ? event.xp : 0, duplicate: !inserted, runId,
      source: 'practice', questionId: question.id, version: question.version, title: question.title };
  }
  const key = `coding:${runId}`;
  const existing = await db.collection(MOMENTUM_EVENTS_COLLECTION).findOne({ ...scope, key });
  if (existing) return { awardedXp: 0, runId, duplicate: true };
  const count = await db.collection(MOMENTUM_EVENTS_COLLECTION).countDocuments({ ...scope, kind: 'coding', source: { $ne: 'practice' } }) + 1;
  const xp = count % MOMENTUM_RULES.codeRunsPerReward === 0 ? MOMENTUM_RULES.coding : 0;
  const { inserted } = await insertMomentumEvent(db, scope, { key, kind: 'coding', source: 'run', xp, scheduleId: '', subject: 'CodeMatrix', title: `${language.toUpperCase()} · successful run ${count}`,
    detail: `Runs ${count - 3}–${count}: four successful executions`, language, occurredAt: now.toISOString(), recordedAt: now.toISOString() });
  return { awardedXp: inserted ? xp : 0, duplicate: !inserted, runId, successfulRuns: count, nextRewardIn: 4 - count % 4 };
}
