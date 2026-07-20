export const DEFAULT_STUDY_PREFERENCES = Object.freeze({
  sessionsPerWeek: 3,
  sessionMinutes: 45,
  preferredTime: "any",
  studyGoal: "coverage",
});

export const SESSION_MINUTE_OPTIONS = [25, 40, 45, 60, 90];
export const PREFERRED_TIME_OPTIONS = ["any", "morning", "midday", "afternoon", "evening", "night"];
export const STUDY_GOAL_OPTIONS = ["coverage", "practice", "revision"];

const MAX_TOPICS = 60;

function clampInteger(value, minimum, maximum, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

export function normalizeSubjectTopics(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();

  return value
    .map((topic) => {
      if (typeof topic === "string") return topic.trim().slice(0, 120);
      if (topic && typeof topic === "object") {
        return String(topic.title || topic.name || topic.label || "").trim().slice(0, 120);
      }
      return "";
    })
    .filter((topic) => {
      if (!topic) return false;
      const key = topic.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_TOPICS);
}

export function normalizeStudyPreferences(value = {}) {
  const sessionMinutes = Number(value?.sessionMinutes);
  const preferredTime = String(value?.preferredTime || "").toLowerCase();
  const studyGoal = String(value?.studyGoal || "").toLowerCase();

  return {
    sessionsPerWeek: clampInteger(
      value?.sessionsPerWeek,
      1,
      7,
      DEFAULT_STUDY_PREFERENCES.sessionsPerWeek,
    ),
    sessionMinutes: SESSION_MINUTE_OPTIONS.includes(sessionMinutes)
      ? sessionMinutes
      : DEFAULT_STUDY_PREFERENCES.sessionMinutes,
    preferredTime: PREFERRED_TIME_OPTIONS.includes(preferredTime)
      ? preferredTime
      : DEFAULT_STUDY_PREFERENCES.preferredTime,
    studyGoal: STUDY_GOAL_OPTIONS.includes(studyGoal)
      ? studyGoal
      : DEFAULT_STUDY_PREFERENCES.studyGoal,
  };
}

export function getSubjectStudyUnits(subject = {}) {
  const topics = normalizeSubjectTopics(subject?.topics);
  const chapterCount = clampInteger(subject?.chapters, 0, 500, 0);
  const targetUnitCount = Math.max(chapterCount, topics.length);
  const usedKeys = new Set(topics.map((topic) => topic.toLocaleLowerCase()));
  const chapterFallbacks = [
    ...Array.from(
      { length: Math.max(chapterCount - topics.length, 0) },
      (_, index) => `Chapter ${topics.length + index + 1}`,
    ),
    ...Array.from(
      { length: chapterCount },
      (_, index) => `Chapter ${index + 1}`,
    ),
  ].filter((chapter) => {
    const key = chapter.toLocaleLowerCase();
    if (usedKeys.has(key)) return false;
    usedKeys.add(key);
    return true;
  });

  return [...topics, ...chapterFallbacks].slice(0, targetUnitCount);
}

export function getSubjectPlanAnalysis(subject = {}) {
  const preferences = normalizeStudyPreferences(subject?.studyPreferences);
  const units = getSubjectStudyUnits(subject);
  const totalMinutes = units.length * preferences.sessionMinutes;
  const estimatedWeeks = units.length === 0
    ? 0
    : Math.max(1, Math.ceil(units.length / preferences.sessionsPerWeek));
  const loadScore = units.length / Math.max(preferences.sessionsPerWeek, 1);
  const intensity = loadScore >= 4
    ? "High"
    : loadScore >= 2
      ? "Steady"
      : "Light";

  return {
    units,
    unitCount: units.length,
    totalMinutes,
    estimatedWeeks,
    intensity,
    preferences,
  };
}

export function getChapterTopicSuggestions(subject = {}) {
  const chapterCount = clampInteger(subject?.chapters, 0, 500, 0);
  return Array.from(
    { length: Math.min(chapterCount, 8) },
    (_, index) => `Chapter ${index + 1}`,
  );
}
