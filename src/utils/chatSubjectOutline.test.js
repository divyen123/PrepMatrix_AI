import assert from "node:assert/strict";
import test from "node:test";
import {
  formatChatSubjectOutline,
  isChatSubjectOutlineRequest,
  mergeChatSubjectOutline,
  normalizeChatSubjectOutline,
  resolveChatSubjectTarget,
  undoChatSubjectOutline,
  validateChatSubjectOutline,
} from "./chatSubjectOutline.js";

const draft = (patch = {}) => ({
  subjectName: "Data Structures",
  chapterNames: ["Arrays", "Linked lists"],
  topics: ["Time complexity"],
  ...patch,
});

test("outline requests bypass local planner commands and copied outlines retain their content", () => {
  assert.equal(isChatSubjectOutlineRequest("Give me topics for Biology to study today"), true);
  assert.equal(isChatSubjectOutlineRequest("Chapters on arithmetic progressions"), true);
  assert.equal(isChatSubjectOutlineRequest("How many tasks are remaining?"), false);
  assert.equal(formatChatSubjectOutline(null), "");
  const copied = formatChatSubjectOutline(draft());
  assert.match(copied, /AI-suggested outline: Data Structures/u);
  assert.match(copied, /1\. Arrays\n2\. Linked lists/u);
  assert.match(copied, /Focus topics\n- Time complexity/u);
});

test("validates flat outlines, normalizes whitespace, and deduplicates Unicode-equivalent names", () => {
  assert.deepEqual(normalizeChatSubjectOutline(draft({
    subjectName: "  Data   Structures  ",
    chapterNames: [" Arrays ", "ＡＲＲＡＹＳ", "Linked\n lists"],
    topics: ["arrays", " Time   complexity ", "TIME COMPLEXITY"],
    difficulty: " HARD ",
  })), {
    subjectName: "Data Structures", difficulty: "hard",
    chapterNames: ["Arrays", "Linked lists"], topics: ["Time complexity"],
  });
  assert.deepEqual(normalizeChatSubjectOutline({ subjectName: "Maths", topics: ["Fractions"] }), {
    subjectName: "Maths", difficulty: "medium", chapterNames: [], topics: ["Fractions"],
  });
});

test("rejects incomplete, nested, invalid and oversized outlines without truncating them", () => {
  for (const raw of [
    null, [], {}, draft({ subjectName: " " }), draft({ subjectName: "X".repeat(161) }),
    draft({ chapterNames: ["X".repeat(121)] }), draft({ topics: [""] }),
    draft({ chapterNames: [{ title: "Arrays", topics: ["Insertion"] }] }),
    draft({ topics: [["Insertion"]] }), draft({ difficulty: "urgent" }),
    draft({ chapterNames: "Arrays" }), draft({ chapterNames: [], topics: [] }),
    draft({ topics: ["A\u0000B"] }),
    draft({ chapterNames: Array.from({ length: 501 }, (_, index) => `Chapter ${index}`) }),
    draft({ topics: Array.from({ length: 61 }, (_, index) => `Topic ${index}`) }),
  ]) {
    const result = validateChatSubjectOutline(raw);
    assert.equal(result.outline, null);
    assert.ok(result.errors.length);
  }
});

test("matches exact names only automatically and asks for ambiguous aliases and duplicate names", () => {
  const subjects = [
    { name: " Data   Structures " }, { name: "Operating Systems" },
    { name: "Data Structures and Algorithms" }, { name: "Mathematics" },
  ];
  assert.deepEqual(resolveChatSubjectTarget(subjects, "ＤＡＴＡ STRUCTURES"), {
    status: "existing", index: 0, candidates: [{ index: 0, name: " Data   Structures " }],
  });
  assert.equal(resolveChatSubjectTarget(subjects, "OS").status, "ambiguous");
  assert.equal(resolveChatSubjectTarget(subjects, "DSA").candidates[0].index, 2);
  assert.equal(resolveChatSubjectTarget(subjects, "Mathematic").status, "ambiguous");
  assert.equal(resolveChatSubjectTarget(subjects, "Advanced Data Structures").status, "ambiguous");
  assert.equal(resolveChatSubjectTarget(subjects, "Physics").status, "new");
  assert.equal(resolveChatSubjectTarget([{ name: "Maths" }, { name: " maths " }], "Maths").status, "ambiguous");
  assert.equal(resolveChatSubjectTarget([null, { name: 4 }], "Maths").status, "new");
});

