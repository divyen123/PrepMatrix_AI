import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGeneratedQuestions } from "./generatedQuizQuestions.js";

function questionFixture(index, overrides = {}) {
  return {
    question: `Question ${index}?`,
    options: ["Alpha", "Beta", "Gamma", "Delta"],
    answerIndex: index % 4,
    explanation: `Explanation ${index}`,
    ...overrides,
  };
}

test("normalizes a complete set of valid generated quiz questions", () => {
  const normalized = normalizeGeneratedQuestions([
    questionFixture(0),
    questionFixture(1),
  ], 2);

  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].question, "Question 0?");
  assert.deepEqual(normalized[0].options, ["Alpha", "Beta", "Gamma", "Delta"]);
  assert.equal(normalized[1].answerIndex, 1);
});

test("rejects non-integer, coerced, and out-of-range answer indexes", () => {
  for (const answerIndex of ["1", 1.5, -1, 4, null, undefined]) {
    assert.throws(
      () => normalizeGeneratedQuestions([questionFixture(0, { answerIndex })], 1),
      /invalid quiz answer index/,
    );
  }
});

test("requires exactly four distinct nonempty normalized options", () => {
  const invalidOptions = [
    ["Alpha", "Beta", "Gamma"],
    ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"],
    ["Alpha", "Beta", "", "Delta"],
    ["Alpha", "Beta", "   ", "Delta"],
    ["Alpha", " alpha ", "Gamma", "Delta"],
    ["Alpha choice", "ALPHA   CHOICE", "Gamma", "Delta"],
  ];

  for (const options of invalidOptions) {
    assert.throws(
      () => normalizeGeneratedQuestions([questionFixture(0, { options })], 1),
      /invalid quiz options/,
    );
  }
});

test("rejects duplicate normalized prompts within the requested question set", () => {
  assert.throws(
    () => normalizeGeneratedQuestions([
      questionFixture(0, { question: "What is REST API?" }),
      questionFixture(1, { question: "  WHAT   IS rest api?  " }),
    ], 2),
    /duplicate quiz questions/,
  );
});

test("ignores questions beyond the requested set when checking duplicates", () => {
  const normalized = normalizeGeneratedQuestions([
    questionFixture(0, { question: "What is REST API?" }),
    questionFixture(1, { question: "WHAT IS REST API?" }),
  ], 1);

  assert.equal(normalized.length, 1);
});
