import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_RESUME_HISTORY_ENTRIES,
  createResumeHistorySnapshot,
  filterResumeHistory,
  loadResumeHistoryEntry,
  normalizeResumeHistory,
  normalizeResumeHistoryEntry,
} from "./resumeHistory.js";

const draft = (fullName, headline = "Engineer") => ({
  personal: {
    fullName,
    headline,
    email: `${fullName.toLowerCase().replaceAll(" ", ".")}@example.com`,
  },
  summary: "Builds reliable products.",
  skills: ["JavaScript"],
  tools: ["VS Code", "GitHub"],
  education: [{ institution: "Example University" }],
});

test("normalizes a history entry and derives its name from the resume", () => {
  const entry = normalizeResumeHistoryEntry({
    id: "history-1",
    name: "Spoofed title",
    draft: draft("Asha Raman"),
    headline: "Backend summary headline",
    layout: { template: "classic", accent: "#5b7cfa", fontFamily: "lora" },
    generatedAt: "2026-08-08T10:00:00.000Z",
  });

  assert.equal(entry.id, "history-1");
  assert.equal(entry.name, "Asha Raman");
  assert.equal(entry.layout.template, "classic");
  assert.equal(entry.layout.fontFamily, "lora");
  assert.equal(entry.generatedAt, "2026-08-08T10:00:00.000Z");
  assert.equal(entry.headline, "Backend summary headline");
  assert.deepEqual(entry.draft.tools, ["VS Code", "GitHub"]);
});

test("sorts, deduplicates, caps, and searches resume history", () => {
  const meeraIndex = MAX_RESUME_HISTORY_ENTRIES + 2;
  const entries = Array.from({ length: MAX_RESUME_HISTORY_ENTRIES + 3 }, (_, index) => ({
    id: `history-${index}`,
    draft: draft(index === meeraIndex ? "Meera Shah" : `Person ${index}`, index === meeraIndex ? "Data Analyst" : "Engineer"),
    updatedAt: new Date(Date.UTC(2026, 7, 1, 0, index)).toISOString(),
  }));
  entries.push({ ...entries[meeraIndex], updatedAt: "2020-01-01T00:00:00.000Z" });

  const normalized = normalizeResumeHistory(entries);
  assert.equal(normalized.length, MAX_RESUME_HISTORY_ENTRIES);
  assert.equal(normalized[0].id, `history-${MAX_RESUME_HISTORY_ENTRIES + 2}`);
  assert.equal(normalized.filter((entry) => entry.id === `history-${meeraIndex}`).length, 1);
  assert.deepEqual(filterResumeHistory(entries, "data analyst").map((entry) => entry.name), ["Meera Shah"]);
  assert.deepEqual(filterResumeHistory(entries, "meera").map((entry) => entry.name), ["Meera Shah"]);
  assert.deepEqual(filterResumeHistory([{
    id: "summary-only",
    name: "Nia Thomas",
    headline: "Platform Architect",
  }], "platform architect").map((entry) => entry.name), ["Nia Thomas"]);
});

test("creates immutable generation snapshots with stable source metadata", () => {
  const snapshot = createResumeHistorySnapshot({
    draft: draft("Irfan Ali"),
    layout: { template: "compact", fontFamily: "poppins" },
    generatedAt: "2026-08-08T12:00:00.000Z",
    requestId: "request-1",
    sourceGenerationId: "generation-1",
  });

  assert.equal(snapshot.name, "Irfan Ali");
  assert.equal(snapshot.layout.template, "compact");
  assert.equal(snapshot.layout.fontFamily, "poppins");
  assert.equal(snapshot.requestId, "request-1");
  assert.equal(snapshot.sourceGenerationId, "generation-1");
});

test("loads a history snapshot into the editor without changing quota metadata", () => {
  const current = {
    draft: draft("Current User"),
    layout: { template: "modern" },
    generationTimestamps: ["2026-08-08T09:00:00.000Z"],
    lastGeneratedAt: "2026-08-08T09:00:00.000Z",
  };
  const loaded = loadResumeHistoryEntry({
    id: "history-2",
    draft: draft("Saved User"),
    layout: { template: "classic", fontFamily: "merriweather" },
  }, current, { now: "2026-08-08T13:00:00.000Z" });

  assert.equal(loaded.draft.personal.fullName, "Saved User");
  assert.deepEqual(loaded.draft.tools, ["VS Code", "GitHub"]);
  assert.equal(loaded.layout.template, "classic");
  assert.equal(loaded.layout.fontFamily, "merriweather");
  assert.deepEqual(loaded.generationTimestamps, current.generationTimestamps);
  assert.equal(loaded.lastGeneratedAt, current.lastGeneratedAt);
});
