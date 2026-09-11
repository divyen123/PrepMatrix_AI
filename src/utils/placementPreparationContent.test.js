import assert from "node:assert/strict";
import test from "node:test";
import { placementContentBlocks } from "./placementPreparationContent.js";
import { normalizeLearningCareerTopicAnalysis } from "./learningNotebook.js";

test("turns saved topic prose into readable points without damaging technical notation", () => {
  assert.deepEqual(placementContentBlocks("HTTP/1.1 is an application protocol. An IPv4 example is 192.168.1.1. Node.js uses JavaScript."), [{
    type: "points", points: ["HTTP/1.1 is an application protocol.", "An IPv4 example is 192.168.1.1.", "Node.js uses JavaScript."],
  }]);
});

test("keeps intentional bullet points together and supports numbered lists", () => {
  assert.deepEqual(placementContentBlocks("- First idea. This example belongs to it.\n• Second idea.\n3. Third idea."), [{
    type: "points", points: ["First idea. This example belongs to it.", "Second idea.", "Third idea."],
  }]);
});

test("preserves abbreviations, inline code, and fenced coding solutions", () => {
  const blocks = placementContentBlocks("Use e.g. TCP for ordered delivery. Read `value.split('. ')` carefully.\n```python\nfor item in items:\n    print(item)\n```\n- Time: O(n).\n- Space: O(1).");
  assert.deepEqual(blocks, [
    { type: "points", points: ["Use e.g. TCP for ordered delivery.", "Read `value.split('. ')` carefully."] },
    { type: "code", language: "python", code: "for item in items:\n    print(item)" },
    { type: "points", points: ["Time: O(n).", "Space: O(1)."] },
  ]);
});

test("an incomplete saved code fence stays code and empty or malformed text stays empty", () => {
  assert.deepEqual(placementContentBlocks("```sql\nSELECT 1;"), [{ type: "code", language: "sql", code: "SELECT 1;" }]);
  for (const input of [undefined, null, {}, [], "  "]) assert.deepEqual(placementContentBlocks(input), []);
});

test("normalization preserves a model answer over older coaching guidance", () => {
  const normalized = normalizeLearningCareerTopicAnalysis({ topics: [{
    title: "HTTP", interviewQuestions: [{ question: "Which layer?", answer: "Application layer.", guidance: "Name the layer." }],
  }] });
  assert.equal(normalized.topics[0].interviewQuestions[0].guidance, "Application layer.");
});
