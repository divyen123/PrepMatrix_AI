export const APP_USAGE_COUNTERS_COLLECTION = "appUsageCounters";
export const APP_USAGE_PREFERENCES_COLLECTION = "appUsagePreferences";
export const APP_USAGE_VERSION = 2;
export const APP_USAGE_RETENTION_DAYS = 90;

const MAX_DAILY_SECONDS = 24 * 60 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const SOURCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const ACCOUNT_FENCE_ERROR_CODES = new Set([
  "ACCOUNT_DELETION_IN_PROGRESS",
  "PROFILE_UPDATE_IN_PROGRESS",
]);

export class AppUsageRequestError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "AppUsageRequestError";
    this.code = code;
    this.status = status;
  }
}

function requestError(code, message) {
  throw new AppUsageRequestError(code, message);
}

function validDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function normalizeUsageTimeZone(value) {
  const requested = typeof value === "string" ? value.trim() : "";
  if (!requested || requested.length > 100) {
    requestError("APP_USAGE_TIME_ZONE_INVALID", "Choose a valid IANA time zone before syncing app usage.");
  }
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: requested })
      .resolvedOptions()
      .timeZone;
  } catch {
    requestError("APP_USAGE_TIME_ZONE_INVALID", "Choose a valid IANA time zone before syncing app usage.");
  }
}

export function getUsageDayKey(value, usageTimeZone) {
  const date = validDate(value);
  if (!date) throw new TypeError("A valid instant is required to determine an app-usage day.");
  const timeZone = normalizeUsageTimeZone(usageTimeZone);
  const parts = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getRetainedUsageDayKeys(usageTimeZone, value = new Date()) {
  const currentDayKey = getUsageDayKey(value, usageTimeZone);
  const [year, month, day] = currentDayKey.split("-").map(Number);
  const anchor = Date.UTC(year, month - 1, day);
  return Array.from({ length: APP_USAGE_RETENTION_DAYS }, (_, index) => {
    const offset = APP_USAGE_RETENTION_DAYS - index - 1;
    const date = new Date(anchor - offset * DAY_MS);
    return [
      String(date.getUTCFullYear()).padStart(4, "0"),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0"),
    ].join("-");
  });
}

function normalizeSourceId(value) {
  const sourceId = typeof value === "string" ? value.trim() : "";
  if (!SOURCE_ID_PATTERN.test(sourceId)) {
    requestError(
      "APP_USAGE_SOURCE_INVALID",
      "The app-usage source identifier is invalid. Refresh and try again.",
    );
  }
  return sourceId;
}

function normalizeDaySeconds(value) {
  if (!Number.isInteger(value) || value < 0 || value > MAX_DAILY_SECONDS) {
    requestError(
      "APP_USAGE_SECONDS_INVALID",
      `Daily app usage must be a whole number from 0 to ${MAX_DAILY_SECONDS} seconds.`,
    );
  }
  return value;
}

function normalizeDaysShape(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    requestError("APP_USAGE_DAYS_INVALID", "App usage days must be an object keyed by local date.");
  }
  const entries = Object.entries(value);
  if (entries.length > APP_USAGE_RETENTION_DAYS) {
    requestError(
      "APP_USAGE_DAYS_LIMIT_EXCEEDED",
      `Sync at most ${APP_USAGE_RETENTION_DAYS} days of app usage at a time.`,
    );
  }
  return entries.map(([dayKey, seconds]) => {
    if (!DAY_KEY_PATTERN.test(dayKey)) {
      requestError("APP_USAGE_DAY_INVALID", "App usage contains an invalid local date.");
    }
    return [dayKey, normalizeDaySeconds(seconds)];
  });
}

export function normalizeAppUsageSyncRequest(value = {}) {
  const body = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  if (body.version !== APP_USAGE_VERSION) {
    requestError(
      "APP_USAGE_VERSION_UNSUPPORTED",
      `App usage sync requires version ${APP_USAGE_VERSION}.`,
    );
  }
  return {
    version: APP_USAGE_VERSION,
    sourceId: normalizeSourceId(body.sourceId),
    localTimeZone: normalizeUsageTimeZone(body.localTimeZone),
    dayEntries: normalizeDaysShape(body.days),
  };
}

