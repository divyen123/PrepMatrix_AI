import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLearningPlannerTaskName,
  findLearningPlannerTask,
  findLearningPlannerTaskForNode,
  getLearningPlannerCompletionState,
  getLearningScheduleDateOptions,
  setLearningPlannerNodeCompletion,
  upsertLearningPlannerTask,
} from "./learningPlanner.js";

const project = {
  id: "project-1",
  subjectName: "Computer networks",
  title: "Networks notebook",
};

const node = {
  id: "chapter-1",
  title: "Routing fundamentals",
  type: "chapter",
};

const schedule = [
  { day: 1, date: "2026-07-25", tasks: [] },
  { day: 2, date: "2026-07-26", tasks: [] },
  { day: 3, date: "2026-07-27", tasks: [] },
];

test("lists only real non-past schedule dates", () => {
  assert.deepEqual(
    getLearningScheduleDateOptions(schedule, "", "2026-07-26")
      .map(({ dateKey, dayIndex, label }) => ({ dateKey, dayIndex, label })),
    [
      { dateKey: "2026-07-26", dayIndex: 1, label: "Day 2 - 26/07/2026" },
      { dateKey: "2026-07-27", dayIndex: 2, label: "Day 3 - 27/07/2026" },
    ],
  );
  assert.deepEqual(
    getLearningScheduleDateOptions(
      [{ day: 1, tasks: [] }, { day: 2, tasks: [] }],
      "2026-07-26",
      "2026-07-26",
    ).map(({ dateKey }) => dateKey),
    ["2026-07-26", "2026-07-27"],
  );
});

test("adds a selected learning node with stable source metadata", () => {
  const result = upsertLearningPlannerTask(
    schedule,
    project,
    node,
    "2026-07-27",
    "",
    "2026-07-26",
  );

  assert.equal(schedule[2].tasks.length, 0);
  assert.equal(result.task.task, "Computer networks - Routing fundamentals");
  assert.equal(result.task.source, "learning");
  assert.equal(result.task.sourceLearningProjectId, project.id);
  assert.equal(result.task.sourceLearningNodeId, node.id);
  assert.equal(result.task.subjectName, project.subjectName);
  assert.equal(result.task.topic, node.title);
  assert.equal(result.task.chapterName, node.title);
  assert.equal(result.task.unitType, "chapter");
  assert.equal(result.dateKey, "2026-07-27");
  assert.equal(
    findLearningPlannerTask(result.schedule, project, node)?.dayIndex,
    2,
  );
});

test("upserts the same stable node by moving and renaming it without duplication", () => {
  const added = upsertLearningPlannerTask(
    schedule,
    project,
    node,
    "2026-07-27",
    "",
    "2026-07-26",
  );
  const renamedNode = { ...node, title: "Advanced routing" };
  const moved = upsertLearningPlannerTask(
    added.schedule,
    project,
    renamedNode,
    "2026-07-26",
    "",
    "2026-07-26",
  );
  const linkedTasks = moved.schedule.flatMap((day) => day.tasks).filter(
    (task) => task.sourceLearningNodeId === node.id,
  );

  assert.equal(moved.moved, true);
  assert.equal(moved.renamedFrom, "Computer networks - Routing fundamentals");
  assert.equal(moved.task.task, "Computer networks - Advanced routing");
  assert.equal(linkedTasks.length, 1);
  assert.equal(findLearningPlannerTask(moved.schedule, project.id, node.id)?.dayIndex, 1);
});

test("keeps equal display labels unique while retaining node identity", () => {
  const occupiedSchedule = structuredClone(schedule);
  occupiedSchedule[1].tasks.push({
    task: "Computer networks - Routing fundamentals",
    time: "Morning",
  });
  const result = upsertLearningPlannerTask(
    occupiedSchedule,
    project,
    node,
    "2026-07-26",
    "",
    "2026-07-26",
  );

  assert.equal(result.task.task, "Computer networks - Routing fundamentals (2)");
  assert.equal(result.task.sourceLearningNodeId, node.id);
});

