import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { assessmentMomentumEvent, enrichPlannerHistoryForArchive, insertMomentumEvent, readMomentum, readPreviousMomentum, reconcileMomentum, recordSuccessfulCodeRun, resolveMomentumSchedule, studyMomentumEvents, syncWorkspaceMomentum, MOMENTUM_EVENTS_COLLECTION } from './momentumService.js';
import registerMomentumRoutes from './momentumRoutes.js';
import { buildClearedPlannerWorkspace, createPlannerHistoryEntry } from '../src/utils/plannerHistory.js';
import { CODE_MATRIX_PRACTICE_QUESTIONS } from '../src/utils/codeMatrixPractice.js';

export function fakeMomentumDb() {
  const collections = new Map();
  return { collection(name) {
    if (!collections.has(name)) collections.set(name, []);
    const rows = collections.get(name);
    const matches = (row, filter) => Object.entries(filter).every(([key, value]) => {
      if (value && typeof value === 'object' && '$in' in value) return value.$in.includes(row[key]);
      if (value && typeof value === 'object' && '$ne' in value) return row[key] !== value.$ne;
      return row[key] === value;
    });
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
const practiceQuestion = () => CODE_MATRIX_PRACTICE_QUESTIONS[0];
const practiceRequest = () => {
  const question = practiceQuestion();
  return { runId: randomUUID(), language: 'python', practice: {
    questionId: question.id, version: question.version,
    results: question.testCases.map(({ id, expectedOutput }) => ({ id, status: 'success', stdout: expectedOutput })),
  } };
};

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

test('new archives receive the trusted prior plan and XP scope while saved records stay immutable', () => {
  const prior = { ...plan, completed: ['tcp'], momentumSchedule: { id: 'trusted-plan', token: 'plan-one', startedAt: '2026-09-13T00:00:00.000Z' } };
  const incoming = createPlannerHistoryEntry(prior, { id: 'new', now });
  const forged = { ...incoming, momentumSchedule: { id: 'forged', startedAt: '2000-01-01' }, subjects: [{ name: 'Changed' }], schedule: undefined };
  const enriched = enrichPlannerHistoryForArchive(prior, [forged], now);
  assert.equal(enriched[0].momentumSchedule.id, 'trusted-plan');
  assert.equal(enriched[0].schedule[0].tasks[0].task, plan.schedule[0].tasks[0].task);
  assert.equal(enriched[0].subjects[0].name, 'Networks');
  const saved = { ...prior, plannerHistory: enriched };
  assert.deepEqual(enrichPlannerHistoryForArchive(saved, [{ ...forged, archivedAt: '2026-10-01' }], now), enriched);
  const unrelated = { ...forged, id: 'unrelated', tasks: [{ ...incoming.tasks[0], label: 'Different task' }] };
  assert.equal(enrichPlannerHistoryForArchive(prior, [unrelated], now)[0].momentumSchedule, undefined);
});

test('replacing or clearing a schedule automatically archives prior work once without archiving ordinary edits', () => {
  const prior = { ...plan, completed: ['tcp'], momentumSchedule: { id: 'prior-plan', token: 'plan-one', startedAt: '2026-09-13T00:00:00.000Z' } };
  const replacement = { ...prior, schedule: [{ ...plan.schedule[0], momentumToken: 'plan-two' }], completed: [] };
  const automatic = enrichPlannerHistoryForArchive(prior, [], now, replacement);
  assert.equal(automatic.length, 1);
  assert.equal(automatic[0].momentumSchedule.id, 'prior-plan');
  assert.equal(automatic[0].schedule[0].momentumToken, 'plan-one');
  assert.equal(automatic[0].fullyCompleted, true);
  const explicit = createPlannerHistoryEntry(prior, { id: 'explicit', now });
  assert.equal(enrichPlannerHistoryForArchive(prior, [explicit], now, replacement).length, 1);
  const cleared = { ...prior, schedule: [], completed: [] };
  assert.equal(enrichPlannerHistoryForArchive(prior, [], now, cleared).length, 1);
  assert.equal(enrichPlannerHistoryForArchive(prior, [explicit], now, cleared).length, 1);
  assert.equal(enrichPlannerHistoryForArchive(prior, [], now, { ...prior, schedule: [...prior.schedule, { tasks: [] }] }).length, 0);
  assert.equal(enrichPlannerHistoryForArchive({ ...prior, completed: [] }, [], now, replacement).length, 0, 'no completed work is manufactured');
});

test('previous momentum scopes schedule and global XP to the archived plan and cutoff', async () => {
  const db = fakeMomentumDb();
  const started = new Date('2026-09-13T08:00:00Z');
  const beforeArchive = new Date('2026-09-13T09:30:00Z');
  const afterArchive = new Date('2026-09-13T11:00:00Z');
  const momentumSchedule = await syncWorkspaceMomentum(db, scope, {}, plan, started);
  const finished = { ...plan, completed: ['tcp'], momentumSchedule };
  await syncWorkspaceMomentum(db, scope, { ...plan, momentumSchedule }, finished, beforeArchive);
  await insertMomentumEvent(db, scope, assessmentMomentumEvent('exam', { _id: 'old-exam', status: 'submitted', answers: { q1: 1 }, submittedAt: beforeArchive, momentumScheduleId: momentumSchedule.id }, {}, beforeArchive));
  await insertMomentumEvent(db, scope, assessmentMomentumEvent('quiz', { _id: 'old-quiz', status: 'completed', total: 10, answeredCount: 10, completedAt: beforeArchive, momentumScheduleId: momentumSchedule.id }, {}, beforeArchive));
  await insertMomentumEvent(db, scope, { key: 'old-coding', kind: 'coding', source: 'run', xp: 10, scheduleId: '', occurredAt: beforeArchive.toISOString(), recordedAt: beforeArchive.toISOString() });
  const cleared = buildClearedPlannerWorkspace(finished, { id: 'archive-one', now });
  await syncWorkspaceMomentum(db, scope, finished, cleared, now);
  const current = { ...cleared, schedule: [{ date: '2026-09-14', momentumToken: 'plan-two', tasks: [{ task: 'Networks - Routing', subjectName: 'Networks', topic: 'Routing', id: 'routing' }] }], completed: ['routing'] };
  const currentScope = await syncWorkspaceMomentum(db, scope, cleared, current, afterArchive);
  await insertMomentumEvent(db, scope, assessmentMomentumEvent('quiz', { _id: 'new-quiz', status: 'completed', total: 10, answeredCount: 10, completedAt: afterArchive, momentumScheduleId: currentScope.id }, {}, afterArchive));
  db.collection('workspaces').rows.push({ ...scope, ...current, momentumSchedule: currentScope });
  const originalWorkspace = structuredClone(db.collection('workspaces').rows[0]);
  const previous = await readPreviousMomentum(db, scope, 'archive-one');
  assert.equal(previous.global.totalXp, 70);
  assert.equal(previous.schedule.totalXp, 60);
  assert.deepEqual(previous.schedule.breakdown, { study: 10, exam: 40, quiz: 10, battle: 0, coding: 0 });
  assert.equal(previous.scheduleId, momentumSchedule.id);
  assert.equal(previous.incomplete, false);
  assert.equal(previous.history.some((event) => event.title === 'Routing' || event.id.includes('new-quiz')), false);
  assert.equal((await readMomentum(db, scope, currentScope)).global.totalXp, 90);
  assert.deepEqual(db.collection('workspaces').rows[0], originalWorkspace, 'loading old analytics must never replace the active plan');
  await assert.rejects(readPreviousMomentum(db, { ...scope, academicProfileId: 'another-profile' }, 'archive-one'), { status: 404 });
  await assert.rejects(readPreviousMomentum(db, scope, 'missing'), { status: 404 });
});

test('legacy previous momentum includes only proven archived study XP when its original scope is unknown', async () => {
  const db = fakeMomentumDb();
  const modern = createPlannerHistoryEntry({ ...plan, completed: ['tcp'] }, { id: 'legacy', now });
  const legacy = { id: modern.id, archivedAt: modern.archivedAt, startDate: modern.startDate, endDate: modern.endDate, totalTasks: 3, tasks: modern.tasks };
  const workspace = { ...scope, plannerHistory: [legacy], schedule: [], completed: [] };
  db.collection('workspaces').rows.push(workspace);
  // Migration happened after clearing; this does not move a proven historical reward into the present.
  const later = new Date('2026-10-01');
  for (const event of studyMomentumEvents(workspace, '', later, true)) await insertMomentumEvent(db, scope, event);
  await insertMomentumEvent(db, scope, assessmentMomentumEvent('quiz', { _id: 'later', status: 'completed', total: 10, answeredCount: 10, completedAt: later }, {}, later));
  const previous = await readPreviousMomentum(db, scope, 'legacy');
  assert.equal(previous.global.totalXp, 10);
  assert.equal(previous.schedule.totalXp, 10);
  assert.equal(previous.schedule.breakdown.quiz, 0);
  assert.equal(previous.history.length, 1);
  assert.equal(previous.incomplete, true);
  assert.equal(previous.scheduleId, '');
});

test('historical assessments and battle counts recover from saved sources without current rewards or workspace mutation', async () => {
  const db = fakeMomentumDb();
  const priorScope = { id: 'prior', token: 'plan-one', startedAt: '2026-09-13T08:00:00.000Z' };
  const before = '2026-09-13T09:00:00.000Z';
  const later = '2026-09-13T11:00:00.000Z';
  const archived = createPlannerHistoryEntry({ ...plan, completed: ['tcp'], momentumSchedule: priorScope }, { id: 'prior-archive', now });
  db.collection('workspaces').rows.push({ ...scope, ...plan, momentumSchedule: { id: 'current', startedAt: later }, plannerHistory: [archived] });
  db.collection('quizAttempts').rows.push(
    { ...scope, _id: 'prior-quiz', status: 'completed', total: 10, answeredCount: 10, completedAt: before, momentumScheduleId: 'prior' },
    { ...scope, _id: 'earlier-quiz', status: 'completed', total: 10, answeredCount: 10, completedAt: '2026-09-12T09:00:00.000Z' },
    { ...scope, _id: 'current-quiz', status: 'completed', total: 10, answeredCount: 10, completedAt: later, momentumScheduleId: 'current' },
  );
  db.collection('examAttempts').rows.push({ ...scope, _id: 'prior-exam', status: 'submitted', answers: { q1: 1 }, submittedAt: before, momentumScheduleId: 'prior', score: 98 });
  db.collection('quizBattleRewards').rows.push(
    { ...scope, _id: 'prior-win', awardedAt: before, totalXp: 25, completionXp: 10, winXp: 10, perfectXp: 5, completed: true, outcome: 'win', score: 10 },
    { ...scope, _id: 'prior-capped', awardedAt: before, totalXp: 0, completed: true, outcome: 'draw', score: 8 },
    { ...scope, _id: 'current-win', awardedAt: later, totalXp: 25, completed: true, outcome: 'win', score: 10 },
    { ...scope, academicProfileId: 'other-profile', _id: 'unrelated-win', awardedAt: before, totalXp: 25, completed: true, outcome: 'win', score: 10 },
  );
  const originalWorkspace = structuredClone(db.collection('workspaces').rows);
  const previous = await readPreviousMomentum(db, scope, 'prior-archive');
  assert.equal(previous.schedule.totalXp, 85);
  assert.equal(previous.global.totalXp, 95);
  assert.deepEqual(previous.battleStats, { battleXp: 25, played: 2, wins: 1, draws: 1, losses: 0, uncontested: 0, perfectScores: 1, badges: ['First Duel', 'Perfect Ten'] });
  assert.equal(previous.history.some((event) => event.id === 'quiz:current-quiz' || event.id === 'battle:current-win'), false);
  assert.equal(previous.history.find((event) => event.id === 'exam:prior-exam').score, undefined);
  assert.deepEqual(previous.quizAttempts.map((attempt) => attempt.id), ['prior-quiz'], 'reports receive only the archived schedule quiz results, without the live list limit');
  assert.deepEqual(db.collection('workspaces').rows, originalWorkspace);
  assert.equal(db.collection(MOMENTUM_EVENTS_COLLECTION).rows.length, 0, 'reconstruction must not mutate the reward ledger');
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
    const duplicate = await recordSuccessfulCodeRun(db, scope, { runId, language: 'java' }, now);
    assert.equal(duplicate.awardedXp, 0);
    assert.equal(duplicate.duplicate, true);
  }
  const data = await readMomentum(db, scope, { id: 'plan' });
  assert.equal(data.successfulCodeRuns, 8);
  assert.equal(data.global.totalXp, 20);
  assert.equal(data.schedule.totalXp, 0);
  assert.equal(data.history.length, 2);
  await assert.rejects(recordSuccessfulCodeRun(db, scope, { runId: 'bad', language: 'java' }), /valid successful/);
  await assert.rejects(recordSuccessfulCodeRun(db, scope, { runId: randomUUID(), language: 'unsupported' }), /valid successful/);
});

test('practice solutions earn once per question version and profile, independently of ordinary run rewards', async () => {
  const db = fakeMomentumDb();
  const request = practiceRequest();
  // Client XP and flags do not choose the reward amount.
  const result = await recordSuccessfulCodeRun(db, scope, { ...request, xp: 900, passed: true }, now);
  assert.equal(result.awardedXp, 10);
  assert.equal(result.source, 'practice');
  assert.equal(result.title, practiceQuestion().title);
  assert.equal(result.duplicate, false);
  const repeated = await recordSuccessfulCodeRun(db, scope, { ...request, runId: randomUUID(), language: 'java' }, now);
  assert.equal(repeated.awardedXp, 0);
  assert.equal(repeated.duplicate, true);
  assert.equal((await recordSuccessfulCodeRun(db, { ...scope, academicProfileId: 'profile-b' }, request, now)).awardedXp, 10);
  for (let index = 1; index <= 4; index += 1) {
    const run = await recordSuccessfulCodeRun(db, scope, { runId: randomUUID(), language: 'python' }, now);
    assert.equal(run.awardedXp, index === 4 ? 10 : 0);
  }
  const momentum = await readMomentum(db, scope, { id: 'plan' });
  assert.equal(momentum.global.totalXp, 20);
  assert.equal(momentum.global.breakdown.coding, 20);
  assert.equal(momentum.successfulCodeRuns, 4);
  assert.equal(momentum.solvedCodeQuestions, 1);
  assert.equal(momentum.schedule.totalXp, 0);
  const reward = momentum.history.find((event) => event.source === 'practice');
  assert.equal(reward.questionId, request.practice.questionId);
  assert.equal(reward.version, request.practice.version);
  assert.equal(reward.language, 'python');
  assert.equal(reward.detail, `All ${request.practice.results.length} test cases passed`);
  assert.equal(reward.results, undefined);
});

test('restoring deleted reward records preserves totals, compiler cadence and scoped duplicate protection', async () => {
  const db = fakeMomentumDb();
  const otherProfile = { ...scope, academicProfileId: 'profile-b' };
  const otherAccount = { ...scope, userId: 'another-student' };
  const momentumSchedule = { id: 'active', startedAt: '2026-09-13T00:00:00.000Z', token: 'plan-one' };
  db.collection('workspaces').rows.push({ ...scope, ...plan, completed: ['tcp'], momentumSchedule });
  db.collection('quizAttempts').rows.push({ ...scope, _id: 'saved-quiz', status: 'completed', total: 5, answeredCount: 5, completedAt: now });
  await reconcileMomentum(db, scope);
  const runIds = Array.from({ length: 7 }, () => randomUUID());
  for (const runId of runIds) await recordSuccessfulCodeRun(db, scope, { runId, language: 'java' }, now);
  const solved = practiceRequest();
  for (const profile of [scope, otherProfile, otherAccount]) await recordSuccessfulCodeRun(db, profile, solved, now);
  const before = await readMomentum(db, scope, momentumSchedule);
  const originalRecords = structuredClone(db.collection(MOMENTUM_EVENTS_COLLECTION).rows);
  assert.equal(before.global.totalXp, 40);
  assert.equal(before.global.breakdown.coding, 20);
  assert.equal(before.successfulCodeRuns, 7);
  assert.equal(before.solvedCodeQuestions, 1);

  db.collection(MOMENTUM_EVENTS_COLLECTION).rows.splice(0);
  // Saved study/assessment sources recover first; restoration must not count them twice.
  await reconcileMomentum(db, scope);
  assert.equal((await readMomentum(db, scope, momentumSchedule)).global.breakdown.coding, 0);
  const restore = async () => {
    for (const { userId, academicProfileId, ...event } of originalRecords) {
      await insertMomentumEvent(db, { userId, academicProfileId }, event);
    }
  };
  await restore();
  await restore();
  const restored = await readMomentum(db, scope, momentumSchedule);
  assert.deepEqual(restored.global, before.global);
  assert.deepEqual(restored.schedule, before.schedule);
  assert.equal(restored.successfulCodeRuns, before.successfulCodeRuns);
  assert.equal(restored.solvedCodeQuestions, before.solvedCodeQuestions);
  assert.equal(restored.history.length, before.history.length);
  assert.equal(db.collection(MOMENTUM_EVENTS_COLLECTION).rows.length, originalRecords.length);
  for (const profile of [otherProfile, otherAccount]) {
    const isolated = await readMomentum(db, profile);
    assert.equal(isolated.global.totalXp, 10);
    assert.equal(isolated.successfulCodeRuns, 0);
    assert.equal(isolated.solvedCodeQuestions, 1);
  }

  const replay = await recordSuccessfulCodeRun(db, scope, { runId: runIds[3], language: 'java' }, now);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.awardedXp, 0);
  const practiceReplay = await recordSuccessfulCodeRun(db, scope, { ...solved, runId: randomUUID() }, now);
  assert.equal(practiceReplay.duplicate, true);
  assert.equal(practiceReplay.awardedXp, 0);
  const nextRunId = randomUUID();
  const nextRun = await recordSuccessfulCodeRun(db, scope, { runId: nextRunId, language: 'python' }, now);
  assert.equal(nextRun.successfulRuns, 8);
  assert.equal(nextRun.awardedXp, 10);
  assert.equal(nextRun.nextRewardIn, 4);
  assert.equal((await recordSuccessfulCodeRun(db, scope, { runId: nextRunId, language: 'python' }, now)).awardedXp, 0);
  const after = await readMomentum(db, scope, momentumSchedule);
  assert.equal(after.global.totalXp, before.global.totalXp + 10);
  assert.deepEqual(after.schedule, before.schedule);
  assert.equal(after.successfulCodeRuns, 8);
  assert.equal(after.solvedCodeQuestions, 1);
});

test('practice rewards validate complete canonical outputs rather than client success flags', async () => {
  const db = fakeMomentumDb();
  const invalid = [
    (request) => { request.practice = null; },
    (request) => { request.practice.questionId = 'unknown-question'; },
    (request) => { request.practice.version += 1; },
    (request) => { request.language = 'sql'; },
    (request) => { request.practice.results = []; },
    (request) => { request.practice.results.pop(); },
    (request) => { request.practice.results[0].status = 'error'; },
    (request) => { request.practice.results[0].status = 'passed'; },
    (request) => { request.practice.results[0].stdout = 'wrong output'; request.practice.results[0].passed = true; },
    (request) => { request.practice.results[0].stdout = 'x'.repeat(8193); },
    (request) => { request.practice.results[0].id = 'unknown-case'; },
    (request) => { request.practice.results[1].id = request.practice.results[0].id; },
  ];
  for (const mutate of invalid) {
    const request = practiceRequest();
    mutate(request);
    await assert.rejects(recordSuccessfulCodeRun(db, scope, request, now), (error) => error.status === 400);
  }
  assert.equal((await readMomentum(db, scope)).global.totalXp, 0);
  const valid = practiceRequest();
  valid.practice.results.reverse();
  valid.practice.results = valid.practice.results.map((result) => ({ ...result, stdout: `${result.stdout.replace(/\n/gu, '\r\n')}  \r\n\r\n` }));
  assert.equal((await recordSuccessfulCodeRun(db, scope, valid, now)).awardedXp, 10);
});

test('concurrent submissions of one solved practice question insert one reward', async () => {
  const db = fakeMomentumDb();
  const outcomes = await Promise.all(Array.from({ length: 4 }, () => recordSuccessfulCodeRun(db, scope, practiceRequest(), now)));
  assert.equal(outcomes.reduce((total, result) => total + result.awardedXp, 0), 10);
  assert.equal(outcomes.filter((result) => result.duplicate).length, 3);
  assert.equal((await readMomentum(db, scope)).solvedCodeQuestions, 1);
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
  const request = async (method, { user = 'student', profile = 'profile-a', body, query } = {}) => {
    const req = { user: user && { _id: user }, academicProfileId: profile, academicProfileContext: { profile: { academicLevel: 'College' } }, body, query };
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
  const practiceOutcomes = await Promise.all(Array.from({ length: 2 }, () => request('post', { body: practiceRequest() })));
  assert.deepEqual(practiceOutcomes.map((outcome) => outcome.body.awardedXp), [10, 0]);
  assert.equal((await request('get')).body.momentum.solvedCodeQuestions, 1);
  assert.equal((await request('post', { body: { ...practiceRequest(), unwanted: 'x'.repeat(48 * 1024) } })).statusCode, 400);
  assert.equal((await request('get', { query: { historyId: 'missing' } })).statusCode, 404);
  assert.equal((await request('get', { query: { historyId: ['invalid'] } })).statusCode, 400);
  assert.equal((await request('get', { query: { historyId: '' } })).statusCode, 400);
  assert.equal((await request('get', { profile: 'deleted', query: { historyId: 'missing' } })).statusCode, 409);
});
