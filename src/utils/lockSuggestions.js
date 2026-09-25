const MAX_LABEL_LENGTH = 56;
const MAX_SUGGESTION_LENGTH = 120;

function cleanLabel(value) {
  if (typeof value !== "string") return "";

  const label = value.replace(/\p{Cc}/gu, " ").replace(/\s+/gu, " ").trim();
  if (label.length <= MAX_LABEL_LENGTH) return label;
  return `${label.slice(0, MAX_LABEL_LENGTH - 1).trimEnd()}…`;
}

function uniqueLabels(values, limit) {
  const seen = new Set();
  const labels = [];

  for (const value of values) {
    const label = cleanLabel(value);
    if (!label || seen.has(label.toLocaleLowerCase())) continue;
    seen.add(label.toLocaleLowerCase());
    labels.push(label);
    if (labels.length === limit) break;
  }

  return labels;
}

/** Short, contextual prompts shown one at a time while the workspace is locked. */
export function buildLockSuggestions({ subjects = [], schedule = [] } = {}) {
  const subjectNames = uniqueLabels(
    Array.isArray(subjects)
      ? subjects.map((subject) => (typeof subject === "string" ? subject : subject?.name))
      : [],
    3,
  );
  const plannedTasks = uniqueLabels(
    Array.isArray(schedule)
      ? schedule.flatMap((day) => (
        Array.isArray(day?.tasks)
          ? day.tasks.map((task) => (typeof task === "string" ? task : task?.task))
          : []
      ))
      : [],
    3,
  );
  const suggestions = [];

  if (subjectNames.length === 0) {
    suggestions.push("Add a subject to start shaping your study plan.");
    suggestions.push("Ask the assistant what to study first.");
  } else {
    for (const name of subjectNames) {
      suggestions.push(`Ask the assistant to explain a topic in ${name}.`);
      suggestions.push(`Review one chapter from ${name}.`);
    }
  }

  if (plannedTasks.length === 0) {
    suggestions.push(subjectNames.length
      ? `Create a study schedule for ${subjectNames[0]}.`
      : "Create a study schedule once you've added a subject.");
    suggestions.push("A small daily plan can make it easier to begin.");
  } else {
    for (const task of plannedTasks) {
      suggestions.push(`Revisit your study plan: ${task}.`);
    }
    suggestions.push("Open your planner and choose one small next step.");
  }

  suggestions.push("Ask the assistant to turn a topic into practice questions.");

  return [...new Set(suggestions.map((suggestion) => (
    suggestion.length <= MAX_SUGGESTION_LENGTH
      ? suggestion
      : `${suggestion.slice(0, MAX_SUGGESTION_LENGTH - 1).trimEnd()}…`
  )))];
}
