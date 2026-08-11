export const LEARNING_PRIVACY_CONSENT_VERSION = "2026-07-26-v1";
export const MEDICAL_TRAINING_PRIVACY_CONSENT_KIND = "medical-training";
export const MEDICAL_TRAINING_PRIVACY_CONSENT_VERSION = "2026-08-11-medical-v1";

const LEARNING_PRIVACY_CONSENT_STORAGE_PREFIX = "prepmatrix_learning_ai_privacy_consent";
const inMemoryConsentByAccount = new Map();

function normalizeAccountId(value) {
  return String(value ?? "").trim();
}

function normalizeVersion(value) {
  return String(value ?? "").trim();
}

function normalizeConsentKind(value) {
  const kind = String(value ?? "").trim().toLocaleLowerCase();
  return kind || "learning";
}

function getDefaultStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function isAcceptedConsent(value, version, kind) {
  return Boolean(
    value
    && typeof value === "object"
    && value.accepted === true
    && normalizeVersion(value.version) === version
    && (kind === "learning" || normalizeConsentKind(value.kind) === kind),
  );
}

export function getLearningPrivacyConsentStorageKey(accountId, options = {}) {
  const normalizedAccountId = normalizeAccountId(accountId);
  if (!normalizedAccountId) return "";
  const kind = normalizeConsentKind(options.kind);
  const kindSegment = kind === "learning" ? "" : ":" + encodeURIComponent(kind);
  return LEARNING_PRIVACY_CONSENT_STORAGE_PREFIX + kindSegment + ":" + encodeURIComponent(normalizedAccountId);
}

export function hasLearningPrivacyConsent(accountId, options = {}) {
  const version = normalizeVersion(
    options.version ?? LEARNING_PRIVACY_CONSENT_VERSION,
  );
  const kind = normalizeConsentKind(options.kind);
  const storageKey = getLearningPrivacyConsentStorageKey(accountId, { kind });
  if (!storageKey || !version) return false;

  const remembered = inMemoryConsentByAccount.get(storageKey);
  if (isAcceptedConsent(remembered, version, kind)) return true;

  const storage = options.storage === undefined ? getDefaultStorage() : options.storage;
  try {
    const storedValue = storage?.getItem?.(storageKey);
    if (!storedValue) return false;
    const parsed = JSON.parse(storedValue);
    if (!isAcceptedConsent(parsed, version, kind)) return false;
    inMemoryConsentByAccount.set(storageKey, parsed);
    return true;
  } catch {
    return false;
  }
}

export function acceptLearningPrivacyConsent(accountId, options = {}) {
  const version = normalizeVersion(
    options.version ?? LEARNING_PRIVACY_CONSENT_VERSION,
  );
  const kind = normalizeConsentKind(options.kind);
  const storageKey = getLearningPrivacyConsentStorageKey(accountId, { kind });
  const nowValue = typeof options.now === "function" ? options.now() : options.now;
  const acceptedAt = new Date(nowValue ?? Date.now()).toISOString();
  const consent = {
    accepted: true,
    version,
    acceptedAt,
    ...(kind === "learning" ? {} : { kind }),
  };

  if (!storageKey || !version) return consent;

  inMemoryConsentByAccount.set(storageKey, consent);
  const storage = options.storage === undefined ? getDefaultStorage() : options.storage;
  try {
    storage?.setItem?.(storageKey, JSON.stringify(consent));
  } catch {
    // The in-memory record keeps consent active for this runtime when storage is blocked.
  }

  return consent;
}
