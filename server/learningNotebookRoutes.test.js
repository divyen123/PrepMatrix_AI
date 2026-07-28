import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_GEMINI_LEARNING_MODEL,
  MAX_GEMINI_LEARNING_OUTPUT_TOKENS,
  LEARNING_RETRY_COMPLETION_TOKENS,
  MAX_GROQ_LEARNING_CHAPTERS,
  MAX_LEARNING_AI_SOURCE_CHARS,
  MAX_LEARNING_AI_SOURCE_TOKENS,
  MAX_LEARNING_COMPLETION_TOKENS,
  compactLearningSourceMaterial,
  MAX_LEARNING_VISION_TEXT_CHARS,
  MAX_LEARNING_TEXT_SOURCE_CHARS,
  normalizeLearningTextSources,
  requestLearningNotebookJson,
  requestLearningVisionText,
  registerLearningNotebookRoutes,
} from "./learningNotebookRoutes.js";
import { LEARNING_PRIVACY_CONSENT_VERSION } from "../src/utils/learningPrivacyConsent.js";

const TEST_IDEMPOTENCY_KEY = "9f0c91cc-6c62-4a41-8c44-b6a364cc31f8";
const TEST_QUOTA = Object.freeze({
  limit: 100,
  used: 0,
  reserved: 12,
  remaining: 88,
  periodStart: "2026-07-01T00:00:00.000Z",
  resetAt: "2026-08-01T00:00:00.000Z",
  costs: {
    learning_notebook: 12,
    career_analysis: 5,
  },
});

function createTestAiQuota({
  lookup: lookupOverride,
  reserve: reserveOverride,
  commit: commitOverride,
  refund: refundOverride,
} = {}) {
  const calls = {
    lookup: [],
    reserve: [],
    commit: [],
    refund: [],
  };
  const featureCost = (feature) => TEST_QUOTA.costs[feature] || 1;
  return {
    calls,
    async lookup(input) {
      calls.lookup.push(input);
      if (lookupOverride) return lookupOverride(input);
      return {
        state: "none",
        cost: featureCost(input.feature),
        quota: TEST_QUOTA,
      };
    },
    async reserve(input) {
      calls.reserve.push(input);
      if (reserveOverride) return reserveOverride(input);
      return {
        state: "reserved",
        eventId: `event-${calls.reserve.length}`,
        reservationToken: "reservation-" + calls.reserve.length,
        cost: featureCost(input.feature),
        quota: TEST_QUOTA,
      };
    },
    async commit(input) {
      calls.commit.push(input);
      if (commitOverride) return commitOverride(input);
      return {
        quota: {
          ...TEST_QUOTA,
          used: featureCost(calls.reserve.at(-1)?.feature),
          reserved: 0,
        },
      };
    },
    async refund(input) {
      calls.refund.push(input);
      if (refundOverride) return refundOverride(input);
      return {
        refunded: true,
        status: "refunded",
        quota: { ...TEST_QUOTA, reserved: 0, remaining: 100 },
      };
    },
    responseHeaders(quota, cost) {
      return {
        "X-AI-Credit-Limit": String(quota.limit),
        "X-AI-Credit-Remaining": String(quota.remaining),
        "X-AI-Credit-Reset-At": quota.resetAt,
        "X-AI-Credit-Cost": String(cost),
      };
    },
  };
}

