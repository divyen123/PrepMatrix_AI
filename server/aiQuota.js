import crypto from "node:crypto";
import { ObjectId } from "mongodb";

export const AI_USAGE_EVENTS_COLLECTION = "aiUsageEvents";
export const AI_QUOTA_LOCKS_COLLECTION = "aiQuotaLocks";

export const AI_QUOTA_FEATURES = Object.freeze({
  chat: 1,
  quiz: 3,
  career_analysis: 5,
  learning_notebook: 12,
  secure_exam: 15,
  question_paper: 15,
});

const RESERVATION_TTL_MS = 30 * 60 * 1000;
const LOCK_TTL_MS = 15 * 1000;
const LOCK_WAIT_MS = 2 * 1000;
const LOCK_RETRY_MS = 25;
const EVENT_RETENTION_MS = 93 * 24 * 60 * 60 * 1000;
const MAX_REPLAY_BYTES = 256 * 1024;
const MAX_RESULT_REF_BYTES = 8 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const FEATURE_ENV_KEYS = Object.freeze({
  chat: "AI_CREDIT_COST_CHAT",
  quiz: "AI_CREDIT_COST_QUIZ",
  career_analysis: "AI_CREDIT_COST_CAREER_ANALYSIS",
  learning_notebook: "AI_CREDIT_COST_LEARNING_NOTEBOOK",
  secure_exam: "AI_CREDIT_COST_SECURE_EXAM",
  question_paper: "AI_CREDIT_COST_QUESTION_PAPER",
});

function positiveInteger(value, fallback, { minimum = 1 } = {}) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

export function getAiQuotaConfig(env = process.env) {
  const costs = {};
  for (const [feature, envKey] of Object.entries(FEATURE_ENV_KEYS)) {
    costs[feature] = positiveInteger(env?.[envKey], AI_QUOTA_FEATURES[feature]);
  }

  return {
    limit: positiveInteger(env?.AI_MONTHLY_CREDIT_LIMIT, 100),
    costs: Object.freeze(costs),
    reservationTtlMs: positiveInteger(env?.AI_QUOTA_RESERVATION_TTL_MS, RESERVATION_TTL_MS),
    lockTtlMs: positiveInteger(env?.AI_QUOTA_LOCK_TTL_MS, LOCK_TTL_MS),
    lockWaitMs: positiveInteger(env?.AI_QUOTA_LOCK_WAIT_MS, LOCK_WAIT_MS, { minimum: 0 }),
    lockRetryMs: positiveInteger(env?.AI_QUOTA_LOCK_RETRY_MS, LOCK_RETRY_MS),
    eventRetentionMs: positiveInteger(env?.AI_QUOTA_EVENT_RETENTION_MS, EVENT_RETENTION_MS),
    maxReplayBytes: positiveInteger(env?.AI_QUOTA_MAX_REPLAY_BYTES, MAX_REPLAY_BYTES),
  };
}

export class AiQuotaError extends Error {
  constructor(code, message, { status = 500, quota, cause, details } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "AiQuotaError";
    this.code = code;
    this.status = status;
    if (quota) this.quota = quota;
    if (details !== undefined) this.details = details;
  }
}

function quotaError(code, message, options) {
  return new AiQuotaError(code, message, options);
}

function unavailable(error) {
  if (error instanceof AiQuotaError) return error;
  return quotaError(
    "AI_QUOTA_UNAVAILABLE",
    "AI credit usage could not be recorded safely. Please try again.",
    { status: 503, cause: error },
  );
}

function asDate(value, label = "time") {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError(`Invalid ${label}.`);
  }
  return date;
}

function periodFor(now) {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const resetAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { periodStart, resetAt };
}

function sameDate(left, right) {
  return left instanceof Date
    && right instanceof Date
    && left.getTime() === right.getTime();
}

function normalizeRequestId(requestId) {
  if (requestId === undefined || requestId === null || String(requestId).trim() === "") {
    throw quotaError(
      "AI_IDEMPOTENCY_KEY_REQUIRED",
      "An Idempotency-Key UUID is required for AI generation.",
      { status: 400 },
    );
  }
  const normalized = String(requestId).trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw quotaError(
      "AI_INVALID_IDEMPOTENCY_KEY",
      "Idempotency-Key must be a valid UUID.",
      { status: 400 },
    );
  }
  return normalized;
}

