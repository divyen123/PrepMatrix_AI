import assert from "node:assert/strict";
import test from "node:test";
import {
  DASHBOARD_VOICE_HINT_DURATION_MS,
  DASHBOARD_VOICE_HINT_REENTRY_GAP_MS,
  DASHBOARD_VOICE_HINT_STORAGE_KEY,
  DASHBOARD_VOICE_HINTS,
  getNextDashboardVoiceHint,
  hasDashboardVoiceHintReentryGapElapsed,
} from "./dashboardVoiceHints.js";

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

test("rotates dashboard voice hints in order across app entries", () => {
  const storage = createStorage();

  assert.equal(getNextDashboardVoiceHint(storage), DASHBOARD_VOICE_HINTS[0]);
  assert.equal(getNextDashboardVoiceHint(storage), DASHBOARD_VOICE_HINTS[1]);
  assert.equal(storage.getItem(DASHBOARD_VOICE_HINT_STORAGE_KEY), "1");
});

test("wraps to the first voice hint after every description has appeared", () => {
  const storage = createStorage({
    [DASHBOARD_VOICE_HINT_STORAGE_KEY]: String(DASHBOARD_VOICE_HINTS.length - 1),
  });

  assert.equal(getNextDashboardVoiceHint(storage), DASHBOARD_VOICE_HINTS[0]);
  assert.equal(storage.getItem(DASHBOARD_VOICE_HINT_STORAGE_KEY), "0");
});

test("recovers from malformed or unavailable hint storage", () => {
  const malformedStorage = createStorage({
    [DASHBOARD_VOICE_HINT_STORAGE_KEY]: "not-an-index",
  });
  const blockedStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };

  assert.equal(getNextDashboardVoiceHint(malformedStorage), DASHBOARD_VOICE_HINTS[0]);
  assert.equal(getNextDashboardVoiceHint(blockedStorage), DASHBOARD_VOICE_HINTS[0]);
});

test("provides several Alexa-style prompts for an exact five-second appearance", () => {
  assert.equal(DASHBOARD_VOICE_HINT_DURATION_MS, 5000);
  assert.ok(DASHBOARD_VOICE_HINTS.length >= 8);
  assert.ok(DASHBOARD_VOICE_HINTS.every((hint) => hint.startsWith("Hey PrepMatrix,")));
  assert.equal(new Set(DASHBOARD_VOICE_HINTS).size, DASHBOARD_VOICE_HINTS.length);
});

test("treats returning from a meaningful background gap as a new app entry", () => {
  const hiddenAt = 10_000;

  assert.equal(
    hasDashboardVoiceHintReentryGapElapsed(
      hiddenAt,
      hiddenAt + DASHBOARD_VOICE_HINT_REENTRY_GAP_MS - 1,
    ),
    false,
  );
  assert.equal(
    hasDashboardVoiceHintReentryGapElapsed(
      hiddenAt,
      hiddenAt + DASHBOARD_VOICE_HINT_REENTRY_GAP_MS,
    ),
    true,
  );
  assert.equal(hasDashboardVoiceHintReentryGapElapsed(undefined, hiddenAt), false);
  assert.equal(hasDashboardVoiceHintReentryGapElapsed(hiddenAt, hiddenAt - 1), false);
});
