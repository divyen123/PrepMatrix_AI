import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_GEMINI_LEARNING_FALLBACK_MODELS,
  DEFAULT_GEMINI_LEARNING_MODEL,
  DEFAULT_GROQ_LEARNING_FALLBACK_MODELS,
  DEFAULT_GROQ_LEARNING_MODEL,
  MAX_GEMINI_LEARNING_OUTPUT_TOKENS,
  LEARNING_RETRY_COMPLETION_TOKENS,
  MAX_GROQ_LEARNING_CHAPTERS,
  MAX_LEARNING_AI_SOURCE_CHARS,
  MAX_LEARNING_AI_SOURCE_TOKENS,
  MAX_LEARNING_PROMPT_CHARS,
  MAX_LEARNING_COMPLETION_TOKENS,
  MAX_GROQ_LEARNING_COMPLETION_TOKENS,
  buildLearningNotebookDepthTargets,
  compactLearningSourceMaterial,
  MAX_LEARNING_VISION_TEXT_CHARS,
  MAX_LEARNING_TEXT_SOURCE_CHARS,
  normalizeLearningTextSources,
  normalizeLearningGenerationSize,
  normalizeLearningPrompt,
  normalizeLearningRequestedOutline,
  requestGeminiLearningNotebookJson,
  requestLearningNotebookJson,
  requestLearningVisionText,
  registerLearningNotebookRoutes,
} from "./learningNotebookRoutes.js";
import { MEDICAL_TRAINING_EDUCATIONAL_NOTICE } from "../src/utils/learningNotebook.js";
import {
  LEARNING_PRIVACY_CONSENT_VERSION,
  MEDICAL_TRAINING_PRIVACY_CONSENT_KIND,
  MEDICAL_TRAINING_PRIVACY_CONSENT_VERSION,
} from "../src/utils/learningPrivacyConsent.js";

const TEST_IDEMPOTENCY_KEY = "9f0c91cc-6c62-4a41-8c44-b6a364cc31f8";

test("normalizes optional kids lesson generation sizes", () => {
  assert.equal(normalizeLearningGenerationSize(" Low "), "low");
  assert.equal(normalizeLearningGenerationSize("HIGH"), "high");
  assert.equal(normalizeLearningGenerationSize("medium"), null);
  assert.equal(normalizeLearningGenerationSize(undefined), null);
});
const DEFAULT_GEMINI_LEARNING_MODEL_CHAIN = [
  DEFAULT_GEMINI_LEARNING_MODEL,
  ...DEFAULT_GEMINI_LEARNING_FALLBACK_MODELS,
];
const DEFAULT_GROQ_LEARNING_MODEL_CHAIN = [...new Set([
  DEFAULT_GROQ_LEARNING_MODEL,
  ...DEFAULT_GROQ_LEARNING_FALLBACK_MODELS,
])];
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