function validGeneratedNotebook() {
  const topics = Array.from({ length: 8 }, (_, topicIndex) => {
    const topicNumber = topicIndex + 1;
    const title = `Balanced trees concept ${topicNumber}`;
    return {
      id: `topic-${topicNumber}`,
      title,
      summary: `${title} introduces a distinct part of balanced-tree design and explains why bounded height matters.`,
      explanation: `${title} keeps search paths predictable by maintaining structural invariants after updates. The learner should understand the invariant, trace how an insertion can violate it, and follow the local repair that restores balance. This connects tree height directly to logarithmic search, insertion, and deletion costs while showing when rebalancing work is worthwhile.`,
      importance: topicIndex < 4 ? "high" : "medium",
      learningObjectives: ["Define the invariant.", "Trace an update.", "Explain the complexity impact."],
      keyPoints: ["Invariant", "Height bound", "Local repair", "Complexity"],
      examples: [
        `Insert keys into example ${topicNumber}, identify the first violated invariant, apply the repair, and verify the final height bound.`,
        `Compare an unbalanced search path with the repaired tree for example ${topicNumber} and explain the operation-count difference.`,
      ],
      applications: ["Database indexes", "Ordered in-memory collections"],
      commonMistakes: ["Checking balance only at the root", "Forgetting to update stored heights"],
      revisionTips: ["Draw the repair step.", "State the invariant before tracing."],
      subtopics: Array.from({ length: 4 }, (_, subtopicIndex) => {
        const subtopicNumber = subtopicIndex + 1;
        return {
          id: `topic-${topicNumber}-subtopic-${subtopicNumber}`,
          title: `${title} subtopic ${subtopicNumber}`,
          summary: `A focused view of ${title.toLowerCase()} using invariant ${subtopicNumber}.`,
          explanation: `This subtopic explains how invariant ${subtopicNumber} is represented, checked, and restored during an update. It connects the local structural change to the global height guarantee and gives the learner a repeatable tracing method.`,
          keyPoints: ["Representation", "Validation", "Repair"],
          examples: [`Trace invariant ${subtopicNumber} through a small insertion and verify the repaired tree.`],
        };
      }),
    };
  });
  return {
    title: "Data Structures",
    overview: "A detailed, example-led guide to balanced trees and their performance guarantees.",
    importantQuestions: Array.from({ length: 10 }, (_, index) => ({
      id: `question-${index + 1}`,
      question: `How does balanced-tree invariant ${index + 1} affect an update?`,
      answer: "The invariant bounds height and determines when a local repair is required after an update.",
      whyItMatters: "It connects implementation details to logarithmic performance.",
      difficulty: index < 3 ? "easy" : index < 7 ? "medium" : "hard",
    })),
    revisedNotes: topics.slice(0, 8).map((topic, index) => ({
      id: `revised-note-${index + 1}`,
      title: topic.title,
      content: `${topic.explanation}\n\nWorked example: ${topic.examples[0]}`,
      keyPoints: topic.keyPoints,
      revisionTips: topic.revisionTips,
    })),
    chapters: [{
      id: "chapter-1",
      title: "Trees",
      summary: "Tree fundamentals, balancing invariants, update repairs, and the relationship between height and operation cost.",
      topics,
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
  assert.equal(requests[0].max_tokens, MAX_LEARNING_COMPLETION_TOKENS);
  assert.equal("response_format" in requests[1], false);
  assert.equal(requests[1].temperature, 0.1);
  assert.equal(requests[1].max_tokens, LEARNING_RETRY_COMPLETION_TOKENS);
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
  assert.equal(requests[0].max_completion_tokens, MAX_LEARNING_COMPLETION_TOKENS);
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
    aiQuota: createTestAiQuota(),
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
      privacyConsent: {
        accepted: true,
        version: LEARNING_PRIVACY_CONSENT_VERSION,
      },
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
    headers: { "idempotency-key": TEST_IDEMPOTENCY_KEY },
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
  assert.ok(requests[1].max_tokens < MAX_LEARNING_COMPLETION_TOKENS);
  assert.ok(requests[1].max_tokens >= 3_000);
  assert.match(requests[1].messages[1].content, /Quantum gates and qubits/u);
  assert.equal(stored[0].model, "llama-3.3-70b-versatile");
  assert.equal(res.body.notebook.model, "llama-3.3-70b-versatile");
});

test("samples every uploaded source within the learning AI character budget", () => {
  const first = `${"FIRST ".repeat(4000)}FIRST-END`;
  const second = `${"SECOND ".repeat(4000)}SECOND-END`;
  const compacted = compactLearningSourceMaterial({
    pdfDocuments: [
      { name: "unit-1.pdf", text: first },
      { name: "unit-2.pdf", text: second },
    ],
  });

  assert.equal(compacted.pdfDocuments.length, 2);
  assert.ok(compacted.totalIncludedChars <= MAX_LEARNING_AI_SOURCE_CHARS);
  assert.equal(compacted.wasCompacted, true);
  assert.match(compacted.pdfDocuments[0].text, /^FIRST/u);
  assert.match(compacted.pdfDocuments[0].text, /FIRST-END$/u);
  assert.match(compacted.pdfDocuments[1].text, /^SECOND/u);
  assert.match(compacted.pdfDocuments[1].text, /SECOND-END$/u);
});

test("compacts Unicode-heavy sources to the Groq estimated-token budget", () => {
  const compacted = compactLearningSourceMaterial(
    {
      pdfDocuments: [{
        name: "unicode-notes.pdf",
        text: "\u0921\u0947\u091f\u093e \u0938\u0902\u091a\u093e\u0930 \u0928\u0947\u091f\u0935\u0930\u094d\u0915 ".repeat(2_000),
      }],
    },
    MAX_LEARNING_AI_SOURCE_CHARS,
    MAX_LEARNING_AI_SOURCE_TOKENS,
  );

  assert.ok(compacted.estimatedIncludedTokens <= MAX_LEARNING_AI_SOURCE_TOKENS);
  assert.equal(compacted.wasCompacted, true);
});

test("compacts dense ASCII sources with a byte-safe Groq token upper bound", () => {
  const denseAscii = "aB9_/\\|{}[]()<>!?$%^&*-=+;:,.".repeat(400);
  const compacted = compactLearningSourceMaterial(
    {
      pdfDocuments: [{ name: "dense-code.pdf", text: denseAscii }],
    },
    MAX_LEARNING_AI_SOURCE_CHARS,
    MAX_LEARNING_AI_SOURCE_TOKENS,
  );

  assert.ok(compacted.estimatedIncludedTokens <= MAX_LEARNING_AI_SOURCE_TOKENS);
  assert.equal(
    compacted.estimatedIncludedTokens,
    Buffer.byteLength(compacted.pdfDocuments[0].text, "utf8"),
  );
  assert.equal(compacted.wasCompacted, true);
});

test("retries one provider token-rate rejection with a smaller completion budget", async () => {
  const requests = [];
  const fetchImpl = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    if (requests.length === 1) {
      return {
        ok: false,
        status: 413,
        json: async () => ({
          error: { code: "rate_limit_exceeded", type: "tokens" },
        }),
      };
    }
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
    model: "llama-3.3-70b-versatile",
    systemPrompt: "Return JSON.",
    userContent: "Generate a notebook.",
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].max_tokens, MAX_LEARNING_COMPLETION_TOKENS);
  assert.equal(requests[1].max_tokens, LEARNING_RETRY_COMPLETION_TOKENS);
});

test("strictly reduces a dynamically capped token-budget retry", async () => {
  const requests = [];
  const fetchImpl = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    if (requests.length === 1) {
      return {
        ok: false,
        status: 413,
        json: async () => ({
          error: {
            code: "rate_limit_exceeded",
            message: "Tokens per minute rate limit exceeded.",
          },
        }),
      };
    }
    return groqNotebookResponse();
  };

  await requestLearningNotebookJson({
    apiKey: "test-key",
    fetchImpl,
    model: "llama-3.3-70b-versatile",
    systemPrompt: "S",
    userContent: "A".repeat(7_217),
  });

  assert.deepEqual(requests.map((request) => request.max_tokens), [4_000, 3_500]);
});

