import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAcademicProfileDeletePayload,
  describeAcademicProfileSlot,
  getAcademicProfileSlots,
} from "./academicProfileSlots.js";

const profileA = {
  id: "profile-a",
  label: "Profile A",
  academicLevel: "Undergraduate / Bachelor's",
  academicTrack: "Engineering & Technology",
  schoolType: "college",
  degree: "B.Tech",
  department: "Information Technology",
};

const profileB = {
  id: "profile-b",
  label: "Profile B",
  academicLevel: "Postgraduate / Master's",
  academicTrack: "Engineering & Technology",
  schoolType: "college",
  degree: "M.Tech",
  department: "Computer Science",
};

test("derives a legacy user as a single Profile A", () => {
  const result = getAcademicProfileSlots(profileA);
  assert.equal(result.profiles.length, 1);
  assert.equal(result.activeProfile.label, "Profile A");
  assert.equal(result.hasTwoProfiles, false);
  assert.equal(result.availableProfileLabel, "Profile B");
});

test("selects the active and visit-target profiles from the server contract", () => {
  const result = getAcademicProfileSlots({
    academicProfiles: [profileA, profileB],
    activeAcademicProfileId: "profile-b",
  });
  assert.equal(result.activeProfile.id, "profile-b");
  assert.equal(result.inactiveProfile.id, "profile-a");
  assert.equal(result.hasTwoProfiles, true);
});

test("preserves the server deletion-pending marker for an exact retry", () => {
  const deletionPending = {
    operationId: "profile-delete:operation-1",
    requestedAt: "2026-08-14T00:00:00.000Z",
  };
  const result = getAcademicProfileSlots({
    academicProfiles: [profileA, { ...profileB, deletionPending }],
    activeAcademicProfileId: "profile-a",
  });

  assert.deepEqual(result.inactiveProfile.deletionPending, deletionPending);
});

test("reuses Profile A after A is deleted and B is the remaining profile", () => {
  const result = getAcademicProfileSlots({
    academicProfiles: [profileB],
    activeAcademicProfileId: "profile-b",
  });
  assert.equal(result.activeProfile.label, "Profile B");
  assert.equal(result.availableProfileLabel, "Profile A");
});

test("builds a compact profile summary", () => {
  assert.equal(
    describeAcademicProfileSlot(profileB),
    "Postgraduate / Master's | M.Tech | Engineering & Technology",
  );
});

test("binds deletion to both the fixed slot and immutable data ID", () => {
  assert.deepEqual(buildAcademicProfileDeletePayload({
    ...profileB,
    dataId: "academic-data-instance-b",
  }), {
    deleteAcademicProfileId: "profile-b",
    deleteAcademicProfileDataId: "academic-data-instance-b",
  });
  assert.equal(buildAcademicProfileDeletePayload(profileB), null);
});