function validYoungKidsLesson({ generationSize = "low" } = {}) {
  const highDetail = generationSize === "high";
  const topicCount = highDetail ? 6 : 4;
  const subtopicCount = highDetail ? 2 : 1;
  const topics = Array.from({ length: topicCount }, (_, topicIndex) => {
    const topicNumber = topicIndex + 1;
    const title = `Plant learning idea ${topicNumber}`;
    return {
      id: `topic-${topicNumber}`,
      title,
      summary: `${title} explains one simple part of how plants make and use food.`,
      explanation: highDetail
        ? `${title} uses sunlight, water, and air to explain photosynthesis in clear steps. The example follows a familiar garden plant through the day, shows what each part contributes, and helps the child connect healthy leaves with the food a plant makes.`
        : `${title} explains photosynthesis with a familiar garden plant. Sunlight, water, and air help its leaves make food so the plant can grow.`,
      importance: "high",
      learningObjectives: highDetail
        ? ["Name what a plant needs.", "Describe what leaves do.", "Share an example."]
        : ["Name what a plant needs.", "Tell what leaves do."],
      keyPoints: highDetail
        ? ["Leaves use sunlight.", "Roots take in water.", "Air helps make food."]
        : ["Leaves use sunlight.", "Roots take in water."],
      examples: [
        "Watch a sunny window plant and notice how its leaves face the light.",
        "Compare a watered plant with a dry plant and notice which one stays firm.",
      ],
      applications: ["Caring for a classroom plant"],
      commonMistakes: ["Thinking roots collect sunlight"],
      revisionTips: ["Draw the sun, roots, and leaves"],
      subtopics: Array.from({ length: subtopicCount }, (_, subtopicIndex) => ({
        id: `topic-${topicNumber}-subtopic-${subtopicIndex + 1}`,
        title: `${title} step ${subtopicIndex + 1}`,
        summary: "One small photosynthesis step.",
        explanation: highDetail
          ? "This step shows how a leaf uses light together with water and air to help the plant make food and grow."
          : "A leaf uses light, water, and air to help the plant make food.",
        keyPoints: highDetail
          ? ["Light reaches the leaf.", "The plant makes food."]
          : ["Light reaches the leaf."],
        examples: ["Point to the leaf that receives sunlight."],
      })),
    };
  });
  const questionCount = highDetail ? 5 : 4;
  const noteCount = highDetail ? 6 : 4;
  return {
    title: "Science - Photosynthesis",
    overview: "A short, child-friendly lesson about how green plants make food and grow.",
    importantQuestions: Array.from({ length: questionCount }, (_, index) => ({
      id: `question-${index + 1}`,
      question: `What helps a plant in learning idea ${index + 1}?`,
      answer: "Sunlight, water, and air help its leaves make food.",
      whyItMatters: "It checks the main lesson idea.",
      difficulty: "easy",
    })),
    revisedNotes: Array.from({ length: noteCount }, (_, index) => ({
      id: `revised-note-${index + 1}`,
      title: topics[index % topics.length].title,
      content: topics[index % topics.length].explanation,
      keyPoints: topics[index % topics.length].keyPoints,
      revisionTips: topics[index % topics.length].revisionTips,
    })),
    chapters: [{
      id: "chapter-1",
      title: "Photosynthesis",
      summary: "Plants use their leaves, roots, sunlight, water, and air to make food and keep growing.",
      topics,
    }],
    mindMap: {
      nodes: [{ id: "root", label: "Photosynthesis", parentId: null, kind: "root", order: 0 }],
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

test("sanitizes and bounds learner prompts and requested outlines", () => {
  assert.equal(
    normalizeLearningPrompt("  Explain\u0007  deadlocks.\r\nFocus\t on prevention.  "),
    "Explain deadlocks.\nFocus on prevention.",
  );
  assert.deepEqual(
    normalizeLearningRequestedOutline([{
      chapterName: "  Concurrency\u0007 ",
      topics: [" Deadlocks ", { title: "Semaphores" }, "Deadlocks"],
    }]),
    [{ chapterName: "Concurrency", topics: ["Deadlocks", "Semaphores"] }],
  );

  assert.throws(
    () => normalizeLearningPrompt("x".repeat(MAX_LEARNING_PROMPT_CHARS + 1)),
    (error) => error.code === "LEARNING_PROMPT_TOO_LARGE" && error.status === 413,
  );
  assert.throws(
    () => normalizeLearningPrompt({ prompt: "not text" }),
    (error) => error.code === "LEARNING_PROMPT_INVALID" && error.status === 400,
  );
  assert.throws(
    () => normalizeLearningRequestedOutline([
      {
        chapterName: "One",
        topics: Array.from({ length: 30 }, (_, index) => `Topic ${index + 1}`),
      },
      {
        chapterName: "Two",
        topics: Array.from({ length: 30 }, (_, index) => `Other ${index + 1}`),
      },
    ]),
    (error) => error.code === "LEARNING_OUTLINE_TOO_LARGE" && error.status === 413,
  );
});

test("does not fetch after the shared learning-generation deadline", async (t) => {
  const deadline = Date.now() - 1;
  const cases = [
    {
      name: "Gemini notebook",
      run: (fetchImpl) => requestGeminiLearningNotebookJson({
        apiKey: "test-key",
        deadline,
        fetchImpl,
        systemPrompt: "Return JSON.",
        userPrompt: "Generate a notebook.",
      }),
    },
    {
      name: "Groq notebook",
      run: (fetchImpl) => requestLearningNotebookJson({
        apiKey: "test-key",
        deadline,
        fetchImpl,
        model: DEFAULT_GROQ_LEARNING_MODEL,
        systemPrompt: "Return JSON.",
        userContent: "Generate a notebook.",
      }),
    },
    {
      name: "Groq OCR",
      run: (fetchImpl) => requestLearningVisionText({
        apiKey: "test-key",
        chapterNames: ["Introduction"],
        deadline,
        fetchImpl,
        model: "qwen/qwen3.6-27b",
        subjectName: "Quantum Computing",
        visionImages: [{
          name: "page-1.png",
          dataUrl: "data:image/png;base64,AAAA",
        }],
      }),
    },
  ];

  for (const row of cases) {
    await t.test(row.name, async () => {
      let fetchCalls = 0;
      await assert.rejects(
        () => row.run(async () => {
          fetchCalls += 1;
          throw new Error("Fetch must not run.");
        }),
        (error) => error.code === "LEARNING_GENERATION_TIMEOUT" && error.status === 504,
      );
      assert.equal(fetchCalls, 0);
    });
  }
});

test("returns and refunds a public 504 when the shared deadline expires in flight", async () => {
  let fetchCalls = 0;
  const harness = createLearningRouteHarness({
    generationDeadlineMs: 15,
    fetchImpl: async (_url, options) => {
      fetchCalls += 1;
      return new Promise((_resolve, reject) => {
        const rejectForAbort = () => {
          reject(options.signal.reason);
        };
        if (options.signal.aborted) {
          rejectForAbort();
          return;
        }
        options.signal.addEventListener("abort", rejectForAbort, { once: true });
      });
    },
  });

  const res = await harness.analyze();

  assert.equal(fetchCalls, 1);
  assert.equal(res.statusCode, 504);
  assert.equal(res.body.code, "LEARNING_GENERATION_TIMEOUT");
  assert.equal(res.body.creditsRefunded, true);
  assert.match(res.body.error, /time limit/iu);
  assert.match(res.body.error, /credits were refunded/iu);
  assert.equal(harness.aiQuota.calls.reserve.length, 1);
  assert.equal(harness.aiQuota.calls.commit.length, 0);
  assert.equal(harness.aiQuota.calls.refund.length, 1);
});

test("keeps the completion allowance when retrying an incomplete AI notebook response", async () => {
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
  assert.equal(requests[1].max_tokens, MAX_LEARNING_COMPLETION_TOKENS);
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

test("uses GPT-OSS-compatible reasoning controls for structured notebooks", async () => {
  const requests = [];
  await requestLearningNotebookJson({
    apiKey: "test-key",
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return groqNotebookResponse();
    },
    model: "openai/gpt-oss-20b",
    systemPrompt: "Return JSON.",
    userContent: "Generate a notebook.",
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].reasoning_effort, "low");
  assert.equal(requests[0].include_reasoning, false);
  assert.equal(requests[0].max_completion_tokens, MAX_GROQ_LEARNING_COMPLETION_TOKENS);
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
    userContent: "<>{}[]".repeat(536) + "!",
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
    systemPrompt: "S",
    userContent: "aB9_/\\|{}[]()<>!?$%^&*-=+;:,.".repeat(80),
  });

  const request = requests[0];
  const promptByteUpperBound = request.messages.reduce(
    (sum, message) => sum + Buffer.byteLength(message.content, "utf8"),
    32,
  );
  assert.ok(promptByteUpperBound + request.max_tokens + 750 <= 8_000);
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
      userContent: "<>{}[]".repeat(702) + "!!!!!",
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
  generationDeadlineMs,
  geminiConfig = { available: true, apiKey: "gemini-key" },
  geminiLearningModel = DEFAULT_GEMINI_LEARNING_MODEL,
  geminiLearningModels,
  groqConfig = { available: true, apiKey: "groq-key" },
  groqLearningModel = DEFAULT_GROQ_LEARNING_MODEL,
  groqLearningModels,
  logger = { warn() {} },
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
    geminiLearningModel,
    geminiLearningModels,
    generationDeadlineMs,
    getDb: async () => {
      dbCalls += 1;
      return { collection: () => collection };
    },
    getGeminiConfigStatus: () => geminiConfig,
    getGroqConfigStatus: () => groqConfig,
    groqLearningModel,
    groqLearningModels,
    groqModel: "llama-3.1-8b-instant",
    groqVisionModel: "qwen/qwen3.6-27b",
    logger,
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
    async analyze(body = {}, userOverrides = {}) {
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
          ...userOverrides,
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

test("keeps optional generation sizes on the existing standard notebook contracts", async () => {
  async function requestedTopicsFor(generationSize) {
    let requestBody = null;
    const harness = createLearningRouteHarness({
      fetchImpl: async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return geminiNotebookResponse();
      },
    });
    const response = await harness.analyze({ generationSize });
    assert.equal(response.statusCode, 201);
    return requestBody.generationConfig.responseJsonSchema
      .properties.chapters.items.properties.topics.minItems;
  }

  assert.equal(await requestedTopicsFor("Low"), 4);
  assert.equal(await requestedTopicsFor("High"), 8);

  async function requestedGroqPrompt(generationSize) {
    let requestBody = null;
    const harness = createLearningRouteHarness({
      geminiConfig: { available: false },
      fetchImpl: async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return groqNotebookResponse();
      },
    });
    const response = await harness.analyze({ generationSize });
    assert.equal(response.statusCode, 201);
    return requestBody.messages.map((message) => message.content).join("\n");
  }

  const standardLowPrompt = await requestedGroqPrompt("Low");
  const standardHighPrompt = await requestedGroqPrompt("High");
  assert.match(standardLowPrompt, /70-110 words/u);
  assert.match(standardHighPrompt, /180-320 words/u);
  assert.match(
    standardHighPrompt,
    /Put important exam, placement, or conceptual questions first/u,
  );
});

test("uses medical no-placement and no-dose prompts for advanced medical ordinary notebooks", async () => {
  const medicalProfiles = [
    {
      label: "postgraduate medicine",
      profile: {
        academicLevel: "Postgraduate / Master's",
        academicTrack: "Medical & Health Sciences",
        degree: "MD Medicine",
        department: "Internal Medicine",
      },
      body: {
        subjectName: "Pathophysiology",
        chapterNames: ["Inflammation"],
      },
    },
    {
      label: "doctoral public health",
      profile: {
        academicLevel: "Doctoral / PhD",
        academicTrack: "Medical & Health Sciences",
        degree: "PhD in Public Health",
        department: "Epidemiology",
      },
      body: {
        subjectName: "Epidemiology",
        chapterNames: ["Study design"],
      },
    },
  ];

  for (const { label, profile, body } of medicalProfiles) {
    let requestBody = null;
    const harness = createLearningRouteHarness({
      fetchImpl: async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return geminiNotebookResponse();
      },
    });

    const response = await harness.analyze(body, profile);

    assert.equal(response.statusCode, 201, label);
    const systemPrompt = requestBody.systemInstruction.parts[0].text;
    const userPrompt = requestBody.contents[0].parts.at(-1).text;
    const combinedPrompt = `${systemPrompt}\n${userPrompt}`;
    assert.match(
      systemPrompt,
      /Placement preparation is replaced by a separate Medical training workflow/iu,
      label,
    );
    assert.match(
      systemPrompt,
      /do not add placement, internship, resume, or job-interview guidance/iu,
      label,
    );
    assert.match(
      userPrompt,
      /Put important exam and conceptual-reasoning questions first/iu,
      label,
    );
    assert.match(
      userPrompt,
      /Do not frame this ordinary notebook as placement preparation/iu,
      label,
    );
    assert.match(
      userPrompt,
      /do not .*provide diagnosis, prescribing, dosing, treatment, or patient-specific advice/iu,
      label,
    );
    assert.doesNotMatch(
      combinedPrompt,
      /Put important exam, placement, or conceptual questions first/iu,
      label,
    );
    assert.doesNotMatch(
      combinedPrompt,
      /(?:recommend|prescribe|administer|take)\s+\d+(?:\.\d+)?\s*(?:mg|mcg|ug|g|ml|units?)/iu,
      label,
    );
    assert.equal(response.body.notebook.careerPreparation.enabled, false, label);
    assert.equal(response.body.notebook.medicalTraining.enabled, true, label);
    assert.equal(harness.stored.length, 1, label);
    assert.equal(harness.aiQuota.calls.refund.length, 0, label);
  }
});

test("keeps ordinary nonmedical postgraduate notebooks placement-aware", async () => {
  let requestBody = null;
  const harness = createLearningRouteHarness({
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return geminiNotebookResponse();
    },
  });

  const response = await harness.analyze({
    subjectName: "Corporate Finance",
    chapterNames: ["Capital budgeting"],
  }, {
    academicLevel: "Postgraduate / Master's",
    academicTrack: "Business & Management",
    degree: "MBA",
    department: "Finance",
  });

  assert.equal(response.statusCode, 201);
  const systemPrompt = requestBody.systemInstruction.parts[0].text;
  const userPrompt = requestBody.contents[0].parts.at(-1).text;
  assert.match(
    systemPrompt,
    /Career preparation is enabled for this profile and must be tailored to: "Finance"/u,
  );
  assert.match(
    userPrompt,
    /Put important exam, placement, or conceptual questions first/u,
  );
  assert.doesNotMatch(
    `${systemPrompt}\n${userPrompt}`,
    /separate Medical training workflow|diagnosis, prescribing, dosing/iu,
  );
  assert.equal(response.body.notebook.careerPreparation.enabled, true);
  assert.equal(response.body.notebook.medicalTraining.enabled, false);
  assert.equal(harness.stored.length, 1);
  assert.equal(harness.aiQuota.calls.refund.length, 0);
});

test("uses smaller, meaningfully different Low and High contracts only for authenticated K-3 learners", async () => {
  const cases = [
    {
      generationSize: "low",
      expected: { topics: 4, subtopics: 1, questions: 4, notes: 4, topicPoints: 2 },
    },
    {
      generationSize: "high",
      expected: { topics: 6, subtopics: 2, questions: 5, notes: 6, topicPoints: 3 },
    },
  ];

  for (const { generationSize, expected } of cases) {
    let requestBody = null;
    const harness = createLearningRouteHarness({
      fetchImpl: async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return geminiNotebookResponse(validYoungKidsLesson({ generationSize }));
      },
    });

    const response = await harness.analyze({
      academicLevel: "Undergraduate / Bachelor's",
      generationSize,
      learnerProfile: {
        academicLevel: "Undergraduate / Bachelor's",
        grade: "",
      },
      subjectName: "Science",
      chapterNames: ["Photosynthesis"],
    }, {
      academicLevel: "Primary School",
      grade: "Class 2",
    });

    assert.equal(response.statusCode, 201, generationSize);
    const schema = requestBody.generationConfig.responseJsonSchema;
    const topicSchema = schema.properties.chapters.items.properties.topics;
    const topicItem = topicSchema.items;
    assert.equal(topicSchema.minItems, expected.topics, generationSize);
    assert.equal(topicSchema.maxItems, expected.topics, generationSize);
    assert.equal(topicItem.properties.subtopics.minItems, expected.subtopics, generationSize);
    assert.equal(topicItem.properties.keyPoints.minItems, expected.topicPoints, generationSize);
    assert.equal(topicItem.properties.examples.minItems, 2, generationSize);
    assert.equal(schema.properties.importantQuestions.minItems, expected.questions, generationSize);
    assert.equal(schema.properties.importantQuestions.maxItems, expected.questions, generationSize);
    assert.equal(schema.properties.revisedNotes.minItems, expected.notes, generationSize);
    const systemPrompt = requestBody.systemInstruction.parts[0].text;
    assert.match(systemPrompt, /server-verified Kindergarten through Class 3/iu);
    const prompt = requestBody.contents[0].parts.at(-1).text;
    assert.match(prompt, /Server-verified young learner class: "Class 2"/u);
    assert.match(prompt, /at least 2 different concrete examples/iu);
    assert.match(
      prompt,
      new RegExp(`exactly ${expected.questions} different friendly practice questions`, "iu"),
    );
    assert.doesNotMatch(prompt, /Undergraduate \/ Bachelor's/u);
    assert.match(prompt, /Keep every practice question friendly, concrete/iu);
    assert.doesNotMatch(
      `${systemPrompt}\n${prompt}`,
      /(?:prioriti[sz]e|prepare|include|practice|focus)[^.\n]{0,80}(?:placement|career|resume|interview)/iu,
    );
    assert.equal(harness.stored.length, 1, generationSize);
    assert.equal(harness.aiQuota.calls.commit.length, 1, generationSize);
    assert.equal(harness.aiQuota.calls.refund.length, 0, generationSize);
  }
});

test("accepts a schema-minimum K-3 Low lesson through Groq and persists it without a refund", async () => {
  let requestBody = null;
  const harness = createLearningRouteHarness({
    geminiConfig: { available: false },
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return groqNotebookResponse(validYoungKidsLesson({ generationSize: "low" }));
    },
  });

  const response = await harness.analyze({
    generationSize: "low",
    subjectName: "Science",
    chapterNames: ["Photosynthesis"],
  }, {
    academicLevel: "Primary School",
    grade: "Class 2",
  });

  assert.equal(response.statusCode, 201);
  assert.match(requestBody.messages[0].content, /server-verified Kindergarten through Class 3/iu);
  assert.equal(response.body.notebook.chapters[0].topics.length, 4);
  assert.equal(response.body.notebook.chapters[0].topics[0].keyPoints.length, 2);
  assert.equal(response.body.notebook.chapters[0].topics[0].subtopics[0].keyPoints.length, 1);
  assert.equal(response.body.notebook.chapters[0].topics[0].examples.length, 2);
  assert.equal(harness.stored.length, 1);
  assert.equal(response.body.notebook.importantQuestions.length, 4);
  assert.equal(harness.aiQuota.calls.commit.length, 1);
  assert.equal(harness.aiQuota.calls.refund.length, 0);
});

