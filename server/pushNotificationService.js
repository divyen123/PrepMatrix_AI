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

export function buildReminderClaimOperation({ userId, deviceId, subscriptionVersion, date, claimId, now }) {
  const claimedAt = validDate(now);
  const normalizedDeviceId = normalizeDeviceId(deviceId);
  if (!SHA256_PATTERN.test(subscriptionVersion || "") || !validLocalDate(date)
    || !UUID_V4_PATTERN.test(claimId || "") || !claimedAt) {
    throw new PushSubscriptionValidationError("The reminder dispatch claim is invalid.");
  }
  const staleClaimBefore = new Date(claimedAt.getTime() - REMINDER_CLAIM_TTL_MS);
  return {
    filter: {
      _id: userId,
      pushSubscriptions: {
        $elemMatch: {
          deviceId: normalizedDeviceId,
          subscriptionVersion,
          lastReminderSentDate: { $ne: date },
          $or: [
            { dispatchClaim: { $exists: false } },
            { "dispatchClaim.date": { $ne: date } },
            { "dispatchClaim.claimedAt": { $lte: staleClaimBefore } },
          ],
        },
      },
    },
    update: { $set: { "pushSubscriptions.$.dispatchClaim": { id: claimId, date, claimedAt } } },
  };
}

export function buildReminderSuccessOperation({ userId, deviceId, claimId, date }) {
  return {
    filter: { _id: userId, pushSubscriptions: { $elemMatch: { deviceId, "dispatchClaim.id": claimId } } },
    update: {
      $set: { "pushSubscriptions.$.lastReminderSentDate": date },
      $unset: { "pushSubscriptions.$.dispatchClaim": "" },
    },
  };
}

export function buildExpiredSubscriptionRemovalOperation({ userId, deviceId, subscriptionVersion, claimId }) {
  return {
    filter: {
      _id: userId,
      pushSubscriptions: { $elemMatch: { deviceId, subscriptionVersion, "dispatchClaim.id": claimId } },
    },
    update: { $pull: { pushSubscriptions: { deviceId, subscriptionVersion, "dispatchClaim.id": claimId } } },
  };
}

export function buildReminderClaimClearOperation({ userId, deviceId, claimId }) {
  return {
    filter: { _id: userId, pushSubscriptions: { $elemMatch: { deviceId, "dispatchClaim.id": claimId } } },
    update: { $unset: { "pushSubscriptions.$.dispatchClaim": "" } },
  };
}

function buildReminderHandledOperation({ userId, deviceId, subscriptionVersion, date }) {
  return {
    filter: {
      _id: userId,
      pushSubscriptions: { $elemMatch: { deviceId, subscriptionVersion, lastReminderSentDate: { $ne: date } } },
    },
    update: { $set: { "pushSubscriptions.$.lastReminderSentDate": date } },
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
    body: "Test successful - study reminders are connected securely.",
    url: "/settings",
    tag: "prepmatrix-push-test",
  });
}

export function buildDailyReminderPayload() {
  return JSON.stringify({
    title: "PrepMatrix AI Reminder",
    body: "You have study tasks waiting today. Open PrepMatrix to keep your momentum going.",
    url: "/planner",
    tag: "prepmatrix-daily-study-reminder",
  });
}

export function getLocalReminderClock(now, timezoneOffset) {
  const safeNow = validDate(now);
  if (!safeNow) throw new TypeError("A valid reminder time is required.");
  const offset = normalizeTimezoneOffset(timezoneOffset);
  const localTime = new Date(safeNow.getTime() - offset * 60 * 1000);
  return {
    hour: localTime.getUTCHours(),
    date: `${localTime.getUTCFullYear()}-${String(localTime.getUTCMonth() + 1).padStart(2, "0")}-${String(localTime.getUTCDate()).padStart(2, "0")}`,
    localTime,
  };
}

function getReminderEligibility(workspace, localTime) {
  if (!workspace?.schedule?.length || !workspace.scheduleStartDate) return { ready: false, handled: false };
  const startDate = validDate(workspace.scheduleStartDate);
  if (!startDate) return { ready: false, handled: false };
  const startDateStart = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());
  const localDateStart = Date.UTC(localTime.getUTCFullYear(), localTime.getUTCMonth(), localTime.getUTCDate());
  const dayIndex = Math.floor((localDateStart - startDateStart) / (24 * 60 * 60 * 1000)) + 1;
  const currentDaySchedule = workspace.schedule.find((item) => item.day === dayIndex);
  const tasks = Array.isArray(currentDaySchedule?.tasks) ? currentDaySchedule.tasks : [];
  const completed = Array.isArray(workspace.completed) ? workspace.completed : [];
  const anyCompleted = tasks.some((task) => completed.includes(task.task));
  return { ready: tasks.length > 0 && !anyCompleted, handled: tasks.length === 0 || anyCompleted };
}