function requireUserId(userId) {
  if (userId === undefined || userId === null || String(userId).trim() === "") {
    throw quotaError("AI_QUOTA_USER_REQUIRED", "A user is required for AI credit usage.", { status: 400 });
  }
  return userId;
}

function normalizeFeature(feature, costs) {
  const normalized = String(feature || "").trim();
  if (!Object.hasOwn(costs, normalized)) {
    throw quotaError("AI_QUOTA_FEATURE_INVALID", "This AI action does not have a configured credit cost.", {
      status: 400,
      details: { feature: normalized || null },
    });
  }
  return normalized;
}

function normalizeReservationToken(reservationToken) {
  if (
    reservationToken === undefined
    || reservationToken === null
    || String(reservationToken).trim() === ""
  ) {
    throw quotaError(
      "AI_QUOTA_RESERVATION_TOKEN_REQUIRED",
      "The AI credit reservation token is required.",
      { status: 400 },
    );
  }
  const normalized = String(reservationToken).trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw quotaError(
      "AI_QUOTA_RESERVATION_TOKEN_INVALID",
      "The AI credit reservation token is invalid.",
      { status: 400 },
    );
  }
  return normalized;
}

function requireMatchingReservationToken(event, reservationToken) {
  if (event?.reservationToken !== reservationToken) {
    throw quotaError(
      "AI_QUOTA_RESERVATION_STALE",
      "This AI credit reservation has been replaced by a newer attempt.",
      { status: 409 },
    );
  }
}

function normalizeEventId(eventId) {
  if (eventId instanceof ObjectId) return eventId;
  const value = String(eventId || "").trim();
  if (!ObjectId.isValid(value)) {
    throw quotaError("AI_QUOTA_EVENT_INVALID", "The AI credit reservation is invalid.", { status: 400 });
  }
  return new ObjectId(value);
}

