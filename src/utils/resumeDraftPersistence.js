import { academicProfileStorageKey } from "./academicProfileScope.js";
import {
  normalizeResumeBuilderState,
  normalizeResumeDraft,
  normalizeResumeLayout,
} from "./resumeBuilder.js";

export const RESUME_DRAFT_CHECKPOINT_VERSION = 1;
export const RESUME_DRAFT_STORAGE_KIND = "resume-draft-v1";

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isRecord = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));

function defaultStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function resolveStorage(options) {
  return hasOwn(options, "storage") ? options.storage : defaultStorage();
}

function validTimestamp(value) {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) {
    return null;
  }
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isoTimestamp(value, fallback = null) {
  const timestamp = validTimestamp(value);
  return timestamp === null ? fallback : new Date(timestamp).toISOString();
}

function normalizeCheckpoint(value, profile = {}) {
  if (
    !isRecord(value)
    || value.version !== RESUME_DRAFT_CHECKPOINT_VERSION
    || !isRecord(value.draft)
    || !isRecord(value.layout)
  ) {
    return null;
  }

  const updatedAt = isoTimestamp(value.updatedAt);
  if (!updatedAt) return null;

  return {
    version: RESUME_DRAFT_CHECKPOINT_VERSION,
    savedAt: isoTimestamp(value.savedAt, updatedAt),
    updatedAt,
    draft: normalizeResumeDraft(value.draft, profile, { mode: "editing" }),
    layout: normalizeResumeLayout(value.layout),
  };
}

export function getResumeDraftStorageKey(academicProfileDataId) {
  return academicProfileStorageKey(academicProfileDataId, RESUME_DRAFT_STORAGE_KIND);
}

export function createResumeDraftCheckpoint(resumeBuilder, options = {}) {
  const now = isoTimestamp(options.now, new Date().toISOString());
  const normalized = normalizeResumeBuilderState(
    resumeBuilder,
    options.profile || {},
    { mode: "editing", now: validTimestamp(now) ?? Date.now() },
  );
  const updatedAt = isoTimestamp(normalized.updatedAt, now);

  return {
    version: RESUME_DRAFT_CHECKPOINT_VERSION,
    savedAt: now,
    updatedAt,
    draft: normalized.draft,
    layout: normalized.layout,
  };
}

/** Writes only editable draft/layout data; generation quota remains server-owned. */
export function writeResumeDraftCheckpoint(
  academicProfileDataId,
  resumeBuilder,
  options = {},
) {
  const key = getResumeDraftStorageKey(academicProfileDataId);
  const storage = resolveStorage(options);
  if (!key || !storage?.setItem) return null;

  const checkpoint = createResumeDraftCheckpoint(resumeBuilder, options);
  try {
    storage.setItem(key, JSON.stringify(checkpoint));
    return checkpoint;
  } catch {
    return null;
  }
}

export function readResumeDraftCheckpoint(academicProfileDataId, options = {}) {
  const key = getResumeDraftStorageKey(academicProfileDataId);
  const storage = resolveStorage(options);
  if (!key || !storage?.getItem) return null;

  let raw;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  const checkpoint = normalizeCheckpoint(parsed, options.profile || {});
  if (checkpoint) return checkpoint;

  try {
    storage.removeItem?.(key);
  } catch {
    // A broken storage implementation should not block the editor.
  }
  return null;
}

/**
 * Restores a newer local draft while retaining server-authoritative generation
 * timestamps and last-generation metadata.
 */
export function reconcileResumeDraftCheckpoint(
  workspaceResumeBuilder,
  checkpoint,
  options = {},
) {
  const profile = options.profile || {};
  const workspace = normalizeResumeBuilderState(
    workspaceResumeBuilder,
    profile,
    { mode: "editing", now: options.now ?? Date.now() },
  );
  const local = normalizeCheckpoint(checkpoint, profile);
  const workspaceTimestamp = validTimestamp(workspace.updatedAt);
  const localTimestamp = validTimestamp(local?.updatedAt);
  const shouldRestore = Boolean(
    local
    && localTimestamp !== null
    && (workspaceTimestamp === null || localTimestamp > workspaceTimestamp)
  );

  if (!shouldRestore) {
    return {
      restored: false,
      resumeBuilder: workspace,
      source: "workspace",
    };
  }

  return {
    restored: true,
    resumeBuilder: {
      ...workspace,
      draft: local.draft,
      layout: local.layout,
      updatedAt: local.updatedAt,
    },
    source: "checkpoint",
  };
}

/**
 * Clears a checkpoint unconditionally, or only through a confirmed saved
 * revision. The guarded form cannot erase edits made while a save was in
 * flight.
 */
export function clearResumeDraftCheckpoint(academicProfileDataId, options = {}) {
  const key = getResumeDraftStorageKey(academicProfileDataId);
  const storage = resolveStorage(options);
  if (!key || !storage?.removeItem) return false;

  if (hasOwn(options, "throughUpdatedAt")) {
    const savedThrough = validTimestamp(options.throughUpdatedAt);
    if (savedThrough === null) return false;
    const checkpoint = readResumeDraftCheckpoint(academicProfileDataId, options);
    const checkpointTimestamp = validTimestamp(checkpoint?.updatedAt);
    if (checkpointTimestamp === null || checkpointTimestamp > savedThrough) return false;
  }

  try {
    if (storage.getItem?.(key) === null) return false;
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
