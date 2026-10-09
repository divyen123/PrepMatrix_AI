import test from "node:test";
import assert from "node:assert/strict";
import { getQuizSubjectContent, syncQuizSubjectTopic } from "./quizSubjectContent.js";

const EMPTY_CONTENT = { chapterNames: [], topics: [], topicText: "" };

test("quiz curriculum uses saved chapter labels without unnamed chapter fallbacks", () => {
  const subjects = [{
    name: "Physics",
    chapters: 5,
    chapterNames: [" Mechanics ", "", null, { title: "Optics" }, ""],
  }];

  assert.deepEqual(getQuizSubjectContent(subjects, " PHYSICS "), {
    chapterNames: ["Mechanics", "Optics"],
    topics: [],
    topicText: "Mechanics; Optics",
  });
  assert.deepEqual(getQuizSubjectContent([{ name: "Physics", chapters: 5 }], "Physics"), EMPTY_CONTENT);
});

test("quiz curriculum supports saved topics without any chapter labels", () => {
  assert.deepEqual(getQuizSubjectContent([{
    subjectName: "Algorithms",
    chapters: 4,
    topics: [" Sorting ", { name: "Graphs" }],
  }], "Algorithms"), {
    chapterNames: [],
    topics: ["Sorting", "Graphs"],
    topicText: "Sorting; Graphs",
  });
});

test("quiz curriculum supports chapter objects and nested topic objects", () => {
  assert.deepEqual(getQuizSubjectContent([{
    title: "Biology",
    topics: { label: "Genetics" },
    chapters: [
      { title: "Cells", topics: [{ name: "Organelles" }, "Membranes"] },
      { label: "", topics: { title: "Cell division" } },
    ],
  }], "Biology"), {
    chapterNames: ["Cells"],
    topics: ["Genetics", "Organelles", "Membranes", "Cell division"],
    topicText: "Cells; Genetics; Organelles; Membranes; Cell division",
  });
});

test("quiz curriculum deduplicates labels case-insensitively and merges chapters first", () => {
  assert.deepEqual(getQuizSubjectContent([{
    label: "Computer Networks",
    chapterNames: [" Network models ", "network models", { name: "Routing" }, ""],
    topics: ["routing", "Packets", "PACKETS", { title: "TCP" }],
  }], "computer networks"), {
    chapterNames: ["Network models", "Routing"],
    topics: ["routing", "Packets", "TCP"],
    topicText: "Network models; Routing; Packets; TCP",
  });
});

test("quiz curriculum returns empty content for cleared, unknown, or curriculum-free subjects", () => {
  const subjects = ["Physics", { name: "Chemistry" }, { name: "Biology", chapterNames: ["Cells"] }];

  for (const subjectName of ["", "Unknown", "Bio", "Physics", "Chemistry"]) {
    assert.deepEqual(getQuizSubjectContent(subjects, subjectName), EMPTY_CONTENT);
  }
  assert.deepEqual(getQuizSubjectContent(undefined, "Biology"), EMPTY_CONTENT);
  assert.deepEqual(getQuizSubjectContent(null, "Biology"), EMPTY_CONTENT);
});

test("quiz curriculum keeps the editable focus input on a single line", () => {
  assert.deepEqual(getQuizSubjectContent([{
    name: "Physics",
    chapterNames: ["Wave\n motion", "wave motion"],
    topics: ["Sound\t waves", "Sound waves"],
  }], "Physics"), {
    chapterNames: ["Wave motion"],
    topics: ["Sound waves"],
    topicText: "Wave motion; Sound waves",
  });
});

test("switching quiz subjects replaces previous subject focus with the next saved curriculum", () => {
  assert.equal(syncQuizSubjectTopic({
    currentTopic: "Custom mechanics focus",
    previousSubjectName: "Physics",
    previousPrefill: "Mechanics",
    subjectName: "Biology",
    prefill: "Cells; Genetics",
  }), "Cells; Genetics");
});

test("clearing or selecting an unknown quiz subject clears the previous curriculum focus", () => {
  for (const subjectName of ["", "Unknown"]) {
    assert.equal(syncQuizSubjectTopic({
      currentTopic: "Mechanics",
      previousSubjectName: "Physics",
      previousPrefill: "Mechanics",
      subjectName,
      prefill: "",
    }), "");
  }
});

test("same-subject curriculum changes update the unchanged automatic focus", () => {
  assert.equal(syncQuizSubjectTopic({
    currentTopic: "Mechanics",
    previousSubjectName: "Physics",
    previousPrefill: "Mechanics",
    subjectName: " PHYSICS ",
    prefill: "Mechanics; Optics",
  }), "Mechanics; Optics");
});

test("same-subject curriculum changes preserve manually edited or cleared focus", () => {
  for (const currentTopic of ["Optics only", "", " Mechanics "]) {
    assert.equal(syncQuizSubjectTopic({
      currentTopic,
      previousSubjectName: "Physics",
      previousPrefill: "Mechanics",
      subjectName: "physics",
      prefill: "Mechanics; Optics",
    }), currentTopic);
  }
});

test("late-arriving curriculum populates an initially empty automatic focus", () => {
  assert.equal(syncQuizSubjectTopic({
    currentTopic: "",
    previousSubjectName: "Physics",
    previousPrefill: "",
    subjectName: "Physics",
    prefill: "Mechanics",
  }), "Mechanics");
});

test("late-arriving curriculum preserves focus entered while curriculum loads", () => {
  assert.equal(syncQuizSubjectTopic({
    currentTopic: "Optics only",
    previousSubjectName: "Physics",
    previousPrefill: "",
    subjectName: "Physics",
    prefill: "Mechanics",
  }), "Optics only");
});

test("same-subject renders preserve custom focus when saved curriculum is unchanged", () => {
  assert.equal(syncQuizSubjectTopic({
    currentTopic: "Optics only",
    previousSubjectName: "Physics",
    previousPrefill: "Mechanics",
    subjectName: "Physics",
    prefill: "Mechanics",
  }), "Optics only");
});
