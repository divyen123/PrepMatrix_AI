const PROFILE_STORAGE_PREFIX = "prepmatrix-profile";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function isValidAcademicProfileDataId(value) {
  return /^[a-zA-Z0-9:_-]{8,160}$/u.test(clean(value));
}

export function getAcademicProfileDataId(profile = {}) {
  return clean(
    profile?.dataId
      || profile?.academicProfileId
      || profile?.profileContext?.academicProfileId
      || profile?.profileContext?.dataId,
  );
}

export function resolveAcademicProfileContext(input = {}, user = {}) {
  const profiles = Array.isArray(user?.academicProfiles) ? user.academicProfiles : [];
  const requestedDataId = getAcademicProfileDataId(input);
  const requestedSlotId = clean(
    input?.slotId
      || input?.id
      || input?.activeAcademicProfileId
      || user?.activeAcademicProfileId,
  );
  const activeProfile = profiles.find((profile) => (
    (requestedDataId && getAcademicProfileDataId(profile) === requestedDataId)
      || (requestedSlotId && clean(profile?.id) === requestedSlotId)
  )) || profiles.find((profile) => clean(profile?.id) === clean(user?.activeAcademicProfileId))
    || profiles[0]
    || null;
  const dataId = requestedDataId || getAcademicProfileDataId(activeProfile);

  return {
    academicProfileId: dataId,
    dataId,
    slotId: clean(activeProfile?.id || requestedSlotId),
    label: clean(input?.label || activeProfile?.label) || "Profile A",
    revision: clean(input?.revision || input?.profileRevision),
  };
}

export function academicProfileStoragePrefix(dataId) {
  const normalized = clean(dataId);
  return normalized ? `${PROFILE_STORAGE_PREFIX}:${encodeURIComponent(normalized)}:` : "";
}

export function academicProfileStorageKey(dataId, kind, suffix = "") {
  const prefix = academicProfileStoragePrefix(dataId);
  const normalizedKind = clean(kind).replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
  if (!prefix || !normalizedKind) return "";
  const normalizedSuffix = clean(suffix);
  return `${prefix}${normalizedKind}${normalizedSuffix ? `:${encodeURIComponent(normalizedSuffix)}` : ""}`;
}

export function legacyAcademicProfileOwnerStorageKey(user = {}) {
  const identity = clean(user?.id || user?._id || user?.email || user?.username)
    .toLocaleLowerCase();
  return identity
    ? `prepmatrix-legacy-profile-owner:${encodeURIComponent(identity)}`
    : "";
}

function clearStoragePrefix(storage, prefix) {
  if (!storage || !prefix) return 0;
  let removed = 0;
  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (!key?.startsWith(prefix)) continue;
      storage.removeItem(key);
      removed += 1;
    }
  } catch {
    return removed;
  }
  return removed;
}

const LEGACY_PROFILE_STORAGE_KEYS = Object.freeze([
  "prepmatrix_active_exam_attempt",
  "prepmatrix_exam_timer_v1",
  "prepmatrix_daily_target",
  "prepmatrix_weekly_review",
  "prepmatrix_kids_pin_setup_pending",
]);
const LEGACY_PROFILE_STORAGE_PREFIXES = Object.freeze([
  "prepmatrix_exam_visited_",
  "prepmatrix-plan-completed:",
  "prepmatrix_kids_v1:",
  "prepmatrix_school_knowledge_v1:",
]);

function clearLegacyProfileStorage(storage) {
  if (!storage) return 0;
  let removed = 0;
  try {
    LEGACY_PROFILE_STORAGE_KEYS.forEach((key) => {
      if (storage.getItem(key) === null) return;
      storage.removeItem(key);
      removed += 1;
    });
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (!LEGACY_PROFILE_STORAGE_PREFIXES.some((prefix) => key?.startsWith(prefix))) continue;
      storage.removeItem(key);
      removed += 1;
    }
  } catch {
    return removed;
  }
  return removed;
}

export function clearAcademicProfileBrowserData(dataId, runtime = {}) {
  const prefix = academicProfileStoragePrefix(dataId);
  const local = runtime.localStorageRef
    ?? (typeof window !== "undefined" ? window.localStorage : null);
  const session = runtime.sessionStorageRef
    ?? (typeof window !== "undefined" ? window.sessionStorage : null);
  return clearStoragePrefix(local, prefix) + clearStoragePrefix(session, prefix);
}

export function clearOwnedLegacyAcademicProfileBrowserData(user, dataId, runtime = {}) {
  const normalized = clean(dataId);
  const ownerKey = legacyAcademicProfileOwnerStorageKey(user);
  const local = runtime.localStorageRef
    ?? (typeof window !== "undefined" ? window.localStorage : null);
  const session = runtime.sessionStorageRef
    ?? (typeof window !== "undefined" ? window.sessionStorage : null);
  if (!normalized || !ownerKey || local?.getItem(ownerKey) !== normalized) return 0;
  const removed = clearLegacyProfileStorage(local) + clearLegacyProfileStorage(session);
  local?.removeItem(ownerKey);
  return removed + 1;
}

export function clearPendingAcademicProfileActions(dataId = "") {
  if (typeof window === "undefined") return;
  const normalized = clean(dataId);
  if (!normalized || window.pendingVoiceNote?.academicProfileId === normalized) {
    window.pendingVoiceNote = null;
  }
  if (!normalized || window.plannerAutoGenerateRequested?.academicProfileId === normalized) {
    window.plannerAutoGenerateRequested = null;
  }
}
