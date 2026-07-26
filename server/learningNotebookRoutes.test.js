import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_LEARNING_TEXT_SOURCE_CHARS,
  normalizeLearningTextSources,
  requestLearningNotebookJson,
} from "./learningNotebookRoutes.js";

function validGeneratedNotebook() {
  return {
    title: "Data Structures",
    overview: "A structured overview.",
    importantQuestions: [{
      question: "Why is a balanced tree useful?",
      answer: "It keeps core operations logarithmic.",
      difficulty: "medium",
    }],
    revisedNotes: [{
      title: "Trees",
      content: "Trees organize hierarchical data.",
      keyPoints: ["Root", "Edges"],
      revisionTips: ["Trace operations by hand."],
    }],
    chapters: [{
      id: "chapter-1",
      title: "Trees",
      summary: "Tree fundamentals.",
      topics: [{
        id: "topic-1",
        title: "Balanced trees",
        summary: "Trees with bounded height.",
        subtopics: [],
      }],
    }],
    mindMap: {
      nodes: [{ id: "root", label: "Data Structures", parentId: null, kind: "root" }],
      edges: [],
    },
    coverageWarnings: [],
    careerPreparation: {
      focus: "",
      skills: [],
      interviewQuestions: [],
      codingTopics: [],
    },
  };
}

test("normalizes bounded plain text and Markdown learning sources", () => {
  const sources = normalizeLearningTextSources([
    {
      name: "../unit-one.md",
      type: "text/markdown",
      text: "# Unit One\r\n\r\nPaging\u0000 and segmentation",
    },
  ]);

  assert.equal(sources.length, 1);
  assert.equal(sources[0].name, "..-unit-one.md");
  assert.equal(sources[0].type, "text/markdown");
  assert.match(sources[0].text, /Paging and segmentation/u);
  assert.ok(sources[0].size > 0);
  assert.equal("dataUrl" in sources[0], false);
});

test("rejects unsupported and oversized text sources before AI work", () => {
  assert.throws(
    () => normalizeLearningTextSources([{
      name: "page.html",
      type: "text/html",
      text: "<p>Untrusted</p>",
    }]),
    (error) => error.code === "LEARNING_TEXT_SOURCE_TYPE" && error.status === 400,
  );
  assert.throws(
    () => normalizeLearningTextSources([{
      name: "large.txt",
      type: "text/plain",
      text: "a".repeat(MAX_LEARNING_TEXT_SOURCE_CHARS + 1),
    }]),
    (error) => error.code === "LEARNING_TEXT_SOURCE_TOO_LARGE" && error.status === 413,
  );
});

test("retries one invalid AI notebook response with stricter temperature", async () => {
  const requests = [];
  const responses = [
    { choices: [{ message: { content: '{"overview":"incomplete"}' } }] },
    { choices: [{ message: { content: JSON.stringify(validGeneratedNotebook()) } }] },
  ];
  const fetchImpl = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return {
      ok: true,
      status: 200,
      json: async () => responses.shift(),
    };
  };

  const result = await requestLearningNotebookJson({
    apiKey: "test-key",
    fetchImpl,
    model: "test-model",
    systemPrompt: "Return JSON.",
    userContent: "Generate a notebook.",
  });

  assert.equal(result.chapters[0].title, "Trees");
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0].response_format, { type: "json_object" });
  assert.equal("response_format" in requests[1], false);
  assert.equal(requests[1].temperature, 0.1);
});

test("disables reasoning for Qwen notebook requests so structured JSON reaches content", async () => {
  const requests = [];
  const fetchImpl = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(validGeneratedNotebook()) } }],
      }),
    };
  };

  await requestLearningNotebookJson({
    apiKey: "test-key",
    fetchImpl,
    model: "qwen/qwen3.6-27b",
    systemPrompt: "Return JSON.",
    userContent: [
      { type: "text", text: "Analyze this scanned page." },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
    ],
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].reasoning_effort, "none");
  assert.equal(requests[0].max_completion_tokens, 7000);
  assert.equal("max_tokens" in requests[0], false);
  assert.deepEqual(requests[0].response_format, { type: "json_object" });
});
