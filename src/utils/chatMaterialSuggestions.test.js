import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChatMaterialSuggestions,
  isMaterialSuggestionRequest,
  normalizeChatMaterialSuggestions,
} from "./chatMaterialSuggestions.js";

const subjects = [
  { name: "Data Analytics", chapters: 2 },
  { name: "React", chapters: 4 },
];

const metrics = {
  weakSubject: "Data Analytics",
  subjectStats: {
    "Data Analytics": { done: 1, pending: 1, total: 2 },
    React: { done: 2, pending: 2, total: 4 },
  },
};

test("detects common material suggestion requests", () => {
  [
    "Suggest study materials for DBMS",
    "Can you recommend a good React course?",
    "Show me React materials",
    "I need practice questions for calculus",
    "Where can I learn cache memory?",
    "Find notes on operating systems",
    "Recommend DBMS materials",
    "Java materials for beginners",
    "I want DBMS notes",
  ].forEach((message) => {
    assert.equal(isMaterialSuggestionRequest(message), true, message);
  });
});

test("does not confuse navigation-only or non-recommendation messages with suggestions", () => {
  [
    "Open materials page",
    "Go to the resources page",
    "Please navigate to materials",
    "Take me to the materials hub",
    "Show me the resources library",
    "Summarize this study material",
    "Explain resource allocation",
    "Suggest how I should revise tonight",
    "I want help understanding my notes",
    "Can you show me materials page?",
    "I want to open materials page",
    "Show materials page for me",
  ].forEach((message) => {
    assert.equal(isMaterialSuggestionRequest(message), false, message);
  });
});

test("explicitly named configured subject takes priority over weak subject", () => {
  const suggestions = buildChatMaterialSuggestions({
    message: "Recommend React materials",
    subjects,
    metrics,
    academicLevel: "Undergraduate / Bachelor's",
    academicTrack: "Engineering & Technology",
  });

  assert.equal(suggestions.length, 4);
  assert.deepEqual([...new Set(suggestions.map((item) => item.subject))], ["React"]);
  assert.ok(suggestions.every((item) => item.academicLevel === "Undergraduate / Bachelor's"));
  assert.ok(suggestions.every((item) => item.academicTrack === "Engineering & Technology"));
});

test("matches configured parenthetical aliases and generated acronyms", () => {
  const aliasedSubjects = [
    { name: "Web Development Frameworks(React)", chapters: 4 },
    { name: "Cloud Management (AWS)", chapters: 3 },
    { name: "Data Structures and Algorithms", chapters: 5 },
  ];
  const scenarios = [
    ["React materials", "Web Development Frameworks(React)"],
    ["AWS resources", "Cloud Management (AWS)"],
    ["Recommend DSA materials", "Data Structures and Algorithms"],
  ];

  scenarios.forEach(([message, subject]) => {
    const suggestions = buildChatMaterialSuggestions({
      message,
      subjects: aliasedSubjects,
      metrics: { weakSubject: "Cloud Management (AWS)", subjectStats: {} },
    });
    assert.equal(suggestions.length, 4, message);
    assert.ok(suggestions.every((item) => item.subject === subject), message);
  });
});

test("weak subject is selected when no configured subject is named", () => {
  const suggestions = buildChatMaterialSuggestions({
    message: "Suggest some useful study resources",
    subjects,
    metrics,
  });

  assert.equal(suggestions.length, 4);
  assert.ok(suggestions.every((item) => item.subject === "Data Analytics"));
  const decodedUrls = suggestions.map((item) => decodeURIComponent(item.href));
  assert.ok(decodedUrls.every((href) => href.includes("chapter+2") || href.includes("chapter 2")));
});

test("first configured subject is selected when there is no explicit or weak subject", () => {
  const suggestions = buildChatMaterialSuggestions({
    message: "Recommend useful materials",
    subjects,
    metrics: { weakSubject: "Unknown subject", subjectStats: {} },
  });

  assert.ok(suggestions.length > 0);
  assert.ok(suggestions.every((item) => item.subject === "Data Analytics"));
});

test("extracts requested topics without choosing audience or timing qualifiers", () => {
  const scenarios = [
    ["Recommend DBMS materials", "DBMS"],
    ["Find notes on DBMS for tomorrow", "DBMS"],
    ["Recommend resources about operating systems for my exam", "operating systems"],
    ["Java materials for beginners", "Java"],
    ["Suggest resources for me about compiler design", "compiler design"],
    ["Suggest materials for quantum computing", "quantum computing"],
    ["Where can I learn cache memory?", "cache memory"],
  ];

  scenarios.forEach(([message, subject]) => {
    const suggestions = buildChatMaterialSuggestions({ message, subjects: [], metrics: {} });
    assert.equal(suggestions.length, 4, message);
    assert.ok(suggestions.every((item) => item.subject === subject), message);
  });
});