test("retries an ordinary provider 429 once and succeeds", async () => {
  let attempts = 0;
  const notebook = await requestLearningNotebookJson({
    apiKey: "test-key",
    fetchImpl: async () => {
      attempts += 1;
      return attempts === 1
        ? providerRateLimitResponse()
        : groqNotebookResponse();
    },
    model: "llama-3.3-70b-versatile",
    systemPrompt: "Return JSON.",
    userContent: "Generate a notebook.",
  });

  assert.equal(attempts, 2);
  assert.ok(notebook.title);
});

test("stops after one bounded retry when an ordinary provider 429 persists", async () => {
  let attempts = 0;
  await assert.rejects(
    () => requestLearningNotebookJson({
      apiKey: "test-key",
      fetchImpl: async () => {
        attempts += 1;
        return providerRateLimitResponse();
      },
      model: "llama-3.3-70b-versatile",
      systemPrompt: "Return JSON.",
      userContent: "Generate a notebook.",
    }),
    (error) => error.code === "LEARNING_PROVIDER_RATE_LIMIT" && error.status === 429,
  );
  assert.equal(attempts, 2);
});

test("derives a smaller completion allowance for a large estimated prompt", async () => {
  const requests = [];
  await requestLearningNotebookJson({
    apiKey: "test-key",
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return groqNotebookResponse();
    },
    model: "llama-3.3-70b-versatile",
    systemPrompt: "Return JSON.",
    userContent: "\u0921\u0947\u091f\u093e".repeat(500),
  });

  assert.equal(requests.length, 1);
  assert.ok(requests[0].max_tokens < MAX_LEARNING_COMPLETION_TOKENS);
  assert.ok(requests[0].max_tokens >= 3_000);
});

test("keeps adversarial ASCII prompt and completion under the Groq token budget", async () => {
  const requests = [];
  await requestLearningNotebookJson({
    apiKey: "test-key",
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return groqNotebookResponse();
    },
    model: "llama-3.3-70b-versatile",
    systemPrompt: "Return strict JSON.",
    userContent: "aB9_/\\|{}[]()<>!?$%^&*-=+;:,.".repeat(175),
  });

  const request = requests[0];
  const promptByteUpperBound = request.messages.reduce(
    (sum, message) => sum + Buffer.byteLength(message.content, "utf8"),
    32,
  );
  assert.ok(promptByteUpperBound + request.max_tokens + 750 <= 12_000);
});

test("does not retry a token-budget rejection at the minimum completion budget", async () => {
  const requestedTokens = [];
  await assert.rejects(
    () => requestLearningNotebookJson({
      apiKey: "test-key",
      fetchImpl: async (_url, options) => {
        requestedTokens.push(JSON.parse(options.body).max_tokens);
        return {
          ok: false,
          status: 413,
          json: async () => ({
            error: {
              code: "rate_limit_exceeded",
              message: "Tokens per minute rate limit exceeded.",
            },
          }),
        };
      },
      model: "llama-3.3-70b-versatile",
      systemPrompt: "S",
      userContent: "A".repeat(8_217),
    }),
    (error) => error.code === "LEARNING_PROVIDER_RATE_LIMIT" && error.status === 429,
  );
  assert.deepEqual(requestedTokens, [3_000]);
});

test("classifies repeated Groq token-rate 413 responses as provider throttling", async () => {
  let attempts = 0;
  await assert.rejects(
    () => requestLearningNotebookJson({
      apiKey: "test-key",
      fetchImpl: async () => {
        attempts += 1;
        return {
          ok: false,
          status: 413,
          json: async () => ({
            error: {
              code: "rate_limit_exceeded",
              type: "tokens",
              message: "Tokens per minute rate limit exceeded.",
            },
          }),
        };
      },
      model: "llama-3.3-70b-versatile",
      systemPrompt: "Return JSON.",
      userContent: "Generate a notebook.",
    }),
    (error) => error.code === "LEARNING_PROVIDER_RATE_LIMIT" && error.status === 429,
  );
  assert.equal(attempts, 2);
});

test("keeps a true Groq context rejection distinct from provider throttling", async () => {
  await assert.rejects(
    () => requestLearningNotebookJson({
      apiKey: "test-key",
      fetchImpl: async () => ({
        ok: false,
        status: 413,
        json: async () => ({
          error: {
            code: "context_length_exceeded",
            message: "Request too large for the model context length.",
          },
        }),
      }),
      model: "llama-3.3-70b-versatile",
      systemPrompt: "Return JSON.",
      userContent: "Generate a notebook.",
    }),
    (error) => error.code === "LEARNING_PROVIDER_SIZE_LIMIT" && error.status === 413,
  );
});
function geminiNotebookResponse(notebook = validGeneratedNotebook()) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(notebook) }] } }],
    }),
  };
}

function providerRateLimitResponse(retryAfter = "0") {
  return {
    ok: false,
    status: 429,
    headers: {
      get: (name) => String(name).toLocaleLowerCase() === "retry-after" ? retryAfter : null,
    },
    json: async () => ({
      error: {
        code: "rate_limit_exceeded",
        message: "Rate limit exceeded.",
      },
    }),
  };
}

function groqNotebookResponse(notebook = validGeneratedNotebook()) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(notebook) } }],
    }),
  };
}

