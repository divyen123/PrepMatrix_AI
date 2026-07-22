import assert from "node:assert/strict";
import test from "node:test";

import { getPlannerMetrics } from "./plannerMetrics.js";

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
