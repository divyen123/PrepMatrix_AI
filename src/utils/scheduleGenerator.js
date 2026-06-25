const SESSION_LABELS = [
  "Morning",
  "Midday",
  "Afternoon",
  "Evening",
  "Night",
  "Late night",
];

function countRemainingQueuedTasks(subjectQueues) {
  return Object.values(subjectQueues).reduce(
    (total, chapters) => total + chapters.length,
    0
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

export function generateSchedule(subjects, days, backlog = [], options = {}) {
  if (!subjects.length || days < 1) {
    return [];
  }

  const priority = { hard: 3, medium: 2, easy: 1 };
  const mode = options.planMode || "balanced";
  const restInterval = mode === "revision-heavy" ? 4 : mode === "rapid" ? 0 : 5;

  const sorted = [...subjects].sort(
    (left, right) => priority[right.difficulty] - priority[left.difficulty]
  );

  const subjectQueues = {};

  sorted.forEach((subject) => {
    subjectQueues[subject.name] = [];

    for (let chapter = 1; chapter <= subject.chapters; chapter += 1) {
      subjectQueues[subject.name].push(chapter);
    }
  });

  const subjectNames = Object.keys(subjectQueues);
  const schedule = [];

  let pointer = 0;
  let taskCount = 0;

  const maxTotalTasks = 500;

  for (let day = 1; day <= days; day += 1) {
    if (taskCount >= maxTotalTasks) {
      break;
    }

    if (restInterval && day % restInterval === 0) {
      schedule.push({ day, tasks: [] });
      continue;
    }

    const remainingStudyDays = countRemainingStudyDays(days, day, restInterval);
    const remainingTasks =
      backlog.length + countRemainingQueuedTasks(subjectQueues);

    if (remainingTasks === 0) {
      break;
    }

    const tasksNeededToday = Math.ceil(remainingTasks / remainingStudyDays);
    const tasks = [];

    while (tasks.length < tasksNeededToday && backlog.length > 0) {
      tasks.push({
        time: getSessionLabel(tasks.length),
        task: backlog.shift(),
      });
      taskCount += 1;
    }

    let safeGuard = 0;

    while (tasks.length < tasksNeededToday) {
      let addedThisPass = false;

      for (let index = 0; index < subjectNames.length; index += 1) {
        if (tasks.length >= tasksNeededToday) {
          break;
        }

        const subjectName = subjectNames[(pointer + index) % subjectNames.length];
        const chapters = subjectQueues[subjectName];

        if (!chapters?.length) {
          continue;
        }

        const chapter = chapters.shift();

        tasks.push({
          time: getSessionLabel(tasks.length),
          task: `${subjectName} - Chapter ${chapter}`,
        });

        taskCount += 1;
        addedThisPass = true;
      }

      pointer = (pointer + 1) % subjectNames.length;
      safeGuard += 1;

      if (!addedThisPass || safeGuard > subjectNames.length + 2) {
        break;
      }
    }

    if (!tasks.length) {
      break;
    }

    schedule.push({ day, tasks });
  }

  return schedule;
}