function createLearningRouteHarness({
  fetchImpl,
  geminiConfig = { available: true, apiKey: "gemini-key" },
  groqConfig = { available: true, apiKey: "groq-key" },
  prepareAttachmentContext,
  aiQuota = createTestAiQuota(),
} = {}) {
  const routes = new Map();
  const app = {};
  ["get", "post", "patch", "delete"].forEach((method) => {
    app[method] = (path, handler) => routes.set(`${method.toUpperCase()} ${path}`, handler);
  });
  const stored = [];
  let dbCalls = 0;
  let prepareCalls = 0;
  const collection = {
    countDocuments: async () => 0,
    insertOne: async (document) => {
      stored.push({ ...document, _id: "notebook-1" });
      return { insertedId: "notebook-1" };
    },
    deleteOne: async (filter) => {
      const index = stored.findIndex((document) => (
        String(document._id) === String(filter._id)
        && String(document.userId) === String(filter.userId)
      ));
      if (index < 0) return { deletedCount: 0 };
      stored.splice(index, 1);
      return { deletedCount: 1 };
    },
  };
  registerLearningNotebookRoutes(app, {
    aiQuota,
    fetchImpl,
    geminiLearningModel: DEFAULT_GEMINI_LEARNING_MODEL,
    getDb: async () => {
      dbCalls += 1;
      return { collection: () => collection };
    },
    getGeminiConfigStatus: () => geminiConfig,
    getGroqConfigStatus: () => groqConfig,
    groqLearningModel: "llama-3.3-70b-versatile",
    groqModel: "llama-3.1-8b-instant",
    groqVisionModel: "qwen/qwen3.6-27b",
    prepareAttachmentContext: async (attachments) => {
      prepareCalls += 1;
      if (prepareAttachmentContext) return prepareAttachmentContext(attachments);
      return { metadata: [], pdfDocuments: [], visionImages: [] };
    },
    requireAuth: (handler) => handler,
  });

  return {
    aiQuota,
    stored,
    get dbCalls() { return dbCalls; },
    get prepareCalls() { return prepareCalls; },
    async analyze(body = {}) {
      const req = {
        body: {
          privacyConsent: {
            accepted: true,
            version: LEARNING_PRIVACY_CONSENT_VERSION,
          },
          subjectName: "Operating Systems",
          chapterNames: ["Processes"],
          attachments: [],
          textSources: [],
          ...body,
        },
        user: {
          _id: "user-1",
          academicLevel: "Undergraduate / Bachelor's",
          degree: "B.Tech",
          department: "IT",
        },
        headers: { "idempotency-key": TEST_IDEMPOTENCY_KEY },
      };
      const res = {
        body: null,
        headers: {},
        statusCode: 200,
        set(name, value) {
          this.headers[name] = String(value);
          return this;
        },
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
      return res;
    },
  };
}

test("uses Gemini structured output with native PDF and image bytes without local extraction", async () => {
  const requests = [];
  const pdfBytes = Buffer.from("%PDF-1.7\nNative Gemini PDF\n%%EOF", "utf8");
  const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAAXNSR0IArs4c6QAAAARzQklUCAgICHwIZIgAAAAUSURBVAiZY6yxevufgYGBgYkBCgAn5wKm8Nhy+QAAAABJRU5ErkJggg==";
  const pngBytes = Buffer.from(pngBase64, "base64");
  const harness = createLearningRouteHarness({
    fetchImpl: async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      return geminiNotebookResponse();
    },
    prepareAttachmentContext: async () => {
      throw new Error("Local extraction must stay lazy on Gemini success.");
    },
  });

  const res = await harness.analyze({
    attachments: [
      {
        name: "unit.pdf",
        type: "application/pdf",
        size: pdfBytes.length,
        dataUrl: `data:application/pdf;base64,${pdfBytes.toString("base64")}`,
      },
      {
        name: "diagram.png",
        type: "image/png",
        size: pngBytes.length,
        dataUrl: `data:image/png;base64,${pngBase64}`,
      },
    ],
  });

  assert.equal(res.statusCode, 201);
  assert.equal(requests.length, 1);
  assert.equal(harness.prepareCalls, 0);
  assert.match(requests[0].url, new RegExp(`/models/${DEFAULT_GEMINI_LEARNING_MODEL}:generateContent$`, "u"));
  assert.equal(requests[0].options.headers["x-goog-api-key"], "gemini-key");
  const generationConfig = requests[0].body.generationConfig;
  assert.equal(generationConfig.maxOutputTokens, MAX_GEMINI_LEARNING_OUTPUT_TOKENS);
  assert.equal("temperature" in generationConfig, false);
  assert.equal("topP" in generationConfig, false);
  assert.equal("topK" in generationConfig, false);
  assert.equal(generationConfig.responseFormat.text.mimeType, "application/json");
  assert.equal(generationConfig.responseFormat.text.schema.type, "object");
  const chapterSchema = generationConfig.responseFormat.text.schema.properties.chapters;
  const topicSchema = chapterSchema.items.properties.topics;
  const topicItemSchema = topicSchema.items;
  const subtopicSchema = topicItemSchema.properties.subtopics;
  assert.equal(chapterSchema.minItems, 1);
  assert.equal(chapterSchema.maxItems, 1);
  assert.equal(topicSchema.minItems, 8);
  assert.equal(topicSchema.maxItems, 8);
  assert.equal(subtopicSchema.minItems, 4);
  assert.ok(topicItemSchema.required.includes("explanation"));
  assert.equal(topicItemSchema.properties.examples.minItems, 2);
  const parts = requests[0].body.contents[0].parts;
  const inlineParts = parts.filter((part) => part.inlineData);
  assert.deepEqual(inlineParts.map((part) => part.inlineData.mimeType), [
    "application/pdf",
    "image/png",
  ]);
  assert.equal(inlineParts[0].inlineData.data, pdfBytes.toString("base64"));
  assert.equal(inlineParts[1].inlineData.data, pngBase64);
  assert.ok(parts.at(-1).text.trim());
  assert.match(parts.at(-1).text, /Return this exact JSON shape/u);
  assert.equal(harness.stored[0].model, DEFAULT_GEMINI_LEARNING_MODEL);
  assert.equal(res.body.notebook.model, DEFAULT_GEMINI_LEARNING_MODEL);
});

