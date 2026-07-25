import assert from "node:assert/strict";
import test from "node:test";

import {
  getPlannerMetrics,
  getSubjectQuizEligibility,
  QUIZ_ELIGIBILITY_THRESHOLD,
} from "./plannerMetrics.js";

test("weekly review stays locked without scheduled planner tasks", () => {
  assert.equal(getPlannerMetrics([], []).hasScheduledPlanner, false);
  assert.equal(getPlannerMetrics([{ day: 1, tasks: [] }], []).hasScheduledPlanner, false);
  assert.equal(getPlannerMetrics([{ day: 1, tasks: [null, { task: 42 }] }], []).hasScheduledPlanner, false);
});

test("weekly review unlocks for active and completed planner schedules", () => {
  const schedule = [{ day: 1, tasks: [{ task: "DBMS - Joins", time: "Morning" }] }];

  assert.equal(getPlannerMetrics(schedule, []).hasScheduledPlanner, true);
  assert.equal(getPlannerMetrics(schedule, ["DBMS - Joins"]).hasScheduledPlanner, true);
});

test("subject quiz eligibility stays locked below 50 percent", () => {
  const schedule = [{
    day: 1,
    tasks: [
      { task: "DBMS - Joins" },
      { task: "DBMS - Transactions" },
      { task: "DBMS - Indexes" },
    ],
  }];
  const eligibility = getSubjectQuizEligibility("DBMS", schedule, ["DBMS - Joins"]);

  assert.equal(QUIZ_ELIGIBILITY_THRESHOLD, 50);
  assert.equal(eligibility.completionRate, 33);
  assert.equal(eligibility.tasksToEligibility, 1);
  assert.equal(eligibility.isEligible, false);
});

test("subject quiz eligibility unlocks at exactly 50 percent", () => {
  const schedule = [{
    day: 1,
    tasks: [
      { task: "Operating Systems - Processes" },
      { task: "Operating Systems - Deadlocks" },
    ],
  }];
  const eligibility = getSubjectQuizEligibility(
    "operating systems",
    schedule,
    ["Operating Systems - Processes"]
  );

  assert.equal(eligibility.subjectName, "Operating Systems");
  assert.equal(eligibility.completionRate, 50);
  assert.equal(eligibility.tasksToEligibility, 0);
  assert.equal(eligibility.isEligible, true);
});

test("subject quiz eligibility requires scheduled work", () => {
  const eligibility = getSubjectQuizEligibility("Networks", [], []);

  assert.equal(eligibility.completionRate, 0);
  assert.equal(eligibility.isEligible, false);
});

test("subject quiz eligibility does not unlock from a rounded 50 percent display", () => {
  const tasks = Array.from({ length: 101 }, (_, index) => ({
    task: `Algorithms - Topic ${index + 1}`,
    subjectName: "Algorithms",
  }));
  const schedule = [{ day: 1, tasks }];
  const completed = tasks.slice(0, 50).map((task) => task.task);
  const eligibility = getSubjectQuizEligibility("Algorithms", schedule, completed);

  assert.equal(eligibility.completionRate, 49);
  assert.equal(eligibility.tasksToEligibility, 1);
  assert.equal(eligibility.isEligible, false);
});

test("subject quiz eligibility uses structured names that contain hyphens", () => {
  const schedule = [{
    day: 1,
    tasks: [
      { task: "Design - Theory - Foundations", subjectName: "Design - Theory" },
      { task: "Design - Theory - Practice", subjectName: "Design - Theory" },
    ],
  }];
  const eligibility = getSubjectQuizEligibility(
    "Design - Theory",
    schedule,
    ["Design - Theory - Foundations"]
  );

  assert.equal(eligibility.subjectName, "Design - Theory");
  assert.equal(eligibility.completionRate, 50);
  assert.equal(eligibility.isEligible, true);
});

test("subject quiz eligibility supports legacy hyphenated subject labels", () => {
  const schedule = [{
    day: 1,
    tasks: [
      { task: "Design - Theory - Foundations" },
      { task: "Design - Theory - Practice" },
    ],
  }];
  const eligibility = getSubjectQuizEligibility(
    "Design - Theory",
    schedule,
    ["Design - Theory - Foundations"]
  );

  assert.equal(eligibility.completionRate, 50);
  assert.equal(eligibility.isEligible, true);
});

test("unrelated subject progress cannot unlock the selected subject", () => {
  const schedule = [{
    day: 1,
    tasks: [
      { task: "DBMS - Joins", subjectName: "DBMS" },
      { task: "DBMS - Transactions", subjectName: "DBMS" },
      { task: "DBMS - Indexes", subjectName: "DBMS" },
      { task: "Math - Algebra", subjectName: "Math" },
      { task: "Math - Geometry", subjectName: "Math" },
    ],
  }];
  const completed = [
    "DBMS - Joins",
    "Math - Algebra",
    "Math - Geometry",
  ];
  const eligibility = getSubjectQuizEligibility("DBMS", schedule, completed);

  assert.equal(eligibility.completionRate, 33);
  assert.equal(eligibility.isEligible, false);
});
