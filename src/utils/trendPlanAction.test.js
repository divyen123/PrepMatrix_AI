import assert from "node:assert/strict";
import test from "node:test";

import { getTrendPlanAction } from "./trendPlanAction.js";

test("trend action prompts the learner to add a subject first", () => {
  assert.deepEqual(getTrendPlanAction([], [{ tasks: [{ task: "Existing task" }] }]), {
    kind: "add-subject",
    label: "Add Subject",
    route: "/subjects",
  });
});

test("trend action prompts the learner to create a plan without scheduled tasks", () => {
  const subjects = [{ name: "DBMS" }];
  assert.deepEqual(getTrendPlanAction(subjects, []), {
    kind: "create-plan",
    label: "Create Plan",
    route: "/planner",
  });
});

test("trend action opens the existing plan when a schedule is present", () => {
  assert.deepEqual(
    getTrendPlanAction([{ name: "DBMS" }], [{ date: "2026-07-14", tasks: [] }]),
    {
      kind: "view-plan",
      label: "View Plan",
      route: "/planner",
    }
  );
});