test("rejects oversized or schema-incomplete K-3 Groq lessons and refunds the reservation", async () => {
  const invalidLessons = [
    {
      name: "extra chapter",
      mutate(notebook) {
        notebook.chapters.push({
          ...structuredClone(notebook.chapters[0]),
          id: "chapter-extra",
          title: "Extra chapter",
        });
      },
    },
    {
      name: "extra topic",
      mutate(notebook) {
        notebook.chapters[0].topics.push({
          ...structuredClone(notebook.chapters[0].topics[0]),
          id: "topic-extra",
          title: "Extra topic",
        });
      },
    },
    {
      name: "extra subtopic",
      mutate(notebook) {
        notebook.chapters[0].topics[0].subtopics.push({
          ...structuredClone(notebook.chapters[0].topics[0].subtopics[0]),
          id: "subtopic-extra",
          title: "Extra subtopic",
        });
      },
    },
    {
      name: "missing required topic detail",
      mutate(notebook) {
        notebook.chapters[0].topics[0].applications = [];
      },
    },
    {
      name: "too few quick-check questions",
      mutate(notebook) {
        notebook.importantQuestions.pop();
      },
    },
    {
      name: "extra quick-check question",
      mutate(notebook) {
        notebook.importantQuestions.push({
          ...structuredClone(notebook.importantQuestions[0]),
          id: "question-extra",
          question: "Can you share one more plant fact?",
        });
      },
    },
  ];

  for (const invalidCase of invalidLessons) {
    const notebook = validYoungKidsLesson({ generationSize: "low" });
    invalidCase.mutate(notebook);
    const harness = createLearningRouteHarness({
      geminiConfig: { available: false },
      fetchImpl: async () => groqNotebookResponse(notebook),
    });

    const response = await harness.analyze({
      generationSize: "low",
      subjectName: "Science",
      chapterNames: ["Photosynthesis"],
    }, {
      academicLevel: "Primary School",
      grade: "Class 2",
    });

    assert.equal(response.statusCode, 502, invalidCase.name);
    assert.equal(response.body.code, "LEARNING_OUTPUT_INVALID", invalidCase.name);
    assert.equal(response.body.creditsRefunded, true, invalidCase.name);
    assert.equal(harness.stored.length, 0, invalidCase.name);
    assert.equal(harness.aiQuota.calls.commit.length, 0, invalidCase.name);
    assert.equal(harness.aiQuota.calls.refund.length, 1, invalidCase.name);
  }
});

test("defaults authenticated K-3 requests without a generation size to the safe Low contract", async () => {
  let requestBody = null;
  const harness = createLearningRouteHarness({
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return geminiNotebookResponse(validYoungKidsLesson({ generationSize: "low" }));
    },
  });

  const response = await harness.analyze({
    subjectName: "Science",
    chapterNames: ["Photosynthesis"],
  }, {
    academicLevel: "Primary School",
    grade: "Class 3",
  });

  assert.equal(response.statusCode, 201);
  const schema = requestBody.generationConfig.responseJsonSchema;
  assert.equal(schema.properties.chapters.items.properties.topics.minItems, 4);
  assert.equal(schema.properties.chapters.items.properties.topics.items.properties.subtopics.minItems, 1);
  assert.equal(schema.properties.importantQuestions.minItems, 4);
  assert.equal(schema.properties.importantQuestions.maxItems, 4);
  assert.match(requestBody.contents[0].parts.at(-1).text, /Server-verified young learner class: "Class 3"/u);
});

test("keeps the standard generation-size depth contract unchanged for non-K-3 profiles", () => {
  const standardLow = buildLearningNotebookDepthTargets(["Photosynthesis"], { compact: true });
  const standardHigh = buildLearningNotebookDepthTargets(["Photosynthesis"], { compact: false });

  assert.deepEqual(
    [standardLow.topicsPerChapter, standardLow.subtopicsPerTopic, standardLow.minimumImportantQuestions],
    [4, 2, 5],
  );
  assert.deepEqual(
    [standardHigh.topicsPerChapter, standardHigh.subtopicsPerTopic, standardHigh.minimumImportantQuestions],
    [8, 4, 10],
  );
});

