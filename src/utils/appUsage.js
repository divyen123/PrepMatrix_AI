export const APP_USAGE_UPDATED_EVENT = "prepmatrix:app-usage-updated";
export const APP_USAGE_LIMIT_REACHED_EVENT = "prepmatrix:app-usage-limit-reached";
export const LEGACY_APP_USAGE_STORAGE_PREFIX = "prepmatrix_app_usage_v1";
export const APP_USAGE_STORAGE_PREFIX = "prepmatrix_app_usage_v2";
export const APP_USAGE_RECORD_VERSION = 2;
export const DEFAULT_APP_USAGE_WINDOW_DAYS = 7;
export const APP_USAGE_RETENTION_DAYS = 90;

export const APP_USAGE_LIMIT_OPTIONS = Object.freeze([
  { label: "No daily limit", value: null },
  { label: "30 minutes", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "1 hour 30 minutes", value: 90 },
  { label: "2 hours", value: 120 },
  { label: "3 hours", value: 180 },
  { label: "4 hours", value: 240 },
  { label: "6 hours", value: 360 },
  { label: "8 hours", value: 480 },
]);

const MAX_DAILY_SECONDS = 24 * 60 * 60;
const MAX_LIMIT_MINUTES = 24 * 60;
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const SOURCE_ID_PATTERN = /^usage-[a-z0-9-]{12,120}$/u;

