import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_LEARNING_VISION_TEXT_CHARS,
  MAX_LEARNING_TEXT_SOURCE_CHARS,
  normalizeLearningTextSources,
  requestLearningNotebookJson,
  requestLearningVisionText,
  registerLearningNotebookRoutes,
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

test("uses Qwen only for bounded OCR text before structured notebook generation", async () => {
  const requests = [];
  const fetchImpl = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: `UNIT I\n${"Quantum gates ".repeat(3000)}` } }],
      }),
    };
  };

  const text = await requestLearningVisionText({
    apiKey: "test-key",
    chapterNames: ["Introduction"],
    fetchImpl,
    model: "qwen/qwen3.6-27b",
    subjectName: "Quantum Computing",
    visionImages: [{
      name: "page-1.png",
      dataUrl: "data:image/png;base64,AAAA",
    }],
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].reasoning_effort, "none");
  assert.equal(requests[0].max_completion_tokens, 4000);
  assert.equal("response_format" in requests[0], false);
  assert.ok(Array.isArray(requests[0].messages[1].content));
  assert.equal(text.length, MAX_LEARNING_VISION_TEXT_CHARS);
  assert.match(text, /^UNIT I/u);
});

test("routes scanned inputs through Qwen OCR and Llama structured generation", async () => {
  const routes = new Map();
  const app = {};
  ["get", "post", "patch", "delete"].forEach((method) => {
    app[method] = (path, handler) => routes.set(`${method.toUpperCase()} ${path}`, handler);
  });
  const requests = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    return {
      ok: true,
      status: 200,
      json: async () => requests.length === 1
        ? { choices: [{ message: { content: "UNIT I\nQuantum gates and qubits" } }] }
        : { choices: [{ message: { content: JSON.stringify(validGeneratedNotebook()) } }] },
    };
  };
  const stored = [];
  const collection = {
    countDocuments: async () => 0,
    insertOne: async (document) => {
      stored.push(document);
      return { insertedId: "notebook-1" };
    },
  };
  const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAAXNSR0IArs4c6QAAAARzQklUCAgICHwIZIgAAAAUSURBVAiZY6yxevufgYGBgYkBCgAn5wKm8Nhy+QAAAABJRU5ErkJggg==";
  const imageDataUrl = `data:image/png;base64,${pngBase64}`;

  registerLearningNotebookRoutes(app, {
    fetchImpl,
    getDb: async () => ({ collection: () => collection }),
    getGroqConfigStatus: () => ({ available: true, apiKey: "test-key" }),
    groqLearningModel: "llama-3.3-70b-versatile",
    groqModel: "llama-3.1-8b-instant",
    groqVisionModel: "qwen/qwen3.6-27b",
    prepareAttachmentContext: async ([image]) => ({
      metadata: [{ name: image.name, type: image.type, size: image.size }],
      pdfDocuments: [],
      visionImages: [{
        name: image.name,
        type: image.type,
        size: image.size,
        dataUrl: image.dataUrl,
      }],
    }),
    requireAuth: (handler) => handler,
  });

  const req = {
    body: {
      subjectName: "Quantum Computing",
      chapterNames: ["Introduction"],
      attachments: [{
        name: "scan.png",
        type: "image/png",
        size: Buffer.from(pngBase64, "base64").length,
        dataUrl: imageDataUrl,
      }],
      textSources: [],
    },
    user: {
      _id: "user-1",
      academicLevel: "Undergraduate / Bachelor's",
      degree: "B.Tech",
      department: "IT",
    },
  };
  const res = {
    body: null,
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  await routes.get("POST /api/learning-notebooks/analyze")(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].model, "qwen/qwen3.6-27b");
  assert.equal(requests[0].reasoning_effort, "none");
  assert.equal(requests[1].model, "llama-3.3-70b-versatile");
  assert.equal(requests[1].max_tokens, 7000);
  assert.match(requests[1].messages[1].content, /Quantum gates and qubits/u);
  assert.equal(stored[0].model, "llama-3.3-70b-versatile");
  assert.equal(res.body.notebook.model, "llama-3.3-70b-versatile");
});