test("rejects past, missing, or invalid planner targets", () => {
  assert.equal(
    upsertLearningPlannerTask(schedule, project, node, "2026-07-25", "", "2026-07-26"),
    null,
  );
  assert.equal(
    upsertLearningPlannerTask(schedule, project, node, "2026-07-30", "", "2026-07-26"),
    null,
  );
  assert.equal(
    upsertLearningPlannerTask(schedule, {}, node, "2026-07-26", "", "2026-07-26"),
    null,
  );
  assert.equal(
    upsertLearningPlannerTask(schedule, project, { id: "blank", title: " " }, "2026-07-26", "", "2026-07-26"),
    null,
  );
  assert.equal(buildLearningPlannerTaskName({}, { title: "Trees" }), "Learn - Trees");
});

test("marks a stably linked notebook unit complete without duplicating completion names", () => {
  const added = upsertLearningPlannerTask(
    schedule,
    project,
    node,
    "2026-07-27",
    "",
    "2026-07-26",
  );
  const first = setLearningPlannerNodeCompletion(
    added.schedule,
    [],
    project,
    node,
  );
  const second = setLearningPlannerNodeCompletion(
    added.schedule,
    first.completed,
    project,
    node,
  );

  assert.equal(first.match.matchType, "id");
  assert.equal(first.isCompleted, true);
  assert.deepEqual(first.completed, ["Computer networks - Routing fundamentals"]);
  assert.deepEqual(second.completed, first.completed);
  assert.equal(
    getLearningPlannerCompletionState(added.schedule, second.completed, project, node).isCompleted,
    true,
  );
});

test("matches subject-generated chapter and topic tasks by exact metadata", () => {
  const generatedSchedule = [{
    day: 1,
    tasks: [
      {
        source: "subject",
        subjectName: "Computer Networks",
        task: "Computer Networks - Routing fundamentals",
        topic: "Routing fundamentals",
        unitKey: "chapter:1",
        unitType: "chapter",
      },
      {
        source: "subject",
        subjectName: "Computer Networks",
        task: "Computer Networks - Distance-vector routing",
        topic: "Distance-vector routing",
        unitKey: "topic:distance-vector routing",
        unitType: "topic",
      },
    ],
  }];

  const chapterMatch = findLearningPlannerTaskForNode(
    generatedSchedule,
    project,
    { ...node, unitKey: "chapter:1" },
  );
  const topicMatch = findLearningPlannerTaskForNode(
    generatedSchedule,
    project,
    { id: "topic-1", title: "Distance vector routing", type: "topic" },
  );

  assert.equal(chapterMatch.matchType, "metadata");
  assert.equal(chapterMatch.task.unitKey, "chapter:1");
  assert.equal(topicMatch.task.unitType, "topic");
});

test("does not complete a similar title from another subject or an ambiguous unit", () => {
  const ambiguousSchedule = [{
    day: 1,
    tasks: [
      {
        subjectName: "Computer networks",
        task: "Computer networks - Routing fundamentals",
        topic: "Routing fundamentals",
        unitType: "chapter",
      },
      {
        subjectName: "Computer networks",
        task: "Computer networks - Routing fundamentals (revision)",
        topic: "Routing fundamentals",
        unitType: "chapter",
      },
      {
        subjectName: "Algorithms",
        task: "Algorithms - Routing fundamentals",
        topic: "Routing fundamentals",
        unitType: "chapter",
      },
    ],
  }];

  assert.equal(
    setLearningPlannerNodeCompletion(ambiguousSchedule, [], project, node),
    null,
  );
  assert.equal(
    findLearningPlannerTaskForNode(
      ambiguousSchedule,
      { id: "other", subjectName: "Operating systems" },
      node,
    ),
    null,
  );
});

test("unmarks only the linked planner task", () => {
  const added = upsertLearningPlannerTask(
    schedule,
    project,
    node,
    "2026-07-27",
    "",
    "2026-07-26",
  );
  const result = setLearningPlannerNodeCompletion(
    added.schedule,
    ["Keep me", added.task.task],
    project,
    node,
    false,
  );

  assert.equal(result.isCompleted, false);
  assert.deepEqual(result.completed, ["Keep me"]);
});
