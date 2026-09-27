import assert from "node:assert/strict";
import test from "node:test";
import { addAnswerCoachRevisionTask } from "./answerCoachPlanner.js";

const weakQuestion = {
  paperId: "paper-1",
  questionId: "question-3",
  questionNumber: 3,
  subjectName: "Maths",
  topic: "Quadratic equations",
  paperTitle: "Algebra practice",
};

test("creates a dated revision day when the schedule has no suitable day", () => {
  const existing = [
    { day: 1, date: "2026-09-20", tasks: [{ task: "Maths - Linear equations" }] },
    { day: 2, date: "2026-09-21", tasks: [] },
  ];
  const added = addAnswerCoachRevisionTask(existing, weakQuestion, "2026-09-27");

  assert.equal(existing.length, 2);
  assert.equal(added.length, 3);
  assert.deepEqual(added[2].date, "2026-09-27");
  assert.equal(added[2].day, 3);
  assert.equal(added[2].tasks[0].source, "answer-coach");
  assert.equal(added[2].tasks[0].subjectName, "Maths");
  assert.equal(added[2].tasks[0].topic, "Quadratic equations");
  assert.match(added[2].tasks[0].task, /Revise Maths: Quadratic equations \(Q3 · Algebra practice\)/u);
});

test("uses today's bucket, then avoids inserting the same question twice", () => {
  const existing = [{ day: 1, date: "2026-09-27", tasks: [{ task: "Maths - Fractions" }] }];
  const added = addAnswerCoachRevisionTask(existing, weakQuestion, "2026-09-27");
  const duplicate = addAnswerCoachRevisionTask(added, {
    ...weakQuestion,
    questionId: "another-id-for-the-same-number",
  }, "2026-09-28");

  assert.equal(added.length, 1);
  assert.equal(added[0].tasks.length, 2);
  assert.equal(existing[0].tasks.length, 1);
  assert.equal(duplicate, added);
});

test("chooses the nearest future bucket and keeps repeated topic names distinct", () => {
  const existing = [
    { day: 1, date: "2026-10-02", tasks: [] },
    { day: 2, date: "2026-09-29", tasks: [] },
  ];
  const first = addAnswerCoachRevisionTask(existing, weakQuestion, "2026-09-27");
  const second = addAnswerCoachRevisionTask(first, {
    ...weakQuestion,
    paperId: "paper-2",
  }, "2026-09-27");

  assert.equal(first[1].tasks.length, 1);
  assert.equal(first[0].tasks.length, 0);
  assert.equal(second[1].tasks.length, 2);
  assert.notEqual(second[1].tasks[0].id, second[1].tasks[1].id);
  assert.notEqual(second[1].tasks[0].task, second[1].tasks[1].task);
  assert.match(second[1].tasks[1].task, /\(2\)$/u);
});

test("keeps an undated legacy plan intact and ignores missing topics", () => {
  const existing = [{ day: 1, tasks: [{ task: "Legacy task" }] }];
  const unchanged = addAnswerCoachRevisionTask(existing, { ...weakQuestion, topic: "" }, "2026-09-27");
  const added = addAnswerCoachRevisionTask(existing, weakQuestion, "2026-09-27");

  assert.equal(unchanged, existing);
  assert.equal(existing[0], added[0]);
  assert.equal(added[1].date, "2026-09-27");
  assert.equal(added[1].day, 2);
});

test("uses a schedule day derived from the plan start date", () => {
  const existing = [{ day: 1, tasks: [] }, { day: 2, tasks: [] }];
  const added = addAnswerCoachRevisionTask(existing, weakQuestion, "2026-09-28", "2026-09-27");

  assert.equal(added.length, 2);
  assert.equal(added[1].tasks[0].source, "answer-coach");
});
