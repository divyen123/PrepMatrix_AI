import assert from "node:assert/strict";
import test from "node:test";
import {
  ChatSubjectOutlineResponseError,
  chatSubjectOutlineHistoryText,
  parseChatSubjectOutlineResponse,
  supportsChatSubjectOutlines,
} from "./chatSubjectOutline.js";

const outline = {
  subjectName: "Data Structures",
  difficulty: "medium",
  chapterNames: ["Arrays", "Linked Lists"],
  topics: ["Traversal", "Memory allocation"],
};
const envelope = (subjectOutline = outline, reply = "Here is an AI-suggested outline.") => (
  JSON.stringify({ reply, subjectOutline })
);

test("keeps ordinary structured and readable legacy responses without an import proposal", () => {
  assert.deepEqual(parseChatSubjectOutlineResponse(envelope(null, "An array stores indexed elements.")), {
    reply: "An array stores indexed elements.", subjectOutline: null,
  });
  assert.deepEqual(parseChatSubjectOutlineResponse("Use a loop to traverse an array."), {
    reply: "Use a loop to traverse an array.", subjectOutline: null,
  });
  assert.deepEqual(parseChatSubjectOutlineResponse("42"), { reply: "42", subjectOutline: null });
  assert.deepEqual(parseChatSubjectOutlineResponse('"A short answer."'), {
    reply: "A short answer.", subjectOutline: null,
  });
});

test("returns a validated outline from a complete JSON response, including a legacy outer fence", () => {
  assert.deepEqual(parseChatSubjectOutlineResponse(envelope()), {
    reply: "Here is an AI-suggested outline.", subjectOutline: outline,
  });
  assert.deepEqual(parseChatSubjectOutlineResponse(`\`\`\`json\n${envelope()}\n\`\`\``).subjectOutline, outline);
});

test("does not make malformed, partial, or empty JSON envelopes importable", () => {
  for (const content of [
    "", "   ", '{"reply":"An outline","subjectOutline":',
    `Here is the JSON: ${envelope()}`, "```json\n{broken}\n```",
    envelope(outline, ""), JSON.stringify({ subjectOutline: outline }), JSON.stringify([outline]),
  ]) {
    assert.throws(() => parseChatSubjectOutlineResponse(content), ChatSubjectOutlineResponseError);
  }
  assert.throws(() => parseChatSubjectOutlineResponse(envelope(), { finishReason: "length" }), {
    code: "AI_OUTPUT_INVALID", status: 502,
  });
});

test("retains a readable answer but suppresses invalid, excessive, or nested outlines", () => {
  for (const invalid of [
    { ...outline, subjectName: "" },
    { ...outline, chapterNames: [], topics: [] },
    { ...outline, chapterNames: ["x".repeat(121)] },
    { ...outline, topics: Array.from({ length: 61 }, (_, index) => `Topic ${index}`) },
    { ...outline, chapterNames: [{ title: "Arrays", topics: ["Traversal"] }] },
  ]) {
    const result = parseChatSubjectOutlineResponse(envelope(invalid));
    assert.equal(result.subjectOutline, null);
    assert.match(result.reply, /^Here is an AI-suggested outline\./u);
    assert.match(result.reply, /couldn't prepare this outline for import/u);
    assert.doesNotMatch(result.reply, /"chapterNames"|"subjectOutline"/u);
  }
});

test("specialized chat keeps its existing text format and cannot emit import proposals", () => {
  assert.equal(supportsChatSubjectOutlines(), false);
  assert.equal(supportsChatSubjectOutlines({ clientSupportsOutlines: "true" }), false);
  assert.equal(supportsChatSubjectOutlines({ clientSupportsOutlines: true }), true);
  assert.equal(supportsChatSubjectOutlines({ clientSupportsOutlines: true, youngKidsChat: true }), false);
  assert.equal(supportsChatSubjectOutlines({ clientSupportsOutlines: true, assistantContext: { artifact: "medical-training" } }), false);
  assert.equal(supportsChatSubjectOutlines({ clientSupportsOutlines: true, hasVisionImages: true }), false);
  assert.deepEqual(parseChatSubjectOutlineResponse("A fictional academic explanation.", {
    enabled: false, finishReason: "length",
  }), { reply: "A fictional academic explanation.", subjectOutline: null });
});

test("a filtered completion cannot provide an importable outline", () => {
  const result = parseChatSubjectOutlineResponse(envelope(), { finishReason: "content_filter" });
  assert.equal(result.subjectOutline, null);
});

test("retains outline details in model history so short follow-up edits can revise the proposal", () => {
  const history = chatSubjectOutlineHistoryText({ role: "assistant", text: "Suggested outline.", subjectOutline: outline });
  assert.match(history, /Suggested outline\./u);
  assert.match(history, /does not mean it was saved to Subjects/u);
  assert.match(history, /Linked Lists/u);
  assert.equal(chatSubjectOutlineHistoryText({ role: "user", text: "Add arrays", subjectOutline: outline }), "Add arrays");
  assert.equal(chatSubjectOutlineHistoryText({ role: "assistant", text: "A normal reply.", subjectOutline: {} }), "A normal reply.");
});