test("lazily extracts PDFs and uses the preserved Groq fallback after a Gemini transport failure", async () => {
  const sequence = [];
  const groqRequests = [];
  const pdfBytes = Buffer.from("%PDF-1.7\nFallback PDF\n%%EOF", "utf8");
  const harness = createLearningRouteHarness({
    fetchImpl: async (url, options) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        sequence.push("gemini");
        throw new TypeError("network unavailable");
      }
      sequence.push("groq");
      groqRequests.push(JSON.parse(options.body));
      return groqNotebookResponse();
    },
    prepareAttachmentContext: async ([attachment]) => {
      sequence.push("prepare");
      assert.equal(attachment.buffer.toString("utf8"), pdfBytes.toString("utf8"));
      return {
        metadata: [{ name: attachment.name, type: attachment.type, size: attachment.size }],
        pdfDocuments: [{
          name: attachment.name,
          text: "Processes use isolated address spaces and scheduled threads.",
          totalPages: 1,
          pagesRead: 1,
          truncated: false,
        }],
        visionImages: [],
      };
    },
  });

  const res = await harness.analyze({
    attachments: [{
      name: "fallback.pdf",
      type: "application/pdf",
      size: pdfBytes.length,
      dataUrl: `data:application/pdf;base64,${pdfBytes.toString("base64")}`,
    }],
  });

  assert.equal(res.statusCode, 201);
  assert.deepEqual(sequence, ["gemini", "prepare", "groq"]);
  assert.equal(harness.prepareCalls, 1);
  assert.ok(groqRequests[0].max_tokens < MAX_LEARNING_COMPLETION_TOKENS);
  assert.ok(groqRequests[0].max_tokens >= 3_000);
  assert.match(groqRequests[0].messages[1].content, /Generate exactly 4 distinct.*exactly 2 meaningful subtopics/u);
  assert.match(groqRequests[0].messages[1].content, /4-5 specific key points/u);
  assert.match(groqRequests[0].messages[1].content, /isolated address spaces/u);
  assert.equal(harness.stored[0].model, "llama-3.3-70b-versatile");
  assert.equal(res.body.notebook.model, "llama-3.3-70b-versatile");
  assert.equal(harness.aiQuota.calls.reserve.length, 1);
  assert.equal(harness.aiQuota.calls.reserve[0].feature, "learning_notebook");
  assert.equal(harness.aiQuota.calls.commit.length, 1);
  assert.equal(harness.aiQuota.calls.refund.length, 0);
  assert.equal(res.headers["X-AI-Credit-Cost"], "12");
});

test("falls back to Groq when Gemini returns malformed notebook output", async () => {
  let requestCount = 0;
  const harness = createLearningRouteHarness({
    fetchImpl: async (url) => {
      requestCount += 1;
      if (url.includes("generativelanguage.googleapis.com")) {
        return geminiNotebookResponse({ overview: "Incomplete" });
      }
      return groqNotebookResponse();
    },
  });

  const res = await harness.analyze();

  assert.equal(res.statusCode, 201);
  assert.equal(requestCount, 2);
  assert.equal(res.body.notebook.model, "llama-3.3-70b-versatile");
});

test("rejects oversized Groq-only chapter sets before reserving credits", async () => {
  let fetchCalls = 0;
  const harness = createLearningRouteHarness({
    geminiConfig: { available: false },
    fetchImpl: async () => {
      fetchCalls += 1;
      return groqNotebookResponse();
    },
  });

  const res = await harness.analyze({
    chapterNames: Array.from(
      { length: MAX_GROQ_LEARNING_CHAPTERS + 1 },
      (_, index) => "Chapter " + (index + 1),
    ),
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "LEARNING_GROQ_CHAPTER_LIMIT");
  assert.equal(fetchCalls, 0);
  assert.equal(harness.aiQuota.calls.reserve.length, 0);
});

test("returns the public provider-rate-limit error and refunds after repeated Groq token throttling", async () => {
  let fetchCalls = 0;
  const harness = createLearningRouteHarness({
    geminiConfig: { available: false },
    fetchImpl: async () => {
      fetchCalls += 1;
      return {
        ok: false,
        status: 413,
        json: async () => ({
          error: {
            code: "rate_limit_exceeded",
            type: "tokens",
            message: "Tokens per minute rate limit exceeded.",
          },
        }),
      };
    },
  });

  const res = await harness.analyze();

  assert.equal(fetchCalls, 2);
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.code, "AI_PROVIDER_RATE_LIMITED");
  assert.equal(res.body.creditsRefunded, true);
  assert.match(res.body.error, /credits were refunded/i);
  assert.equal(harness.aiQuota.calls.reserve.length, 1);
  assert.equal(harness.aiQuota.calls.commit.length, 0);
  assert.equal(harness.aiQuota.calls.refund.length, 1);
});
test("rejects an exhausted learning-notebook quota before any provider request", async () => {
  let fetchCalls = 0;
  const exhaustedQuota = {
    ...TEST_QUOTA,
    reserved: 0,
    remaining: 0,
    used: 100,
  };
  const aiQuota = createTestAiQuota({
    reserve: async () => {
      const error = new Error("You have used all AI credits for this month.");
      error.status = 429;
      error.code = "AI_USER_QUOTA_EXHAUSTED";
      error.details = { quota: exhaustedQuota, cost: 12 };
      throw error;
    },
  });
  const harness = createLearningRouteHarness({
    aiQuota,
    fetchImpl: async () => {
      fetchCalls += 1;
      return geminiNotebookResponse();
    },
  });

  const res = await harness.analyze();

  assert.equal(res.statusCode, 429);
  assert.equal(res.body.code, "AI_USER_QUOTA_EXHAUSTED");
  assert.equal(fetchCalls, 0);
  assert.equal(aiQuota.calls.reserve.length, 1);
  assert.equal(aiQuota.calls.commit.length, 0);
  assert.equal(aiQuota.calls.refund.length, 0);
  assert.equal(res.headers["X-AI-Credit-Remaining"], "0");
  assert.equal(res.headers["X-AI-Credit-Cost"], "12");
});