test("creates a subject with sensible defaults and supports focus-topic-only subjects", () => {
  const existing = [{ name: "Physics", chapters: 1 }];
  const result = mergeChatSubjectOutline(existing, draft());
  assert.equal(result.created, true);
  assert.equal(result.subjectIndex, 1);
  assert.equal(result.subjects[0], existing[0]);
  assert.equal(result.subject.difficulty, "medium");
  assert.equal(result.subject.chapters, 2);
  assert.equal(result.subject.studyPreferences.sessionMinutes, 45);
  assert.equal(result.addedChapters, 2);
  assert.equal(result.addedTopics, 1);
  assert.equal(existing.length, 1);
  const topicsOnly = mergeChatSubjectOutline([], draft({ chapterNames: [], topics: ["Arrays"] }));
  assert.equal(topicsOnly.subject.chapters, 0);
  assert.deepEqual(topicsOnly.subject.chapterNames, []);
});

test("merges without changing existing numbering, names, settings, metadata, or other subjects", () => {
  const subject = {
    id: "existing-id", name: "Data Structures", chapters: 4,
    chapterNames: [" ARRAYs ", "", "Trees"], topics: ["Pointer basics"],
    difficulty: "hard", studyPreferences: { sessionMinutes: 60 },
    completedChapters: [1, 3], custom: { pinned: true },
  };
  const other = { name: "Physics", chapters: 2 };
  const subjects = [subject, other];
  const before = structuredClone(subjects);
  const result = mergeChatSubjectOutline(subjects, draft({
    chapterNames: ["Arrays", "Linked lists", "Pointer basics", "linked LISTS"],
    topics: ["trees", "Time complexity", "TIME COMPLEXITY"],
    difficulty: "easy",
  }));
  assert.deepEqual(subjects, before);
  assert.equal(result.subject.id, "existing-id");
  assert.equal(result.subject.difficulty, "hard");
  assert.equal(result.subject.studyPreferences, subject.studyPreferences);
  assert.equal(result.subject.custom, subject.custom);
  assert.deepEqual(result.subject.completedChapters, [1, 3]);
  assert.deepEqual(result.subject.chapterNames, [" ARRAYs ", "Linked lists", "Trees", ""]);
  assert.equal(result.subject.chapters, 4);
  assert.deepEqual(result.subject.topics, ["Pointer basics", "Time complexity"]);
  assert.equal(result.subjects[1], other);
  assert.equal(result.addedChapters, 1);
  assert.equal(result.addedTopics, 1);
  assert.equal(result.skippedCount, 5);
});

test("repeated import is a no-op and preserves references", () => {
  const first = mergeChatSubjectOutline([], draft());
  const repeated = mergeChatSubjectOutline(first.subjects, draft());
  assert.equal(repeated.changed, false);
  assert.equal(repeated.subjects, first.subjects);
  assert.equal(repeated.subject, first.subject);
  assert.equal(repeated.skippedCount, 3);
  assert.equal(repeated.undoReceipt, null);
});

test("fills existing unnamed chapter slots before increasing the chapter count", () => {
  const existing = { name: "Maths", chapters: 5 };
  const names = ["Numbers", "Fractions", "Algebra", "Geometry", "Statistics"];
  const result = mergeChatSubjectOutline([existing], draft({ subjectName: "Maths", chapterNames: names, topics: [] }));
  assert.equal(result.subject.chapters, 5);
  assert.deepEqual(result.subject.chapterNames, names);
  assert.equal(result.addedChapters, 5);
  assert.equal(mergeChatSubjectOutline(result.subjects, draft({ subjectName: "Maths", chapterNames: names, topics: [] })).changed, false);
  assert.deepEqual(undoChatSubjectOutline(result.subjects, result.undoReceipt), [existing]);
});

