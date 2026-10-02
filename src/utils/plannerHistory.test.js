import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClearedPlannerWorkspace, createPlannerHistoryEntry, getLandscapeData, getPreviousPlannerAnalytics, mergePlannerHistory, normalizePlannerHistory } from './plannerHistory.js';

const options = { id: 'archive-1', now: '2026-09-13T10:00:00Z' };
const tasks = [
  { id: 'chapter-1', task: 'Data analytics - Big Data Overview', subjectName: 'Data analytics', topic: 'Big Data Overview', unitKey: 'chapter:1' },
  { id: 'topic-1', task: 'Data analytics - The 4 V’s', subjectName: 'Data analytics', topic: 'The 4 V’s', chapterName: 'Big data fundamentals', source: 'learning', sourceLearningProjectId: 'book-1', sourceLearningNodeId: 'node-1' },
  { id: 'note-task', task: 'Revise data examples', source: 'note', sourceNoteId: 'note-1' },
];
const workspace = { subjects: [{ name: 'Data analytics', chapters: 9 }], schedule: [{ day: 1, date: '2026-09-10', tasks }], completed: tasks.map((task) => task.task), scheduleStartDate: '2026-09-10', memoryReviewData: { schedule: [{ tasks: [{ source: 'memory_review', task: 'Recall' }] }], completed: [] } };

test('clear archives latest completions atomically, preserves context and independent recall across reload', () => {
  const original = structuredClone(workspace);
  const cleared = buildClearedPlannerWorkspace(workspace, options);
  assert.deepEqual(workspace, original);
  assert.deepEqual(cleared.schedule, []);
  assert.deepEqual(cleared.completed, []);
  assert.deepEqual(cleared.subjects, workspace.subjects);
  assert.deepEqual(cleared.memoryReviewData, workspace.memoryReviewData);
  const [record] = normalizePlannerHistory(JSON.parse(JSON.stringify(cleared.plannerHistory)));
  assert.equal(record.fullyCompleted, true);
  assert.equal(record.tasks.length, 3);
  assert.equal(record.tasks[0].chapterTitle, 'Big Data Overview');
  assert.equal(record.tasks[1].chapterTitle, 'Big data fundamentals');
  assert.equal(record.tasks[1].topic, 'The 4 V’s');
  assert.equal(record.tasks[1].notebookId, 'book-1');
  assert.equal(record.tasks[2].noteId, 'note-1');
  assert.equal(record.startDate, '2026-09-10');
  assert.equal(record.archivedAt, '2026-09-13T10:00:00.000Z');
  assert.equal(record.tasks[0].completedAt, undefined, 'scheduled dates must not be invented completion dates');
});

test('clearing partial or reopened work never claims the entire plan was finished', () => {
  const partial = createPlannerHistoryEntry({ ...workspace, completed: ['chapter-1'] }, options);
  assert.equal(partial.tasks.length, 1);
  assert.equal(partial.totalTasks, 3);
  assert.equal(partial.fullyCompleted, false);
  const reopened = createPlannerHistoryEntry({ ...workspace, schedule: [{ tasks: [{ ...tasks[0], recheckPending: true }] }] }, options);
  assert.equal(reopened.tasks.length, 1);
  assert.equal(reopened.fullyCompleted, false);
});

test('empty schedules, unknown completions and recall-only plans do not manufacture records', () => {
  assert.equal(createPlannerHistoryEntry({ ...workspace, completed: ['unknown'] }, options), null);
  assert.equal(createPlannerHistoryEntry({ schedule: [], completed: workspace.completed }, options), null);
  assert.equal(createPlannerHistoryEntry({ schedule: [{ tasks: [{ task: 'Recall', source: 'memory_review' }] }], completed: ['Recall'] }, options), null);
  const once = buildClearedPlannerWorkspace(workspace, options);
  const twice = buildClearedPlannerWorkspace(once, { ...options, id: 'archive-2' });
  assert.deepEqual(twice.plannerHistory, once.plannerHistory);
});

