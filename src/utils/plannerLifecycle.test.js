import assert from "node:assert/strict";
import test from "node:test";
import { acknowledgeScheduleExam, getScheduleCompletion, separatePlannerRecall } from "./plannerLifecycle.js";
import { clearPlannerScheduleState } from "./plannerScheduleProgress.js";
import { getPlannerMetrics } from "./plannerMetrics.js";

const study = { id: "study-1", task: "Networks - TCP/IP" };
const recall = { id: "memory-decay-1", task: "3-minute memory check: TCP/IP", source: "memory-decay", nodeId: "tcp", recheckPending: true };
const schedule = [{ day: 1, date: "2026-09-12", tasks: [study, recall] }, { day: 2, date: "2026-09-13", tasks: [{ ...recall, id: "memory-review-2" }] }];

test("migrates legacy recall out of the timetable without losing learning or recheck records", () => {
  const input = { schedule, completed: [study.task, recall.task] };
  const original = structuredClone(input);
  const state = separatePlannerRecall(input);
  assert.deepEqual(input, original);
  assert.deepEqual(state.schedule, [{ ...schedule[0], tasks: [study] }]);
  assert.deepEqual(state.completed, [study.task]);
  assert.equal(state.memoryReviewData.schedule.length, 2);
  assert.equal(state.memoryReviewData.schedule[0].tasks[0].recheckPending, true);
  assert.deepEqual(state.memoryReviewData.completed, [recall.task]);
  assert.deepEqual(separatePlannerRecall(state), state);
});

test("clear removes all study days and progress but retains independent recall state after reload", () => {
  const state = separatePlannerRecall({ schedule, completed: [study.task, recall.task] });
  const cleared = clearPlannerScheduleState(state);
  const reloaded = separatePlannerRecall(JSON.parse(JSON.stringify(cleared)));
  assert.deepEqual(reloaded.schedule, []);
  assert.deepEqual(reloaded.completed, []);
  assert.deepEqual(reloaded.memoryReviewData, state.memoryReviewData);
  assert.equal(getScheduleCompletion(reloaded.schedule, reloaded.completed).shouldInvite, false);
});

test("retains recall dismissals and ID-based completions during migration", () => {
  const input = { schedule: [{ ...schedule[0], memoryReviewDismissals: [{ unitKey: "tcp", dateKey: "2026-09-12" }] }],
    completed: ["memory-review-1"], memoryReviewData: { completed: ["another-review"], schedule: [] } };
  const original = structuredClone(input);
  const state = separatePlannerRecall(input);
  assert.deepEqual(input, original);
  assert.deepEqual(state.memoryReviewData.completed, ["another-review", "memory-review-1"]);
  assert.equal(state.memoryReviewData.schedule[0].memoryReviewDismissals.length, 1);
  assert.equal(state.schedule[0].memoryReviewDismissals, undefined);
});

test("recall cannot reduce study completion or change server exam eligibility", () => {
  assert.equal(getPlannerMetrics(schedule, [study.task]).completionRate, 100);
  assert.equal(getPlannerMetrics(schedule, [study.task]).isExamEligible, true);
  assert.equal(getPlannerMetrics([{ tasks: [recall] }], [recall.task]).isExamEligible, false);
});

test("invites only when a nonempty schedule is exactly complete", () => {
  assert.equal(getScheduleCompletion([], []).shouldInvite, false);
  assert.equal(getScheduleCompletion([{ tasks: [recall] }], [recall.task]).shouldInvite, false);
  assert.equal(getScheduleCompletion(schedule, []).shouldInvite, false);
  assert.equal(getScheduleCompletion(schedule, [study.task]).shouldInvite, true);
  const many = Array.from({ length: 250 }, (_, index) => ({ task: `Task ${index}` }));
  const almost = many.slice(1).map((task) => task.task);
  assert.equal(getPlannerMetrics([{ tasks: many }], almost).completionRate, 100);
  assert.equal(getScheduleCompletion([{ tasks: many }], almost).shouldInvite, false);
});

test("Maybe later stays acknowledged across reloads and task rechecks; new schedules can invite again", () => {
  const completed = [study.task];
  const state = separatePlannerRecall({ schedule, completed });
  const result = getScheduleCompletion(state.schedule, completed);
  const acknowledged = JSON.parse(JSON.stringify(acknowledgeScheduleExam(state.schedule, result.key)));
  assert.equal(getScheduleCompletion(acknowledged, completed).shouldInvite, false);
  const rechecking = [{ ...acknowledged[0], tasks: [{ ...study, recheckPending: true }] }];
  assert.equal(getScheduleCompletion(rechecking, completed).complete, false);
  assert.equal(getScheduleCompletion(acknowledged, completed).shouldInvite, false);
  const newSchedule = [{ ...acknowledged[0], tasks: [study, { task: "HTTP" }] }];
  assert.equal(getScheduleCompletion(newSchedule, [...completed, "HTTP"]).shouldInvite, true);
  assert.equal(getScheduleCompletion(state.schedule, completed).shouldInvite, true);
});

test("normalizes malformed saved arrays without creating a completed schedule", () => {
  assert.deepEqual(separatePlannerRecall({ schedule: null, completed: {}, memoryReviewData: null }), {
    schedule: [], completed: [], memoryReviewData: { schedule: [], completed: [] },
  });
});
