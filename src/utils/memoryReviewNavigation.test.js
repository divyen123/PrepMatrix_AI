import assert from "node:assert/strict";
import test from "node:test";
import {
  MEMORY_REVIEW_ROUTE,
  MEMORY_REVIEW_TASK_QUERY_PARAM,
  MEMORY_REVIEW_UNIT_QUERY_PARAM,
  buildMemoryReviewRoute,
  clearMemoryReviewRouteRequest,
  normalizeMemoryReviewTaskId,
  normalizeMemoryReviewUnitKey,
  parseMemoryReviewRoute,
} from "./memoryReviewNavigation.js";

test("builds and parses one exact memory-review task route", () => {
  const route = buildMemoryReviewRoute({
    id: "memory-review-abc_123:day-4",
    unitKey: "memory-review:notebook-1:topic-2:2026-09-03",
  });

  assert.equal(
    route,
    `${MEMORY_REVIEW_ROUTE}?${MEMORY_REVIEW_TASK_QUERY_PARAM}=memory-review-abc_123%3Aday-4&${MEMORY_REVIEW_UNIT_QUERY_PARAM}=memory-review%3Anotebook-1%3Atopic-2%3A2026-09-03`,
  );
  assert.deepEqual(parseMemoryReviewRoute(route), {
    requested: true,
    taskId: "memory-review-abc_123:day-4",
    unitKey: "memory-review:notebook-1:topic-2:2026-09-03",
  });
});

test("normalizes legacy memory-decay IDs at both ends of the route contract", () => {
  assert.equal(
    normalizeMemoryReviewTaskId("memory-decay-legacy"),
    "memory-review-legacy",
  );
  assert.equal(
    normalizeMemoryReviewUnitKey("memory-decay:notebook:node:day"),
    "memory-review:notebook:node:day",
  );
  assert.deepEqual(
    parseMemoryReviewRoute("?memoryTaskId=memory-decay-legacy&memoryUnitKey=memory-decay%3Anotebook%3Anode%3Aday"),
    {
      requested: true,
      taskId: "memory-review-legacy",
      unitKey: "memory-review:notebook:node:day",
    },
  );
});

test("uses a unit key as a safe fallback when a legacy task has no ID", () => {
  const route = buildMemoryReviewRoute({
    unitKey: "memory-review:notebook:node:2026-09-03",
  });

  assert.deepEqual(parseMemoryReviewRoute(route), {
    requested: true,
    taskId: "",
    unitKey: "memory-review:notebook:node:2026-09-03",
  });
});

test("rejects missing or unsafe task identifiers", () => {
  assert.equal(buildMemoryReviewRoute({}), MEMORY_REVIEW_ROUTE);
  assert.deepEqual(parseMemoryReviewRoute("?memoryTaskId=%3Cscript%3E"), {
    requested: false,
    taskId: "",
    unitKey: "",
  });
  assert.deepEqual(parseMemoryReviewRoute("not a valid URL"), {
    requested: false,
    taskId: "",
    unitKey: "",
  });
});

test("consumes only the one-shot memory-review request", () => {
  assert.equal(
    clearMemoryReviewRouteRequest(
      "?tab=due&memoryTaskId=memory-review-a&memoryUnitKey=memory-review%3An%3At%3Ad",
    ),
    "?tab=due",
  );
  assert.equal(clearMemoryReviewRouteRequest("?memoryTaskId=memory-review-a"), "");
});
