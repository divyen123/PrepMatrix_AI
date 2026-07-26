import assert from "node:assert/strict";
import test from "node:test";
import {
  LEARNING_PRIVACY_CONSENT_VERSION,
  acceptLearningPrivacyConsent,
  getLearningPrivacyConsentStorageKey,
  hasLearningPrivacyConsent,
} from "./learningPrivacyConsent.js";

function createStorage(initialValues = {}) {
  const values = new Map(Object.entries(initialValues));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

test("stores learning privacy consent by account and current version", () => {
  const storage = createStorage();
  const accountId = "student-account-a";
  const otherAccountId = "student-account-b";

  assert.equal(hasLearningPrivacyConsent(accountId, { storage }), false);
  const consent = acceptLearningPrivacyConsent(accountId, {
    now: "2026-07-26T10:00:00.000Z",
    storage,
  });

  assert.deepEqual(consent, {
    accepted: true,
    version: LEARNING_PRIVACY_CONSENT_VERSION,
    acceptedAt: "2026-07-26T10:00:00.000Z",
  });
  assert.equal(hasLearningPrivacyConsent(accountId, { storage }), true);
  assert.equal(hasLearningPrivacyConsent(otherAccountId, { storage }), false);
  assert.notEqual(
    getLearningPrivacyConsentStorageKey(accountId),
    getLearningPrivacyConsentStorageKey(otherAccountId),
  );
});

test("requires fresh consent when the disclosure version changes", () => {
  const storage = createStorage();
  const accountId = "student-version-check";

  acceptLearningPrivacyConsent(accountId, { storage, version: "notice-v1" });

  assert.equal(
    hasLearningPrivacyConsent(accountId, { storage, version: "notice-v1" }),
    true,
  );
  assert.equal(
    hasLearningPrivacyConsent(accountId, { storage, version: "notice-v2" }),
    false,
  );
});

test("ignores malformed or non-affirmative stored consent", () => {
  const malformedAccount = "student-malformed";
  const declinedAccount = "student-declined";
  const storage = createStorage({
    [getLearningPrivacyConsentStorageKey(malformedAccount)]: "{not-json",
    [getLearningPrivacyConsentStorageKey(declinedAccount)]: JSON.stringify({
      accepted: false,
      version: LEARNING_PRIVACY_CONSENT_VERSION,
    }),
  });

  assert.equal(hasLearningPrivacyConsent(malformedAccount, { storage }), false);
  assert.equal(hasLearningPrivacyConsent(declinedAccount, { storage }), false);
});

test("falls back to in-memory consent when browser storage is blocked", () => {
  const accountId = "student-storage-blocked";
  const blockedStorage = {
    getItem() {
      throw new Error("Storage access blocked");
    },
    setItem() {
      throw new Error("Storage access blocked");
    },
  };

  assert.equal(hasLearningPrivacyConsent(accountId, { storage: blockedStorage }), false);
  acceptLearningPrivacyConsent(accountId, { storage: blockedStorage });
  assert.equal(hasLearningPrivacyConsent(accountId, { storage: blockedStorage }), true);
});
