import { clearPlannerScheduleState, isPlannerMemoryReviewTask, isPlannerTaskCompleted, isPlannerTaskPending } from './plannerScheduleProgress.js';
import { getScheduleDateKey } from './scheduleDates.js';
import { normalizeStudyPreferences, normalizeSubjectChapterNames, normalizeSubjectTopics } from './subjectPlanning.js';

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

function normalizeSchedule(value, startDate = '') {
  return list(value).flatMap((day, index) => {
    if (!day || typeof day !== 'object' || Array.isArray(day)) return [];
    const tasks = list(day.tasks).flatMap((task) => {
      if (!text(task?.task) || isPlannerMemoryReviewTask(task)) return [];
      const normalized = Object.fromEntries(['id', 'task', 'subjectName', 'topic', 'time', 'source', 'unitKey', 'unitType', 'studyGoal',
        'chapterName', 'chapterTitle', 'sourceNoteId', 'sourceLearningProjectId', 'sourceLearningNodeId', 'notebookId', 'nodeId']
        .filter((key) => text(task[key])).map((key) => [key, text(task[key])]));
      for (const key of ['durationMinutes', 'unitIndex']) {
        const number = Number(task[key]);
        if (task[key] != null && Number.isFinite(number) && number >= 0) normalized[key] = number;
      }
      if (task.recheckPending === true) normalized.recheckPending = true;
      return [normalized];
    });
    const dayNumber = Number.parseInt(day.day, 10);
    const normalized = { day: dayNumber > 0 ? dayNumber : index + 1, date: getScheduleDateKey(day, index, startDate), tasks };
    if (text(day.momentumToken, 160)) normalized.momentumToken = text(day.momentumToken, 160);
    return [normalized];
  });
}