test("rejects oversized and underspecified learning prompts before AI work", async () => {
  let fetchCalls = 0;
  const harness = createLearningRouteHarness({
    fetchImpl: async () => {
      fetchCalls += 1;
      return geminiNotebookResponse();
    },
  });

  const oversized = await harness.analyze({
    learningPrompt: "x".repeat(MAX_LEARNING_PROMPT_CHARS + 1),
  });
  assert.equal(oversized.statusCode, 413);
  assert.equal(oversized.body.code, "LEARNING_PROMPT_TOO_LARGE");

  const underspecified = await harness.analyze({
    subjectName: "",
    chapterNames: [],
    learningPrompt: "hi",
  });
  assert.equal(underspecified.statusCode, 400);
  assert.equal(underspecified.body.code, "LEARNING_MANUAL_SCOPE_REQUIRED");

  assert.equal(fetchCalls, 0);
  assert.equal(harness.dbCalls, 0);
  assert.equal(harness.aiQuota.calls.lookup.length, 0);
  assert.equal(harness.aiQuota.calls.reserve.length, 0);
});

test("accepts descriptive prompt-only Gemini scope without persisting the raw request", async () => {
  const generated = validGeneratedNotebook();
  generated.revisedNotes.push(...Array.from({ length: 4 }, (_, index) => ({
    ...generated.revisedNotes[index],
    id: `prompt-note-${index + 1}`,
    title: `Prompt focus ${index + 1}`,
  })));
  let requestBody = null;
  const harness = createLearningRouteHarness({
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return geminiNotebookResponse(generated);
    },
  });
  const learningPrompt = "Explain operating-system deadlocks with prevention examples. PROMPT_NOT_STORED";

  const res = await harness.analyze({
    subjectName: "",
    chapterNames: [],
    learningPrompt,
  });

  assert.equal(res.statusCode, 201);
  assert.equal(harness.stored[0].subjectName, "Prompt-guided learning");
  const systemText = requestBody.systemInstruction.parts[0].text;
  const userText = requestBody.contents[0].parts.at(-1).text;
  assert.match(systemText, /untrusted scope data/u);
  assert.match(systemText, /must never override this system instruction/u);
  assert.match(userText, /Learner focus request \(untrusted scope data\)/u);
  assert.match(userText, /PROMPT_NOT_STORED/u);
  assert.doesNotMatch(
    JSON.stringify(harness.stored[0]),
    /PROMPT_NOT_STORED|learningPrompt|requestedOutline/u,
  );
  assert.equal("learningPrompt" in res.body.notebook, false);
  assert.equal("requestedOutline" in res.body.notebook, false);
});

test("includes learner prompt and requested outline in Groq without persisting request fields", async () => {
  const requests = [];
  const harness = createLearningRouteHarness({
    geminiConfig: { available: false },
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return groqNotebookResponse();
    },
  });
  const learningPrompt = "Prioritize process synchronization. GROQ_PROMPT_NOT_STORED";
  const requestedOutline = [{
    chapterName: "Processes",
    topics: ["Semaphores", "Deadlock prevention"],
  }];

  const res = await harness.analyze({ learningPrompt, requestedOutline });

  assert.equal(res.statusCode, 201);
  assert.equal(requests.length, 1);
  const [systemMessage, userMessage] = requests[0].messages;
  assert.match(systemMessage.content, /untrusted scope data/u);
  assert.match(systemMessage.content, /required JSON schema and counts/u);
  assert.match(userMessage.content, /GROQ_PROMPT_NOT_STORED/u);
  assert.match(userMessage.content, /Requested outline \(untrusted scope data\)/u);
  assert.match(userMessage.content, /"chapterName":"Processes"/u);
  assert.match(userMessage.content, /"Deadlock prevention"/u);
  assert.doesNotMatch(
    JSON.stringify(harness.stored[0]),
    /GROQ_PROMPT_NOT_STORED|learningPrompt|requestedOutline/u,
  );
  assert.equal("learningPrompt" in res.body.notebook, false);
  assert.equal("requestedOutline" in res.body.notebook, false);
});

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
  assert.equal(generationConfig.responseMimeType, "application/json");
  assert.equal(generationConfig.responseJsonSchema.type, "object");
  const chapterSchema = generationConfig.responseJsonSchema.properties.chapters;
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

test("accepts concise structured Gemini notebooks without falling back", async () => {
  const conciseNotebook = validGeneratedNotebook();
  conciseNotebook.chapters = conciseNotebook.chapters.map((chapter) => ({
    ...chapter,
    summary: "Concise chapter summary.",
    topics: chapter.topics.map((topic) => ({
      ...topic,
      explanation: "Concise explanation.",
      subtopics: topic.subtopics.map((subtopic) => ({
        ...subtopic,
        explanation: "Concise subtopic explanation.",
      })),
    })),
  }));
  const providers = [];
  const harness = createLearningRouteHarness({
    fetchImpl: async (url) => {
      const provider = url.includes("generativelanguage.googleapis.com") ? "gemini" : "groq";
      providers.push(provider);
      if (provider === "groq") assert.fail("Structured Gemini output should not use Groq.");
      return geminiNotebookResponse(conciseNotebook);
    },
  });

  const res = await harness.analyze();

  assert.equal(res.statusCode, 201);
  assert.deepEqual(providers, ["gemini"]);
  assert.equal(res.body.notebook.model, DEFAULT_GEMINI_LEARNING_MODEL);
});

test("rejects blank Gemini prose instead of storing an empty notebook", async () => {
  const blankNotebook = validGeneratedNotebook();
  blankNotebook.chapters = blankNotebook.chapters.map((chapter) => ({
    ...chapter,
    summary: " ",
    topics: chapter.topics.map((topic) => ({
      ...topic,
      explanation: " ",
      subtopics: topic.subtopics.map((subtopic) => ({
        ...subtopic,
        explanation: " ",
      })),
    })),
  }));
  let requests = 0;
  const harness = createLearningRouteHarness({
    groqConfig: { available: false },
    fetchImpl: async () => {
      requests += 1;
      return geminiNotebookResponse(blankNotebook);
    },
  });

  const res = await harness.analyze();

  assert.equal(res.statusCode, 502);
  assert.equal(res.body.code, "LEARNING_OUTPUT_INVALID");
  assert.equal(requests, DEFAULT_GEMINI_LEARNING_MODEL_CHAIN.length);
  assert.equal(harness.stored.length, 0);
  assert.equal(harness.aiQuota.calls.refund.length, 1);
});

test("tries the first default secondary Gemini model before Groq", async () => {
  const requestedModels = [];
  const harness = createLearningRouteHarness({
    fetchImpl: async (url) => {
      if (!url.includes("generativelanguage.googleapis.com")) {
        assert.fail("The secondary Gemini model should prevent a Groq request.");
      }
      const match = url.match(/\/models\/([^:]+):generateContent$/u);
      const model = decodeURIComponent(match?.[1] || "");
      requestedModels.push(model);
      return requestedModels.length === 1
        ? geminiNotebookResponse({ overview: "Incomplete" })
        : geminiNotebookResponse();
    },
  });

  const res = await harness.analyze();

  assert.equal(res.statusCode, 201);
  assert.deepEqual(requestedModels, [
    DEFAULT_GEMINI_LEARNING_MODEL,
    DEFAULT_GEMINI_LEARNING_FALLBACK_MODELS[0],
  ]);
  assert.equal(res.body.notebook.model, DEFAULT_GEMINI_LEARNING_FALLBACK_MODELS[0]);
});

test("deduplicates configured Gemini candidates and caps the provider chain", async () => {
  const requestedModels = [];
  const configuredModels = [
    "gemini-cap-primary",
    "gemini-cap-primary",
    "gemini-cap-2",
    "gemini-cap-3",
    "gemini-cap-4",
    "gemini-cap-5",
  ];
  const harness = createLearningRouteHarness({
    geminiLearningModel: configuredModels[0],
    geminiLearningModels: configuredModels,
    groqConfig: { available: false },
    fetchImpl: async (url) => {
      const match = url.match(/\/models\/([^:]+):generateContent$/u);
      requestedModels.push(decodeURIComponent(match?.[1] || ""));
      return geminiNotebookResponse({ overview: "Incomplete" });
    },
  });

  const res = await harness.analyze();

  assert.equal(res.statusCode, 502);
  assert.equal(res.body.code, "LEARNING_OUTPUT_INVALID");
  assert.deepEqual(requestedModels, [
    "gemini-cap-primary",
    "gemini-cap-2",
    "gemini-cap-3",
    "gemini-cap-4",
  ]);
});

