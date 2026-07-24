import {
  getSubjectStudyUnitRecords,
  normalizeStudyPreferences,
} from "./subjectPlanning.js";
import { addDaysToDateKey, toLocalDateKey } from "./scheduleDates.js";

const SESSION_LABELS = [
  "Morning",
  "Midday",
  "Afternoon",
  "Evening",
  "Night",
  "Late night",
];

const PREFERRED_TIME_LABELS = {
  morning: "Morning",
  midday: "Midday",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
};

function countRemainingQueuedTasks(subjectQueues) {
  return Object.values(subjectQueues).reduce(
    (total, units) => total + units.length,
    0,
  );
}

function countRemainingStudyDays(totalDays, currentDay, restInterval) {
  let remaining = 0;

  for (let day = currentDay; day <= totalDays; day += 1) {
    if (!restInterval || day % restInterval !== 0) {
      remaining += 1;
    }
  }

  return Math.max(remaining, 1);
}

function getSessionLabel(index) {
  return SESSION_LABELS[index] || `Session ${index + 1}`;
}

function getConfiguredTimeLabel(preferences, sessionIndex) {
  const baseLabel = preferences.preferredTime === "any"
    ? getSessionLabel(sessionIndex)
    : PREFERRED_TIME_LABELS[preferences.preferredTime] || getSessionLabel(sessionIndex);

  return `${baseLabel} · ${preferences.sessionMinutes} min`;
}

function getGoalLabel(unit, studyGoal) {
  if (studyGoal === "practice") return `${unit} · Practice`;
  if (studyGoal === "revision") return `${unit} · Revision`;
  return unit;
}

export function createSubjectScheduleTask(subject = {}, unit = {}, sessionIndex = 0) {
  const name = String(subject?.name || "").trim();
  const preferences = normalizeStudyPreferences(subject?.preferences || subject?.studyPreferences);
  const label = String(unit?.label || "").trim();
  const displayUnit = getGoalLabel(label, preferences.studyGoal);

  return {
    durationMinutes: preferences.sessionMinutes,
    source: "subject",
    studyGoal: preferences.studyGoal,
    subjectName: name,
    time: getConfiguredTimeLabel(preferences, sessionIndex),
    topic: label,
    task: `${name} - ${displayUnit}`,
    unitIndex: unit.unitIndex,
    unitKey: unit.unitKey,
    unitType: unit.unitType,
  };
}

function buildWeightedRotation(configuredSubjects, planMode, priority) {
  const weighted = configuredSubjects.map((subject) => {
    const priorityBoost = planMode === "high-priority"
      ? Math.max(0, priority[subject.difficulty] - 1)
      : 0;

    return {
      key: subject.key,
      weight: Math.min(7, subject.preferences.sessionsPerWeek + priorityBoost),
    };
  });
  const maximumWeight = Math.max(...weighted.map((subject) => subject.weight), 1);
  const rotation = [];

  for (let pass = 0; pass < maximumWeight; pass += 1) {
    weighted.forEach((subject) => {
      if (subject.weight > pass) rotation.push(subject.key);
    });
  }

  return rotation;
}

export function generateSchedule(subjects, days, backlog = [], options = {}) {
  if (!subjects.length || days < 1) return [];

  const priority = { hard: 3, medium: 2, easy: 1 };
  const mode = options.planMode || "balanced";
  const startDate = toLocalDateKey(options.startDate);
  const restInterval = mode === "revision-heavy" ? 4 : mode === "rapid" ? 0 : 5;
  const sorted = [...subjects].sort(
    (left, right) => priority[right.difficulty] - priority[left.difficulty],
  );
  const configuredSubjects = sorted.map((subject, index) => {
    const name = String(subject?.name || "").trim();
    const preferences = normalizeStudyPreferences(subject?.studyPreferences);

    return {
      ...subject,
      difficulty: priority[subject?.difficulty] ? subject.difficulty : "medium",
      key: `${index}:${name}`,
      name,
      preferences,
      units: getSubjectStudyUnitRecords(subject),
    };
  }).filter((subject) => subject.name && subject.units.length > 0);

  if (!configuredSubjects.length) return [];

  const subjectQueues = {};
  const subjectDetails = {};

  configuredSubjects.forEach((subject) => {
    subjectDetails[subject.key] = subject;
    subjectQueues[subject.key] = subject.units.map((unit) => ({ ...unit }));
  });

  const subjectRotation = buildWeightedRotation(configuredSubjects, mode, priority);
  const schedule = [];
  let pointer = 0;
  let taskCount = 0;
  const maxTotalTasks = 500;

  for (let day = 1; day <= days; day += 1) {
    if (taskCount >= maxTotalTasks) break;

    if (restInterval && day % restInterval === 0) {
      schedule.push({
        day,
        ...(startDate ? { date: addDaysToDateKey(startDate, day - 1) } : {}),
        tasks: [],
      });
      continue;
    }

    const remainingStudyDays = countRemainingStudyDays(days, day, restInterval);
    const remainingTasks = backlog.length + countRemainingQueuedTasks(subjectQueues);

    if (remainingTasks === 0) break;

    const tasksNeededToday = Math.ceil(remainingTasks / remainingStudyDays);
    const tasks = [];

    while (tasks.length < tasksNeededToday && backlog.length > 0) {
      const backlogTask = backlog.shift();
      tasks.push(
        backlogTask && typeof backlogTask === "object"
          ? {
              ...backlogTask,
              time: getSessionLabel(tasks.length),
              task: String(backlogTask.task || "").trim(),
            }
          : {
              time: getSessionLabel(tasks.length),
              task: String(backlogTask || "").trim(),
            },
      );
      taskCount += 1;
    }

    while (tasks.length < tasksNeededToday) {
      let selectedKey = null;
      let attempts = 0;

      while (attempts < subjectRotation.length) {
        const candidateKey = subjectRotation[pointer % subjectRotation.length];
        pointer = (pointer + 1) % subjectRotation.length;
        attempts += 1;

        if (subjectQueues[candidateKey]?.length) {
          selectedKey = candidateKey;
          break;
        }
      }

      if (!selectedKey) break;

      const subject = subjectDetails[selectedKey];
      const unit = subjectQueues[selectedKey].shift();
      tasks.push(createSubjectScheduleTask(subject, unit, tasks.length));
      taskCount += 1;
    }

    if (!tasks.length) break;
    schedule.push({
      day,
      ...(startDate ? { date: addDaysToDateKey(startDate, day - 1) } : {}),
      tasks,
    });
  }

  return schedule;
}