test('retry and stale saves cannot duplicate, erase or rewrite archived records', () => {
  const first = createPlannerHistoryEntry(workspace, options);
  const second = createPlannerHistoryEntry(workspace, { id: 'archive-2', now: '2026-09-14' });
  const saved = mergePlannerHistory([first], [second]);
  assert.equal(mergePlannerHistory(saved, [first, second]).length, 2);
  assert.deepEqual(mergePlannerHistory(saved, []), saved);
  assert.deepEqual(mergePlannerHistory(saved, [{ ...first, tasks: [first.tasks[0]] }]), saved);
  assert.equal(saved[0].id, 'archive-2');
});

test('archived tasks never inflate a new plan, and cleared subjects have no pending work', () => {
  const history = [createPlannerHistoryEntry(workspace, options)];
  const clearedRows = getLandscapeData(workspace.subjects, [], [], history);
  const oldSubject = clearedRows.find((row) => row.subject === 'Data analytics');
  assert.equal(oldSubject.pending, 0);
  assert.equal(oldSubject.historicalCount, 2);
  assert.equal(oldSubject.completionRate, 100);
  const active = getLandscapeData(workspace.subjects, workspace.schedule, [], history).find((row) => row.subject === 'Data analytics');
  assert.equal(active.pending, 2);
  assert.equal(active.completionRate, 0);
  assert.equal(active.historicalCount, 2);
  assert.equal(getLandscapeData([{ name: 'Unscheduled', chapters: 10 }])[0].pendingRate, 0);
  assert.ok(getLandscapeData([], [], [], history).length > 0, 'removed subjects remain in history');
});

test('normalization rejects malformed records and retains safe snapshot fields only', () => {
  assert.deepEqual(normalizePlannerHistory([null, {}, { id: 'bad', archivedAt: 'not a date', tasks }]), []);
  const entry = createPlannerHistoryEntry(workspace, options);
  const [normalized] = normalizePlannerHistory([{ ...entry, userId: 'another-user', totalTasks: Infinity, tasks: [{ ...entry.tasks[0], arbitrary: 'ignored' }] }]);
  assert.equal(normalized.userId, undefined);
  assert.equal(normalized.tasks[0].arbitrary, undefined);
  assert.equal(Number.isFinite(normalized.totalTasks), true);
});

test('legacy subject names containing hyphens preserve the complete subject and chapter label', () => {
  const legacy = { subjects: [{ name: 'Networks' }, { name: 'Networks - Advanced' }], schedule: [{ tasks: [{ task: 'Networks - Advanced - TCP/IP' }] }], completed: ['Networks - Advanced - TCP/IP'] };
  const entry = createPlannerHistoryEntry(legacy, options);
  assert.equal(entry.tasks[0].subjectName, 'Networks - Advanced');
  assert.equal(entry.tasks[0].topic, 'TCP/IP');
  const rows = getLandscapeData(legacy.subjects, legacy.schedule, legacy.completed);
  assert.equal(rows.find((row) => row.subject === 'Networks').total, 0);
  assert.equal(rows.find((row) => row.subject === 'Networks - Advanced').done, 1);
  const noteRows = getLandscapeData([], [{ tasks: [tasks[2]] }], [tasks[2].task]);
  assert.equal(noteRows[0].subject, 'General study');
  assert.equal(noteRows[0].done, 1);
});