test("returns four safe General study cards for a generic request without subjects", () => {
  const suggestions = buildChatMaterialSuggestions({
    message: "Suggest any materials",
    subjects: [],
    metrics: {},
  });

  assert.equal(suggestions.length, 4);
  assert.ok(suggestions.every((item) => item.subject === "General study"));
  suggestions.forEach((suggestion) => {
    const url = new URL(suggestion.href);
    assert.equal(url.protocol, "https:");
    assert.ok(["www.google.com", "www.youtube.com"].includes(url.hostname));
  });
});

test("builds only allowlisted HTTPS Google and YouTube result URLs", () => {
  const suggestions = buildChatMaterialSuggestions({
    message: "Show me React materials",
    subjects,
    metrics,
  });

  assert.equal(suggestions.length, 4);
  suggestions.forEach((suggestion) => {
    const url = new URL(suggestion.href);
    assert.equal(url.protocol, "https:");
    assert.ok(["www.google.com", "www.youtube.com"].includes(url.hostname));
    assert.ok(["/search", "/results"].includes(url.pathname));
  });
});

test("normalizer rejects unsafe or non-result URLs", () => {
  const normalized = normalizeChatMaterialSuggestions([
    {
      subject: "Security",
      title: "Script",
      provider: "Unknown",
      description: "Unsafe URL",
      href: "javascript:alert(1)",
    },
    {
      subject: "Security",
      title: "Foreign host",
      provider: "Unknown",
      description: "Untrusted host",
      href: "https://example.com/search?q=security",
    },
    {
      subject: "Security",
      title: "Google redirect",
      provider: "Unknown",
      description: "Wrong path",
      href: "https://www.google.com/url?q=https://example.com",
    },
    {
      subject: "Security",
      title: "YouTube video",
      provider: "YouTube",
      description: "Direct videos are not generated result URLs",
      href: "https://www.youtube.com/watch?v=abc",
    },
    {
      subject: "Security",
      title: "Valid notes",
      provider: "Web notes",
      description: "A safe result page",
      href: "https://www.google.com/search?q=security+notes",
    },
  ]);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].title, "Valid notes");
});

test("normalizer accepts wrapped arrays, bounds text, deduplicates, and limits to four", () => {
  const longText = `  ${"x".repeat(400)}\u0000  `;
  const materials = Array.from({ length: 7 }, (_, index) => ({
    academicLevel: longText,
    academicTrack: longText,
    description: longText,
    href: `https://www.google.com/search?q=topic+${index}`,
    provider: longText,
    subject: longText,
    title: `${longText}${index}`,
  }));
  materials.splice(1, 0, { ...materials[0], title: "Duplicate URL" });

  const normalized = normalizeChatMaterialSuggestions({ materials });

  assert.equal(normalized.length, 4);
  assert.equal(new Set(normalized.map((item) => item.href)).size, 4);
  normalized.forEach((item) => {
    assert.ok(item.academicLevel.length <= 80);
    assert.ok(item.academicTrack.length <= 120);
    assert.ok(item.description.length <= 240);
    assert.ok(item.provider.length <= 60);
    assert.ok(item.subject.length <= 100);
    assert.ok(item.title.length <= 120);
    assert.equal(JSON.stringify(item).includes("\u0000"), false);
  });
});

test("normalizer supplies safe text defaults and drops blank titles", () => {
  const normalized = normalizeChatMaterialSuggestions([
    {
      title: "",
      href: "https://www.google.com/search?q=blank",
    },
    {
      title: "Focused tutorial",
      href: "https://www.youtube.com/results?search_query=focused+tutorial",
    },
  ]);

  assert.deepEqual(normalized, [
    {
      subject: "General study",
      title: "Focused tutorial",
      provider: "YouTube",
      description: "",
      href: "https://www.youtube.com/results?search_query=focused+tutorial",
    },
  ]);
});

test("does not build cards for an unrelated chat request", () => {
  const suggestions = buildChatMaterialSuggestions({
    message: "Explain cache memory in simple terms",
    subjects,
    metrics,
  });

  assert.deepEqual(suggestions, []);
});

test("explicit ad-hoc topic takes priority over planner subject fallbacks", () => {
  const suggestions = buildChatMaterialSuggestions({
    message: "Recommend resources about operating systems",
    subjects,
    metrics,
  });

  assert.ok(suggestions.every((item) => item.subject === "operating systems"));
});