function validateRetainedDayEntries(dayEntries, usageTimeZone, now) {
  const retainedDayKeys = getRetainedUsageDayKeys(usageTimeZone, now);
  const retained = new Set(retainedDayKeys);
  for (const [dayKey] of dayEntries) {
    if (!retained.has(dayKey)) {
      requestError(
        "APP_USAGE_DAY_OUTSIDE_RETENTION",
        `App usage can only sync the current day and previous ${APP_USAGE_RETENTION_DAYS - 1} days in the account time zone.`,
      );
    }
  }
  return retainedDayKeys;
}

function usageDayOrdinal(dayKey) {
  const [year, month, day] = String(dayKey).split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

export function remapAppUsageDayEntries(
  dayEntries,
  sourceTimeZone,
  accountTimeZone,
  now,
) {
  const sourceToday = getUsageDayKey(now, sourceTimeZone);
  const accountToday = getUsageDayKey(now, accountTimeZone);
  const dayOffset = usageDayOrdinal(accountToday) - usageDayOrdinal(sourceToday);
  if (!dayOffset) return dayEntries.map(([dayKey, seconds]) => [dayKey, seconds]);

  return dayEntries.map(([dayKey, seconds]) => {
    const shifted = new Date((usageDayOrdinal(dayKey) + dayOffset) * DAY_MS);
    return [shifted.toISOString().slice(0, 10), seconds];
  });
}

function counterExpiresAt(dayKey) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) + (APP_USAGE_RETENTION_DAYS + 1) * DAY_MS);
}

function duplicateKeyError(error) {
  return Number(error?.code) === 11000;
}