test('full archive round trips the previous schedule, pending tasks, subjects and XP scope independently', () => {
  const prior = { ...workspace,
    schedule: [{ ...workspace.schedule[0], momentumToken: 'old-plan', tasks: [...tasks, { id: 'pending', task: 'Data analytics - Regression', subjectName: 'Data analytics', topic: 'Regression', time: 'Evening', durationMinutes: 45 }] }, { day: 2, date: '2026-09-11', tasks: [] }],
    completed: ['chapter-1'],
    momentumSchedule: { id: 'prior-xp', token: 'old-plan', startedAt: '2026-09-09T09:00:00Z' },
    learningInsights: { notebookCount: 2, learnedTopicCount: 3, accuracy: 80, notebooks: ['private-internals'], arbitrary: 999 },
  };
  const original = structuredClone(prior);
  const archived = createPlannerHistoryEntry(prior, options);
  const historical = getPreviousPlannerAnalytics(JSON.parse(JSON.stringify([archived])));
  assert.deepEqual(prior, original);
  assert.equal(historical.schedule.length, 2, 'revision days remain in the previous plan');
  assert.equal(historical.schedule[0].tasks.length, 4, 'unfinished tasks remain visible in the snapshot');
  assert.deepEqual(historical.completed, [tasks[0].task]);
  assert.equal(historical.tasks.length, 1, 'landscape history still contains only completions');
  assert.equal(historical.totalTasks, 4);
  assert.equal(historical.fullyCompleted, false);
  assert.equal(historical.hasFullSnapshot, true);
  assert.equal(historical.isPartialSnapshot, false);
  assert.equal(historical.scheduleStartDate, '2026-09-10');
  assert.equal(historical.endDate, '2026-09-11');
  assert.equal(historical.subjects[0].chapters, 9);
  assert.equal(historical.momentumSchedule.id, 'prior-xp');
  assert.deepEqual(historical.learningInsights, { notebookCount: 2, learnedTopicCount: 3, accuracy: 80 });
  historical.schedule[0].tasks[0].task = 'Modified display';
  historical.subjects[0].name = 'Modified subject';
  assert.equal(archived.schedule[0].tasks[0].task, tasks[0].task);
  assert.equal(archived.subjects[0].name, 'Data analytics');
});

test('historical analytics selects the latest archive, or the exact requested owned record', () => {
  const first = createPlannerHistoryEntry(workspace, options);
  const latest = createPlannerHistoryEntry(workspace, { id: 'latest', now: '2026-10-01' });
  assert.equal(getPreviousPlannerAnalytics([first, latest]).id, 'latest');
  assert.equal(getPreviousPlannerAnalytics([latest, first], 'archive-1').id, 'archive-1');
  assert.equal(getPreviousPlannerAnalytics([latest], 'missing'), null);
  assert.equal(getPreviousPlannerAnalytics([]), null);
});

test('legacy archives reconstruct only known completed work and report unknown pending tasks honestly', () => {
  const entry = createPlannerHistoryEntry({ ...workspace, completed: ['chapter-1'] }, options);
  const legacy = { id: entry.id, archivedAt: entry.archivedAt, startDate: entry.startDate, endDate: entry.endDate,
    tasks: entry.tasks, totalTasks: 3, fullyCompleted: false };
  const original = structuredClone(legacy);
  const historical = getPreviousPlannerAnalytics([legacy]);
  assert.equal(historical.schedule.length, 1);
  assert.equal(historical.schedule[0].tasks.length, 1);
  assert.deepEqual(historical.completed, [tasks[0].task]);
  assert.equal(historical.totalTasks, 3);
  assert.equal(historical.knownTaskCount, 1);
  assert.equal(historical.missingTaskCount, 2);
  assert.equal(historical.isPartialSnapshot, true);
  assert.equal(historical.hasFullSnapshot, false);
  assert.equal(historical.fullyCompleted, false);
  assert.equal(historical.learningInsights, undefined);
  assert.deepEqual(legacy, original);
});

test('snapshot normalization keeps recall independent and cannot mark reopened tasks fully completed', () => {
  const prior = { ...workspace, schedule: [{ ...workspace.schedule[0], tasks: [...tasks.map((task, index) => index ? task : { ...task, recheckPending: true }),
    { task: 'Recall data', source: 'memory_review', subjectName: 'Data analytics' }] }], completed: [...workspace.completed, 'Recall data'] };
  const historical = getPreviousPlannerAnalytics([createPlannerHistoryEntry(prior, options)]);
  assert.equal(historical.schedule[0].tasks.length, 3);
  assert.equal(historical.schedule[0].tasks[0].recheckPending, true);
  assert.equal(historical.fullyCompleted, false);
  assert.equal(historical.completed.includes('Recall data'), false);
  assert.equal(historical.completed.includes(tasks[0].task), false, 'reopened tasks are pending in historical analytics while their earned XP stays archived');
});
