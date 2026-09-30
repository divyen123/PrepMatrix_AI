import assert from "node:assert/strict";
import test from "node:test";
import { getNotebookRecallCard, getNotebookRecallTopics } from "./notebookRecall.js";

test("recall uses a matching question and revised note for the selected outline topic", () => {
  const notebook = {
    importantQuestions: [
      { question: "How does binary search narrow the interval?", answer: "It halves the candidate interval." },
    ],
    revisedNotes: [
      { title: "Binary search", content: "Only use it on sorted data.", keyPoints: ["Compare the midpoint."], revisionTips: ["Check boundaries."] },
      { title: "Hash tables", content: "Unrelated reference." },
    ],
  };
  const topic = {
    id: "binary-search",
    type: "topic",
    title: "Binary search",
    chapterName: "Algorithms",
    explanation: "Search a sorted interval by halving it.",
    keyPoints: ["Discard one half each step."],
    examples: ["Find a number in a sorted array."],
  };

  const card = getNotebookRecallCard(notebook, topic);
  assert.equal(card.prompt, "How does binary search narrow the interval?");
  assert.equal(card.answer, "It halves the candidate interval.");
  assert.deepEqual(card.notes, ["Only use it on sorted data.", "Compare the midpoint.", "Check boundaries."]);
  assert.deepEqual(card.outline, ["Search a sorted interval by halving it.", "Discard one half each step."]);
  assert.deepEqual(card.examples, ["Find a number in a sorted array."]);
  assert.ok(!card.notes.includes("Unrelated reference."));
});

test("recall falls back to a topic prompt and only allows outline topics", () => {
  const nodes = [
    { id: "chapter", type: "chapter", title: "Algorithms" },
    { id: "topic", type: "topic", title: "Sorting", summary: "Order values." },
  ];
  assert.deepEqual(getNotebookRecallTopics(nodes), [nodes[1]]);
  assert.equal(getNotebookRecallCard({}, nodes[0]), null);
  const card = getNotebookRecallCard({}, nodes[1]);
  assert.match(card.prompt, /From memory, explain Sorting/u);
  assert.deepEqual(card.outline, ["Order values."]);
});
