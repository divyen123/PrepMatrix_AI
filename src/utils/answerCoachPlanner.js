import { getScheduleDateKey, toLocalDateKey } from "./scheduleDates.js";

function cleanText(value, maximum = 180) {
  return String(value ?? "").replace(/\s+/gu, " ").trim().slice(0, maximum);
}

function taskIdentity(details) {
  const paper = cleanText(details.paperId, 240)
    || `title:${cleanText(details.paperTitle, 240)}:subject:${cleanText(details.subjectName, 180)}`;
  const questionNumber = Number.parseInt(details.questionNumber, 10);
  const question = Number.isInteger(questionNumber) && questionNumber > 0
    ? String(questionNumber)
    : cleanText(details.questionId, 240) || `topic:${cleanText(details.topic, 180)}`;

  return `answer-coach:${encodeURIComponent(paper)}:${encodeURIComponent(question)}`;
}

function uniqueTaskName(schedule, preferredName) {
  const occupied = new Set(schedule.flatMap((day) => (
    Array.isArray(day?.tasks)
      ? day.tasks.map((task) => String(task?.task ?? "").trim()).filter(Boolean)
      : []
  )));
  if (!occupied.has(preferredName)) return preferredName;

  let suffix = 2;
  while (occupied.has(`${preferredName} (${suffix})`)) suffix += 1;
  return `${preferredName} (${suffix})`;
}

function targetDayIndex(schedule, todayKey, scheduleStartDate) {
  let nextIndex = -1;
  let nextDate = "";

  for (let index = 0; index < schedule.length; index += 1) {
    const dateKey = getScheduleDateKey(schedule[index], index, scheduleStartDate);
    if (!dateKey) continue;
    if (dateKey === todayKey) return index;
    if (dateKey > todayKey && (!nextDate || dateKey < nextDate)) {
      nextIndex = index;
      nextDate = dateKey;
    }
  }

  return nextIndex;
}

/** Add one revision task for a reviewed answer without changing the input schedule. */
export function addAnswerCoachRevisionTask(schedule, details = {}, now = new Date(), scheduleStartDate = "") {
  const currentSchedule = Array.isArray(schedule) ? schedule : [];
  const topic = cleanText(details?.topic);
  if (!topic) return currentSchedule;

  const id = taskIdentity(details);
  if (currentSchedule.some((day) => (
    Array.isArray(day?.tasks) && day.tasks.some((task) => task?.id === id)
  ))) return currentSchedule;

  const todayKey = toLocalDateKey(now) || toLocalDateKey(new Date());
  const subjectName = cleanText(details.subjectName);
  const paperTitle = cleanText(details.paperTitle);
  const questionId = cleanText(details.questionId, 240);
  const paperId = cleanText(details.paperId, 240);
  const parsedQuestionNumber = Number.parseInt(details.questionNumber, 10);
  const questionNumber = Number.isInteger(parsedQuestionNumber) && parsedQuestionNumber > 0
    ? parsedQuestionNumber
    : null;
  const reference = [questionNumber ? `Q${questionNumber}` : "", paperTitle]
    .filter(Boolean).join(" · ");
  const preferredName = `Revise ${subjectName ? `${subjectName}: ` : ""}${topic}${reference ? ` (${reference})` : ""}`;
  const task = {
    id,
    source: "answer-coach",
    sourcePaperId: paperId,
    sourceQuestionId: questionId,
    questionNumber,
    paperTitle,
    subjectName,
    topic,
    studyGoal: "revision",
    task: uniqueTaskName(currentSchedule, preferredName),
    time: "Morning",
  };

  const dayIndex = targetDayIndex(currentSchedule, todayKey, scheduleStartDate);
  if (dayIndex >= 0) {
    return currentSchedule.map((day, index) => index === dayIndex
      ? { ...day, tasks: [...(Array.isArray(day.tasks) ? day.tasks : []), task] }
      : day);
  }

  const lastDayNumber = currentSchedule.reduce((maximum, day, index) => {
    const dayNumber = Number.parseInt(day?.day, 10);
    return Math.max(maximum, Number.isInteger(dayNumber) && dayNumber > 0 ? dayNumber : index + 1);
  }, 0);

  return [...currentSchedule, {
    day: lastDayNumber + 1,
    date: todayKey,
    tasks: [task],
  }];
}