function clampNumber(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function resolveStorage(storage) {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function identityHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeUsageDays(value) {
  const entries = Object.entries(value && typeof value === "object" ? value : {})
    .filter(([dayKey]) => DAY_KEY_PATTERN.test(dayKey))
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-APP_USAGE_RETENTION_DAYS);
  return Object.fromEntries(entries.map(([dayKey, seconds]) => [
    dayKey,
    normalizeDaySeconds(seconds),
  ]));
}

function normalizeSourceId(value) {
  const sourceId = String(value || "").trim().toLowerCase();
  return SOURCE_ID_PATTERN.test(sourceId) ? sourceId : "";
}

function createSourceId() {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return `usage-${randomUuid.toLowerCase()}`;

  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
    return `usage-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }

  const seed = `${Date.now()}:${Math.random()}:${Math.random()}`;
  return `usage-${identityHash(seed)}-${identityHash([...seed].reverse().join(""))}`;
}

export function normalizeAppUsageTimeZone(value) {
  const timeZone = String(value || "").trim().slice(0, 80);
  if (!timeZone) return "";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "";
  }
}

export function getCurrentAppUsageTimeZone() {
  try {
    return normalizeAppUsageTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return "";
  }
}

export function resolveAppUsageIdentity(userProfile = {}) {
  const source = [userProfile?.id, userProfile?._id, userProfile?.email]
    .map((value) => String(value || "").trim().toLocaleLowerCase())
    .find(Boolean);
  return source ? `account-${identityHash(source)}` : "";
}

export function getAppUsageStorageKey(identity) {
  const normalized = String(identity || "").trim();
  return normalized ? `${APP_USAGE_STORAGE_PREFIX}:${normalized}` : "";
}

export function getLocalUsageDayKey(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLegacyAppUsageStorageKey(identity) {
  const normalized = String(identity || "").trim();
  return normalized ? `${LEGACY_APP_USAGE_STORAGE_PREFIX}:${normalized}` : "";
}

export function getAppUsageDayKey(input = new Date(), timeZone = "") {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  const normalizedTimeZone = normalizeAppUsageTimeZone(timeZone);
  if (!normalizedTimeZone) return getLocalUsageDayKey(date);
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone: normalizedTimeZone,
      year: "numeric",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return getLocalUsageDayKey(date);
  }
}

function dateFromUsageDayKey(dayKey) {
  return new Date(`${dayKey}T12:00:00.000Z`);
}

function remapUsageDays(value, sourceTimeZone, targetTimeZone, now) {
  const days = normalizeUsageDays(value);
  const sourceToday = getAppUsageDayKey(now, sourceTimeZone);
  const targetToday = getAppUsageDayKey(now, targetTimeZone);
  const sourceDate = dateFromUsageDayKey(sourceToday);
  const targetDate = dateFromUsageDayKey(targetToday);
  if (
    !sourceToday
    || !targetToday
    || Number.isNaN(sourceDate.getTime())
    || Number.isNaN(targetDate.getTime())
  ) return days;

  const dayOffset = Math.round((targetDate.getTime() - sourceDate.getTime()) / 86_400_000);
  if (!dayOffset) return days;

  const shiftedEntries = Object.entries(days).map(([dayKey, seconds]) => {
    const date = dateFromUsageDayKey(dayKey);
    date.setUTCDate(date.getUTCDate() + dayOffset);
    return [date.toISOString().slice(0, 10), seconds];
  });
  return normalizeUsageDays(Object.fromEntries(shiftedEntries));
}

export function getRecentUsageDayKeys(
  dayCount = DEFAULT_APP_USAGE_WINDOW_DAYS,
  now = new Date(),
  timeZone = "",
) {
  const count = clampNumber(Math.floor(Number(dayCount) || 0), 1, APP_USAGE_RETENTION_DAYS);
  const endKey = getAppUsageDayKey(now, timeZone);
  const end = dateFromUsageDayKey(endKey);
  if (!endKey || Number.isNaN(end.getTime())) return [];
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (count - index - 1));
    return date.toISOString().slice(0, 10);
  });
}

function normalizeLimitMinutes(value) {
  if (value === null || value === undefined || value === "") return null;
  const minutes = Math.round(Number(value));
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return clampNumber(minutes, 15, MAX_LIMIT_MINUTES);
}

function normalizeDaySeconds(value) {
  const seconds = Math.floor(Number(value) || 0);
  return clampNumber(seconds, 0, MAX_DAILY_SECONDS);
}

export function normalizeAppUsageRecord(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const days = normalizeUsageDays(source.days);
  const sourceDays = normalizeUsageDays(
    source.sourceDays && typeof source.sourceDays === "object"
      ? source.sourceDays
      : (Number(source.version) || 1) < APP_USAGE_RECORD_VERSION ? days : {},
  );
  const rawAcknowledgedDays = normalizeUsageDays(source.acknowledgedSourceDays);
  const acknowledgedSourceDays = Object.fromEntries(
    Object.entries(rawAcknowledgedDays)
      .filter(([dayKey]) => Object.prototype.hasOwnProperty.call(sourceDays, dayKey))
      .map(([dayKey, seconds]) => [dayKey, Math.min(seconds, sourceDays[dayKey])]),
  );
  return {
    version: APP_USAGE_RECORD_VERSION,
    sourceId: normalizeSourceId(source.sourceId),
    usageTimeZone: normalizeAppUsageTimeZone(source.usageTimeZone),
    days,
    sourceDays,
    acknowledgedSourceDays,
    dailyLimitMinutes: normalizeLimitMinutes(source.dailyLimitMinutes),
    limitNotifiedDay: DAY_KEY_PATTERN.test(source.limitNotifiedDay || "")
      ? source.limitNotifiedDay
      : "",
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : "",
  };
}

export function readAppUsageRecord(identity, storage) {
  const key = getAppUsageStorageKey(identity);
  const legacyKey = getLegacyAppUsageStorageKey(identity);
  const targetStorage = resolveStorage(storage);
  if (!key || !targetStorage) return normalizeAppUsageRecord();
  try {
    const currentValue = targetStorage.getItem(key);
    if (currentValue !== null) return normalizeAppUsageRecord(JSON.parse(currentValue));
    return normalizeAppUsageRecord(JSON.parse(targetStorage.getItem(legacyKey) || "{}"));
  } catch {
    return normalizeAppUsageRecord();
  }
}

function emitUsageEvent(eventName, detail) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  try {
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  } catch {
    // Browsers without CustomEvent still persist data; consumers also poll safely.
  }
}

function emitUsageUpdate(identity, record) {
  emitUsageEvent(APP_USAGE_UPDATED_EVENT, { identity, record });
}

function emitUsageLimitReached(identity, record, dayKey) {
  emitUsageEvent(APP_USAGE_LIMIT_REACHED_EVENT, {
    identity,
    dayKey,
    dailyLimitMinutes: record.dailyLimitMinutes,
  });
}

export function writeAppUsageRecord(identity, value, storage) {
  const key = getAppUsageStorageKey(identity);
  const targetStorage = resolveStorage(storage);
  const record = normalizeAppUsageRecord(value);
  if (!key || !targetStorage) return record;
  try {
    targetStorage.setItem(key, JSON.stringify(record));
    emitUsageUpdate(identity, record);
  } catch {
    // Usage insights are non-critical and must never interrupt the learning app.
  }
  return record;
}

export function ensureAppUsageSource(identity, storage) {
  const current = readAppUsageRecord(identity, storage);
  if (!identity || (current.sourceId && current.usageTimeZone)) return current;
  return writeAppUsageRecord(identity, {
    ...current,
    sourceId: current.sourceId || createSourceId(),
    usageTimeZone: current.usageTimeZone || getCurrentAppUsageTimeZone(),
  }, storage);
}

function latestIso(left, right) {
  const leftTime = Date.parse(left || "");
  const rightTime = Date.parse(right || "");
  if (!Number.isFinite(leftTime)) return Number.isFinite(rightTime) ? right : "";
  return Number.isFinite(rightTime) && rightTime > leftTime ? right : left;
}

export function mergeSyncedAppUsageRecord(identity, payload = {}, { storage } = {}) {
  const current = ensureAppUsageSource(identity, storage);
  const usage = payload?.usage && typeof payload.usage === "object" ? payload.usage : {};
  const incomingTimeZone = normalizeAppUsageTimeZone(usage.usageTimeZone);
  const mergeInstant = Number.isFinite(Date.parse(usage.updatedAt || ""))
    ? new Date(usage.updatedAt)
    : new Date();
  const timeZoneChanged = Boolean(
    incomingTimeZone
      && current.usageTimeZone
      && incomingTimeZone !== current.usageTimeZone,
  );
  const currentDays = timeZoneChanged
    ? remapUsageDays(current.days, current.usageTimeZone, incomingTimeZone, mergeInstant)
    : current.days;
  const currentSourceDays = timeZoneChanged
    ? remapUsageDays(current.sourceDays, current.usageTimeZone, incomingTimeZone, mergeInstant)
    : current.sourceDays;
  const currentAcknowledgedDays = timeZoneChanged
    ? remapUsageDays(
      current.acknowledgedSourceDays,
      current.usageTimeZone,
      incomingTimeZone,
      mergeInstant,
    )
    : current.acknowledgedSourceDays;
  const serverDays = normalizeUsageDays(usage.days);
  const acknowledgedDays = normalizeUsageDays(payload.acknowledgedDays);
  const nextAcknowledgedDays = {};
  const nextDays = {};
  const dayKeys = new Set([
    ...Object.keys(currentDays),
    ...Object.keys(currentSourceDays),
    ...Object.keys(serverDays),
  ]);

  for (const dayKey of [...dayKeys].sort().slice(-APP_USAGE_RETENTION_DAYS)) {
    const localSourceSeconds = currentSourceDays[dayKey] || 0;
    const previousAcknowledged = Math.min(
      currentAcknowledgedDays[dayKey] || 0,
      localSourceSeconds,
    );
    const nextAcknowledged = Math.min(
      localSourceSeconds,
      Math.max(previousAcknowledged, acknowledgedDays[dayKey] || 0),
    );
    if (localSourceSeconds || nextAcknowledged) {
      nextAcknowledgedDays[dayKey] = nextAcknowledged;
    }

    const previousPending = Math.max(0, localSourceSeconds - previousAcknowledged);
    const previousServerTotal = Math.max(0, (currentDays[dayKey] || 0) - previousPending);
    const serverTotal = Math.max(previousServerTotal, serverDays[dayKey] || 0);
    const nextPending = Math.max(0, localSourceSeconds - nextAcknowledged);
    const combinedSeconds = normalizeDaySeconds(serverTotal + nextPending);
    if (combinedSeconds || localSourceSeconds) nextDays[dayKey] = combinedSeconds;
  }

  return writeAppUsageRecord(identity, {
    ...current,
    days: nextDays,
    sourceDays: currentSourceDays,
    acknowledgedSourceDays: nextAcknowledgedDays,
    usageTimeZone: incomingTimeZone
      || current.usageTimeZone
      || getCurrentAppUsageTimeZone(),
    updatedAt: latestIso(current.updatedAt, usage.updatedAt),
  }, storage);
}

export function addAppUsageSeconds(identity, seconds, { now = new Date(), storage } = {}) {
  const safeSeconds = Math.floor(Number(seconds) || 0);
  const current = ensureAppUsageSource(identity, storage);
  const dayKey = getAppUsageDayKey(now, current.usageTimeZone);
  if (!identity || safeSeconds <= 0 || !dayKey) return current;
  const nextDaySeconds = normalizeDaySeconds((current.days[dayKey] || 0) + safeSeconds);
  const nextSourceSeconds = normalizeDaySeconds((current.sourceDays[dayKey] || 0) + safeSeconds);
  const limitReached = Boolean(
    current.dailyLimitMinutes
      && nextDaySeconds >= current.dailyLimitMinutes * 60
      && current.limitNotifiedDay !== dayKey
  );
  const nextRecord = writeAppUsageRecord(identity, {
    ...current,
    days: {
      ...current.days,
      [dayKey]: nextDaySeconds,
    },
    sourceDays: {
      ...current.sourceDays,
      [dayKey]: nextSourceSeconds,
    },
    limitNotifiedDay: limitReached ? dayKey : current.limitNotifiedDay,
    updatedAt: new Date(now).toISOString(),
  }, storage);
  if (limitReached) emitUsageLimitReached(identity, nextRecord, dayKey);
  return nextRecord;
}

export function saveAppUsageLimit(identity, minutes, { now = new Date(), storage } = {}) {
  const current = readAppUsageRecord(identity, storage);
  const dailyLimitMinutes = normalizeLimitMinutes(minutes);
  return writeAppUsageRecord(identity, {
    ...current,
    dailyLimitMinutes,
    limitNotifiedDay: dailyLimitMinutes === current.dailyLimitMinutes
      ? current.limitNotifiedDay
      : "",
    updatedAt: new Date(now).toISOString(),
  }, storage);
}

function formatDayLabel(date, options) {
  try {
    return new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" }).format(date);
  } catch {
    return getLocalUsageDayKey(date);
  }
}

export function buildAppUsageSummary(value, {
  dayCount = DEFAULT_APP_USAGE_WINDOW_DAYS,
  now = new Date(),
} = {}) {
  const record = normalizeAppUsageRecord(value);
  const keys = getRecentUsageDayKeys(dayCount, now, record.usageTimeZone);
  const daily = keys.map((dayKey) => {
    const date = dateFromUsageDayKey(dayKey);
    const seconds = normalizeDaySeconds(record.days[dayKey]);
    return {
      dayKey,
      label: formatDayLabel(date, { weekday: "short" }),
      fullLabel: formatDayLabel(date, { day: "numeric", month: "short", weekday: "long" }),
      seconds,
      minutes: Number((seconds / 60).toFixed(1)),
      hours: Number((seconds / 3600).toFixed(2)),
    };
  });
  const totalSeconds = daily.reduce((total, day) => total + day.seconds, 0);
  const averageSeconds = daily.length ? Math.round(totalSeconds / daily.length) : 0;
  const averageMinutes = Number((averageSeconds / 60).toFixed(1));
  const dailyWithAverage = daily.map((day) => ({ ...day, averageMinutes }));
  const today = dailyWithAverage.at(-1) || {
    dayKey: getAppUsageDayKey(now, record.usageTimeZone),
    seconds: 0,
    minutes: 0,
  };
  const dailyLimitSeconds = record.dailyLimitMinutes
    ? record.dailyLimitMinutes * 60
    : null;
  const rawLimitPercent = dailyLimitSeconds
    ? Math.round((today.seconds / dailyLimitSeconds) * 100)
    : 0;
  const mostActiveDay = dailyWithAverage.reduce((current, day) => (
    !current || day.seconds > current.seconds ? day : current
  ), null);

  return {
    record,
    daily: dailyWithAverage,
    today,
    totalSeconds,
    averageSeconds,
    averageMinutes,
    activeDays: dailyWithAverage.filter((day) => day.seconds > 0).length,
    mostActiveDay: mostActiveDay?.seconds ? mostActiveDay : null,
    dailyLimitMinutes: record.dailyLimitMinutes,
    dailyLimitSeconds,
    limitUsedPercent: rawLimitPercent,
    limitProgressPercent: clampNumber(rawLimitPercent, 0, 100),
    hasRecordedUsage: totalSeconds > 0,
  };
}
