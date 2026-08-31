import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveRouteTaskActivity,
  getBackgroundTaskKey,
} from "../utils/backgroundTasks.js";

test("builds profile-scoped task keys", () => {
  assert.equal(getBackgroundTaskKey("Learning Notebook", "profile-a"), "learning-notebook:profile-a");
  assert.equal(getBackgroundTaskKey("Learning Notebook", ""), "");
});

test("route activity is profile scoped and prioritizes running work", () => {
  const tasks = {
    one: {
      academicProfileId: "profile-a",
      route: "/learn",
      status: "completed",
      updatedAt: 4,
    },
    two: {
      academicProfileId: "profile-a",
      route: "/learn",
      status: "running",
      updatedAt: 2,
    },
    three: {
      academicProfileId: "profile-b",
      route: "/learn",
      status: "failed",
      updatedAt: 10,
    },
  };

  assert.equal(deriveRouteTaskActivity(tasks, "/learn", "profile-a")?.status, "running");
  assert.equal(deriveRouteTaskActivity(tasks, "/learn", "profile-b")?.status, "failed");
  assert.equal(deriveRouteTaskActivity(tasks, "/exam", "profile-a"), null);
});
