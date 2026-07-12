import assert from "node:assert/strict";
import test from "node:test";
import {
  generateExamQuestions,
  isGroqJsonGenerationFailure,
  normalizeExamQuestions,
  requestGroqJson,
} from "./examRoutes.js";

function questionFixture(label, overrides = {}) {
  return {
    question: label,
    options: ["Option A", "Option B", "Option C", "Option D"],
    answerIndex: 0,
    explanation: `Explanation for ${label}`,
    topic: "Test topic",
    difficulty: "easy",
    ...overrides,
  };
}

test("keeps valid MCQs while skipping malformed and duplicate items", () => {
  const valid = questionFixture("Which option is correct?", {
    options: [
      { text: "One" },
      { text: "Two" },
      { text: "Three" },
      { text: "Four" },
    ],
    answerIndex: undefined,
    correctAnswer: "Two",
  });
  const normalized = normalizeExamQuestions([
    valid,
    { ...valid },
    questionFixture("Malformed options", { options: ["One", "Two"] }),
  ], 10);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].question, valid.question);
  assert.deepEqual(normalized[0].options, ["One", "Two", "Three", "Four"]);
  assert.equal(normalized[0].answerIndex, 1);
});

test("preserves programming operators and Unicode when validating options", () => {
  const normalized = normalizeExamQuestions([
    questionFixture("How do Java increment and decrement operators differ?", {
      options: ["i++", "++i", "i--", "--i"],
    }),
    questionFixture("தமிழில் சரியான தேர்வைத் தேர்ந்தெடுக்கவும்", {
      options: ["ஆம்", "இல்லை", "முதல்", "இரண்டாம்"],
      answerIndex: 2,
    }),
    questionFixture("Which Java logical operator is shown?", {
      options: ["&&", "||", "&", "|"],
      answerIndex: 1,
    }),
  ], 10);

  assert.equal(normalized.length, 3);
  assert.deepEqual(normalized[0].options, ["i++", "++i", "i--", "--i"]);
  assert.deepEqual(normalized[1].options, ["ஆம்", "இல்லை", "முதல்", "இரண்டாம்"]);
  assert.deepEqual(normalized[2].options, ["&&", "||", "&", "|"]);
});

test("recognizes Groq JSON validation failures without treating unrelated 400s as recoverable", () => {
  assert.equal(isGroqJsonGenerationFailure({
    error: {
      code: "json_validate_failed",
      message: "Failed to generate JSON. Please adjust your prompt.",
      failed_generation: "{invalid",
    },
  }), true);
  assert.equal(isGroqJsonGenerationFailure({
    error: { code: "failed_generation", message: "Legacy JSON generation failure." },
  }), true);
  assert.equal(isGroqJsonGenerationFailure({
    error: { code: "invalid_request_error", message: "The model is unavailable." },
  }), false);
});

test("retries without JSON Object Mode when Groq returns json_validate_failed", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    if (requests.length === 1) {
      return {
        ok: false,
        status: 400,
        headers: { get: () => null },
        json: async () => ({
          error: {
            code: "json_validate_failed",
            message: "Failed to generate JSON. Please adjust your prompt. See 'failed_generation' for more details.",
            failed_generation: "{invalid",
          },
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ choices: [{ message: { content: '{"questions":[]}' } }] }),
    };
  };

  try {
    const result = await requestGroqJson(
      { apiKey: "test-key" },
      "test-model",
      { system: "Return JSON.", prompt: "Create questions.", temperature: 0.4 },
    );

    assert.deepEqual(result, { questions: [] });
    assert.deepEqual(requests[0].response_format, { type: "json_object" });
    assert.equal("response_format" in requests[1], false);
    assert.equal(requests[1].temperature, 0.1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("recovers partial online-exam batches by requesting only missing questions", async () => {
  const originalFetch = globalThis.fetch;
  const callsByBatch = new Map();
  const prompts = [];

  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    const prompt = request.messages.at(-1).content;
    prompts.push(prompt);
    const batch = Number(prompt.match(/Batch: (\d+) of 4/u)?.[1]);
    assert.ok(batch >= 1 && batch <= 4);
    const pass = (callsByBatch.get(batch) || 0) + 1;
    callsByBatch.set(batch, pass);

    const count = pass === 1 ? 6 : 4;
    const offset = pass === 1 ? 0 : 6;
    const questions = Array.from({ length: count }, (_, index) => (
      questionFixture(`Batch ${batch} concept ${offset + index + 1}`)
    ));
    if (pass === 1) {
      questions.push({ ...questions[0] });
      questions.push(questionFixture(`Batch ${batch} malformed`, { options: ["A", "B"] }));
    }

    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ questions }) } }],
      }),
    };
  };

  try {
    const questions = await generateExamQuestions(
      { apiKey: "test-key" },
      "test-model",
      {
        promptLines: ["LEARNER STAGE - HARD CONSTRAINT"],
        subjectName: "Java Programming",
        scopeText: "Functions, arrays, collections, and operators",
      },
    );

    assert.equal(questions.length, 40);
    assert.equal(new Set(questions.map((question) => question.question)).size, 40);
    assert.deepEqual([...callsByBatch.values()], [2, 2, 2, 2]);
    assert.equal(prompts.length, 8);
    assert.equal(prompts.filter((prompt) => /Generate exactly 4 new unique academic MCQs/u.test(prompt)).length, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
