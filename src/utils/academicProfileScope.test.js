import assert from "node:assert/strict";
import test from "node:test";
import {
  academicProfileStorageKey,
  clearAcademicProfileBrowserData,
  clearOwnedLegacyAcademicProfileBrowserData,
  getAcademicProfileDataId,
  isValidAcademicProfileDataId,
  resolveAcademicProfileContext,
} from "./academicProfileScope.js";
import { getKidsStorageKey } from "./kidsLearning.js";
import { getSchoolKnowledgeStorageKey } from "./schoolKnowledge.js";

function memoryStorage(entries = []) {
  const values = new Map(entries);
  return {
    get length() {
      return values.size;
    },
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    values,
  };
}

test("resolves the immutable data ID for the active fixed profile slot", () => {
  const user = {
    activeAcademicProfileId: "profile-b",
    academicProfiles: [
      { id: "profile-a", dataId: "data-a", label: "Profile A" },
      { id: "profile-b", dataId: "data-b", label: "Profile B" },
    ],
  };
  const context = resolveAcademicProfileContext({}, user);
  assert.equal(context.slotId, "profile-b");
  assert.equal(context.academicProfileId, "data-b");
  assert.equal(getAcademicProfileDataId(user.academicProfiles[1]), "data-b");
  assert.equal(isValidAcademicProfileDataId("academic-profile:data-b"), true);
  assert.equal(isValidAcademicProfileDataId("bad id"), false);
});

test("browser study keys are distinct for profile instances", () => {
  assert.notEqual(
    academicProfileStorageKey("data-a", "exam-timer"),
    academicProfileStorageKey("data-b", "exam-timer"),
  );
  assert.notEqual(
    getKidsStorageKey({ id: "same-account" }, "data-a"),
    getKidsStorageKey({ id: "same-account" }, "data-b"),
  );
  assert.notEqual(
    getSchoolKnowledgeStorageKey({ id: "same-account", dataId: "data-a" }),
    getSchoolKnowledgeStorageKey({ id: "same-account", dataId: "data-b" }),
  );
});

test("deleting one profile clears only its browser namespace", () => {
  const local = memoryStorage([
    [academicProfileStorageKey("data-a", "kids-local"), "A"],
    [academicProfileStorageKey("data-b", "kids-local"), "B"],
    ["prepmatrix_default_theme", "dark"],
  ]);
  const session = memoryStorage([
    [academicProfileStorageKey("data-a", "active-exam-attempt"), "attempt-a"],
    [academicProfileStorageKey("data-b", "active-exam-attempt"), "attempt-b"],
  ]);

  assert.equal(clearAcademicProfileBrowserData("data-a", {
    localStorageRef: local,
    sessionStorageRef: session,
  }), 2);
  assert.equal(local.getItem(academicProfileStorageKey("data-a", "kids-local")), null);
  assert.equal(session.getItem(academicProfileStorageKey("data-a", "active-exam-attempt")), null);
  assert.equal(local.getItem(academicProfileStorageKey("data-b", "kids-local")), "B");
  assert.equal(session.getItem(academicProfileStorageKey("data-b", "active-exam-attempt")), "attempt-b");
  assert.equal(local.getItem("prepmatrix_default_theme"), "dark");
});

test("deleting the assigned legacy owner also purges unscoped study remnants", () => {
  const user = { id: "account-1" };
  const ownerKey = "prepmatrix-legacy-profile-owner:account-1";
  const local = memoryStorage([
    [ownerKey, "data-a"],
    ["prepmatrix_exam_timer_v1", "timer"],
    ["prepmatrix_kids_v1:legacy", "kids"],
    ["prepmatrix_default_theme", "dark"],
  ]);
  const session = memoryStorage([
    ["prepmatrix_kids_v1:legacy:session", "session"],
  ]);

  assert.equal(clearOwnedLegacyAcademicProfileBrowserData(user, "data-b", {
    localStorageRef: local,
    sessionStorageRef: session,
  }), 0);
  assert.equal(clearOwnedLegacyAcademicProfileBrowserData(user, "data-a", {
    localStorageRef: local,
    sessionStorageRef: session,
  }), 4);
  assert.equal(local.getItem("prepmatrix_exam_timer_v1"), null);
  assert.equal(local.getItem("prepmatrix_kids_v1:legacy"), null);
  assert.equal(session.getItem("prepmatrix_kids_v1:legacy:session"), null);
  assert.equal(local.getItem("prepmatrix_default_theme"), "dark");
});
