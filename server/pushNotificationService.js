import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

const DEFAULT_TRUSTED_PUSH_HOSTS = Object.freeze([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
  "*.notify.windows.com",
]);

export const MAX_PUSH_SUBSCRIPTIONS_PER_USER = 8;
export const REMINDER_CLAIM_TTL_MS = 5 * 60 * 1000;
export const PUSH_DELIVERY_TIMEOUT_MS = 15 * 1000;

const MAX_ENDPOINT_LENGTH = 4096;
const MAX_KEY_LENGTH = 256;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class PushSubscriptionValidationError extends Error {
  constructor(message = "A valid browser push subscription is required.") {
    super(message);
    this.name = "PushSubscriptionValidationError";
    this.code = "INVALID_PUSH_SUBSCRIPTION";
  }
}

function base64UrlBytes(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_KEY_LENGTH || !/^[A-Za-z0-9_-]+={0,2}$/.test(trimmed)) return null;
  try {
    const normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
    return Buffer.from(normalized + padding, "base64");
  } catch {
    return null;
  }
}

function hostMatchesPattern(hostname, pattern) {
  const normalizedPattern = String(pattern || "").trim().toLowerCase();
  if (!normalizedPattern) return false;
  if (!normalizedPattern.startsWith("*.")) return hostname === normalizedPattern;
  const suffix = normalizedPattern.slice(2);
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function validLocalDate(value) {
  return typeof value === "string" && LOCAL_DATE_PATTERN.test(value) ? value : "";
}

function normalizeDispatchClaim(value, { createMissingId = false, idFactory = randomUUID } = {}) {
  if (!value || typeof value !== "object") return null;
  const date = validLocalDate(value.date);
  const claimedAt = validDate(value.claimedAt);
  const suppliedId = typeof value.id === "string" ? value.id.trim().toLowerCase() : "";
  const id = UUID_V4_PATTERN.test(suppliedId) ? suppliedId : createMissingId ? idFactory() : "";
  if (!date || !claimedAt || !UUID_V4_PATTERN.test(id)) return null;
  return { id, date, claimedAt };
}

function recordIdentity(record) {
  return {
    deviceId: record.deviceId,
    subscriptionVersion: record.subscriptionVersion,
    endpoint: record.endpoint,
    expirationTime: record.expirationTime ?? null,
    keys: { p256dh: record.keys.p256dh, auth: record.keys.auth },
    timezoneOffset: record.timezoneOffset,
    updatedAt: record.updatedAt,
  };
}

function stateFallbackFromRecord(record) {
  const state = {};
  const sentDate = validLocalDate(record?.lastReminderSentDate);
  if (sentDate) state.lastReminderSentDate = sentDate;
  if (record?.dispatchClaim) state.dispatchClaim = record.dispatchClaim;
  if (record?.createdAt) state.createdAt = record.createdAt;
  return state;
}

export function parseAdditionalPushHosts(value) {
  return String(value || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(isValidAdditionalPushHostPattern)
    .slice(0, 20);
}

export function normalizeDeviceId(value) {
  const deviceId = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!UUID_V4_PATTERN.test(deviceId)) {
    throw new PushSubscriptionValidationError("A valid notification device identifier is required.");
  }
  return deviceId;
}

export function normalizePushSubscription(subscription, { additionalHosts = [] } = {}) {
  if (!subscription || typeof subscription !== "object" || Array.isArray(subscription)) {
    throw new PushSubscriptionValidationError();
  }
  const rawEndpoint = typeof subscription.endpoint === "string" ? subscription.endpoint.trim() : "";
  if (!rawEndpoint || rawEndpoint.length > MAX_ENDPOINT_LENGTH) throw new PushSubscriptionValidationError();
  let endpoint;
  try {
    endpoint = new URL(rawEndpoint);
  } catch {
    throw new PushSubscriptionValidationError();
  }
  const trustedHosts = [...DEFAULT_TRUSTED_PUSH_HOSTS, ...additionalHosts];
  const endpointAllowed = endpoint.protocol === "https:" && !endpoint.username && !endpoint.password && !endpoint.hash
    && trustedHosts.some((pattern) => hostMatchesPattern(endpoint.hostname.toLowerCase(), pattern));
  const p256dh = typeof subscription.keys?.p256dh === "string" ? subscription.keys.p256dh.trim() : "";
  const auth = typeof subscription.keys?.auth === "string" ? subscription.keys.auth.trim() : "";
  const p256dhBytes = base64UrlBytes(p256dh);
  const authBytes = base64UrlBytes(auth);
  if (!endpointAllowed || p256dhBytes?.length !== 65 || p256dhBytes[0] !== 4 || authBytes?.length !== 16) {
    throw new PushSubscriptionValidationError();
  }
  const expirationTime = Number.isFinite(subscription.expirationTime) && subscription.expirationTime > 0
    ? Number(subscription.expirationTime)
    : null;
  return { endpoint: endpoint.toString(), expirationTime, keys: { p256dh, auth } };
}

export function normalizeTimezoneOffset(value) {
  return Number.isInteger(value) && value >= -840 && value <= 840 ? value : 0;
}

export function createSubscriptionVersion(subscription) {
  return createHash("sha256")
    .update(`${subscription.endpoint}\n${subscription.keys.p256dh}\n${subscription.keys.auth}`, "utf8")
    .digest("hex");
}

export function normalizeSubscriptionBinding(binding, options = {}) {
  const deviceId = normalizeDeviceId(binding?.deviceId);
  const subscriptionVersion = typeof binding?.subscriptionVersion === "string" ? binding.subscriptionVersion.trim() : "";
  if (!SHA256_PATTERN.test(subscriptionVersion)) {
    throw new PushSubscriptionValidationError("The notification subscription version is stale or invalid.");
  }
  if (!binding?.subscription) return { deviceId, subscriptionVersion };
  const subscription = normalizePushSubscription(binding.subscription, options);
  if (subscriptionVersion !== createSubscriptionVersion(subscription)) {
    throw new PushSubscriptionValidationError("The notification subscription version is stale or invalid.");
  }
  return { deviceId, subscriptionVersion, subscription };
}

export function createPushSubscriptionRecord({ deviceId, subscription, timezoneOffset, now = new Date(), additionalHosts = [], deviceIdFactory = randomUUID }) {
  const normalizedSubscription = normalizePushSubscription(subscription, { additionalHosts });
  const normalizedNow = validDate(now);
  if (!normalizedNow) throw new PushSubscriptionValidationError("The subscription timestamp is invalid.");
  return {
    deviceId: normalizeDeviceId(deviceId || deviceIdFactory()),
    subscriptionVersion: createSubscriptionVersion(normalizedSubscription),
    ...normalizedSubscription,
    timezoneOffset: normalizeTimezoneOffset(timezoneOffset),
    createdAt: normalizedNow,
    updatedAt: normalizedNow,
  };
}

export function normalizeStoredPushSubscriptionRecord(record, options = {}) {
  const subscription = normalizePushSubscription(record, options);
  const deviceId = normalizeDeviceId(record?.deviceId);
  const expectedVersion = createSubscriptionVersion(subscription);
  if (record?.subscriptionVersion !== expectedVersion) {
    throw new PushSubscriptionValidationError("The stored notification subscription version is invalid.");
  }
  const normalized = {
    deviceId,
    subscriptionVersion: expectedVersion,
    ...subscription,
    timezoneOffset: normalizeTimezoneOffset(record?.timezoneOffset),
    createdAt: validDate(record?.createdAt) || new Date(0),
    updatedAt: validDate(record?.updatedAt) || validDate(record?.createdAt) || new Date(0),
  };
  const sentDate = validLocalDate(record?.lastReminderSentDate);
  if (sentDate) normalized.lastReminderSentDate = sentDate;
  const dispatchClaim = normalizeDispatchClaim(record?.dispatchClaim);
  if (dispatchClaim) normalized.dispatchClaim = dispatchClaim;
  return normalized;
}

export function mergePushSubscriptionRecords(records, record, { maxDevices = MAX_PUSH_SUBSCRIPTIONS_PER_USER, fallbackState = {} } = {}) {
  const source = Array.isArray(records) ? records : [];
  const deviceMatch = source.find((item) => item?.deviceId === record.deviceId);
  const subscriptionMatch = source.find((item) => item?.subscriptionVersion === record.subscriptionVersion || item?.endpoint === record.endpoint);
  const existing = deviceMatch || subscriptionMatch || null;
  const preservedState = { ...stateFallbackFromRecord(fallbackState), ...stateFallbackFromRecord(existing) };
  const merged = {
    ...preservedState,
    ...recordIdentity(record),
    createdAt: existing?.createdAt || fallbackState?.createdAt || record.createdAt,
  };
  const remaining = source.filter((item) => item?.deviceId !== record.deviceId
    && item?.subscriptionVersion !== record.subscriptionVersion && item?.endpoint !== record.endpoint);
  const limit = Math.max(1, Math.min(32, Number(maxDevices) || MAX_PUSH_SUBSCRIPTIONS_PER_USER));
  return [merged, ...remaining].slice(0, limit);
}

export function buildPushSubscriptionSyncPipeline(record, { maxDevices = MAX_PUSH_SUBSCRIPTIONS_PER_USER, fallbackState = {} } = {}) {
  const limit = Math.max(1, Math.min(32, Number(maxDevices) || MAX_PUSH_SUBSCRIPTIONS_PER_USER));
  const identity = recordIdentity(record);
  const normalizedFallback = stateFallbackFromRecord(fallbackState);
  return [{
    $set: {
      pushSubscriptions: {
        $let: {
          vars: { records: { $cond: [{ $isArray: "$pushSubscriptions" }, "$pushSubscriptions", []] } },
          in: {
            $let: {
              vars: {
                deviceMatch: { $arrayElemAt: [{ $filter: { input: "$$records", as: "record", cond: { $eq: ["$$record.deviceId", record.deviceId] } } }, 0] },
                subscriptionMatch: {
                  $arrayElemAt: [{
                    $filter: {
                      input: "$$records",
                      as: "record",
                      cond: { $or: [
                        { $eq: ["$$record.subscriptionVersion", record.subscriptionVersion] },
                        { $eq: ["$$record.endpoint", record.endpoint] },
                      ] },
                    },
                  }, 0],
                },
                remaining: {
                  $filter: {
                    input: "$$records",
                    as: "record",
                    cond: { $and: [
                      { $ne: ["$$record.deviceId", record.deviceId] },
                      { $ne: ["$$record.subscriptionVersion", record.subscriptionVersion] },
                      { $ne: ["$$record.endpoint", record.endpoint] },
                    ] },
                  },
                },
              },
              in: {
                $let: {
                  vars: { existing: { $ifNull: ["$$deviceMatch", "$$subscriptionMatch"] } },
                  in: {
                    $slice: [{
                      $concatArrays: [[{
                        $mergeObjects: [
                          normalizedFallback,
                          { $ifNull: ["$$existing", {}] },
                          identity,
                          { createdAt: { $ifNull: ["$$existing.createdAt", normalizedFallback.createdAt || record.createdAt] } },
                        ],
                      }], "$$remaining"],
                    }, limit],
                  },
                },
              },
            },
          },
        },
      },
    },
  }];
}

export function preparePushSubscriptionSync(input) {
  const record = createPushSubscriptionRecord(input);
  return { record, subscriptionVersion: record.subscriptionVersion, pipeline: buildPushSubscriptionSyncPipeline(record) };
}

export function buildPushSubscriptionRemovalOperation({ userId, deviceId, subscriptionVersion }) {
  const normalizedDeviceId = normalizeDeviceId(deviceId);
  if (!SHA256_PATTERN.test(subscriptionVersion || "")) {
    throw new PushSubscriptionValidationError("The notification subscription version is invalid.");
  }
  return {
    filter: { _id: userId },
    update: { $pull: { pushSubscriptions: { deviceId: normalizedDeviceId, subscriptionVersion } } },
  };
}

export async function migrateLegacyPushSubscription({
  usersCollection,
  user,
  additionalHosts = [],
  now = new Date(),
  deviceIdFactory = randomUUID,
}) {
  if (!user?.pushSubscription) {
    return { migrated: false, records: Array.isArray(user?.pushSubscriptions) ? user.pushSubscriptions : [] };
  }
  let subscription;
  try {
    subscription = normalizePushSubscription(user.pushSubscription, { additionalHosts });
  } catch {
    return { migrated: false, invalid: true, records: Array.isArray(user.pushSubscriptions) ? user.pushSubscriptions : [] };
  }
  const deviceId = deviceIdFactory();
  const record = createPushSubscriptionRecord({ deviceId, subscription, timezoneOffset: user.timezoneOffset, now, additionalHosts });
  const fallbackState = {};
  const sentDate = validLocalDate(user.lastReminderSentDate);
  if (sentDate) fallbackState.lastReminderSentDate = sentDate;
  const dispatchClaim = normalizeDispatchClaim(user.reminderDispatchClaim, { createMissingId: true, idFactory: deviceIdFactory });
  if (dispatchClaim) fallbackState.dispatchClaim = dispatchClaim;
  const pipeline = [
    ...buildPushSubscriptionSyncPipeline(record, { fallbackState }),
    { $unset: ["pushSubscription", "timezoneOffset", "lastReminderSentDate", "reminderDispatchClaim"] },
  ];
  const result = await usersCollection.updateOne({
    _id: user._id,
    "pushSubscription.endpoint": user.pushSubscription.endpoint,
    "pushSubscription.keys.p256dh": user.pushSubscription.keys.p256dh,
    "pushSubscription.keys.auth": user.pushSubscription.keys.auth,
  }, pipeline);
  if (result.modifiedCount !== 1) {
    return { migrated: false, raced: true, records: Array.isArray(user.pushSubscriptions) ? user.pushSubscriptions : [] };
  }
  return {
    migrated: true,
    deviceId,
    subscriptionVersion: record.subscriptionVersion,
    records: mergePushSubscriptionRecords(user.pushSubscriptions, record, { fallbackState }),
  };
}

export function schedulerSecretMatches(authorizationHeader, configuredSecret) {
  const secret = typeof configuredSecret === "string" ? configuredSecret.trim() : "";
  const header = typeof authorizationHeader === "string" ? authorizationHeader.trim() : "";
  if (secret.length < 32 || header.length < 8 || header.length > 1024 || !header.startsWith("Bearer ")) return false;
  const suppliedToken = header.slice(7).trim();
  if (!suppliedToken) return false;
  const expectedDigest = createHash("sha256").update(secret).digest();
  const suppliedDigest = createHash("sha256").update(suppliedToken).digest();
  return timingSafeEqual(expectedDigest, suppliedDigest);
}

export function getPushDeliveryStatus(error) {
  return Number(error?.statusCode || error?.status || 0);
}

export function isExpiredPushSubscription(error) {
  return [404, 410].includes(getPushDeliveryStatus(error));
}

export function buildTestNotificationPayload() {
  return JSON.stringify({
    title: "PrepMatrix AI",
    body: "Test successful - action alerts are connected securely.",
    url: "/settings",
    kind: "push-test",
    tag: "prepmatrix-push-test",
    forceNative: true,
  });
}

function isValidAdditionalPushHostPattern(value) {
  const pattern = String(value || "").trim().toLowerCase();
  const hostname = pattern.startsWith("*.") ? pattern.slice(2) : pattern;
  if (!hostname || hostname.length > 253 || hostname.includes("..")) return false;
  const labels = hostname.split(".");
  return labels.length >= 2 && labels.every((label) => (
    label.length >= 1 && label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  ));
}

export function isNotificationMutationRequestAllowed({
  contentType,
  authorization,
  origin,
  allowedOrigins = [],
  isProduction = false,
}) {
  const mediaType = String(contentType || "").split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") return false;
  if (/^Bearer\s+\S+$/.test(String(authorization || "").trim())) return true;
  const requestOrigin = String(origin || "").trim();
  const trusted = new Set(allowedOrigins.map((item) => String(item || "").trim()).filter(Boolean));
  if (requestOrigin && trusted.has(requestOrigin)) return true;
  return !isProduction && !requestOrigin;
}
