import {
  normalizeResumeBuilderState,
  normalizeResumeDraft,
  normalizeResumeLayout,
} from "./resumeBuilder.js";

export const MAX_RESUME_HISTORY_ENTRIES = 30;

const EDITING_OPTIONS = Object.freeze({ mode: "editing" });

function cleanLine(value, max = 160) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanIso(value, fallback = "") {
  const date = new Date(value);
  if (Number.isFinite(date.getTime())) return date.toISOString();
  if (!fallback) return "";
  const fallbackDate = new Date(fallback);
  return Number.isFinite(fallbackDate.getTime()) ? fallbackDate.toISOString() : "";
}

export function normalizeResumeHistoryEntry(value, options = {}) {
  const source = value && typeof value === "object" ? value : {};
  const draft = normalizeResumeDraft(
    source.draft ?? source.resume?.draft ?? source.resumeDraft,
  );
  const generatedAt = cleanIso(source.generatedAt ?? source.createdAt, options.now);
  const updatedAt = cleanIso(source.updatedAt, generatedAt || options.now);

  return {
    id: cleanLine(source.id ?? source._id ?? options.fallbackId, 100),
    name: cleanLine(draft.personal.fullName, 120)
      || cleanLine(source.name, 120)
      || "Untitled resume",
    headline: cleanLine(source.headline ?? draft.personal.headline, 140),
    draft,
    layout: normalizeResumeLayout(source.layout ?? source.resume?.layout),
    generatedAt,
    updatedAt,
    sourceGenerationId: cleanLine(source.sourceGenerationId ?? source.generationId, 100),
    requestId: cleanLine(source.requestId, 100),
  };
}

export function normalizeResumeHistory(value, options = {}) {
  const rows = Array.isArray(value) ? value : [];
  const seen = new Set();

  return rows
    .map((entry, index) => normalizeResumeHistoryEntry(entry, {
      ...options,
      fallbackId: `resume-history-${index + 1}`,
    }))
    .filter((entry) => {
      if (!entry.id || seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .sort((left, right) => (
      (right.updatedAt || right.generatedAt || "")
        .localeCompare(left.updatedAt || left.generatedAt || "")
    ))
    .slice(0, MAX_RESUME_HISTORY_ENTRIES);
}

export function createResumeHistorySnapshot({
  draft,
  layout,
  generatedAt,
  now = new Date().toISOString(),
  requestId = "",
  sourceGenerationId = "",
} = {}) {
  const normalizedDraft = normalizeResumeDraft(draft);
  const timestamp = cleanIso(generatedAt, now) || new Date().toISOString();
  return {
    name: cleanLine(normalizedDraft.personal.fullName, 120) || "Untitled resume",
    draft: normalizedDraft,
    layout: normalizeResumeLayout(layout),
    generatedAt: timestamp,
    updatedAt: timestamp,
    sourceGenerationId: cleanLine(sourceGenerationId, 100),
    requestId: cleanLine(requestId, 100),
  };
}

export function filterResumeHistory(value, query = "") {
  const rows = normalizeResumeHistory(value);
  const needle = cleanLine(query, 120).toLocaleLowerCase();
  if (!needle) return rows;

  return rows.filter((entry) => [
    entry.name,
    entry.headline,
    entry.draft.personal.email,
  ].some((field) => String(field || "").toLocaleLowerCase().includes(needle)));
}

export function reconcileResumeHistorySearch(search, hasHistory) {
  return hasHistory ? search : "";
}

export function loadResumeHistoryEntry(entry, currentBuilder, options = {}) {
  const normalizedEntry = normalizeResumeHistoryEntry(entry, { now: options.now });
  const normalizationNow = new Date(options.now).getTime();
  const current = normalizeResumeBuilderState(
    currentBuilder,
    options.profile || {},
    Number.isFinite(normalizationNow)
      ? { ...EDITING_OPTIONS, now: normalizationNow }
      : EDITING_OPTIONS,
  );
  return {
    ...current,
    draft: normalizeResumeDraft(normalizedEntry.draft, {}, EDITING_OPTIONS),
    layout: normalizeResumeLayout(normalizedEntry.layout),
    updatedAt: cleanIso(options.now, new Date().toISOString()),
  };
}
