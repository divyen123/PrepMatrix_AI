import { clearPlannerScheduleState, isPlannerMemoryReviewTask, isPlannerTaskCompleted, isPlannerTaskPending } from './plannerScheduleProgress.js';
import { getScheduleDateKey } from './scheduleDates.js';

const list = (value) => Array.isArray(value) ? value : [];
const text = (value, length = 500) => typeof value === 'string' ? value.trim().slice(0, length) : '';
const iso = (value) => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : '';
};

function normalizeTask(task) {
  if (!text(task?.label)) return null;
  return Object.fromEntries(['id', 'label', 'subjectName', 'chapterTitle', 'topic', 'date', 'time', 'source', 'noteId', 'notebookId', 'nodeId']
    .map((key) => [key, text(task[key]) ]));
}

function taskSubject(task, subjects) {
  if (text(task.subjectName)) return text(task.subjectName);
  const label = text(task.task);
  const subject = list(subjects).filter((item) => text(item?.name) && label.toLocaleLowerCase().startsWith(`${text(item.name)} - `.toLocaleLowerCase()))
    .sort((a, b) => b.name.length - a.name.length)[0];
  return text(subject?.name) || (label.includes(' - ') ? label.split(' - ')[0] : 'General study');
}

export function normalizePlannerHistory(value) {
  const seen = new Set();
  return list(value).flatMap((entry) => {
    const id = text(entry?.id, 160);
    const archivedAt = iso(entry?.archivedAt);
    const tasks = list(entry?.tasks).map(normalizeTask).filter(Boolean);
    if (!id || !archivedAt || !tasks.length || seen.has(id)) return [];
    seen.add(id);
    const count = Number(entry.totalTasks);
    const totalTasks = Math.max(tasks.length, Number.isFinite(count) ? Math.trunc(count) : 0);
    return [{ id, archivedAt, startDate: text(entry.startDate, 40), endDate: text(entry.endDate, 40),
      totalTasks, fullyCompleted: entry.fullyCompleted === true && tasks.length === totalTasks, tasks }];
  }).sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
}

// Archives are append-only during ordinary saves; a stale tab cannot erase or rewrite them.
export function mergePlannerHistory(saved, incoming) {
  return normalizePlannerHistory([...list(saved), ...list(incoming)]);
}

export function createPlannerHistoryEntry(workspace = {}, { id = globalThis.crypto.randomUUID(), now = new Date() } = {}) {
  const schedule = list(workspace.schedule);
  const subjects = list(workspace.subjects);
  let totalTasks = 0;
  let fullyCompleted = true;
  const tasks = schedule.flatMap((day, dayIndex) => list(day?.tasks).flatMap((task, taskIndex) => {
    if (!text(task?.task) || isPlannerMemoryReviewTask(task)) return [];
    totalTasks += 1;
    if (isPlannerTaskPending(task, workspace.completed)) fullyCompleted = false;
    if (!isPlannerTaskCompleted(task, workspace.completed)) return [];
    const label = text(task.task);
    const subjectName = taskSubject(task, subjects);
    const topic = text(task.topic) || (label.toLocaleLowerCase().startsWith(`${subjectName} - `.toLocaleLowerCase()) ? label.slice(subjectName.length + 3) : label);
    return [{ id: text(task.id) || `${dayIndex}:${taskIndex}`, label, subjectName, topic,
      chapterTitle: text(task.chapterName || task.chapterTitle) || (task.unitType === 'chapter' || /^chapter:/u.test(task.unitKey || '') ? topic : ''),
      date: getScheduleDateKey(day, dayIndex, workspace.scheduleStartDate) || '', time: text(task.time), source: text(task.source),
      noteId: text(task.sourceNoteId), notebookId: text(task.sourceLearningProjectId || task.notebookId), nodeId: text(task.sourceLearningNodeId || task.nodeId) }];
  }));
  if (!tasks.length) return null;
  const dates = schedule.map((day, index) => getScheduleDateKey(day, index, workspace.scheduleStartDate)).filter(Boolean).sort();
  return normalizePlannerHistory([{ id, archivedAt: iso(now), startDate: dates[0] || '', endDate: dates.at(-1) || '', totalTasks, fullyCompleted, tasks }])[0] || null;
}

export function getLandscapeData(subjects = [], schedule = [], completed = [], history = []) {
  const archived = normalizePlannerHistory(history).flatMap((entry) => entry.tasks);
  const live = list(schedule).flatMap((day) => list(day?.tasks)).filter((task) => text(task?.task) && !isPlannerMemoryReviewTask(task));
  const names = new Set([...list(subjects).map((subject) => text(subject?.name)), ...archived.map((task) => task.subjectName), ...live.map((task) => taskSubject(task, subjects))].filter(Boolean));
  return [...names].map((subjectName) => {
    const subject = list(subjects).find((item) => item.name === subjectName);
    const current = live.filter((task) => taskSubject(task, subjects) === subjectName);
    const historical = archived.filter((task) => task.subjectName === subjectName);
    const done = current.filter((task) => isPlannerTaskCompleted(task, completed)).length;
    const total = current.length;
    const difficulty = ['easy', 'medium', 'hard'].includes(subject?.difficulty?.toLowerCase()) ? subject.difficulty.toLowerCase() : 'medium';
    return { subject: subjectName, difficulty, done, total, pending: total - done, historicalCount: historical.length,
      completionRate: total ? Math.round(done * 100 / total) : historical.length ? 100 : 0,
      pendingRate: total ? Math.round((total - done) * 100 / total) : 0 };
  }).sort((a, b) => b.pending - a.pending || a.subject.localeCompare(b.subject));
}

export function buildClearedPlannerWorkspace(workspace, options) {
  const entry = createPlannerHistoryEntry(workspace, options);
  return { ...clearPlannerScheduleState(workspace), plannerHistory: mergePlannerHistory(workspace.plannerHistory, entry ? [entry] : []) };
}
