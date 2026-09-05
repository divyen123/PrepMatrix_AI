import assert from "node:assert/strict";
import test from "node:test";
import api, {
  ACADEMIC_PROFILE_DELETE_TIMEOUT_MS,
  AUTH_RECOVERY_TIMEOUT_MS,
  getApiAcademicProfileScope,
  setApiAcademicProfileScope,
} from "./apiClient.js";

test("gives profile deletion and authoritative recovery enough time to complete", () => {
  assert.ok(AUTH_RECOVERY_TIMEOUT_MS >= 65_000);
  assert.ok(ACADEMIC_PROFILE_DELETE_TIMEOUT_MS >= AUTH_RECOVERY_TIMEOUT_MS);
});

function response(payload = {}) {
  return {
    headers: { get: () => null },
    json: async () => payload,
    ok: true,
    status: 200,
  };
}

test("authenticated requests send the captured academic profile data ID", async (t) => {
  const previousFetch = globalThis.fetch;
  const previousLocalStorage = globalThis.localStorage;
  const calls = [];
  globalThis.localStorage = {
    getItem: () => "token",
    removeItem: () => {},
    setItem: () => {},
  };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return response({ ok: true });
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
    globalThis.localStorage = previousLocalStorage;
    setApiAcademicProfileScope("");
  });

  setApiAcademicProfileScope({ academicProfileId: "data-a" });
  assert.equal(getApiAcademicProfileScope(), "data-a");
  await api.get("/api/example");
  await api.get("/api/example", { academicProfileId: "data-b" });
  await api.get("/api/account-level", { academicProfileId: null });
  await api.syncAppUsage({ version: 2, sourceId: "usage-source-test", days: {} });
  await api.getAiQuota();

  assert.equal(calls[0].options.headers["X-Academic-Profile-Id"], "data-a");
  assert.equal(calls[1].options.headers["X-Academic-Profile-Id"], "data-b");
  assert.equal("X-Academic-Profile-Id" in calls[2].options.headers, false);
  assert.equal(calls[3].url.endsWith("/api/app-usage/sync"), true);
  assert.equal("X-Academic-Profile-Id" in calls[3].options.headers, false);
  assert.equal(calls[4].url.endsWith("/api/ai/quota"), true);
  assert.equal("X-Academic-Profile-Id" in calls[4].options.headers, false);
});
