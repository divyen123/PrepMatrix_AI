import { createHash, randomUUID } from "node:crypto";

import {
  PUSH_DELIVERY_TIMEOUT_MS,
  REMINDER_CLAIM_TTL_MS,
  buildPushSubscriptionRemovalOperation,
  getPushDeliveryStatus,
  isExpiredPushSubscription,
  migrateLegacyPushSubscription,
  normalizeStoredPushSubscriptionRecord,
  normalizeTimezoneOffset,
} from "./pushNotificationService.js";

export const SCHEDULED_REMINDER_LOOKBACK_MS = 24 * 60 * 60 * 1000;
export const SCHEDULED_REMINDER_DELIVERY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_SCHEDULED_REMINDERS_PER_DEVICE = 5;

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function validDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function safeText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function scheduledAtForDevice(reminder, timezoneOffset) {
  const dateMatch = LOCAL_DATE_PATTERN.exec(String(reminder?.date || ""));
  if (!dateMatch) return null;
  const timeMatch = LOCAL_TIME_PATTERN.exec(String(reminder?.time || "00:00"));
  if (!timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const localWallClock = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (
    localWallClock.getUTCFullYear() !== year
    || localWallClock.getUTCMonth() !== month - 1
    || localWallClock.getUTCDate() !== day
  ) {
    return null;
  }

  return new Date(localWallClock.getTime() + normalizeTimezoneOffset(timezoneOffset) * 60 * 1000);
}

export function getDueScheduledReminderOccurrences(
  reminders,
  {
    now = new Date(),
    timezoneOffset = 0,
    lookbackMs = SCHEDULED_REMINDER_LOOKBACK_MS,
  } = {},
) {
  const sweepNow = validDate(now);
  if (!sweepNow) throw new TypeError("A valid reminder sweep time is required.");
  const oldestAllowed = sweepNow.getTime() - Math.max(0, Number(lookbackMs) || 0);

  return (Array.isArray(reminders) ? reminders : [])
    .map((reminder) => {
      if (!reminder || reminder.completed) return null;
      const id = safeText(reminder.id, 120);
      const title = safeText(reminder.title, 120);
      if (!id || !title) return null;

      const scheduledAt = scheduledAtForDevice(reminder, timezoneOffset);
      if (!scheduledAt) return null;
      const snoozedUntil = validDate(reminder.snoozedUntil);
      const effectiveAt = new Date(Math.max(scheduledAt.getTime(), snoozedUntil?.getTime() || 0));
      if (effectiveAt.getTime() > sweepNow.getTime() || effectiveAt.getTime() < oldestAllowed) return null;

      const occurrenceKey = createHash("sha256")
        .update(`${id}\0${effectiveAt.toISOString()}`)
        .digest("hex");
      return {
        occurrenceKey,
        effectiveAt,
        reminder: {
          id,
          title,
          notes: safeText(reminder.notes, 800),
          priority: ["low", "medium", "high"].includes(reminder.priority) ? reminder.priority : "medium",
        },
      };
    })
    .filter(Boolean)
    .sort((left, right) => (
      left.effectiveAt - right.effectiveAt
      || left.reminder.id.localeCompare(right.reminder.id)
    ));
}

export function buildScheduledReminderPayload(occurrence) {
  const title = safeText(occurrence?.reminder?.title, 120) || "Scheduled reminder";
  const notes = safeText(occurrence?.reminder?.notes, 220);
  const body = notes ? `${title}: ${notes}`.slice(0, 320) : `${title} is due now.`;
  const occurrenceKey = String(occurrence?.occurrenceKey || "");
  return JSON.stringify({
    title: "PrepMatrix Reminder",
    body,
    url: `/dashboard?reminder=${encodeURIComponent(occurrence?.reminder?.id || "")}`,
    tag: `prepmatrix-reminder-${occurrenceKey.slice(0, 40)}`,
    kind: "scheduled-reminder",
    reminderId: occurrence?.reminder?.id || "",
  });
}

export function buildScheduledReminderDeliveryId({ userId, deviceId, occurrenceKey }) {
  return createHash("sha256")
    .update(`${String(userId)}\0${String(deviceId)}\0${String(occurrenceKey)}`)
    .digest("hex");
}

export async function claimScheduledReminderDelivery({
  collection,
  userId,
  deviceId,
  occurrence,
  now = new Date(),
  claimIdFactory = randomUUID,
}) {
  const claimedAt = validDate(now);
  if (!claimedAt) throw new TypeError("A valid reminder claim time is required.");
  const claimId = claimIdFactory();
  const deliveryId = buildScheduledReminderDeliveryId({
    userId,
    deviceId,
    occurrenceKey: occurrence.occurrenceKey,
  });
  const expiresAt = new Date(claimedAt.getTime() + SCHEDULED_REMINDER_DELIVERY_RETENTION_MS);
  const document = {
    _id: deliveryId,
    userId,
    deviceId,
    reminderId: occurrence.reminder.id,
    occurrenceKey: occurrence.occurrenceKey,
    dueAt: occurrence.effectiveAt,
    claimId,
    claimedAt,
    expiresAt,
  };

  try {
    await collection.insertOne(document);
    return { claimed: true, claimId, deliveryId };
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }

  const staleBefore = new Date(claimedAt.getTime() - REMINDER_CLAIM_TTL_MS);
  const reclaimed = await collection.updateOne(
    {
      _id: deliveryId,
      sentAt: { $exists: false },
      claimedAt: { $lte: staleBefore },
    },
    {
      $set: { claimId, claimedAt, expiresAt },
    },
  );
  return { claimed: reclaimed.modifiedCount === 1, claimId, deliveryId };
}

async function clearScheduledReminderClaim(collection, deliveryId, claimId) {
  return collection.deleteOne({ _id: deliveryId, claimId, sentAt: { $exists: false } });
}

async function markScheduledReminderSent(collection, deliveryId, claimId, now) {
  return collection.updateOne(
    { _id: deliveryId, claimId, sentAt: { $exists: false } },
    {
      $set: {
        sentAt: now,
        expiresAt: new Date(now.getTime() + SCHEDULED_REMINDER_DELIVERY_RETENTION_MS),
      },
      $unset: { claimId: "", claimedAt: "" },
    },
  );
}

export async function runScheduledReminderPushSweep({
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
  const deliveriesCollection = db.collection("scheduledReminderDeliveries");
  const users = await usersCollection.find({
    $or: [
      { "pushSubscriptions.0": { $exists: true } },
      { pushSubscription: { $exists: true, $ne: null } },
    ],
  }).toArray();
  const summary = {
    usersExamined: users.length,
    devicesExamined: 0,
    remindersExamined: 0,
    eligible: 0,
    sent: 0,
    expired: 0,
    failed: 0,
    skipped: 0,
    raced: 0,
    deferred: 0,
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

    const workspace = await workspacesCollection.findOne({ userId: user._id });
    const reminders = Array.isArray(workspace?.goalReminderData?.reminders)
      ? workspace.goalReminderData.reminders
      : [];
    summary.remindersExamined += reminders.length;
    if (reminders.length === 0) continue;

    for (const device of devices) {
      const due = getDueScheduledReminderOccurrences(reminders, {
        now: sweepNow,
        timezoneOffset: device.timezoneOffset,
      });
      summary.eligible += due.length;
      let claimedThisSweep = 0;

      for (const occurrence of due) {
        if (claimedThisSweep >= MAX_SCHEDULED_REMINDERS_PER_DEVICE) {
          summary.deferred += 1;
          continue;
        }
        let deliveryId = "";
        let claimId = "";
        try {
          const claim = await claimScheduledReminderDelivery({
            collection: deliveriesCollection,
            userId: user._id,
            deviceId: device.deviceId,
            occurrence,
            now: sweepNow,
            claimIdFactory,
          });
          if (!claim.claimed) {
            summary.skipped += 1;
            continue;
          }
          deliveryId = claim.deliveryId;
          claimId = claim.claimId;
          claimedThisSweep += 1;

          try {
            await sendNotification(
              { endpoint: device.endpoint, expirationTime: device.expirationTime, keys: device.keys },
              buildScheduledReminderPayload(occurrence),
              { TTL: 4 * 60 * 60, timeout: PUSH_DELIVERY_TIMEOUT_MS },
            );
          } catch (error) {
            const statusCode = getPushDeliveryStatus(error);
            if (isExpiredPushSubscription(error)) {
              const removal = buildPushSubscriptionRemovalOperation({
                userId: user._id,
                deviceId: device.deviceId,
                subscriptionVersion: device.subscriptionVersion,
              });
              const removed = await usersCollection.updateOne(removal.filter, removal.update);
              if (removed.modifiedCount !== 1) summary.raced += 1;
              summary.expired += 1;
            } else {
              summary.failed += 1;
            }
            await clearScheduledReminderClaim(deliveriesCollection, deliveryId, claimId);
            deliveryId = "";
            claimId = "";
            logger.warn(`[Web Push] Scheduled reminder delivery failed for user ${user._id}`, { statusCode });
            if (isExpiredPushSubscription(error)) break;
            continue;
          }

          const marked = await markScheduledReminderSent(deliveriesCollection, deliveryId, claimId, sweepNow);
          if (marked.modifiedCount === 1) summary.sent += 1;
          else summary.raced += 1;
          deliveryId = "";
          claimId = "";
        } catch (error) {
          if (deliveryId && claimId) {
            await clearScheduledReminderClaim(deliveriesCollection, deliveryId, claimId).catch(() => {});
          }
          summary.failed += 1;
          logger.error(`[Web Push] Scheduled reminder processing failed for user ${user._id}`, {
            statusCode: getPushDeliveryStatus(error),
          });
        }
      }
    }
  }

  return summary;
}