test("guards Groq PDF preparation before and after the shared deadline", async (t) => {
  const pdfBytes = Buffer.from("%PDF-1.7\nDeadline PDF\n%%EOF", "utf8");
  const attachments = [{
    name: "deadline.pdf",
    type: "application/pdf",
    size: pdfBytes.length,
    dataUrl: "data:application/pdf;base64," + pdfBytes.toString("base64"),
  }];

  await t.test("does not start preparation after expiry", async () => {
    let fetchCalls = 0;
    const harness = createLearningRouteHarness({
      geminiConfig: { available: false },
      generationDeadlineMs: 0,
      fetchImpl: async () => {
        fetchCalls += 1;
        return groqNotebookResponse();
      },
    });

    const res = await harness.analyze({ attachments });

    assert.equal(res.statusCode, 504);
    assert.equal(res.body.code, "LEARNING_GENERATION_TIMEOUT");
    assert.equal(res.body.creditsRefunded, true);
    assert.equal(harness.prepareCalls, 0);
    assert.equal(fetchCalls, 0);
    assert.equal(harness.aiQuota.calls.reserve.length, 1);
    assert.equal(harness.aiQuota.calls.commit.length, 0);
    assert.equal(harness.aiQuota.calls.refund.length, 1);
  });

  await t.test("does not generate when preparation finishes after expiry", async () => {
    let fetchCalls = 0;
    const harness = createLearningRouteHarness({
      geminiConfig: { available: false },
      generationDeadlineMs: 5,
      fetchImpl: async () => {
        fetchCalls += 1;
        return groqNotebookResponse();
      },
      prepareAttachmentContext: async ([attachment]) => {
        await new Promise((resolve) => {
          setTimeout(resolve, 15);
        });
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

    const res = await harness.analyze({ attachments });

    assert.equal(res.statusCode, 504);
    assert.equal(res.body.code, "LEARNING_GENERATION_TIMEOUT");
    assert.equal(res.body.creditsRefunded, true);
    assert.equal(harness.prepareCalls, 1);
    assert.equal(fetchCalls, 0);
    assert.equal(harness.aiQuota.calls.reserve.length, 1);
    assert.equal(harness.aiQuota.calls.commit.length, 0);
    assert.equal(harness.aiQuota.calls.refund.length, 1);
  });
});

test("crosses directly to Groq after one Gemini transport failure and lazily extracts PDFs", async () => {
  const sequence = [];
  const groqRequests = [];
  const pdfBytes = Buffer.from("%PDF-1.7\nFallback PDF\n%%EOF", "utf8");
  const harness = createLearningRouteHarness({
    fetchImpl: async (url, options) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        const match = url.match(/\/models\/([^:]+):generateContent$/u);
        const model = decodeURIComponent(match?.[1] || "");
        sequence.push("gemini:" + model);
        throw new TypeError("network unavailable");
      }
      const request = JSON.parse(options.body);
      sequence.push("groq:" + request.model);
      groqRequests.push(request);
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
  assert.deepEqual(sequence, [
    "gemini:" + DEFAULT_GEMINI_LEARNING_MODEL,
    "prepare",
    "groq:" + DEFAULT_GROQ_LEARNING_MODEL,
  ]);
  assert.equal(harness.prepareCalls, 1);
  const groqCompletionTokens = groqRequests[0].max_completion_tokens ?? groqRequests[0].max_tokens;
  assert.ok(groqCompletionTokens <= MAX_GROQ_LEARNING_COMPLETION_TOKENS);
  assert.ok(groqCompletionTokens >= 3_000);
  assert.equal(groqRequests[0].reasoning_effort, "low");
  assert.equal(groqRequests[0].include_reasoning, false);
  assert.match(groqRequests[0].messages[1].content, /Generate exactly 4 distinct.*exactly 2 meaningful subtopics/u);
  assert.match(groqRequests[0].messages[1].content, /4-5 specific key points/u);
  assert.match(groqRequests[0].messages[1].content, /isolated address spaces/u);
  assert.equal(harness.stored[0].model, DEFAULT_GROQ_LEARNING_MODEL);
  assert.equal(res.body.notebook.model, DEFAULT_GROQ_LEARNING_MODEL);
  assert.equal(harness.aiQuota.calls.reserve.length, 1);
  assert.equal(harness.aiQuota.calls.reserve[0].feature, "learning_notebook");
  assert.equal(harness.aiQuota.calls.commit.length, 1);
  assert.equal(harness.aiQuota.calls.refund.length, 0);
  assert.equal(res.headers["X-AI-Credit-Cost"], "12");
});

test("crosses directly to Groq after one invalid Gemini API-key response", async () => {
  const attempts = [];
  const harness = createLearningRouteHarness({
    fetchImpl: async (url, options) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        const match = url.match(/\/models\/([^:]+):generateContent$/u);
        attempts.push({
          provider: "gemini",
          model: decodeURIComponent(match?.[1] || ""),
        });
        return {
          ok: false,
          status: 400,
          json: async () => ({
            error: {
              code: 400,
              details: [{
                "@type": "type.googleapis.com/google.rpc.ErrorInfo",
                reason: "API_KEY_INVALID",
              }],
              message: "API key not valid. Please pass a valid API key.",
              status: "INVALID_ARGUMENT",
            },
          }),
        };
      }

      const request = JSON.parse(options.body);
      attempts.push({ provider: "groq", model: request.model });
      return groqNotebookResponse();
    },
  });

  const res = await harness.analyze();

  assert.equal(res.statusCode, 201);
  assert.deepEqual(attempts, [
    {
      provider: "gemini",
      model: DEFAULT_GEMINI_LEARNING_MODEL,
    },
    {
      provider: "groq",
      model: DEFAULT_GROQ_LEARNING_MODEL,
    },
  ]);
  assert.equal(harness.stored[0].model, DEFAULT_GROQ_LEARNING_MODEL);
  assert.equal(res.body.notebook.model, DEFAULT_GROQ_LEARNING_MODEL);
  assert.equal(harness.aiQuota.calls.reserve.length, 1);
  assert.equal(harness.aiQuota.calls.commit.length, 1);
  assert.equal(harness.aiQuota.calls.refund.length, 0);
});

test("tries every Gemini candidate before the second configured Groq model succeeds", async () => {
  const geminiModels = ["gemini-test-primary", "gemini-test-secondary"];
  const groqModels = ["groq-test-primary", "groq-test-secondary"];
  const attempts = [];
  const pdfBytes = Buffer.from("%PDF-1.7\nMulti-model fallback PDF\n%%EOF", "utf8");
  const harness = createLearningRouteHarness({
    geminiLearningModel: geminiModels[0],
    geminiLearningModels: geminiModels,
    groqLearningModel: groqModels[0],
    groqLearningModels: groqModels,
    fetchImpl: async (url, options) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        const match = url.match(/\/models\/([^:]+):generateContent$/u);
        const model = decodeURIComponent(match?.[1] || "");
        attempts.push({ provider: "gemini", model });
        return geminiNotebookResponse({ overview: "Incomplete" });
      }

      const request = JSON.parse(options.body);
      attempts.push({ provider: "groq", model: request.model });
      if (request.model === groqModels[0]) {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            error: {
              code: "model_unavailable",
              message: "The selected model is unavailable.",
            },
          }),
        };
      }
      return groqNotebookResponse();
    },
    prepareAttachmentContext: async ([attachment]) => {
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
      name: "multi-model-fallback.pdf",
      type: "application/pdf",
      size: pdfBytes.length,
      dataUrl: "data:application/pdf;base64," + pdfBytes.toString("base64"),
    }],
  });

  assert.equal(res.statusCode, 201);
  assert.deepEqual(attempts, [
    ...geminiModels.map((model) => ({ provider: "gemini", model })),
    ...groqModels.map((model) => ({ provider: "groq", model })),
  ]);
  assert.equal(harness.prepareCalls, 1);
  assert.equal(harness.stored[0].model, groqModels[1]);
  assert.equal(res.body.notebook.model, groqModels[1]);
  assert.equal(harness.aiQuota.calls.reserve.length, 1);
  assert.equal(harness.aiQuota.calls.commit.length, 1);
  assert.equal(harness.aiQuota.calls.refund.length, 0);
});

test("tries the next Groq model after a transport failure", async () => {
  const models = ["groq-transport-primary", "groq-transport-secondary"];
  const attempts = [];
  const harness = createLearningRouteHarness({
    geminiConfig: { available: false },
    groqLearningModel: models[0],
    groqLearningModels: models,
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      attempts.push(request.model);
      if (request.model === models[0]) throw new TypeError("network unavailable");
      return groqNotebookResponse();
    },
  });

  const res = await harness.analyze();

  assert.equal(res.statusCode, 201);
  assert.deepEqual(attempts, models);
  assert.equal(res.body.notebook.model, models[1]);
  assert.equal(harness.aiQuota.calls.reserve.length, 1);
  assert.equal(harness.aiQuota.calls.commit.length, 1);
  assert.equal(harness.aiQuota.calls.refund.length, 0);
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
  assert.equal(requestCount, DEFAULT_GEMINI_LEARNING_MODEL_CHAIN.length + 1);
  assert.equal(res.body.notebook.model, DEFAULT_GROQ_LEARNING_MODEL);
});

