import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLearningNoteSourceKey,
  buildLearningTopicNote,
  normalizeLearningTopicNote,
} from "./learningNoteIntegration.js";

test("builds a Notes-compatible topic note with useful learning context", () => {
  const note = buildLearningTopicNote({
    chapterId: "chapter-1",
    chapterTitle: "Trees",
    examples: ["Trace an AVL insertion."],
    explanation: "Balanced trees keep their height bounded after updates.",
    keyPoints: ["Height invariant", "Local rotations"],
    notebookId: "notebook-1",
    subjectName: "Data Structures",
    summary: "A compact guide to balanced search trees.",
    topicId: "topic-1",
    topicTitle: "AVL Trees",
  }, {
    idFactory: () => "note-1",
    now: new Date("2026-08-08T10:00:00.000Z"),
  });

  assert.equal(note.id, "note-1");
  assert.equal(note.topic, "AVL Trees · Data Structures");
  assert.equal(note.status, "Open");
  assert.equal(note.source, "start-learning");
  assert.equal(note.learningContext.chapter, "Trees");
  assert.match(note.details, /Subject: Data Structures/u);
  assert.match(note.details, /• Height invariant/u);
  assert.match(note.details, /Trace an AVL insertion/u);
});

test("uses a stable case-insensitive source key to prevent duplicate topic notes", () => {
  const first = buildLearningNoteSourceKey({
    subject: " Data Structures ",
    chapter: "Trees",
    topic: "AVL Trees",
  });
  const second = buildLearningNoteSourceKey({
    subject: "data structures",
    chapter: " trees ",
    topic: "avl trees",
  });

  assert.equal(first, second);
});

test("normalizes untrusted learning-note fields and rebuilds source metadata", () => {
  const note = normalizeLearningTopicNote({
    id: "saved-note",
    topic: "Paging · Operating Systems",
    details: "Virtual memory concepts",
    priority: "Urgent",
    sourceKey: "spoofed",
    status: "Resolved",
    learningContext: {
      chapter: "Memory",
      subject: "Operating Systems",
      topic: "Paging",
    },
  });

  assert.equal(note.priority, "Medium");
  assert.equal(note.status, "Open");
  assert.equal(note.source, "start-learning");
  assert.notEqual(note.sourceKey, "spoofed");
  assert.match(note.sourceKey, /^start-learning:/u);
});

test("rejects a learning note without a topic", () => {
  assert.throws(
    () => buildLearningTopicNote({ subject: "Physics" }),
    /topic is required/iu,
  );
});
