import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH_RECOVERY_RETRY_DELAY_MS,
  AUTH_RECOVERY_RETRY_TIMEOUT_MS,
  recoverAuthSession,
} from "./authRecovery.js";

test("retries one transient cold-start failure with a bounded timeout", async () => {
  const calls = [];
  const waits = [];
  const payload = { user: { id: "user-1" } };

  const result = await recoverAuthSession(async (options) => {
    calls.push(options);
    if (calls.length === 1) throw new TypeError("fetch failed");
    return payload;
  }, {
    wait: async (milliseconds) => waits.push(milliseconds),
  });

  assert.equal(result, payload);
  assert.deepEqual(calls, [undefined, { timeoutMs: AUTH_RECOVERY_RETRY_TIMEOUT_MS }]);
  assert.deepEqual(waits, [AUTH_RECOVERY_RETRY_DELAY_MS]);
});

test("does not retry a definitive unauthenticated response", async () => {
  const unauthorized = Object.assign(new Error("Login required."), { status: 401 });
  let calls = 0;
  let waits = 0;

  await assert.rejects(
    recoverAuthSession(async () => {
      calls += 1;
      throw unauthorized;
    }, {
      wait: async () => {
        waits += 1;
      },
    }),
    unauthorized,
  );

  assert.equal(calls, 1);
  assert.equal(waits, 0);
});

test("surfaces a second transient failure instead of retrying indefinitely", async () => {
  let calls = 0;
  const unavailable = Object.assign(new Error("Service unavailable."), { status: 503 });

  await assert.rejects(
    recoverAuthSession(async () => {
      calls += 1;
      throw unavailable;
    }, { wait: async () => undefined }),
    unavailable,
  );

  assert.equal(calls, 2);
});
