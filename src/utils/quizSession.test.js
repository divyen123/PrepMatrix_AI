import assert from "node:assert/strict";
import test from "node:test";
import {
  QUIZ_SESSION_STATUSES,
  clearQuizSession,
  createQuizSession,
  getQuizSessionEntry,
  getQuizSessionStorageKey,
  readQuizSession,
  writeQuizSession,
} from "./quizSession.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
    values,
  };
}

const questions = [
  {
    id: "q-1",
    question: "What is 2 + 2?",
    options: ["3", "4", "5", "6"],
    answerIndex: 1,
    explanation: "Two pairs make four.",
  },
];

test("stores quiz sessions in distinct academic-profile namespaces", () => {
  const storage = memoryStorage();
  const first = createQuizSession({
    sessionId: "session-a",
    subjectName: "Math",
    topic: "Addition",
    questions,
  });
  const second = createQuizSession({
    sessionId: "session-b",
    status: QUIZ_SESSION_STATUSES.PAUSED,
    subjectName: "Science",
    topic: "Cells",
    questions,
  });

  writeQuizSession(storage, "profile-data-a", first);
  writeQuizSession(storage, "profile-data-b", second);

  assert.notEqual(
    getQuizSessionStorageKey("profile-data-a"),
    getQuizSessionStorageKey("profile-data-b"),
  );
  assert.equal(readQuizSession(storage, "profile-data-a").topic, "Addition");
  assert.equal(readQuizSession(storage, "profile-data-b").status, "paused");
});

test("normalizes answers and clears a completed or aborted local session", () => {
  const storage = memoryStorage();
  const session = createQuizSession({
    answers: { "q-1": 1, missing: 2 },
    questions,
    sessionId: "session-c",
    subjectName: "Math",
    topic: "Addition",
  });

  writeQuizSession(storage, "profile-data-c", session);
  assert.deepEqual(readQuizSession(storage, "profile-data-c").answers, { "q-1": 1 });
  clearQuizSession(storage, "profile-data-c");
  assert.equal(readQuizSession(storage, "profile-data-c"), null);
});

test("removes corrupt or incompatible persisted quiz data", () => {
  const storage = memoryStorage();
  const key = getQuizSessionStorageKey("profile-data-d");
  storage.setItem(key, JSON.stringify({ version: 99, topic: "Old data" }));

  assert.equal(readQuizSession(storage, "profile-data-d"), null);
  assert.equal(storage.getItem(key), null);

  storage.setItem(key, "not-json");
  assert.equal(readQuizSession(storage, "profile-data-d"), null);
  assert.equal(storage.getItem(key), null);
});

test("subject shortcuts prefill the requested subject without losing another subject's saved quiz", () => {
  const storage = memoryStorage();
  const saved = writeQuizSession(storage, "profile-entry", createQuizSession({
    answers: { "q-1": 1 },
    questions,
    sessionId: "math-quiz",
    status: QUIZ_SESSION_STATUSES.PAUSED,
    subjectName: "Math",
    topic: "Addition",
  }));
  const entry = getQuizSessionEntry("  Data analytics  ", saved);

  assert.equal(entry.subjectName, "Data analytics");
  assert.equal(entry.session, null);
  assert.equal(entry.deferredSession, saved);
  assert.deepEqual(entry.deferredSession.answers, { "q-1": 1 });
  assert.deepEqual(readQuizSession(storage, "profile-entry"), saved);
});

test("ordinary quiz visits and matching subject shortcuts restore the saved subject and answers", () => {
  const saved = createQuizSession({
    answers: { "q-1": 1 },
    questions,
    subjectName: "Math",
    topic: "Addition",
  });

  for (const subject of ["", " math "]) {
    const entry = getQuizSessionEntry(subject, saved);
    assert.equal(entry.subjectName, "Math");
    assert.equal(entry.session, saved);
    assert.equal(entry.deferredSession, null);
    assert.deepEqual(entry.session.answers, { "q-1": 1 });
  }
});

test("subject shortcuts initialize quiz setup when no draft exists", () => {
  assert.deepEqual(getQuizSessionEntry("Data analytics"), {
    subjectName: "Data analytics",
    session: null,
    deferredSession: null,
  });
});
