import {
  PUSH_DELIVERY_TIMEOUT_MS,
  PushSubscriptionValidationError,
  buildPushSubscriptionRemovalOperation,
  buildTestNotificationPayload,
  createSubscriptionVersion,
  getPushDeliveryStatus,
  isExpiredPushSubscription,
  migrateLegacyPushSubscription,
  normalizePushSubscription,
  normalizeStoredPushSubscriptionRecord,
  normalizeSubscriptionBinding,
  preparePushSubscriptionSync,
} from "./pushNotificationService.js";

function clearLegacySubscriptionUpdate() {
  return {
    $unset: {
      pushSubscription: "",
      timezoneOffset: "",
      lastReminderSentDate: "",
      lastPushTestAt: "",
      reminderDispatchClaim: "",
    },
  };
}

function publicSubscription(record) {
  return {
    endpoint: record.endpoint,
    expirationTime: record.expirationTime,
    keys: record.keys,
  };
}

function findStoredRecord(user, binding, additionalHosts) {
  const rawRecord = Array.isArray(user?.pushSubscriptions)
    ? user.pushSubscriptions.find((record) => (
        record?.deviceId === binding.deviceId &&
        record?.subscriptionVersion === binding.subscriptionVersion
      ))
    : null;
  if (!rawRecord) return null;
  const record = normalizeStoredPushSubscriptionRecord(rawRecord, { additionalHosts });
  return { rawRecord, record };
}

async function migrateOrClearLegacySubscription(users, user, additionalHosts, now) {
  if (!user?.pushSubscription) return;
  const migration = await migrateLegacyPushSubscription({
    usersCollection: users,
    user,
    additionalHosts,
    now,
  });
  if (!migration.invalid) return;

  await users.updateOne(
    { _id: user._id, pushSubscription: user.pushSubscription },
    clearLegacySubscriptionUpdate(),
  );
}

function invalidSubscriptionResponse(res, message = "A valid browser push subscription is required.") {
  return res.status(400).json({
    error: message,
    code: "INVALID_PUSH_SUBSCRIPTION",
  });
}

