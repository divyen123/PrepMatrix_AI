import assert from "node:assert/strict";
import test from "node:test";
import api, { AI_QUOTA_UPDATED_EVENT, extractAiQuotaUpdate } from "./apiClient.js";

function response(headers = {}, payload = {}) {
  const normalized = new Map(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), String(value)]),
  );
  return {
    headers: {
      get(name) {
        return normalized.get(String(name).toLowerCase()) ?? null;
      },
    },
    json: async () => payload,
    ok: true,
    status: 200,
  };
}

test("ignores unrelated feature-specific quota payloads", () => {
  assert.equal(
    extractAiQuotaUpdate(
      response(),
      "/api/resume-builder/status",
    ),
    null,
  );
});

test("leaves authoritative account reads to the request-sequenced provider", () => {
  assert.equal(
    extractAiQuotaUpdate(
      response({
        "X-AI-Credit-Limit": 100,
        "X-AI-Credit-Remaining": 86,
      }),
      "/api/ai/quota",
    ),
    null,
  );
});

test("uses AI credit headers instead of an unrelated nested quota", () => {
  assert.deepEqual(
    extractAiQuotaUpdate(
      response({
        "X-AI-Credit-Limit": 100,
        "X-AI-Credit-Remaining": 85,
        "X-AI-Credit-Reset-At": "2026-10-01T00:00:00.000Z",
        "X-AI-Credit-Cost": 1,
      }),
      "/api/chat",
    ),
    {
      partial: true,
      limit: 100,
      remaining: 85,
      resetAt: "2026-10-01T00:00:00.000Z",
      requestCost: 1,
    },
  );
});

test("overlapping authoritative reads cannot publish an out-of-order balance", async (t) => {
  const previousFetch = globalThis.fetch;
  const previousLocalStorage = globalThis.localStorage;
  const previousWindow = globalThis.window;
  const published = [];
  const pending = [];

  globalThis.localStorage = {
    getItem: () => "token",
    removeItem: () => {},
    setItem: () => {},
  };
  globalThis.window = {
    dispatchEvent(event) {
      if (event.type === AI_QUOTA_UPDATED_EVENT) published.push(event.detail);
    },
  };
  globalThis.fetch = () => new Promise((resolve) => pending.push(resolve));

  t.after(() => {
    globalThis.fetch = previousFetch;
    globalThis.localStorage = previousLocalStorage;
    globalThis.window = previousWindow;
  });

  const olderRead = api.getAiQuota();
  const newerRead = api.getAiQuota();
  pending[1](response({ "X-AI-Credit-Remaining": 85 }));
  pending[0](response({ "X-AI-Credit-Remaining": 86 }));
  await Promise.all([olderRead, newerRead]);

  assert.deepEqual(published, []);
});