async function clearClaim(usersCollection, userId, deviceId, claimId) {
  const operation = buildReminderClaimClearOperation({ userId, deviceId, claimId });
  return usersCollection.updateOne(operation.filter, operation.update);
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

export async function runDailyReminderSweep({
  db,
  ensureVapidConfigured,
  sendNotification,
  additionalHosts = [],
  now = new Date(),
  logger = console,
  claimIdFactory = randomUUID,
  legacyDeviceIdFactory = randomUUID,
}) {
  await ensureVapidConfigured();
  const sweepNow = validDate(now);
  if (!sweepNow) throw new TypeError("A valid reminder sweep time is required.");
  const usersCollection = db.collection("users");
  const workspacesCollection = db.collection("workspaces");
  const users = await usersCollection.find({
    $or: [
      { "pushSubscriptions.0": { $exists: true } },
      { pushSubscription: { $exists: true, $ne: null } },
    ],
  }).toArray();
  const summary = {
    usersExamined: users.length,
    devicesExamined: 0,
    eligible: 0,
    sent: 0,
    expired: 0,
    failed: 0,
    skipped: 0,
    raced: 0,
  };

  for (const user of users) {
    let records = Array.isArray(user.pushSubscriptions) ? user.pushSubscriptions : [];
    if (user.pushSubscription) {
      try {
        const migration = await migrateLegacyPushSubscription({
          usersCollection,
          user,
          additionalHosts,
          now: sweepNow,
          deviceIdFactory: legacyDeviceIdFactory,
        });
        records = migration.records;
        if (migration.raced) summary.raced += 1;
      } catch (error) {
        summary.failed += 1;
        logger.error(`[Web Push] Legacy subscription migration failed for user ${user._id}`, {
          statusCode: getPushDeliveryStatus(error),
        });
      }
    }

    const devices = [];
    for (const record of records) {
      try {
        devices.push(normalizeStoredPushSubscriptionRecord(record, { additionalHosts }));
      } catch {
        summary.skipped += 1;
      }
    }
    summary.devicesExamined += devices.length;
    if (devices.length === 0) continue;

    let workspacePromise = null;
    for (const device of devices) {
      let claimId = "";
      try {
        const clock = getLocalReminderClock(sweepNow, device.timezoneOffset);
        // Scheduled runners are best-effort. Allow a same-day catch-up after
        // 6 PM while the per-device date claim still guarantees one delivery.
        if (clock.hour < 18 || device.lastReminderSentDate === clock.date) {
          summary.skipped += 1;
          continue;
        }
        summary.eligible += 1;
        workspacePromise ||= workspacesCollection.findOne({ userId: user._id });
        const workspace = await workspacePromise;
        const eligibility = getReminderEligibility(workspace, clock.localTime);
        if (!eligibility.ready) {
          if (eligibility.handled) {
            const handled = buildReminderHandledOperation({
              userId: user._id,
              deviceId: device.deviceId,
              subscriptionVersion: device.subscriptionVersion,
              date: clock.date,
            });
            await usersCollection.updateOne(handled.filter, handled.update);
          }
          summary.skipped += 1;
          continue;
        }

        claimId = claimIdFactory();
        const claim = buildReminderClaimOperation({
          userId: user._id,
          deviceId: device.deviceId,
          subscriptionVersion: device.subscriptionVersion,
          date: clock.date,
          claimId,
          now: sweepNow,
        });
        const claimResult = await usersCollection.updateOne(claim.filter, claim.update);
        if (claimResult.modifiedCount !== 1) {
          summary.raced += 1;
          continue;
        }

        try {
          await sendNotification(
            { endpoint: device.endpoint, expirationTime: device.expirationTime, keys: device.keys },
            buildDailyReminderPayload(),
            { TTL: 60 * 60, timeout: PUSH_DELIVERY_TIMEOUT_MS },
          );
        } catch (error) {
          const statusCode = getPushDeliveryStatus(error);
          if (isExpiredPushSubscription(error)) {
            const expired = buildExpiredSubscriptionRemovalOperation({
              userId: user._id,
              deviceId: device.deviceId,
              subscriptionVersion: device.subscriptionVersion,
              claimId,
            });
            const removal = await usersCollection.updateOne(expired.filter, expired.update);
            if (removal.modifiedCount !== 1) {
              await clearClaim(usersCollection, user._id, device.deviceId, claimId);
              summary.raced += 1;
            }
            summary.expired += 1;
          } else {
            await clearClaim(usersCollection, user._id, device.deviceId, claimId);
            summary.failed += 1;
          }
          logger.warn(`[Web Push] Reminder delivery failed for user ${user._id}`, { statusCode });
          claimId = "";
          continue;
        }

        const success = buildReminderSuccessOperation({
          userId: user._id,
          deviceId: device.deviceId,
          claimId,
          date: clock.date,
        });
        const marked = await usersCollection.updateOne(success.filter, success.update);
        if (marked.modifiedCount === 1) summary.sent += 1;
        else summary.raced += 1;
        claimId = "";
      } catch (error) {
        if (claimId) await clearClaim(usersCollection, user._id, device.deviceId, claimId).catch(() => {});
        summary.failed += 1;
        logger.error(`[Web Push] Reminder processing failed for user ${user._id}`, {
          statusCode: getPushDeliveryStatus(error),
        });
      }
    }
  }
  return summary;
}