function normalizeSubjects(value) {
  const seen = new Set();
  return list(value).flatMap((subject) => {
    const name = text(typeof subject === 'string' ? subject : subject?.name, 160);
    if (!name || seen.has(name)) return [];
    seen.add(name);
    const chapters = Math.max(0, Math.min(500, Number.parseInt(subject?.chapters, 10) || 0));
    const difficulty = text(subject?.difficulty).toLowerCase();
    const normalized = { name, chapters, difficulty: ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium' };
    if (text(subject?.id, 160)) normalized.id = text(subject.id, 160);
    if (Array.isArray(subject?.chapterNames)) normalized.chapterNames = normalizeSubjectChapterNames(subject.chapterNames, chapters);
    if (Array.isArray(subject?.topics)) normalized.topics = normalizeSubjectTopics(subject.topics);
    if (subject?.preferences || subject?.studyPreferences) normalized.preferences = normalizeStudyPreferences(subject.preferences || subject.studyPreferences);
    return [normalized];
  });
}

function normalizeMomentumSchedule(value) {
  const id = text(value?.id, 160);
  return id ? { id, token: text(value.token, 160), startedAt: iso(value.startedAt) } : null;
}

function normalizeLearningInsights(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = ['notebookCount', 'subjectCount', 'topicCount', 'learnedTopicCount', 'masteredTopicCount', 'reviewDueCount', 'sessionCount',
    'studyMinutes', 'masteryRate', 'attemptCount', 'accuracy', 'averageConfidence', 'misconceptionCount', 'unresolvedMisconceptionCount'];
  const fields = keys.filter((key) => value[key] != null && Number.isFinite(Number(value[key])) && Number(value[key]) >= 0)
    .map((key) => [key, Number(value[key])]);
  return fields.length ? Object.fromEntries(fields) : null;
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
    const normalized = { id, archivedAt, startDate: text(entry.startDate, 40), endDate: text(entry.endDate, 40),
      totalTasks, fullyCompleted: entry.fullyCompleted === true && tasks.length === totalTasks, tasks };
    if (Array.isArray(entry.schedule) && entry.schedule.length) {
      normalized.scheduleStartDate = text(entry.scheduleStartDate, 40) || normalized.startDate;
      normalized.schedule = normalizeSchedule(entry.schedule, normalized.scheduleStartDate);
      const snapshotTasks = normalized.schedule.flatMap((day) => day.tasks);
      // Completion IDs are converted to labels because planner analytics consumes labels.
      normalized.completed = [...new Set(snapshotTasks.filter((task) => isPlannerTaskCompleted(task, entry.completed)).map((task) => task.task))];
      normalized.subjects = normalizeSubjects(entry.subjects);
      normalized.totalTasks = Math.max(totalTasks, snapshotTasks.length);
      normalized.fullyCompleted = normalized.completed.length > 0 && snapshotTasks.every((task) => !isPlannerTaskPending(task, normalized.completed));
      normalized.snapshotVersion = 2;
    }
    const momentumSchedule = normalizeMomentumSchedule(entry.momentumSchedule);
    if (momentumSchedule) normalized.momentumSchedule = momentumSchedule;
    const learningInsights = normalizeLearningInsights(entry.learningInsights);
    if (learningInsights) normalized.learningInsights = learningInsights;
    return [normalized];
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
  return normalizePlannerHistory([{ id, archivedAt: iso(now), startDate: dates[0] || '', endDate: dates.at(-1) || '', totalTasks, fullyCompleted, tasks,
    schedule, completed: workspace.completed, subjects, scheduleStartDate: workspace.scheduleStartDate,
    momentumSchedule: workspace.momentumSchedule, learningInsights: workspace.learningInsights }])[0] || null;
}

/** Returns a detached, read-only view of one archive, defaulting to the newest. */
export function getPreviousPlannerAnalytics(history = [], historyId = '') {
  const entries = normalizePlannerHistory(history);
  const entry = historyId ? entries.find((item) => item.id === historyId) : entries[0];
  if (!entry) return null;
  const hasSnapshot = Array.isArray(entry.schedule);
  const schedule = hasSnapshot ? entry.schedule : [...new Set(entry.tasks.map((task) => task.date || ''))].sort().map((date, index) => ({
    day: date && entry.startDate && Number.isFinite(Date.parse(date)) && Number.isFinite(Date.parse(entry.startDate))
      ? Math.max(1, Math.round((Date.parse(date) - Date.parse(entry.startDate)) / 86_400_000) + 1) : index + 1,
    date, tasks: entry.tasks.filter((task) => (task.date || '') === date).map((task) => ({
      id: task.id, task: task.label, subjectName: task.subjectName, topic: task.topic, chapterTitle: task.chapterTitle,
      time: task.time, source: task.source, sourceNoteId: task.noteId, sourceLearningProjectId: task.notebookId, sourceLearningNodeId: task.nodeId,
    })),
  }));
  const completed = hasSnapshot
    ? entry.completed.filter((label) => schedule.some((day) => day.tasks.some((task) => task.task === label && !task.recheckPending)))
    : [...new Set(entry.tasks.map((task) => task.label))];
  const subjects = [...(entry.subjects || [])];
  for (const task of schedule.flatMap((day) => day.tasks)) {
    const name = taskSubject(task, subjects);
    if (!subjects.some((subject) => subject.name === name)) {
      const knownTasks = schedule.flatMap((day) => day.tasks).filter((candidate) => taskSubject(candidate, subjects) === name);
      subjects.push({ name, chapters: knownTasks.length, difficulty: 'medium', topics: [...new Set(knownTasks.map((candidate) => candidate.topic).filter(Boolean))] });
    }
  }
  const knownTaskCount = schedule.reduce((sum, day) => sum + day.tasks.length, 0);
  const missingTaskCount = Math.max(entry.totalTasks - knownTaskCount, 0);
  return { ...entry, schedule, completed, subjects, scheduleStartDate: entry.scheduleStartDate || entry.startDate,
    isPartialSnapshot: missingTaskCount > 0, missingTaskCount, knownTaskCount, hasFullSnapshot: hasSnapshot };
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