test("replays a completed learning-notebook request without another provider call", async () => {
  let fetchCalls = 0;
  const replayPayload = {
    notebook: {
      id: "replayed-notebook",
      title: "Replayed notebook",
    },
  };
  const aiQuota = createTestAiQuota({
    lookup: async () => ({
      state: "replay",
      eventId: "completed-event",
      cost: 12,
      quota: { ...TEST_QUOTA, used: 12, reserved: 0 },
      replayPayload,
    }),
  });
  const harness = createLearningRouteHarness({
    aiQuota,
    geminiConfig: { available: false, message: "Gemini unavailable." },
    groqConfig: { available: false, message: "Groq unavailable." },
    fetchImpl: async () => {
      fetchCalls += 1;
      return geminiNotebookResponse();
    },
  });

  const res = await harness.analyze();

  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, replayPayload);
  assert.equal(fetchCalls, 0);
  assert.equal(aiQuota.calls.lookup.length, 1);
  assert.equal(aiQuota.calls.reserve.length, 0);
  assert.equal(aiQuota.calls.commit.length, 0);
  assert.equal(aiQuota.calls.refund.length, 0);
  assert.equal(res.headers["X-AI-Credit-Cost"], "12");
});

test("refunds one learning-notebook reservation when the provider is unavailable", async () => {
  let fetchCalls = 0;
  const aiQuota = createTestAiQuota();
  const harness = createLearningRouteHarness({
    aiQuota,
    groqConfig: { available: false, message: "Groq unavailable." },
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new TypeError("network unavailable");
    },
  });

  const res = await harness.analyze();

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, "AI_PROVIDER_UNAVAILABLE");
  assert.equal(res.body.creditsRefunded, true);
  assert.match(res.body.error, /credits were refunded/iu);
  assert.equal(fetchCalls, 1);
  assert.equal(aiQuota.calls.reserve.length, 1);
  assert.equal(aiQuota.calls.commit.length, 0);
  assert.equal(aiQuota.calls.refund.length, 1);
  assert.equal(res.headers["X-AI-Credit-Remaining"], "100");
});

test("rolls back a persisted notebook and refunds when quota commit fails", async () => {
  const aiQuota = createTestAiQuota({
    commit: async () => {
      const error = new Error("AI credit storage unavailable.");
      error.status = 503;
      error.code = "AI_QUOTA_UNAVAILABLE";
      throw error;
    },
  });
  const harness = createLearningRouteHarness({
    aiQuota,
    fetchImpl: async () => geminiNotebookResponse(),
  });

  const res = await harness.analyze();

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, "AI_QUOTA_UNAVAILABLE");
  assert.equal(res.body.creditsRefunded, true);
  assert.equal(harness.stored.length, 0);
  assert.equal(aiQuota.calls.commit.length, 1);
  assert.equal(aiQuota.calls.commit[0].reservationToken, "reservation-1");
  assert.equal(aiQuota.calls.refund.length, 1);
  assert.equal(aiQuota.calls.refund[0].reservationToken, "reservation-1");
});

test("supports Gemini-first, Gemini-only, Groq-only, and unavailable provider configurations", async (t) => {
  const cases = [
    { name: "both", gemini: true, groq: true, status: 201, provider: "gemini" },
    { name: "Gemini only", gemini: true, groq: false, status: 201, provider: "gemini" },
    { name: "Groq only", gemini: false, groq: true, status: 201, provider: "groq" },
    { name: "neither", gemini: false, groq: false, status: 503, provider: null },
  ];

  for (const row of cases) {
    await t.test(row.name, async () => {
      const providers = [];
      const harness = createLearningRouteHarness({
        geminiConfig: row.gemini
          ? { available: true, apiKey: "gemini-key" }
          : { available: false, message: "Gemini unavailable." },
        groqConfig: row.groq
          ? { available: true, apiKey: "groq-key" }
          : { available: false, message: "Groq unavailable." },
        fetchImpl: async (url) => {
          const provider = url.includes("generativelanguage.googleapis.com") ? "gemini" : "groq";
          providers.push(provider);
          return provider === "gemini" ? geminiNotebookResponse() : groqNotebookResponse();
        },
      });

      const res = await harness.analyze();

      assert.equal(res.statusCode, row.status);
      assert.deepEqual(providers, row.provider ? [row.provider] : []);
      if (row.provider) {
        assert.equal(
          res.body.notebook.model,
          row.provider === "gemini" ? DEFAULT_GEMINI_LEARNING_MODEL : "llama-3.3-70b-versatile",
        );
      } else {
        assert.equal(res.body.code, "AI_PROVIDER_UNAVAILABLE");
        assert.equal(harness.dbCalls, 0);
      }
    });
  }
});