test("requires a choice for aliases, protects duplicate creation, and rejects stale explicit targets", () => {
  const subjects = [{ name: "Data Structures and Algorithms", chapters: 0 }];
  const outline = draft({ subjectName: "DSA" });
  assert.throws(() => mergeChatSubjectOutline(subjects, outline), /Choose the subject/u);
  const chosen = mergeChatSubjectOutline(subjects, outline, { targetIndex: 0, expectedTargetName: subjects[0].name });
  assert.equal(chosen.created, false);
  assert.equal(chosen.subject.name, subjects[0].name);
  assert.equal(mergeChatSubjectOutline(subjects, outline, { targetIndex: null }).created, true);
  assert.throws(() => mergeChatSubjectOutline(subjects, draft({ subjectName: subjects[0].name }), { targetIndex: null }), /already exists/u);
  for (const targetIndex of [-1, 1, 0.5, "0"]) {
    assert.throws(() => mergeChatSubjectOutline(subjects, outline, { targetIndex }), /no longer available/u);
  }
  assert.throws(() => mergeChatSubjectOutline(subjects, outline, { targetIndex: 0, expectedTargetName: "Physics" }), /selected subject changed/u);
});

test("rejects overflowing or malformed existing subjects atomically", () => {
  const full = { name: "Data Structures", chapters: 500, chapterNames: Array.from({ length: 500 }, (_, index) => `Old ${index}`), topics: Array.from({ length: 60 }, (_, index) => `Topic ${index}`) };
  assert.throws(() => mergeChatSubjectOutline([full], draft()), /500 chapters/u);
  assert.throws(() => mergeChatSubjectOutline([full], draft({ chapterNames: [] })), /60 focus topics/u);
  assert.equal(full.chapters, 500);
  assert.equal(full.topics.length, 60);
  for (const subject of [
    { name: "Data Structures", chapters: -1 },
    { name: "Data Structures", chapters: 2.5 },
    { name: "Data Structures", chapters: [{ title: "Old" }] },
    { name: "Data Structures", chapters: 1, chapterNames: ["One", "Two"] },
    { name: "Data Structures", chapters: 1, topics: [{ title: "Old" }] },
  ]) assert.throws(() => mergeChatSubjectOutline([subject], draft()), /subject/u);
});

test("undo removes a created subject while preserving unrelated later additions", () => {
  const other = { name: "Physics", chapters: 1 };
  const importResult = mergeChatSubjectOutline([other], draft());
  const later = { name: "Chemistry", chapters: 2 };
  const restored = undoChatSubjectOutline([later, ...importResult.subjects], importResult.undoReceipt);
  assert.deepEqual(restored, [later, other]);
  assert.equal(restored[0], later);
  assert.equal(restored[1], other);
});

test("undo restores an existing subject only while its imported state is unchanged", () => {
  const before = { name: "Data Structures", chapters: 1, chapterNames: ["Old"], difficulty: "easy", notes: ["Keep"] };
  const imported = mergeChatSubjectOutline([before], draft());
  assert.deepEqual(undoChatSubjectOutline(imported.subjects, imported.undoReceipt), [before]);
  const changed = [{ ...imported.subject, difficulty: "hard" }];
  assert.throws(() => undoChatSubjectOutline(changed, imported.undoReceipt), /has changed/u);
  assert.throws(() => undoChatSubjectOutline([], imported.undoReceipt), /has changed/u);
  assert.throws(() => undoChatSubjectOutline([imported.subject, structuredClone(imported.subject)], imported.undoReceipt), /has changed/u);
  assert.throws(() => undoChatSubjectOutline([imported.subject, { name: "Data Structures", chapters: 1 }], imported.undoReceipt), /has changed/u);
  assert.throws(() => undoChatSubjectOutline([], null), /no longer/u);
});
