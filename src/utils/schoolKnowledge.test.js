import assert from "node:assert/strict";
import test from "node:test";
import {
  SCHOOL_KNOWLEDGE_QUESTIONS,
  applySchoolKnowledgeResult,
  buildSchoolKnowledgeDailyChallenge,
  createDefaultSchoolKnowledgeProgress,
  getSchoolKnowledgeStorageKey,
  loadSchoolKnowledgeProgress,
  millisecondsUntilNextSchoolKnowledgeDay,
  saveSchoolKnowledgeProgress,
  scoreSchoolKnowledgeChallenge,
} from "./schoolKnowledge.js";

test("ships a varied and internally valid General Knowledge bank", () => {
  assert.ok(SCHOOL_KNOWLEDGE_QUESTIONS.length >= 40);
  assert.equal(new Set(SCHOOL_KNOWLEDGE_QUESTIONS.map(({ id }) => id)).size, SCHOOL_KNOWLEDGE_QUESTIONS.length);
  assert.ok(new Set(SCHOOL_KNOWLEDGE_QUESTIONS.map(({ category }) => category)).size >= 8);
  SCHOOL_KNOWLEDGE_QUESTIONS.forEach((question) => {
    assert.ok(question.prompt.length > 10);
    assert.ok(question.explanation.length > 10);
    assert.ok(question.options.length >= 4);
    assert.equal(new Set(question.options.map(({ id }) => id)).size, question.options.length);
    assert.ok(question.options.some(({ id }) => id === question.answer));
  });
});

test("daily challenge is deterministic for one learner and rotates on the next day", () => {
  const options = {
    date: new Date("2026-08-09T09:00:00"),
    grade: "Class 5",
    userKey: "learner-one",
  };
  const first = buildSchoolKnowledgeDailyChallenge(options);
  const replay = buildSchoolKnowledgeDailyChallenge(options);
  const tomorrow = buildSchoolKnowledgeDailyChallenge({
    ...options,
    date: new Date("2026-08-10T09:00:00"),
  });

  assert.equal(first.questions.length, 8);
  assert.deepEqual(first.questions.map(({ id }) => id), replay.questions.map(({ id }) => id));
  assert.notDeepEqual(first.questions.map(({ id }) => id), tomorrow.questions.map(({ id }) => id));
  assert.equal(new Set(first.questions.map(({ id }) => id)).size, first.questions.length);
  assert.ok(new Set(first.questions.map(({ category }) => category)).size >= 6);
});

test("Class 4 challenge avoids stretch questions while Classes 6 through 8 keep higher grades", () => {
  const classFour = buildSchoolKnowledgeDailyChallenge({
    date: new Date("2026-08-09T09:00:00"),
    grade: 4,
    questionCount: 12,
  });
  const classSix = buildSchoolKnowledgeDailyChallenge({
    date: new Date("2026-08-09T09:00:00"),
    grade: 6,
    questionCount: 12,
  });
  const classSeven = buildSchoolKnowledgeDailyChallenge({
    date: new Date("2026-08-09T09:00:00"),
    grade: "Class 7",
    questionCount: 12,
  });
  const classEight = buildSchoolKnowledgeDailyChallenge({
    date: new Date("2026-08-09T09:00:00"),
    grade: "Grade 8",
    questionCount: 12,
  });

  assert.equal(classFour.grade, 4);
  assert.equal(classSix.grade, 6);
  assert.equal(classSeven.grade, 7);
  assert.equal(classEight.grade, 8);
  assert.ok(classFour.questions.every(({ difficulty }) => difficulty !== "stretch"));
  assert.ok(classSix.questions.some(({ difficulty }) => difficulty === "stretch"));
  assert.ok(classSeven.questions.some(({ difficulty }) => difficulty === "stretch"));
  assert.ok(classEight.questions.some(({ difficulty }) => difficulty === "stretch"));
});

test("scores selected answers and creates a useful review", () => {
  const challenge = buildSchoolKnowledgeDailyChallenge({
    date: new Date("2026-08-09T09:00:00"),
    grade: 5,
    questionCount: 4,
  });
  const answers = Object.fromEntries(challenge.questions.map((question, index) => [
    question.id,
    index === 0 ? question.answer : "definitely-wrong",
  ]));
  const result = scoreSchoolKnowledgeChallenge(challenge, answers);

  assert.equal(result.correct, 1);
  assert.equal(result.total, 4);
  assert.equal(result.percentage, 25);
  assert.equal(result.review[0].correct, true);
  assert.equal(result.review[1].correct, false);
  assert.ok(result.review[1].correctLabel);
});

test("progress keeps personal best, unique completion days, and a daily streak", () => {
  let progress = createDefaultSchoolKnowledgeProgress();
  progress = applySchoolKnowledgeResult(progress, {
    challengeId: "day-one",
    dateKey: "2026-08-07",
    correct: 4,
    total: 8,
    percentage: 50,
  });
  progress = applySchoolKnowledgeResult(progress, {
    challengeId: "day-two",
    dateKey: "2026-08-08",
    correct: 7,
    total: 8,
    percentage: 88,
  });
  progress = applySchoolKnowledgeResult(progress, {
    challengeId: "day-two-replay",
    dateKey: "2026-08-08",
    correct: 5,
    total: 8,
    percentage: 63,
  });
  progress = applySchoolKnowledgeResult(progress, {
    challengeId: "day-three",
    dateKey: "2026-08-09",
    correct: 6,
    total: 8,
    percentage: 75,
  });

  assert.equal(progress.attempts, 4);
  assert.deepEqual(progress.completedDateKeys, ["2026-08-07", "2026-08-08", "2026-08-09"]);
  assert.equal(progress.streak, 3);
  assert.equal(progress.bestScore, 7);
  assert.equal(progress.bestTotal, 8);
  assert.equal(progress.totalCorrect, 22);
  assert.equal(progress.totalQuestions, 32);
});

test("local persistence is isolated by user", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const learnerOne = { id: "learner-one" };
  const learnerTwo = { id: "learner-two" };
  const progress = applySchoolKnowledgeResult(createDefaultSchoolKnowledgeProgress(), {
    challengeId: "today",
    dateKey: "2026-08-09",
    correct: 8,
    total: 8,
    percentage: 100,
  });

  assert.notEqual(getSchoolKnowledgeStorageKey(learnerOne), getSchoolKnowledgeStorageKey(learnerTwo));
  assert.equal(saveSchoolKnowledgeProgress(storage, learnerOne, progress), true);
  assert.equal(loadSchoolKnowledgeProgress(storage, learnerOne).bestScore, 8);
  assert.equal(loadSchoolKnowledgeProgress(storage, learnerTwo).attempts, 0);
});

test("next challenge timer points to local midnight", () => {
  assert.equal(
    millisecondsUntilNextSchoolKnowledgeDay(new Date("2026-08-09T23:59:30")),
    30_000,
  );
});