test("rejects missing, declined, or stale privacy consent before provider or database work", async (t) => {
  const cases = [
    { name: "missing", value: undefined },
    { name: "declined", value: { accepted: false, version: LEARNING_PRIVACY_CONSENT_VERSION } },
    { name: "stale", value: { accepted: true, version: "stale-version" } },
  ];

  for (const row of cases) {
    await t.test(row.name, async () => {
      let fetchCalls = 0;
      const harness = createLearningRouteHarness({
        fetchImpl: async () => {
          fetchCalls += 1;
          return geminiNotebookResponse();
        },
      });

      const res = await harness.analyze({ privacyConsent: row.value });

      assert.equal(res.statusCode, 428);
      assert.equal(res.body.code, "LEARNING_PRIVACY_CONSENT_REQUIRED");
      assert.equal(res.body.consentVersion, LEARNING_PRIVACY_CONSENT_VERSION);
      assert.equal(fetchCalls, 0);
      assert.equal(harness.dbCalls, 0);
    });
  }
});

test("does not invoke Gemini or Groq fallback for client input validation errors", async () => {
  let fetchCalls = 0;
  const harness = createLearningRouteHarness({
    fetchImpl: async () => {
      fetchCalls += 1;
      return geminiNotebookResponse();
    },
  });

  const res = await harness.analyze({
    attachments: [{
      name: "unsafe.html",
      type: "text/html",
      size: 8,
      dataUrl: "data:text/html;base64,PHNjcmlwdD4=",
    }],
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "CHAT_ATTACHMENT_TYPE");
  assert.equal(fetchCalls, 0);
  assert.equal(harness.prepareCalls, 0);
  assert.equal(harness.dbCalls, 0);
});

function validCareerTopicAnalysis(topics = ["Arrays", "Graphs"]) {
  return {
    targetRole: "Software engineering intern",
    overview: "Focus on problem-solving fundamentals and clear trade-off explanations.",
    topics: topics.map((title, index) => ({
      id: `career-topic-${index + 1}`,
      title,
      explanation: `${title} explained with intuition, examples, and common mistakes.`,
      whyItMatters: `${title} is frequently used to test applied reasoning.`,
      interviewQuestions: [{
        id: `career-topic-${index + 1}-question-1`,
        question: `How would you apply ${title} in a constrained problem?`,
        guidance: "Clarify constraints, compare approaches, and explain complexity.",
      }],
      practiceSteps: ["Review the core model.", "Solve a representative problem."],
    })),
    preparationPlan: [{
      id: "preparation-phase-1",
      title: "Foundations",
      description: "Build accurate explanations before timed practice.",
      actions: ["Review both requested topics.", "Complete a recall check."],
    }],
  };
}

function createCareerRouteHarness({
  fetchImpl,
  geminiConfig = { available: true, apiKey: "gemini-key" },
  groqConfig = { available: true, apiKey: "groq-key" },
  user = {},
  aiQuota = createTestAiQuota(),
} = {}) {
  const routes = new Map();
  const app = {};
  ["get", "post", "patch", "delete"].forEach((method) => {
    app[method] = (path, handler) => routes.set(`${method.toUpperCase()} ${path}`, handler);
  });
  const existing = {
    _id: "507f1f77bcf86cd799439011",
    userId: "user-1",
    subjectName: "Data Structures",
    ...validGeneratedNotebook(),
    model: DEFAULT_GEMINI_LEARNING_MODEL,
    sources: [],
    createdAt: new Date("2026-07-26T10:00:00.000Z"),
    updatedAt: new Date("2026-07-26T10:00:00.000Z"),
  };
  const updates = [];
  let dbCalls = 0;
  const collection = {
    findOne: async () => existing,
    updateOne: async (filter, update) => {
      updates.push({ filter, update });
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };
  registerLearningNotebookRoutes(app, {
    aiQuota,
    fetchImpl,
    geminiLearningModel: DEFAULT_GEMINI_LEARNING_MODEL,
    getDb: async () => {
      dbCalls += 1;
      return { collection: () => collection };
    },
    getGeminiConfigStatus: () => geminiConfig,
    getGroqConfigStatus: () => groqConfig,
    groqLearningModel: "llama-3.3-70b-versatile",
    groqModel: "llama-3.1-8b-instant",
    groqVisionModel: "qwen/qwen3.6-27b",
    now: () => new Date("2026-07-26T12:00:00.000Z"),
    requireAuth: (handler) => handler,
  });

  return {
    aiQuota,
    updates,
    get dbCalls() { return dbCalls; },
    async analyze(body = {}) {
      const req = {
        body: {
          privacyConsent: {
            accepted: true,
            version: LEARNING_PRIVACY_CONSENT_VERSION,
          },
          targetRole: "Software engineering intern",
          topics: "Arrays, Graphs",
          ...body,
        },
        params: { id: "507f1f77bcf86cd799439011" },
        user: {
          _id: "user-1",
          academicLevel: "Undergraduate / Bachelor's",
          degree: "B.Tech",
          department: "IT",
          ...user,
        },
        headers: { "idempotency-key": TEST_IDEMPOTENCY_KEY },
      };
      const res = {
        body: null,
        headers: {},
        statusCode: 200,
        set(name, value) {
          this.headers[name] = String(value);
          return this;
        },
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.body = payload;
          return this;
        },
      };
      await routes.get("POST /api/learning-notebooks/:id/career-analyze")(req, res);
      return res;
    },
  };
}

test("replays completed career analysis before eligibility and provider checks", async () => {
  let fetchCalls = 0;
  const replayPayload = {
    notebook: { id: "507f1f77bcf86cd799439011" },
    topicAnalysis: { targetRole: "Backend intern", topics: [] },
    providerModel: "saved-model",
  };
  const aiQuota = createTestAiQuota({
    lookup: async () => ({
      state: "replay",
      eventId: "completed-career-event",
      cost: 5,
      quota: { ...TEST_QUOTA, used: 5, reserved: 0 },
      replayPayload,
    }),
  });
  const harness = createCareerRouteHarness({
    aiQuota,
    geminiConfig: { available: false, message: "Gemini unavailable." },
    groqConfig: { available: false, message: "Groq unavailable." },
    user: { academicLevel: "High School", degree: "", department: "" },
    fetchImpl: async () => {
      fetchCalls += 1;
      return geminiNotebookResponse();
    },
  });

  const res = await harness.analyze();

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, replayPayload);
  assert.equal(fetchCalls, 0);
  assert.equal(harness.dbCalls, 1);
  assert.equal(aiQuota.calls.lookup.length, 1);
  assert.equal(aiQuota.calls.reserve.length, 0);
});