export function registerPushNotificationRoutes(app, {
  additionalHosts = [],
  ensureVapidConfigured,
  getDb,
  mutationSecurity,
  pushTestCooldownMs = 60 * 1000,
  requireAuth,
  webpush,
}) {
  app.get("/api/notifications/vapid-key", async (_req, res) => {
    try {
      const keys = await ensureVapidConfigured();
      res.set("Cache-Control", "no-store");
      return res.json({ publicKey: keys.publicKey, configured: true });
    } catch (error) {
      console.error("[Web Push] VAPID initialization failed:", error instanceof Error ? error.name : "UnknownError");
      res.set("Cache-Control", "no-store");
      return res.status(503).json({
        error: "Study reminders are temporarily unavailable. Please try again shortly.",
        code: "PUSH_NOT_CONFIGURED",
        configured: false,
      });
    }
  });

  app.get("/api/notifications/status", requireAuth(async (req, res) => {
    const db = await getDb();
    const user = await db.collection("users").findOne(
      { _id: req.user._id },
      { projection: { pushSubscriptions: 1, pushSubscription: 1 } },
    );
    const hasDeviceSubscription = (Array.isArray(user?.pushSubscriptions) ? user.pushSubscriptions : [])
      .some((record) => {
        try {
          normalizeStoredPushSubscriptionRecord(record, { additionalHosts });
          return true;
        } catch {
          return false;
        }
      });
    let hasLegacySubscription = false;
    if (user?.pushSubscription) {
      try {
        normalizePushSubscription(user.pushSubscription, { additionalHosts });
        hasLegacySubscription = true;
      } catch {
        hasLegacySubscription = false;
      }
    }

    res.set("Cache-Control", "no-store");
    return res.json({ subscribed: hasDeviceSubscription || hasLegacySubscription });
  }));

  app.post(
    "/api/notifications/subscribe",
    mutationSecurity,
    requireAuth(async (req, res) => {
      const { deviceId, subscription, timezoneOffset } = req.body ?? {};
      let prepared;
      try {
        prepared = preparePushSubscriptionSync({
          deviceId,
          subscription,
          timezoneOffset,
          additionalHosts,
          now: new Date(),
        });
      } catch (error) {
        if (!(error instanceof PushSubscriptionValidationError)) throw error;
        return invalidSubscriptionResponse(res);
      }

      try {
        await ensureVapidConfigured();
        const db = await getDb();
        const users = db.collection("users");
        const user = await users.findOne(
          { _id: req.user._id },
          {
            projection: {
              pushSubscriptions: 1,
              pushSubscription: 1,
              timezoneOffset: 1,
              lastReminderSentDate: 1,
              reminderDispatchClaim: 1,
            },
          },
        );
        await migrateOrClearLegacySubscription(users, user, additionalHosts, prepared.record.updatedAt);
        await users.updateOne({ _id: req.user._id }, prepared.pipeline);
        res.set("Cache-Control", "no-store");
        return res.json({
          success: true,
          deviceId: prepared.record.deviceId,
          subscriptionVersion: prepared.subscriptionVersion,
        });
      } catch (error) {
        console.error(`[Web Push] Failed to save subscription for ${req.user._id}:`, error instanceof Error ? error.name : "UnknownError");
        return res.status(500).json({ error: "The notification subscription could not be saved." });
      }
    }),
  );

  app.post(
    "/api/notifications/test",
    mutationSecurity,
    requireAuth(async (req, res) => {
      res.set("Cache-Control", "no-store");
      let binding;
      try {
        binding = normalizeSubscriptionBinding(req.body, { additionalHosts });
      } catch (error) {
        if (!(error instanceof PushSubscriptionValidationError)) throw error;
        return invalidSubscriptionResponse(res, "Reconnect this browser before sending a test notification.");
      }

      const db = await getDb();
      const users = db.collection("users");
      let user = await users.findOne(
        { _id: req.user._id },
        { projection: { pushSubscriptions: 1 } },
      );
      let stored;
      try {
        stored = findStoredRecord(user, binding, additionalHosts);
      } catch {
        stored = null;
      }
      if (!stored) {
        return res.status(409).json({
          error: "Enable study reminders on this browser before sending a test notification.",
          code: "PUSH_NOT_SUBSCRIBED",
        });
      }

      try {
        await ensureVapidConfigured();
      } catch (error) {
        console.error("[Web Push] Test setup failed:", error instanceof Error ? error.name : "UnknownError");
        return res.status(503).json({
          error: "Study reminders are temporarily unavailable.",
          code: "PUSH_NOT_CONFIGURED",
        });
      }

      const now = new Date();
      const cooldownBefore = new Date(now.getTime() - pushTestCooldownMs);
      const claim = await users.updateOne(
        {
          _id: req.user._id,
          pushSubscriptions: {
            $elemMatch: {
              deviceId: binding.deviceId,
              subscriptionVersion: binding.subscriptionVersion,
              $or: [
                { lastPushTestAt: { $exists: false } },
                { lastPushTestAt: null },
                { lastPushTestAt: { $lte: cooldownBefore } },
              ],
            },
          },
        },
        { $set: { "pushSubscriptions.$.lastPushTestAt": now } },
      );

      if (claim.modifiedCount !== 1) {
        user = await users.findOne(
          { _id: req.user._id },
          { projection: { pushSubscriptions: 1 } },
        );
        const current = (Array.isArray(user?.pushSubscriptions) ? user.pushSubscriptions : [])
          .find((record) => (
            record?.deviceId === binding.deviceId &&
            record?.subscriptionVersion === binding.subscriptionVersion
          ));
        if (!current) {
          return res.status(409).json({
            error: "Enable study reminders on this browser before sending a test notification.",
            code: "PUSH_NOT_SUBSCRIBED",
          });
        }
        const lastTestAt = current.lastPushTestAt instanceof Date ? current.lastPushTestAt.getTime() : now.getTime();
        const retryAfter = Math.max(1, Math.ceil((lastTestAt + pushTestCooldownMs - now.getTime()) / 1000));
        res.set("Retry-After", String(retryAfter));
        return res.status(429).json({
          error: "Please wait before sending another test notification.",
          code: "PUSH_TEST_RATE_LIMITED",
        });
      }

      try {
        await webpush.sendNotification(
          publicSubscription(stored.record),
          buildTestNotificationPayload(),
          { TTL: 60, timeout: PUSH_DELIVERY_TIMEOUT_MS },
        );
        return res.json({ success: true });
      } catch (error) {
        const statusCode = getPushDeliveryStatus(error);
        console.warn(`[Web Push] Test delivery failed for user ${req.user._id}`, { statusCode });
        if (isExpiredPushSubscription(error)) {
          const removal = buildPushSubscriptionRemovalOperation({
            userId: req.user._id,
            deviceId: binding.deviceId,
            subscriptionVersion: binding.subscriptionVersion,
          });
          await users.updateOne(removal.filter, removal.update);
          return res.status(410).json({
            error: "The browser notification subscription expired.",
            code: "PUSH_SUBSCRIPTION_EXPIRED",
          });
        }
        return res.status(502).json({
          error: "The browser push provider did not accept the test notification.",
          code: "PUSH_DELIVERY_FAILED",
        });
      }
    }),
  );

  app.delete(
    "/api/notifications/subscribe",
    mutationSecurity,
    requireAuth(async (req, res) => {
      res.set("Cache-Control", "no-store");
      let binding;
      try {
        binding = normalizeSubscriptionBinding(req.body, { additionalHosts });
      } catch (error) {
        if (!(error instanceof PushSubscriptionValidationError)) throw error;
        return invalidSubscriptionResponse(res, "A valid browser notification binding is required.");
      }

      try {
        const db = await getDb();
        const users = db.collection("users");
        const removal = buildPushSubscriptionRemovalOperation({
          userId: req.user._id,
          deviceId: binding.deviceId,
          subscriptionVersion: binding.subscriptionVersion,
        });
        await users.updateOne(removal.filter, removal.update);

        if (binding.subscription) {
          const legacyUser = await users.findOne(
            { _id: req.user._id },
            { projection: { pushSubscription: 1 } },
          );
          if (legacyUser?.pushSubscription) {
            try {
              const legacySubscription = normalizePushSubscription(legacyUser.pushSubscription, { additionalHosts });
              if (createSubscriptionVersion(legacySubscription) === binding.subscriptionVersion) {
                await users.updateOne(
                  { _id: req.user._id, pushSubscription: legacyUser.pushSubscription },
                  clearLegacySubscriptionUpdate(),
                );
              }
            } catch {
              // Invalid legacy data is never used for an outbound request.
            }
          }
        }

        return res.json({ success: true });
      } catch (error) {
        console.error(`[Web Push] Failed to remove subscription for ${req.user._id}:`, error instanceof Error ? error.name : "UnknownError");
        return res.status(500).json({ error: "The notification subscription could not be removed." });
      }
    }),
  );
}