test("logs provider failures without leaking source or credential data", async () => {
  const warnings = [];
  const harness = createLearningRouteHarness({
    fetchImpl: async (url) => (
      url.includes("generativelanguage.googleapis.com")
        ? geminiNotebookResponse({ overview: "Incomplete" })
        : providerRateLimitResponse()
    ),
    logger: {
      warn(...args) {
        warnings.push(args);
      },
    },
  });

  const res = await harness.analyze({
    subjectName: "Operating Systems",
    chapterNames: ["Processes"],
  });

  assert.equal(res.statusCode, 429);
  assert.equal(res.body.code, "AI_PROVIDER_RATE_LIMITED");
  assert.deepEqual(
    warnings.map(([, details]) => ({
      model: details.model,
      provider: details.provider,
    })),
    [
      ...DEFAULT_GEMINI_LEARNING_MODEL_CHAIN.map((model) => ({ model, provider: "gemini" })),
      ...DEFAULT_GROQ_LEARNING_MODEL_CHAIN.map((model) => ({ model, provider: "groq" })),
    ],
  );
  warnings.forEach(([message, details], index) => {
    const isGemini = index < DEFAULT_GEMINI_LEARNING_MODEL_CHAIN.length;
    assert.equal(message, "[Learning notebook] provider request failed");
    assert.equal(details.code, isGemini
      ? "LEARNING_OUTPUT_INVALID"
      : "LEARNING_PROVIDER_RATE_LIMIT");
    assert.equal(details.status, isGemini ? 502 : 429);
    assert.ok(["primary", "secondary", "fallback"].includes(details.phase));
  });
  assert.doesNotMatch(
    JSON.stringify(warnings),
    /gemini-key|groq-key|Operating Systems|Processes/u,
  );
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

  assert.equal(fetchCalls, DEFAULT_GROQ_LEARNING_MODEL_CHAIN.length);
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
          row.provider === "gemini" ? DEFAULT_GEMINI_LEARNING_MODEL : DEFAULT_GROQ_LEARNING_MODEL,
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

function validMedicalTrainingAnalysis(topics = ["Fluid balance", "Tissue perfusion"]) {
  return {
    trainingTitle: "Conceptual clinical reasoning",
    overview: "Use fictional cases to compare mechanisms, evidence, uncertainty, and safety principles.",
    educationalNotice: MEDICAL_TRAINING_EDUCATIONAL_NOTICE,
    modules: topics.map((title, index) => ({
      id: `medical-module-${index + 1}`,
      title,
      conceptOverview: `${title} is explored through mechanism, evidence interpretation, and explicit uncertainty.`,
      whyItMatters: `${title} supports safe, structured conceptual reasoning within the learner's verified discipline.`,
      fictionalCase: {
        summary: `A fictional, non-identifying classroom scenario illustrates a pattern related to ${title}.`,
        learningObjective: `Compare conceptual explanations for the fictional ${title} pattern.`,
      },
      reasoningSteps: [
        {
          id: `medical-module-${index + 1}-reasoning-1`,
          prompt: "Identify the governing concepts and relevant variables.",
          explanation: "Start with mechanism and describe what the conceptual model predicts.",
        },
        {
          id: `medical-module-${index + 1}-reasoning-2`,
          prompt: "Compare the plausible educational hypotheses.",
          explanation: "Keep uncertainty visible and identify evidence that separates the options.",
        },
        {
          id: `medical-module-${index + 1}-reasoning-3`,
          prompt: "Reassess the model using the fictional evidence.",
          explanation: "Explain which findings strengthen or weaken each conceptual option.",
        },
      ],
      differentials: [{
        name: "Mechanism-based conceptual option",
        rationale: "The option follows from the modeled physiology in the fictional scenario.",
        distinguishingClues: ["A fictional trend", "A modeled relationship"],
      }],
      investigations: [{
        name: "Conceptual evidence check",
        rationale: "The check tests a prediction made by the educational model.",
        expectedPattern: "A fictional pattern that would support one option over another.",
      }],
      managementPrinciples: [
        "Compare monitoring, communication, and supervision principles at a high level.",
      ],
      redFlags: [
        "Recognize conceptual patterns that require qualified supervision and escalation.",
      ],
      vivaChecks: [
        {
          id: `medical-module-${index + 1}-viva-1`,
          question: `Which mechanism best explains the fictional ${title} pattern?`,
          guidance: "State the model, evidence, uncertainty, and a reasonable alternative.",
        },
        {
          id: `medical-module-${index + 1}-viva-2`,
          question: "Which new evidence would most change your reasoning?",
          guidance: "Choose discriminating evidence and explain its conceptual effect.",
        },
      ],
      practiceSteps: [
        "Draw the mechanism as a concept map.",
        "Compare two fictional hypotheses in an evidence table.",
        "Explain how one new fictional finding changes the reasoning.",
      ],
    })),
    trainingPlan: [
      {
        id: "medical-phase-1",
        title: "Mechanism foundations",
        description: "Build an accurate conceptual model before interpreting cases.",
        actions: ["Map the governing variables.", "Review key relationships."],
      },
      {
        id: "medical-phase-2",
        title: "Fictional case reasoning",
        description: "Compare alternatives while keeping uncertainty explicit.",
        actions: ["Create an evidence table.", "Identify discriminating clues."],
      },
      {
        id: "medical-phase-3",
        title: "Viva and reflection",
        description: "Practice concise explanations and reflect on safety boundaries.",
        actions: ["Complete the viva checks.", "Summarize the education-only boundary."],
      },
    ],
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
    async analyzeMedical(body = {}) {
      const req = {
        body: {
          privacyConsent: {
            accepted: true,
            kind: MEDICAL_TRAINING_PRIVACY_CONSENT_KIND,
            version: MEDICAL_TRAINING_PRIVACY_CONSENT_VERSION,
          },
          trainingFocus: "Conceptual clinical reasoning",
          topics: "Fluid balance, Tissue perfusion",
          ...body,
        },
        params: { id: "507f1f77bcf86cd799439011" },
        user: {
          _id: "user-1",
          academicLevel: "Medical / Health Sciences",
          academicTrack: "Medical & Health Sciences",
          degree: "MBBS",
          department: "Medicine",
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
      await routes.get("POST /api/learning-notebooks/:id/medical-training-analyze")(req, res);
      return res;
    },
    async patchNotebook(notebook = {}) {
      const req = {
        body: { notebook },
        params: { id: "507f1f77bcf86cd799439011" },
        user: {
          _id: "user-1",
          academicLevel: "Medical / Health Sciences",
          academicTrack: "Medical & Health Sciences",
          degree: "MBBS",
          department: "Medicine",
          ...user,
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
      await routes.get("PATCH /api/learning-notebooks/:id")(req, res);
      return res;
    },
  };
}

test("replays completed career analysis after current eligibility and before provider checks", async () => {
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

test("rejects a career-analysis replay when the current profile is no longer college-eligible", async () => {
  const aiQuota = createTestAiQuota({
    lookup: async () => ({
      state: "replay",
      eventId: "completed-career-event",
      cost: 5,
      quota: { ...TEST_QUOTA, used: 5, reserved: 0 },
      replayPayload: {
        notebook: { id: "507f1f77bcf86cd799439011" },
        topicAnalysis: { targetRole: "Backend intern", topics: [] },
      },
    }),
  });
  const harness = createCareerRouteHarness({
    aiQuota,
    user: { academicLevel: "Diploma / Vocational", degree: "Diploma", department: "IT" },
  });

  const res = await harness.analyze();

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "LEARNING_CAREER_NOT_ELIGIBLE");
  assert.equal(harness.dbCalls, 0);
  assert.equal(aiQuota.calls.lookup.length, 0);
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

test("uses Gemini structured output for career topics and returns a normalized transient draft", async () => {
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
    requests[0].body.generationConfig.responseJsonSchema.properties.topics.type,
    "array",
  );
  assert.match(
    requests[0].body.contents[0].parts[0].text,
    /Requested career topic data, in required output order: \["Arrays","Graphs"\]/u,
  );
  assert.match(
    requests[0].body.contents[0].parts[0].text,
    /implementation outline, time and space complexity, important edge cases/u,
  );
  assert.equal(harness.updates.length, 0);
  assert.equal(res.body.transient, true);
  assert.equal(res.body.notebook.careerPreparation.topicAnalysis.topics.length, 0);
  assert.equal(res.body.topicAnalysis.targetRole, "Backend engineering intern");
  assert.deepEqual(res.body.topicAnalysis.topics.map((topic) => topic.title), ["Arrays", "Graphs"]);
  assert.ok(res.body.topicAnalysis.topics[0].explanation.length > 20);
  assert.equal(res.body.topicAnalysis.preparationPlan.length, 1);
  assert.equal(res.body.providerModel, DEFAULT_GEMINI_LEARNING_MODEL);
  assert.equal(harness.aiQuota.calls.reserve.length, 1);
  assert.equal(harness.aiQuota.calls.reserve[0].feature, "career_analysis");
  assert.equal(harness.aiQuota.calls.commit.length, 1);
  assert.deepEqual(harness.aiQuota.calls.commit[0].replayPayload, res.body);
  assert.equal(harness.aiQuota.calls.commit[0].resultRef.type, "career_analysis_draft");
  assert.equal(harness.aiQuota.calls.refund.length, 0);
  assert.equal(res.headers["X-AI-Credit-Cost"], "5");
});

test("refunds without writing career data when transient quota commit fails", async () => {
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
  assert.equal(harness.updates.length, 0);
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
  assert.equal(harness.updates.length, 0);
});

test("rejects career analysis for non-college learner profiles before provider work", async () => {
  const ineligibleProfiles = [
    {
      academicLevel: "Class 10",
      academicTrack: "CBSE",
      degree: "",
      department: "",
    },
    {
      academicLevel: "Diploma / Vocational",
      academicTrack: "Diploma / Vocational",
      degree: "Diploma in Computer Engineering",
      department: "Computer Science",
    },
    {
      academicLevel: "Professional / Certification",
      academicTrack: "Professional Certification",
      degree: "PMP",
      department: "",
    },
    {
      academicLevel: "Medical / Health Sciences",
      academicTrack: "Medical & Health Sciences",
      degree: "MBBS",
      department: "Medicine",
    },
  ];

  for (const user of ineligibleProfiles) {
    let fetchCalls = 0;
    const harness = createCareerRouteHarness({
      fetchImpl: async () => {
        fetchCalls += 1;
        return geminiNotebookResponse(validCareerTopicAnalysis());
      },
      user,
    });

    const res = await harness.analyze();

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, "LEARNING_CAREER_NOT_ELIGIBLE");
    assert.equal(harness.dbCalls, 0);
    assert.equal(fetchCalls, 0);
  }
});

test("requires the dedicated Medical Training privacy acknowledgement before any AI work", async () => {
  const harness = createCareerRouteHarness();
  const res = await harness.analyzeMedical({
    privacyConsent: {
      accepted: true,
      version: LEARNING_PRIVACY_CONSENT_VERSION,
    },
  });

  assert.equal(res.statusCode, 428);
  assert.equal(res.body.code, "LEARNING_PRIVACY_CONSENT_REQUIRED");
  assert.equal(res.body.consentKind, MEDICAL_TRAINING_PRIVACY_CONSENT_KIND);
  assert.equal(res.body.consentVersion, MEDICAL_TRAINING_PRIVACY_CONSENT_VERSION);
  assert.equal(harness.dbCalls, 0);
  assert.equal(harness.aiQuota.calls.lookup.length, 0);
  assert.equal(harness.aiQuota.calls.reserve.length, 0);
});

test("uses discipline-aware Gemini output for a transient medical training draft without persistence", async () => {
  const requests = [];
  const harness = createCareerRouteHarness({
    user: {
      academicLevel: "Medical / Health Sciences",
      academicTrack: "Medical & Health Sciences",
      degree: "B.Sc Nursing",
      department: "Nursing",
    },
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return geminiNotebookResponse(
        validMedicalTrainingAnalysis(["Fluid balance", "Tissue perfusion"]),
      );
    },
  });

  const res = await harness.analyzeMedical({
    trainingFocus: "Nursing assessment reasoning",
    topics: "Fluid balance, Tissue perfusion",
  });

  assert.equal(res.statusCode, 200);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /generativelanguage\.googleapis\.com/u);
  assert.equal(
    requests[0].body.generationConfig.responseJsonSchema.properties.educationalNotice.type,
    "string",
  );
  assert.match(
    requests[0].body.contents[0].parts[0].text,
    /Authoritative discipline mode: "nursing" \("Nursing"\)/u,
  );
  assert.match(
    requests[0].body.contents[0].parts[0].text,
    /Never assume physician diagnosis or prescribing scope/u,
  );
  assert.equal(harness.updates.length, 0);
  assert.equal(res.body.transient, true);
  assert.equal(res.body.trainingKind, "medical");
  assert.equal(res.body.medicalTraining.educationalNotice, MEDICAL_TRAINING_EDUCATIONAL_NOTICE);
  assert.deepEqual(
    res.body.medicalTraining.modules.map((module) => module.title),
    ["Fluid balance", "Tissue perfusion"],
  );
  assert.equal(res.body.notebook.medicalTraining.topicAnalysis.modules.length, 0);
  assert.equal(harness.aiQuota.calls.lookup.length, 1);
  assert.equal(harness.aiQuota.calls.reserve.length, 1);
  assert.equal(harness.aiQuota.calls.reserve[0].feature, "career_analysis");
  assert.equal(harness.aiQuota.calls.commit.length, 1);
  assert.deepEqual(harness.aiQuota.calls.commit[0].replayPayload, res.body);
  assert.equal(harness.aiQuota.calls.commit[0].resultRef.type, "medical_training_draft");
  assert.equal(harness.aiQuota.calls.refund.length, 0);
  assert.equal(res.headers["X-AI-Credit-Cost"], "5");
});

test("accepts explicitly inapplicable management and safety arrays without inventing care guidance", async () => {
  const nonClinical = validMedicalTrainingAnalysis(["Biostatistical bias", "Population sampling"]);
  nonClinical.modules.forEach((module) => {
    module.managementPrinciples = [];
    module.redFlags = [];
  });
  const harness = createCareerRouteHarness({
    fetchImpl: async () => geminiNotebookResponse(nonClinical),
    user: {
      academicLevel: "Postgraduate / Master's",
      academicTrack: "Medical & Health Sciences",
      degree: "MPH",
      department: "Public Health",
    },
  });

  const res = await harness.analyzeMedical({
    trainingFocus: "Public-health reasoning",
    topics: "Biostatistical bias, Population sampling",
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.medicalTraining.modules[0].managementPrinciples.length, 0);
  assert.equal(res.body.medicalTraining.modules[0].redFlags.length, 0);
  assert.equal(harness.aiQuota.calls.commit.length, 1);
  assert.equal(harness.aiQuota.calls.refund.length, 0);
});

test("rejects nonmedical profiles and personal medical advice before quota, database, or provider work", async () => {
  let nonmedicalFetchCalls = 0;
  const nonmedical = createCareerRouteHarness({
    user: {
      academicLevel: "Undergraduate / Bachelor's",
      academicTrack: "Engineering & Technology",
      degree: "B.Tech",
      department: "Computer Science",
    },
    fetchImpl: async () => {
      nonmedicalFetchCalls += 1;
      return geminiNotebookResponse(validMedicalTrainingAnalysis());
    },
  });

  const nonmedicalRes = await nonmedical.analyzeMedical();

  assert.equal(nonmedicalRes.statusCode, 403);
  assert.equal(nonmedicalRes.body.code, "LEARNING_MEDICAL_TRAINING_NOT_ELIGIBLE");
  assert.equal(nonmedical.dbCalls, 0);
  assert.equal(nonmedicalFetchCalls, 0);
  assert.equal(nonmedical.aiQuota.calls.lookup.length, 0);
  assert.equal(nonmedical.aiQuota.calls.reserve.length, 0);

  let adviceFetchCalls = 0;
  const personalAdvice = createCareerRouteHarness({
    fetchImpl: async () => {
      adviceFetchCalls += 1;
      return geminiNotebookResponse(validMedicalTrainingAnalysis(["Cardiovascular physiology"]));
    },
  });

  const adviceRes = await personalAdvice.analyzeMedical({
    trainingFocus: "What should I take for my chest pain?",
    topics: "Cardiovascular physiology",
  });

  assert.equal(adviceRes.statusCode, 400);
  assert.equal(adviceRes.body.code, "LEARNING_MEDICAL_PERSONAL_ADVICE_NOT_ALLOWED");
  assert.equal(personalAdvice.dbCalls, 0);
  assert.equal(adviceFetchCalls, 0);
  assert.equal(personalAdvice.aiQuota.calls.lookup.length, 0);
  assert.equal(personalAdvice.aiQuota.calls.reserve.length, 0);

  const patientIdentifier = createCareerRouteHarness({
    fetchImpl: async () => {
      adviceFetchCalls += 1;
      return geminiNotebookResponse(validMedicalTrainingAnalysis(["Cardiovascular physiology"]));
    },
  });
  for (const topics of [
    "Patient name: Example Person; MRN: 12345; chest pain",
    "Patient name is Example Person",
    "MRN ABC123",
    "Date of birth is 12 May 2000",
  ]) {
    const identifierRes = await patientIdentifier.analyzeMedical({ topics });
    assert.equal(identifierRes.statusCode, 400);
    assert.equal(identifierRes.body.code, "LEARNING_MEDICAL_PERSONAL_ADVICE_NOT_ALLOWED");
  }
  assert.equal(patientIdentifier.dbCalls, 0);
  assert.equal(patientIdentifier.aiQuota.calls.lookup.length, 0);
  assert.equal(patientIdentifier.aiQuota.calls.reserve.length, 0);
  assert.equal(adviceFetchCalls, 0);
});

test("rejects unsafe client-supplied Medical training before notebook persistence", async () => {
  const unsafe = validMedicalTrainingAnalysis(["Fluid balance"]);
  unsafe.modules[0].managementPrinciples = ["Start aspirin immediately."];
  const harness = createCareerRouteHarness();

  const res = await harness.patchNotebook({
    medicalTraining: {
      enabled: true,
      topicAnalysis: unsafe,
    },
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "LEARNING_MEDICAL_TRAINING_UNSAFE");
  assert.equal(harness.updates.length, 0);

  const legacyHarness = createCareerRouteHarness();
  const legacyRes = await legacyHarness.patchNotebook({
    careerPreparation: {
      topicAnalysis: {
        targetRole: "Legacy clinical preparation",
        overview: "Legacy content.",
        topics: [{
          id: "legacy-topic",
          title: "Tissue perfusion",
          explanation: "Start aspirin immediately.",
          interviewQuestions: [],
          practiceSteps: [],
        }],
        preparationPlan: [],
      },
    },
  });

  assert.equal(legacyRes.statusCode, 400);
  assert.equal(legacyRes.body.code, "LEARNING_MEDICAL_TRAINING_UNSAFE");
  assert.equal(legacyHarness.updates.length, 0);
});

test("rejects unsafe medical model output and refunds its reserved credits", async () => {
  const unsafe = validMedicalTrainingAnalysis(["Fluid balance", "Tissue perfusion"]);
  unsafe.modules[0].managementPrinciples = ["Give 50 mg aspirin immediately."];
  let fetchCalls = 0;
  const harness = createCareerRouteHarness({
    groqConfig: { available: false, message: "Groq unavailable." },
    fetchImpl: async () => {
      fetchCalls += 1;
      return geminiNotebookResponse(unsafe);
    },
  });

  const res = await harness.analyzeMedical();

  assert.equal(res.statusCode, 502);
  assert.equal(res.body.code, "LEARNING_OUTPUT_INVALID");
  assert.equal(res.body.creditsRefunded, true);
  assert.match(res.body.error, /credits were refunded/iu);
  assert.equal(fetchCalls, 1);
  assert.equal(harness.updates.length, 0);
  assert.equal(harness.aiQuota.calls.reserve.length, 1);
  assert.equal(harness.aiQuota.calls.commit.length, 0);
  assert.equal(harness.aiQuota.calls.refund.length, 1);
  assert.equal(harness.aiQuota.calls.refund[0].reservationToken, "reservation-1");
});

test("rejects a no-dose treatment recommendation from medical training output", async () => {
  const unsafe = validMedicalTrainingAnalysis(["Fluid balance", "Tissue perfusion"]);
  unsafe.modules[0].managementPrinciples = ["Recommended treatment: aspirin."];
  const harness = createCareerRouteHarness({
    groqConfig: { available: false, message: "Groq unavailable." },
    fetchImpl: async () => geminiNotebookResponse(unsafe),
  });

  const res = await harness.analyzeMedical();

  assert.equal(res.statusCode, 502);
  assert.equal(res.body.code, "LEARNING_OUTPUT_INVALID");
  assert.equal(res.body.creditsRefunded, true);
  assert.equal(harness.updates.length, 0);
  assert.equal(harness.aiQuota.calls.commit.length, 0);
  assert.equal(harness.aiQuota.calls.refund.length, 1);
});

test("rejects identifying medical training output before commit and refunds credits", async () => {
  const unsafe = validMedicalTrainingAnalysis(["Fluid balance", "Tissue perfusion"]);
  unsafe.modules[0].fictionalCase.summary = "Patient name: Example Person; MRN: 12345.";
  const harness = createCareerRouteHarness({
    groqConfig: { available: false, message: "Groq unavailable." },
    fetchImpl: async () => geminiNotebookResponse(unsafe),
  });

  const res = await harness.analyzeMedical();

  assert.equal(res.statusCode, 502);
  assert.equal(res.body.code, "LEARNING_OUTPUT_INVALID");
  assert.equal(res.body.creditsRefunded, true);
  assert.equal(harness.updates.length, 0);
  assert.equal(harness.aiQuota.calls.commit.length, 0);
  assert.equal(harness.aiQuota.calls.refund.length, 1);
});

test("rejects newline diagnosis headings after structured JSON parsing and refunds credits", async () => {
  const unsafe = validMedicalTrainingAnalysis(["Fluid balance", "Tissue perfusion"]);
  unsafe.modules[0].conceptOverview = "### Final diagnosis\nMyocardial infarction.";
  const harness = createCareerRouteHarness({
    groqConfig: { available: false, message: "Groq unavailable." },
    fetchImpl: async () => geminiNotebookResponse(unsafe),
  });

  const res = await harness.analyzeMedical();

  assert.equal(res.statusCode, 502);
  assert.equal(res.body.code, "LEARNING_OUTPUT_INVALID");
  assert.equal(res.body.creditsRefunded, true);
  assert.equal(harness.updates.length, 0);
  assert.equal(harness.aiQuota.calls.commit.length, 0);
  assert.equal(harness.aiQuota.calls.refund.length, 1);
});

test("rejects empty core medical teaching content before commit and refunds credits", async () => {
  const incomplete = validMedicalTrainingAnalysis(["Fluid balance", "Tissue perfusion"]);
  incomplete.modules[0].reasoningSteps[0].explanation = " ";
  incomplete.trainingPlan[0].actions = [];
  const harness = createCareerRouteHarness({
    groqConfig: { available: false, message: "Groq unavailable." },
    fetchImpl: async () => geminiNotebookResponse(incomplete),
  });

  const res = await harness.analyzeMedical();

  assert.equal(res.statusCode, 502);
  assert.equal(res.body.code, "LEARNING_OUTPUT_INVALID");
  assert.equal(res.body.creditsRefunded, true);
  assert.equal(harness.updates.length, 0);
  assert.equal(harness.aiQuota.calls.commit.length, 0);
  assert.equal(harness.aiQuota.calls.refund.length, 1);
});

test("rejects replaying a placement-analysis idempotency result through medical training", async () => {
  let fetchCalls = 0;
  const aiQuota = createTestAiQuota({
    lookup: async () => ({
      state: "replay",
      eventId: "completed-placement-event",
      cost: 5,
      quota: { ...TEST_QUOTA, used: 5, reserved: 0 },
      replayPayload: {
        notebook: { id: "507f1f77bcf86cd799439011" },
        topicAnalysis: validCareerTopicAnalysis(["Arrays", "Graphs"]),
        providerModel: "saved-model",
        transient: true,
      },
    }),
  });
  const harness = createCareerRouteHarness({
    aiQuota,
    geminiConfig: { available: false, message: "Gemini unavailable." },
    groqConfig: { available: false, message: "Groq unavailable." },
    fetchImpl: async () => {
      fetchCalls += 1;
      return geminiNotebookResponse(validMedicalTrainingAnalysis());
    },
  });

  const res = await harness.analyzeMedical();

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "AI_IDEMPOTENCY_KEY_CONFLICT");
  assert.equal(fetchCalls, 0);
  assert.equal(harness.dbCalls, 1);
  assert.equal(aiQuota.calls.lookup.length, 1);
  assert.equal(aiQuota.calls.reserve.length, 0);
  assert.equal(aiQuota.calls.commit.length, 0);
  assert.equal(aiQuota.calls.refund.length, 0);
});

test("refunds without persisting a medical draft when transient quota commit fails", async () => {
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
    fetchImpl: async () => geminiNotebookResponse(validMedicalTrainingAnalysis()),
  });

  const res = await harness.analyzeMedical();

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, "AI_QUOTA_UNAVAILABLE");
  assert.equal(res.body.creditsRefunded, true);
  assert.equal(harness.updates.length, 0);
  assert.equal(aiQuota.calls.commit.length, 1);
  assert.equal(aiQuota.calls.commit[0].reservationToken, "reservation-1");
  assert.equal(aiQuota.calls.refund.length, 1);
  assert.equal(aiQuota.calls.refund[0].reservationToken, "reservation-1");
});