test("career analysis requires current privacy consent before database or provider work", async () => {
  let fetchCalls = 0;
  const harness = createCareerRouteHarness({
    fetchImpl: async () => {
      fetchCalls += 1;
      return geminiNotebookResponse();
    },
  });

  const res = await harness.analyze({ privacyConsent: undefined });

  assert.equal(res.statusCode, 428);
  assert.equal(res.body.code, "LEARNING_PRIVACY_CONSENT_REQUIRED");
  assert.equal(harness.dbCalls, 0);
  assert.equal(fetchCalls, 0);
});

test("uses Gemini structured output for career topics and persists normalized analysis", async () => {
  const requests = [];
  const harness = createCareerRouteHarness({
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return geminiNotebookResponse(validCareerTopicAnalysis(["Arrays", "Graphs"]));
    },
  });

  const res = await harness.analyze({
    topics: " Arrays, Graphs\narrays ",
    targetRole: "Backend engineering intern",
  });

  assert.equal(res.statusCode, 200);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /generativelanguage\.googleapis\.com/u);
  assert.equal(
    requests[0].body.generationConfig.responseFormat.text.schema.properties.topics.type,
    "array",
  );
  assert.match(
    requests[0].body.contents[0].parts[0].text,
    /Requested career topic data, in required output order: \["Arrays","Graphs"\]/u,
  );
  assert.equal(harness.updates.length, 1);
  const persisted = harness.updates[0].update.$set.careerPreparation.topicAnalysis;
  assert.equal(persisted.targetRole, "Backend engineering intern");
  assert.deepEqual(persisted.topics.map((topic) => topic.title), ["Arrays", "Graphs"]);
  assert.ok(persisted.topics[0].explanation.length > 20);
  assert.equal(res.body.notebook.careerPreparation.topicAnalysis.topics.length, 2);
  assert.equal(res.body.topicAnalysis.preparationPlan.length, 1);
  assert.equal(res.body.providerModel, DEFAULT_GEMINI_LEARNING_MODEL);
  assert.equal(harness.aiQuota.calls.reserve.length, 1);
  assert.equal(harness.aiQuota.calls.reserve[0].feature, "career_analysis");
  assert.equal(harness.aiQuota.calls.commit.length, 1);
  assert.equal(harness.aiQuota.calls.refund.length, 0);
  assert.equal(res.headers["X-AI-Credit-Cost"], "5");
});

test("restores career data and refunds when quota commit fails", async () => {
  const aiQuota = createTestAiQuota({
    commit: async () => {
      const error = new Error("AI credit storage unavailable.");
      error.status = 503;
      error.code = "AI_QUOTA_UNAVAILABLE";
      throw error;
    },
  });
  const harness = createCareerRouteHarness({
    aiQuota,
    fetchImpl: async () => (
      geminiNotebookResponse(validCareerTopicAnalysis(["Arrays", "Graphs"]))
    ),
  });

  const res = await harness.analyze();

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, "AI_QUOTA_UNAVAILABLE");
  assert.equal(res.body.creditsRefunded, true);
  assert.equal(harness.updates.length, 2);
  assert.equal(aiQuota.calls.commit.length, 1);
  assert.equal(aiQuota.calls.commit[0].reservationToken, "reservation-1");
  assert.equal(aiQuota.calls.refund.length, 1);
  assert.equal(aiQuota.calls.refund[0].reservationToken, "reservation-1");
});

test("falls back to Groq for career analysis after a Gemini transport failure", async () => {
  const providers = [];
  const groqRequests = [];
  const harness = createCareerRouteHarness({
    fetchImpl: async (url, options) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        providers.push("gemini");
        throw new TypeError("network unavailable");
      }
      providers.push("groq");
      const body = JSON.parse(options.body);
      groqRequests.push(body);
      return groqNotebookResponse(validCareerTopicAnalysis(["Arrays", "Graphs"]));
    },
  });

  const res = await harness.analyze();

  assert.equal(res.statusCode, 200);
  assert.deepEqual(providers, ["gemini", "groq"]);
  assert.equal(groqRequests[0].model, "llama-3.3-70b-versatile");
  assert.equal(groqRequests[0].max_tokens, MAX_LEARNING_COMPLETION_TOKENS);
  assert.equal(res.body.providerModel, "llama-3.3-70b-versatile");
  assert.equal(harness.updates.length, 1);
});

test("rejects career analysis for an ineligible learner profile before provider work", async () => {
  let fetchCalls = 0;
  const harness = createCareerRouteHarness({
    fetchImpl: async () => {
      fetchCalls += 1;
      return geminiNotebookResponse(validCareerTopicAnalysis());
    },
    user: {
      academicLevel: "Class 10",
      academicTrack: "CBSE",
      degree: "",
      department: "",
    },
  });

  const res = await harness.analyze();

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "LEARNING_CAREER_NOT_ELIGIBLE");
  assert.equal(harness.dbCalls, 0);
  assert.equal(fetchCalls, 0);
});
