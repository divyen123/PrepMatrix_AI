export const APP_USAGE_UPDATED_EVENT = "prepmatrix:app-usage-updated";
export const APP_USAGE_LIMIT_REACHED_EVENT = "prepmatrix:app-usage-limit-reached";
export const APP_USAGE_STORAGE_PREFIX = "prepmatrix_app_usage_v1";
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

function dateFromUsageDayKey(dayKey) {
  const [year, month, day] = String(dayKey).split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function getRecentUsageDayKeys(dayCount = DEFAULT_APP_USAGE_WINDOW_DAYS, now = new Date()) {
  const count = clampNumber(Math.floor(Number(dayCount) || 0), 1, APP_USAGE_RETENTION_DAYS);
  const end = now instanceof Date ? new Date(now) : new Date(now);
  if (Number.isNaN(end.getTime())) return [];
  end.setHours(12, 0, 0, 0);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(end);
    date.setDate(end.getDate() - (count - index - 1));
    return getLocalUsageDayKey(date);
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
  const entries = Object.entries(source.days && typeof source.days === "object" ? source.days : {})
    .filter(([dayKey]) => DAY_KEY_PATTERN.test(dayKey))
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-APP_USAGE_RETENTION_DAYS);
  const days = Object.fromEntries(entries.map(([dayKey, seconds]) => [
    dayKey,
    normalizeDaySeconds(seconds),
  ]));
  return {
    version: 1,
    days,
    dailyLimitMinutes: normalizeLimitMinutes(source.dailyLimitMinutes),
    limitNotifiedDay: DAY_KEY_PATTERN.test(source.limitNotifiedDay || "")
      ? source.limitNotifiedDay
      : "",
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : "",
  };
}

export function readAppUsageRecord(identity, storage) {
  const key = getAppUsageStorageKey(identity);
  const targetStorage = resolveStorage(storage);
  if (!key || !targetStorage) return normalizeAppUsageRecord();
  try {
    return normalizeAppUsageRecord(JSON.parse(targetStorage.getItem(key) || "{}"));
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

export function addAppUsageSeconds(identity, seconds, { now = new Date(), storage } = {}) {
  const safeSeconds = Math.floor(Number(seconds) || 0);
  const dayKey = getLocalUsageDayKey(now);
  if (!identity || safeSeconds <= 0 || !dayKey) return readAppUsageRecord(identity, storage);
  const current = readAppUsageRecord(identity, storage);
  const nextDaySeconds = normalizeDaySeconds((current.days[dayKey] || 0) + safeSeconds);
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
    return new Intl.DateTimeFormat(undefined, options).format(date);
  } catch {
    return getLocalUsageDayKey(date);
  }
}

export function buildAppUsageSummary(value, {
  dayCount = DEFAULT_APP_USAGE_WINDOW_DAYS,
  now = new Date(),
} = {}) {
  const record = normalizeAppUsageRecord(value);
  const keys = getRecentUsageDayKeys(dayCount, now);
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
    dayKey: getLocalUsageDayKey(now),
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
