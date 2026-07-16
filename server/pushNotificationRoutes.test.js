import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerPushNotificationRoutes } from "./pushNotificationRoutes.js";
import {
  PUSH_DELIVERY_TIMEOUT_MS,
  createPushSubscriptionRecord,
  isNotificationMutationRequestAllowed,
} from "./pushNotificationService.js";

const USER_ID = "route-test-user";
const DEVICE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function validSubscription() {
  return {
    endpoint: "https://fcm.googleapis.com/wp/route-test-subscription",
    expirationTime: null,
    keys: {
      p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString("base64url"),
      auth: Buffer.alloc(16, 9).toString("base64url"),
    },
  };
}

function mutationSecurity(req, res, next) {
  const allowed = isNotificationMutationRequestAllowed({
    contentType: req.headers["content-type"],
    authorization: req.headers.authorization,
    origin: req.headers.origin,
    allowedOrigins: ["https://app.example.test"],
    isProduction: true,
  });
  return allowed ? next() : res.status(403).json({ error: "blocked" });
}

async function withRoutes({ user = null, updateOne, sendNotification = async () => {} }, run) {
  const updates = [];
  const users = {
    findOne: async () => user,
    updateOne: async (filter, update) => {
      updates.push({ filter, update });
      return updateOne ? updateOne(filter, update, updates.length) : { modifiedCount: 1 };
    },
  };
  const app = express();
  app.use(express.json());
  registerPushNotificationRoutes(app, {
    additionalHosts: [],
    ensureVapidConfigured: async () => ({ publicKey: "public-test-key" }),
    getDb: async () => ({ collection: () => users }),
    mutationSecurity,
    pushTestCooldownMs: 60_000,
    requireAuth: (handler) => async (req, res) => {
      req.user = { _id: USER_ID };
      return handler(req, res);
    },
    webpush: { sendNotification },
  });

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run({ baseUrl, updates });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeIdleConnections?.();
    });
  }
}

function jsonOptions(method, body) {
  return {
    method,
    headers: {
      Authorization: "Bearer route-test-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

test("subscribe stores a versioned device record without resetting reminder state", async () => {
  await withRoutes({ user: { _id: USER_ID } }, async ({ baseUrl, updates }) => {
    const response = await fetch(`${baseUrl}/api/notifications/subscribe`, jsonOptions("POST", {
      deviceId: DEVICE_ID,
      subscription: validSubscription(),
      timezoneOffset: -330,
    }));
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.deviceId, DEVICE_ID);
    assert.match(payload.subscriptionVersion, /^[0-9a-f]{64}$/);
    assert.equal(updates.length, 1);
    assert.equal(Array.isArray(updates[0].update), true);
    assert.equal(updates[0].update.some((stage) => stage.$unset?.includes?.("lastReminderSentDate")), false);
  });
});

test("status is read-only and reports a valid stored device", async () => {
  const record = createPushSubscriptionRecord({
    deviceId: DEVICE_ID,
    subscription: validSubscription(),
    timezoneOffset: -330,
  });
  await withRoutes({ user: { _id: USER_ID, pushSubscriptions: [record] } }, async ({ baseUrl, updates }) => {
    const response = await fetch(`${baseUrl}/api/notifications/status`, {
      headers: { Authorization: "Bearer route-test-token" },
    });
    assert.deepEqual(await response.json(), { subscribed: true });
    assert.equal(updates.length, 0);
  });
});

test("test delivery is device-scoped, rate-claimed, and bounded", async () => {
  const record = createPushSubscriptionRecord({
    deviceId: DEVICE_ID,
    subscription: validSubscription(),
    timezoneOffset: -330,
  });
  const deliveries = [];
  await withRoutes({
    user: { _id: USER_ID, pushSubscriptions: [record] },
    sendNotification: async (...args) => deliveries.push(args),
  }, async ({ baseUrl, updates }) => {
    const response = await fetch(`${baseUrl}/api/notifications/test`, jsonOptions("POST", {
      deviceId: record.deviceId,
      subscriptionVersion: record.subscriptionVersion,
    }));

    assert.equal(response.status, 200);
    assert.equal(updates.length, 1);
    const matched = updates[0].filter.pushSubscriptions.$elemMatch;
    assert.equal(matched.deviceId, record.deviceId);
    assert.equal(matched.subscriptionVersion, record.subscriptionVersion);
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0][2].timeout, PUSH_DELIVERY_TIMEOUT_MS);
  });
});

test("unsubscribe removes only the observed device and subscription version", async () => {
  const record = createPushSubscriptionRecord({
    deviceId: DEVICE_ID,
    subscription: validSubscription(),
    timezoneOffset: -330,
  });
  await withRoutes({ user: { _id: USER_ID, pushSubscriptions: [record] } }, async ({ baseUrl, updates }) => {
    const response = await fetch(`${baseUrl}/api/notifications/subscribe`, jsonOptions("DELETE", {
      deviceId: record.deviceId,
      subscriptionVersion: record.subscriptionVersion,
      subscription: validSubscription(),
    }));

    assert.equal(response.status, 200);
    assert.deepEqual(updates[0].update.$pull.pushSubscriptions, {
      deviceId: record.deviceId,
      subscriptionVersion: record.subscriptionVersion,
    });
  });
});