function jsonByteLength(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function prepareReplayPayload(value, maxBytes, hasResultRef) {
  if (value === undefined) return undefined;
  let cloned;
  try {
    cloned = JSON.parse(JSON.stringify(value));
  } catch (error) {
    throw quotaError("AI_REPLAY_PAYLOAD_INVALID", "The AI replay payload must be JSON serializable.", {
      status: 400,
      cause: error,
    });
  }
  if (jsonByteLength(cloned) > maxBytes) {
    if (hasResultRef) return undefined;
    throw quotaError(
      "AI_REPLAY_PAYLOAD_TOO_LARGE",
      "The AI replay payload is too large; commit it with a result reference instead.",
      { status: 400, details: { maxBytes } },
    );
  }
  return cloned;
}

function normalizeResultRef(value) {
  if (value === undefined || value === null || value === "") return undefined;
  let normalized;
  try {
    normalized = JSON.parse(JSON.stringify(value));
  } catch (error) {
    throw quotaError("AI_RESULT_REF_INVALID", "The AI result reference must be JSON serializable.", {
      status: 400,
      cause: error,
    });
  }
  const validString = typeof normalized === "string" && normalized.trim().length > 0;
  const validObject = normalized
    && typeof normalized === "object"
    && !Array.isArray(normalized)
    && Object.keys(normalized).length > 0;
  if ((!validString && !validObject) || jsonByteLength(normalized) > MAX_RESULT_REF_BYTES) {
    throw quotaError("AI_RESULT_REF_INVALID", "The AI result reference is invalid.", { status: 400 });
  }
  return normalized;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function lockId(userId) {
  return `ai-quota:${String(userId)}`;
}

function summarize(events, currentTime, periodStart, resetAt, config) {
  let used = 0;
  let reserved = 0;

  for (const event of events) {
    if (!sameDate(event.periodStart, periodStart)) continue;
    const cost = Number(event.cost);
    if (!Number.isFinite(cost) || cost <= 0) continue;
    if (event.status === "committed") {
      used += cost;
    } else if (
      event.status === "reserved"
      && event.reservationExpiresAt instanceof Date
      && event.reservationExpiresAt.getTime() > currentTime.getTime()
    ) {
      reserved += cost;
    }
  }

  return {
    limit: config.limit,
    used,
    reserved,
    remaining: Math.max(0, config.limit - used - reserved),
    periodStart: periodStart.toISOString(),
    resetAt: resetAt.toISOString(),
    costs: { ...config.costs },
  };
}

export function createAiQuotaService({
  getDb,
  config: configOverrides,
  now: nowProvider = () => new Date(),
} = {}) {
  if (typeof getDb !== "function") {
    throw new TypeError("createAiQuotaService requires getDb.");
  }

  const defaults = getAiQuotaConfig();
  const suppliedCosts = configOverrides?.costs || configOverrides?.features;
  const config = {
    ...defaults,
    ...(configOverrides || {}),
    costs: Object.freeze({
      ...defaults.costs,
      ...(suppliedCosts || {}),
    }),
  };

  function currentTime() {
    return asDate(nowProvider(), "quota clock");
  }

  async function loadStatus(db, userId, at = currentTime()) {
    const { periodStart, resetAt } = periodFor(at);
    const collection = db.collection(AI_USAGE_EVENTS_COLLECTION);
    const events = await collection
      .find({ userId, periodStart })
      .toArray();
    const expired = events.filter((event) => (
      event.status === "reserved"
      && event.reservationExpiresAt instanceof Date
      && event.reservationExpiresAt.getTime() <= at.getTime()
    ));

    if (expired.length) {
      await Promise.all(expired.map((event) => collection.updateOne(
        {
          _id: event._id,
          status: "reserved",
          reservationExpiresAt: { $lte: at },
          ...(event.reservationToken ? { reservationToken: event.reservationToken } : {}),
        },
        {
          $set: {
            status: "refunded",
            outcome: "reservation_expired",
            refundedAt: at,
            updatedAt: at,
          },
        },
      )));
    }

    return summarize(events, at, periodStart, resetAt, config);
  }

  async function acquireLock(db, userId) {
    const locks = db.collection(AI_QUOTA_LOCKS_COLLECTION);
    const _id = lockId(userId);
    const token = crypto.randomUUID();
    const deadline = Date.now() + config.lockWaitMs;

    do {
      const at = currentTime();
      try {
        await locks.insertOne({
          _id,
          token,
          userId,
          createdAt: at,
          updatedAt: at,
          expiresAt: new Date(at.getTime() + config.lockTtlMs),
        });
        return { _id, token };
      } catch (error) {
        if (error?.code !== 11000) throw error;
        await locks.deleteOne({ _id, expiresAt: { $lte: at } });
      }

      if (Date.now() >= deadline) {
        throw quotaError(
          "AI_QUOTA_UNAVAILABLE",
          "AI credit usage is busy. Please try again.",
          { status: 503 },
        );
      }
      await wait(Math.min(config.lockRetryMs, Math.max(1, deadline - Date.now())));
    } while (Date.now() <= deadline);

    throw quotaError("AI_QUOTA_UNAVAILABLE", "AI credit usage is busy. Please try again.", { status: 503 });
  }

  function lockLeaseLost(error) {
    return quotaError(
      "AI_QUOTA_UNAVAILABLE",
      "AI credit usage could not be recorded safely because its lock lease was lost.",
      { status: 503, cause: error },
    );
  }

  async function renewLock(db, lock) {
    const at = currentTime();
    const result = await db.collection(AI_QUOTA_LOCKS_COLLECTION).updateOne(
      {
        _id: lock._id,
        token: lock.token,
        expiresAt: { $gt: at },
      },
      {
        $set: {
          updatedAt: at,
          expiresAt: new Date(at.getTime() + config.lockTtlMs),
        },
      },
    );
    if (result?.matchedCount !== 1) throw lockLeaseLost();
  }

  function startLockLease(db, lock) {
    let stopped = false;
    let renewal = null;
    let failure = null;
    const intervalMilliseconds = Math.max(1, Math.floor(config.lockTtlMs / 3));

    const beginRenewal = () => {
      if (stopped || renewal || failure) return;
      renewal = renewLock(db, lock)
        .catch((error) => {
          failure = error instanceof AiQuotaError ? error : lockLeaseLost(error);
        })
        .finally(() => {
          renewal = null;
        });
    };

    const timer = setInterval(beginRenewal, intervalMilliseconds);
    timer.unref?.();

    return {
      async assertOwned() {
        if (renewal) await renewal;
        if (failure) throw failure;
        try {
          await renewLock(db, lock);
        } catch (error) {
          failure = error instanceof AiQuotaError ? error : lockLeaseLost(error);
          throw failure;
        }
      },
      async stop() {
        stopped = true;
        clearInterval(timer);
        if (renewal) await renewal;
      },
    };
  }

  async function releaseLock(db, lock) {
    if (!lock) return;
    try {
      await db.collection(AI_QUOTA_LOCKS_COLLECTION).deleteOne({
        _id: lock._id,
        token: lock.token,
      });
    } catch {
      // The TTL index will recover an unreleased lock. Never mask a completed
      // reservation transition because best-effort lock cleanup failed.
    }
  }

  async function withUserLock(db, userId, operation) {
    let lock;
    let lease;
    try {
      lock = await acquireLock(db, userId);
      lease = startLockLease(db, lock);
      return await operation(lease);
    } finally {
      if (lease) await lease.stop();
      if (lock) await releaseLock(db, lock);
    }
  }

  async function getStatus(userId) {
    try {
      const normalizedUserId = requireUserId(userId);
      const db = await getDb();
      return await loadStatus(db, normalizedUserId);
    } catch (error) {
      throw unavailable(error);
    }
  }

  async function lookup({ userId, feature, requestId } = {}) {
    try {
      const normalizedUserId = requireUserId(userId);
      const normalizedFeature = normalizeFeature(feature, config.costs);
      const normalizedRequestId = normalizeRequestId(requestId);
      const cost = config.costs[normalizedFeature];
      const db = await getDb();
      const events = db.collection(AI_USAGE_EVENTS_COLLECTION);

      return await withUserLock(db, normalizedUserId, async (lease) => {
        const at = currentTime();
        const existing = await events.findOne({
          userId: normalizedUserId,
          requestId: normalizedRequestId,
        });

        if (existing && existing.feature !== normalizedFeature) {
          throw quotaError(
            "AI_IDEMPOTENCY_KEY_CONFLICT",
            "This Idempotency-Key was already used for a different AI action.",
            { status: 409 },
          );
        }

        if (existing?.status === "committed") {
          return {
            state: "replay",
            eventId: String(existing._id),
            cost: existing.cost,
            quota: await loadStatus(db, normalizedUserId, at),
            ...(existing.replayPayload === undefined ? {} : { replayPayload: existing.replayPayload }),
            ...(existing.resultRef ? { resultRef: existing.resultRef } : {}),
          };
        }

        if (
          existing?.status === "reserved"
          && existing.reservationExpiresAt instanceof Date
          && existing.reservationExpiresAt.getTime() > at.getTime()
        ) {
          const activeCost = Number(existing.cost) > 0 ? Number(existing.cost) : cost;
          throw quotaError(
            "AI_REQUEST_IN_PROGRESS",
            "An AI request with this Idempotency-Key is already in progress.",
            {
              status: 409,
              quota: await loadStatus(db, normalizedUserId, at),
              details: {
                eventId: String(existing._id),
                feature: normalizedFeature,
                cost: activeCost,
              },
            },
          );
        }

        if (existing?.status === "reserved") {
          await lease.assertOwned();
          const expired = await events.updateOne(
            {
              _id: existing._id,
              status: "reserved",
              ...(existing.reservationToken ? { reservationToken: existing.reservationToken } : {}),
            },
            {
              $set: {
                status: "refunded",
                outcome: "reservation_expired",
                refundedAt: at,
                updatedAt: at,
              },
            },
          );
          if (expired?.matchedCount !== 1) throw lockLeaseLost();
        }

        return {
          state: "none",
          cost,
          quota: await loadStatus(db, normalizedUserId, at),
        };
      });
    } catch (error) {
      throw unavailable(error);
    }
  }

  async function reserve({ userId, feature, requestId } = {}) {
    try {
      const normalizedUserId = requireUserId(userId);
      const normalizedFeature = normalizeFeature(feature, config.costs);
      const normalizedRequestId = normalizeRequestId(requestId);
      const cost = config.costs[normalizedFeature];
      const db = await getDb();
      const events = db.collection(AI_USAGE_EVENTS_COLLECTION);

      return await withUserLock(db, normalizedUserId, async (lease) => {
        const at = currentTime();
        let existing = await events.findOne({
          userId: normalizedUserId,
          requestId: normalizedRequestId,
        });

        if (existing && existing.feature !== normalizedFeature) {
          throw quotaError(
            "AI_IDEMPOTENCY_KEY_CONFLICT",
            "This Idempotency-Key was already used for a different AI action.",
            { status: 409 },
          );
        }

        if (existing?.status === "committed") {
          return {
            state: "replay",
            eventId: String(existing._id),
            cost: existing.cost,
            quota: await loadStatus(db, normalizedUserId, at),
            ...(existing.replayPayload === undefined ? {} : { replayPayload: existing.replayPayload }),
            ...(existing.resultRef ? { resultRef: existing.resultRef } : {}),
          };
        }

        if (
          existing?.status === "reserved"
          && existing.reservationExpiresAt instanceof Date
          && existing.reservationExpiresAt.getTime() > at.getTime()
        ) {
          throw quotaError(
            "AI_REQUEST_IN_PROGRESS",
            "An AI request with this Idempotency-Key is already in progress.",
            {
              status: 409,
              quota: await loadStatus(db, normalizedUserId, at),
              details: { eventId: String(existing._id), feature: normalizedFeature, cost },
            },
          );
        }

        if (existing?.status === "reserved") {
          await lease.assertOwned();
          await events.updateOne(
            {
              _id: existing._id,
              status: "reserved",
              reservationExpiresAt: { $lte: at },
              ...(existing.reservationToken ? { reservationToken: existing.reservationToken } : {}),
            },
            {
              $set: {
                status: "refunded",
                outcome: "reservation_expired",
                refundedAt: at,
                updatedAt: at,
              },
            },
          );
          existing = { ...existing, status: "refunded" };
        }

        const before = await loadStatus(db, normalizedUserId, at);
        if (before.remaining < cost) {
          throw quotaError(
            "AI_USER_QUOTA_EXHAUSTED",
            "You do not have enough AI credits remaining for this action.",
            {
              status: 429,
              quota: before,
              details: { feature: normalizedFeature, cost },
            },
          );
        }

        const { periodStart, resetAt } = periodFor(at);
        const reservationExpiresAt = new Date(at.getTime() + config.reservationTtlMs);

        const reservationToken = crypto.randomUUID();
        const expiresAt = new Date(resetAt.getTime() + config.eventRetentionMs);
        let eventId;

        await lease.assertOwned();
        if (existing) {
          await events.updateOne(
            { _id: existing._id },
            {
              $set: {
                userId: normalizedUserId,
                requestId: normalizedRequestId,
                feature: normalizedFeature,
                cost,
                status: "reserved",
                periodStart,
                resetAt,
                reservedAt: at,
                reservationToken,
                reservationExpiresAt,
                expiresAt,
                updatedAt: at,
              },
              $unset: {
                committedAt: "",
                refundedAt: "",
                outcome: "",
                replayPayload: "",
                resultRef: "",
              },
            },
          );
          eventId = existing._id;
        } else {
          const result = await events.insertOne({
            userId: normalizedUserId,
            requestId: normalizedRequestId,
            feature: normalizedFeature,
            cost,
            status: "reserved",
            periodStart,
            resetAt,
            reservedAt: at,
            reservationToken,
            reservationExpiresAt,
            createdAt: at,
            updatedAt: at,
            expiresAt,
          });
          eventId = result.insertedId;
        }

        return {
          state: "reserved",
          eventId: String(eventId),
          reservationToken,
          cost,
          quota: await loadStatus(db, normalizedUserId, at),
        };
      });
    } catch (error) {
      throw unavailable(error);
    }
  }

  async function commit({ eventId, reservationToken, replayPayload, resultRef } = {}) {
    try {
      const _id = normalizeEventId(eventId);
      const normalizedReservationToken = normalizeReservationToken(reservationToken);
      const normalizedResultRef = normalizeResultRef(resultRef);
      const normalizedReplayPayload = prepareReplayPayload(
        replayPayload,
        config.maxReplayBytes,
        Boolean(normalizedResultRef),
      );
      const db = await getDb();
      const events = db.collection(AI_USAGE_EVENTS_COLLECTION);
      const initial = await events.findOne({ _id });
      if (!initial) {
        throw quotaError("AI_QUOTA_EVENT_NOT_FOUND", "The AI credit reservation was not found.", { status: 404 });
      }

      return await withUserLock(db, initial.userId, async (lease) => {
        const at = currentTime();
        const event = await events.findOne({ _id });
        if (!event) {
          throw quotaError("AI_QUOTA_EVENT_NOT_FOUND", "The AI credit reservation was not found.", { status: 404 });
        }
        requireMatchingReservationToken(event, normalizedReservationToken);
        if (event.status === "committed") {
          return { committed: false, status: "committed", quota: await loadStatus(db, event.userId, at) };
        }
        if (event.status !== "reserved") {
          throw quotaError(
            "AI_QUOTA_RESERVATION_INACTIVE",
            "The AI credit reservation is no longer active.",
            { status: 409 },
          );
        }
        if (
          !(event.reservationExpiresAt instanceof Date)
          || event.reservationExpiresAt.getTime() <= at.getTime()
        ) {
          await lease.assertOwned();
          const expired = await events.updateOne(
            {
              _id,
              status: "reserved",
              reservationToken: normalizedReservationToken,
              reservationExpiresAt: { $lte: at },
            },
            {
              $set: {
                status: "refunded",
                outcome: "reservation_expired",
                refundedAt: at,
                updatedAt: at,
              },
            },
          );
          if (expired?.matchedCount !== 1) {
            throw lockLeaseLost();
          }
          throw quotaError(
            "AI_QUOTA_RESERVATION_EXPIRED",
            "The AI credit reservation expired before it could be committed.",
            { status: 409, quota: await loadStatus(db, event.userId, at) },
          );
        }

        const set = {
          status: "committed",
          committedAt: at,
          updatedAt: at,
        };
        if (normalizedReplayPayload !== undefined) set.replayPayload = normalizedReplayPayload;
        if (normalizedResultRef !== undefined) set.resultRef = normalizedResultRef;

        await lease.assertOwned();
        const committed = await events.updateOne(
          {
            _id,
            status: "reserved",
            reservationToken: normalizedReservationToken,
            reservationExpiresAt: { $gt: at },
          },
          {
            $set: set,
            $unset: {
              refundedAt: "",
              outcome: "",
            },
          },
        );
        if (committed?.matchedCount !== 1) {
          throw lockLeaseLost();
        }
        return { committed: true, status: "committed", quota: await loadStatus(db, event.userId, at) };
      });
    } catch (error) {
      throw unavailable(error);
    }
  }

  async function refund({ eventId, reservationToken, outcome = "request_failed" } = {}) {
    try {
      const _id = normalizeEventId(eventId);
      const normalizedReservationToken = normalizeReservationToken(reservationToken);
      const normalizedOutcome = String(outcome || "request_failed").trim().slice(0, 120);
      const db = await getDb();
      const events = db.collection(AI_USAGE_EVENTS_COLLECTION);
      const initial = await events.findOne({ _id });
      if (!initial) {
        throw quotaError("AI_QUOTA_EVENT_NOT_FOUND", "The AI credit reservation was not found.", { status: 404 });
      }

      return await withUserLock(db, initial.userId, async (lease) => {
        const at = currentTime();
        const event = await events.findOne({ _id });
        if (!event) {
          throw quotaError("AI_QUOTA_EVENT_NOT_FOUND", "The AI credit reservation was not found.", { status: 404 });
        }
        requireMatchingReservationToken(event, normalizedReservationToken);
        let refunded = false;
        if (event.status === "reserved") {
          await lease.assertOwned();
          const result = await events.updateOne(
            {
              _id,
              status: "reserved",
              reservationToken: normalizedReservationToken,
            },
            {
              $set: {
                status: "refunded",
                outcome: normalizedOutcome,
                refundedAt: at,
                updatedAt: at,
              },
            },
          );
          if (result?.matchedCount !== 1) {
            throw lockLeaseLost();
          }
          refunded = true;
        }
        return {
          refunded,
          status: refunded ? "refunded" : event.status,
          quota: await loadStatus(db, event.userId, at),
        };
      });
    } catch (error) {
      throw unavailable(error);
    }
  }

  function responseHeaders(quota, cost) {
    return {
      "X-AI-Credit-Limit": String(quota.limit),
      "X-AI-Credit-Remaining": String(quota.remaining),
      "X-AI-Credit-Reset-At": String(quota.resetAt),
      "X-AI-Credit-Cost": String(cost),
    };
  }

  return {
    getStatus,
    lookup,
    reserve,
    commit,
    refund,
    responseHeaders,
  };
}
