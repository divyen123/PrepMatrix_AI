import assert from "node:assert/strict";
import test from "node:test";
import { clearAcademicProfileBrowserData } from "./academicProfileScope.js";
import {
  ACADEMIC_PROFILE_GUIDE_VERSION,
  claimFirstProfileBGuide,
  getAcademicProfileGuideMarkerKey,
} from "./academicProfileGuide.js";

function createStorage() {
  const values = new Map();
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
  };
}

test("claims the first Profile B guide once for one immutable profile", () => {
  const storage = createStorage();
  const profileB = {
    dataId: "academic-profile:test:profile-b",
    displayName: "Medical Studies",
    id: "profile-b",
    label: "Profile A",
  };

  assert.equal(claimFirstProfileBGuide(profileB, storage), true);
  assert.equal(claimFirstProfileBGuide(profileB, storage), false);
  assert.equal(
    storage.getItem(getAcademicProfileGuideMarkerKey(profileB)),
    ACADEMIC_PROFILE_GUIDE_VERSION,
  );
});

test("never auto-opens for Profile A and treats recreated Profile B as new", () => {
  const storage = createStorage();
  const profileA = {
    dataId: "academic-profile:test:profile-a",
    displayName: "Profile B",
    id: "profile-a",
    label: "Profile B",
  };
  const firstProfileB = {
    dataId: "academic-profile:test:profile-b-one",
    id: "profile-b",
    label: "Profile B",
  };
  const recreatedProfileB = {
    dataId: "academic-profile:test:profile-b-two",
    id: "profile-b",
    label: "Profile B",
  };

  assert.equal(claimFirstProfileBGuide(profileA, storage), false);
  assert.equal(claimFirstProfileBGuide(firstProfileB, storage), true);
  assert.equal(claimFirstProfileBGuide(recreatedProfileB, storage), true);
});

test("profile deletion clears the scoped guide marker and storage failures stay safe", () => {
  const storage = createStorage();
  const sessionStorage = createStorage();
  const profileB = {
    dataId: "academic-profile:test:profile-b-clear",
    id: "profile-b",
    label: "Profile B",
  };

  assert.equal(claimFirstProfileBGuide(profileB, storage), true);
  assert.equal(clearAcademicProfileBrowserData(profileB.dataId, {
    localStorageRef: storage,
    sessionStorageRef: sessionStorage,
  }), 1);
  assert.equal(claimFirstProfileBGuide(profileB, storage), true);

  const blockedStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(claimFirstProfileBGuide(profileB, blockedStorage), true);
});