async function createUsagePreferences(collection, userId, usageTimeZone, syncedAt) {
  try {
    await collection.updateOne(
      { userId },
      {
        $setOnInsert: {
          userId,
          usageTimeZone,
          createdAt: syncedAt,
          updatedAt: syncedAt,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    if (!duplicateKeyError(error)) throw error;
  }
  const preferences = await collection.findOne({ userId });
  if (!preferences?.usageTimeZone) {
    throw new Error("App-usage preferences could not be prepared.");
  }
  return {
    ...preferences,
    usageTimeZone: normalizeUsageTimeZone(preferences.usageTimeZone),
  };
}

async function writeCumulativeCounter(collection, filter, seconds, syncedAt) {
  const update = {
    $max: { seconds },
    $set: {
      updatedAt: syncedAt,
      expiresAt: counterExpiresAt(filter.dayKey),
    },
    $setOnInsert: { createdAt: syncedAt },
  };
  try {
    await collection.updateOne(filter, update, { upsert: true });
  } catch (error) {
    if (!duplicateKeyError(error)) throw error;
    const retry = await collection.updateOne(filter, update);
    if (Number(retry?.matchedCount || 0) !== 1) throw error;
  }
}

function normalizedStoredSeconds(value) {
  const seconds = Math.floor(Number(value) || 0);
  return Math.min(MAX_DAILY_SECONDS, Math.max(0, seconds));
}

export function aggregateAppUsageDocuments(documents = [], sourceId = "") {
  const counters = new Map();
  for (const document of Array.isArray(documents) ? documents : []) {
    const dayKey = String(document?.dayKey || "");
    const storedSourceId = String(document?.sourceId || "");
    if (!DAY_KEY_PATTERN.test(dayKey) || !storedSourceId) continue;
    const key = `${dayKey}\u0000${storedSourceId}`;
    counters.set(key, Math.max(counters.get(key) || 0, normalizedStoredSeconds(document.seconds)));
  }

  const days = {};
  const acknowledgedDays = {};
  for (const [key, seconds] of counters) {
    const [dayKey, storedSourceId] = key.split("\u0000");
    days[dayKey] = Math.min(MAX_DAILY_SECONDS, (days[dayKey] || 0) + seconds);
    if (storedSourceId === sourceId) acknowledgedDays[dayKey] = seconds;
  }
  const sortRecord = (record) => Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
  return {
    days: sortRecord(days),
    acknowledgedDays: sortRecord(acknowledgedDays),
  };
}

function sendRequestError(res, error) {
  return res.status(error.status).json({ error: error.message, code: error.code });
}

function isAccountFenceError(error) {
  return Number(error?.status) === 409 && ACCOUNT_FENCE_ERROR_CODES.has(error?.code);
}

export function registerAppUsageRoutes(app, {
  getDb,
  requireAuth,
  withAccountWriteFence,
  now = () => new Date(),
} = {}) {
  if (!app?.post) throw new TypeError("App usage routes require an Express application.");
  if (typeof getDb !== "function") throw new TypeError("App usage routes require a database provider.");
  if (typeof requireAuth !== "function") throw new TypeError("App usage routes require authentication.");
  if (typeof withAccountWriteFence !== "function") {
    throw new TypeError("App usage routes require an account write fence.");
  }

  app.post("/api/app-usage/sync", requireAuth(async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const sync = normalizeAppUsageSyncRequest(req.body);
      const syncedAt = validDate(now());
      if (!syncedAt) throw new TypeError("App usage sync requires a valid server time.");
      const db = await getDb();
      const counters = db.collection(APP_USAGE_COUNTERS_COLLECTION);
      const preferences = db.collection(APP_USAGE_PREFERENCES_COLLECTION);
      const userId = req.user._id;

      const payload = await withAccountWriteFence(db, req, async () => {
        const storedPreferences = await preferences.findOne({ userId });
        const candidateTimeZone = storedPreferences?.usageTimeZone
          ? normalizeUsageTimeZone(storedPreferences.usageTimeZone)
          : sync.localTimeZone;
        validateRetainedDayEntries(
          sync.dayEntries,
          sync.localTimeZone,
          syncedAt,
        );
        const canonicalPreferences = storedPreferences?.usageTimeZone
          ? { ...storedPreferences, usageTimeZone: candidateTimeZone }
          : await createUsagePreferences(preferences, userId, candidateTimeZone, syncedAt);
        const retainedDayKeys = getRetainedUsageDayKeys(
          canonicalPreferences.usageTimeZone,
          syncedAt,
        );
        const canonicalDayEntries = remapAppUsageDayEntries(
          sync.dayEntries,
          sync.localTimeZone,
          canonicalPreferences.usageTimeZone,
          syncedAt,
        );
        const firstRetainedDay = retainedDayKeys[0];
        const lastRetainedDay = retainedDayKeys.at(-1);
        await counters.deleteMany({
          userId,
          $or: [
            { dayKey: { $lt: firstRetainedDay } },
            { dayKey: { $gt: lastRetainedDay } },
          ],
        });

        for (const [dayKey, seconds] of canonicalDayEntries) {
          await writeCumulativeCounter(
            counters,
            { userId, sourceId: sync.sourceId, dayKey },
            seconds,
            syncedAt,
          );
        }

        const documents = await counters.find({
          userId,
          dayKey: { $gte: firstRetainedDay, $lte: lastRetainedDay },
        }).toArray();
        const aggregate = aggregateAppUsageDocuments(documents, sync.sourceId);
        return {
          usage: {
            version: APP_USAGE_VERSION,
            days: aggregate.days,
            usageTimeZone: canonicalPreferences.usageTimeZone,
            updatedAt: syncedAt.toISOString(),
          },
          acknowledgedDays: aggregate.acknowledgedDays,
        };
      });

      return res.json(payload);
    } catch (error) {
      if (error instanceof AppUsageRequestError) return sendRequestError(res, error);
      if (isAccountFenceError(error)) {
        res.set("Retry-After", "1");
        return sendRequestError(res, error);
      }
      throw error;
    }
  }));
}

export default registerAppUsageRoutes;
