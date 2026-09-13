import { createHash, randomUUID } from 'node:crypto';
import { createPlannerHistoryEntry, normalizePlannerHistory } from '../src/utils/plannerHistory.js';

export const MOMENTUM_EVENTS_COLLECTION = 'momentumEvents';
export const MOMENTUM_RULES = Object.freeze({ study: 10, exam: 40, quiz: 10, coding: 10, codeRunsPerReward: 4 });
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

export function studyMomentumEvents(workspace, scheduleId = '', now = new Date(), historical = false) {
  const current = createPlannerHistoryEntry(workspace, { id: 'current', now });
  const records = [...normalizePlannerHistory(workspace?.plannerHistory), ...(current ? [current] : [])];
  return records.flatMap((record) => record.tasks.map((task) => ({
    // A saved occurrence earns once, including after retries, rechecks or archive migration.
    key: `study:${digest([task.subjectName, task.label, task.date, task.time])}`,
    kind: 'study', xp: MOMENTUM_RULES.study, subject: task.subjectName,
    title: task.topic || task.label, detail: task.chapterTitle ? `Chapter: ${task.chapterTitle}` : 'Completed study task',
    scheduledDate: task.date, scheduleId: record.id === 'current' ? scheduleId : '',
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
    successfulCodeRuns: events.filter((event) => event.kind === 'coding').length,
    history: rewards.sort((a, b) => (b.occurredAt || b.recordedAt).localeCompare(a.occurredAt || a.recordedAt)).map((event) => Object.fromEntries([
      ['id', String(event._id)], ...['kind', 'xp', 'subject', 'title', 'detail', 'scheduledDate', 'scheduleId', 'occurredAt', 'recordedAt'].map((key) => [key, event[key]]),
    ])) };
}

export async function readMomentum(db, scope, momentumSchedule) {
  const events = await db.collection(MOMENTUM_EVENTS_COLLECTION).find(scope).toArray();
  return { ...summarizeMomentum(events, momentumSchedule?.id), scheduleId: momentumSchedule?.id || '', rules: MOMENTUM_RULES };
}

export async function recordSuccessfulCodeRun(db, scope, { runId, language }, now = new Date()) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(runId || '') || !['python', 'c', 'cpp', 'java', 'javascript', 'sql'].includes(language)) {
    const error = new Error('A valid successful execution is required.'); error.status = 400; throw error;
  }
  const key = `coding:${runId}`;
  const existing = await db.collection(MOMENTUM_EVENTS_COLLECTION).findOne({ ...scope, key });
  if (existing) return { awardedXp: existing.xp, runId, duplicate: true };
  const count = await db.collection(MOMENTUM_EVENTS_COLLECTION).countDocuments({ ...scope, kind: 'coding' }) + 1;
  const xp = count % MOMENTUM_RULES.codeRunsPerReward === 0 ? MOMENTUM_RULES.coding : 0;
  await insertMomentumEvent(db, scope, { key, kind: 'coding', xp, scheduleId: '', subject: 'CodeMatrix', title: `${language.toUpperCase()} · successful run ${count}`,
    detail: `Runs ${count - 3}–${count}: four successful executions`, language, occurredAt: now.toISOString(), recordedAt: now.toISOString() });
  return { awardedXp: xp, runId, successfulRuns: count, nextRewardIn: 4 - count % 4 };
}
