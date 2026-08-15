import assert from "node:assert/strict";
import test from "node:test";
import {
  AcademicProfileMutationError,
  academicProfileRecord,
  academicProfileSnapshot,
  beginAcademicProfileDeletion,
  createInitialAcademicProfiles,
  deriveAcademicProfilesState,
  finalizeAcademicProfileDeletionState,
  transitionAcademicProfiles,
} from "./academicProfiles.js";

const undergraduate = {
  academicLevel: "Undergraduate / Bachelor's",
  academicTrack: "Engineering & Technology",
  degree: "B.Tech",
  department: "Information Technology",
};

const postgraduate = {
  academicLevel: "Postgraduate / Master's",
  academicTrack: "Engineering & Technology",
  degree: "M.Tech",
  department: "Artificial Intelligence",
};

const doctorate = {
  academicLevel: "Doctorate / PhD",
  academicTrack: "Engineering & Technology",
  degree: "PhD",
  department: "Artificial Intelligence",
};

function expectMutationError(callback, status, code) {
  assert.throws(callback, (error) => (
    error instanceof AcademicProfileMutationError
      && error.status === status
      && error.code === code
  ));
}

function persistedUserAfterTransition(user, transition) {
  return {
    ...user,
    ...academicProfileSnapshot(transition.activeProfile),
    academicProfiles: transition.academicProfiles,
    activeAcademicProfileId: transition.activeAcademicProfileId,
  };
}

test("registration creates fixed Profile A metadata and makes it active", () => {
  const state = createInitialAcademicProfiles(undergraduate);
  assert.equal(state.activeAcademicProfileId, "profile-a");
  assert.equal(state.academicProfiles.length, 1);
  assert.match(state.activeProfile.dataId, /^academic-profile:/);
  assert.equal(state.activeProfile.degree, "B.Tech");
  assert.equal(state.activeProfile.label, "Profile A");
});

test("legacy users project their current top-level profile as Profile A without a read-time write", () => {
  const state = deriveAcademicProfilesState(undergraduate);
  assert.equal(state.activeAcademicProfileId, "profile-a");
  assert.equal(state.academicProfiles.length, 1);
  assert.equal(state.academicProfiles[0].degree, "B.Tech");
  assert.equal(state.legacyMaterialized, false);
});

test("legacy restore data projects to Profile A while the current profile becomes active Profile B", () => {
  const state = deriveAcademicProfilesState({
    ...postgraduate,
    academicProfileRestore: undergraduate,
  });
  assert.equal(state.activeAcademicProfileId, "profile-b");
  assert.equal(state.legacyMaterialized, true);
  assert.deepEqual(state.academicProfiles.map(({ id, label, degree }) => ({ id, label, degree })), [
    { id: "profile-a", label: "Profile A", degree: "B.Tech" },
    { id: "profile-b", label: "Profile B", degree: "M.Tech" },
  ]);
});

test("the active top-level academic fields remain authoritative over an embedded active slot", () => {
  const state = deriveAcademicProfilesState({
    ...postgraduate,
    academicProfiles: [
      academicProfileRecord("profile-a", undergraduate),
      academicProfileRecord("profile-b", doctorate),
    ],
    activeAcademicProfileId: "profile-b",
  });
  assert.equal(state.activeProfile.degree, "M.Tech");
  assert.equal(state.academicProfiles[0].degree, "B.Tech");
});

test("a semantic change creates and activates the missing slot, then enforces the two-profile limit", () => {
  const original = {
    ...undergraduate,
    institutionName: "PrepMatrix University",
    ...createInitialAcademicProfiles(undergraduate),
  };
  const created = transitionAcademicProfiles(original, { requestedAcademic: postgraduate });
  assert.equal(created.action, "create");
  assert.equal(created.activeAcademicProfileId, "profile-b");
  assert.equal(created.activeProfile.degree, "M.Tech");
  assert.equal(created.academicProfiles.length, 2);
  assert.equal(persistedUserAfterTransition(original, created).institutionName, "PrepMatrix University");

  expectMutationError(
    () => transitionAcademicProfiles({
      ...created.activeProfile,
      academicProfiles: created.academicProfiles,
      activeAcademicProfileId: created.activeAcademicProfileId,
    }, { requestedAcademic: doctorate }),
    409,
    "ACADEMIC_PROFILE_LIMIT_REACHED",
  );
});

test("semantically unchanged academic details preserve both profiles", () => {
  const profiles = [
    academicProfileRecord("profile-a", undergraduate),
    academicProfileRecord("profile-b", postgraduate),
  ];
  const state = transitionAcademicProfiles({
    ...postgraduate,
    academicProfiles: profiles,
    activeAcademicProfileId: "profile-b",
  }, {
    requestedAcademic: { ...postgraduate, academicLevel: "  Postgraduate / Master's " },
  });
  assert.equal(state.action, "unchanged");
  assert.equal(state.activeAcademicProfileId, "profile-b");
  assert.deepEqual(state.academicProfiles, profiles);
});

test("visiting switches the active slot and is idempotent for the current slot", () => {
  const user = {
    ...postgraduate,
    institutionName: "PrepMatrix University",
    academicProfiles: [
      academicProfileRecord("profile-a", undergraduate),
      academicProfileRecord("profile-b", postgraduate),
    ],
    activeAcademicProfileId: "profile-b",
  };
  const visited = transitionAcademicProfiles(user, { visitAcademicProfileId: "profile-a" });
  assert.equal(visited.activeAcademicChanged, true);
  assert.equal(visited.activeProfile.degree, "B.Tech");
  assert.equal(persistedUserAfterTransition(user, visited).institutionName, "PrepMatrix University");

  const same = transitionAcademicProfiles(user, { visitAcademicProfileId: "profile-b" });
  assert.equal(same.activeAcademicChanged, false);
  assert.equal(same.activeProfile.degree, "M.Tech");
});

test("direct profile transitions cannot delete metadata without the purge saga", () => {
  const profiles = [
    academicProfileRecord("profile-a", undergraduate),
    academicProfileRecord("profile-b", postgraduate),
  ];
  const user = {
    ...undergraduate,
    institutionName: "PrepMatrix University",
    academicProfiles: profiles,
    activeAcademicProfileId: "profile-a",
  };
  expectMutationError(
    () => transitionAcademicProfiles(user, { deleteAcademicProfileId: "profile-b" }),
    409,
    "ACADEMIC_PROFILE_DELETE_REQUIRES_PURGE",
  );
});

test("rejects invalid, missing, and mixed profile actions with stable API codes", () => {
  const user = {
    ...undergraduate,
    ...createInitialAcademicProfiles(undergraduate),
  };
  expectMutationError(
    () => transitionAcademicProfiles(user, { visitAcademicProfileId: "profile-c" }),
    400,
    "ACADEMIC_PROFILE_ID_INVALID",
  );
  expectMutationError(
    () => transitionAcademicProfiles(user, { visitAcademicProfileId: "profile-b" }),
    404,
    "ACADEMIC_PROFILE_NOT_FOUND",
  );
  expectMutationError(
    () => transitionAcademicProfiles(user, {
      requestedAcademic: postgraduate,
      visitAcademicProfileId: "profile-a",
    }),
    400,
    "ACADEMIC_PROFILE_ACTION_CONFLICT",
  );
  expectMutationError(
    () => transitionAcademicProfiles(user, {
      visitAcademicProfileId: "profile-a",
      deleteAcademicProfileId: "profile-a",
    }),
    400,
    "ACADEMIC_PROFILE_ACTION_CONFLICT",
  );
});

test("legacy restore requests materialize the pair and visit Profile A without consuming either", () => {
  const restored = transitionAcademicProfiles({
    ...postgraduate,
    academicProfileRestore: undergraduate,
  }, { restoreAcademicProfile: true });
  assert.equal(restored.action, "legacy-restore");
  assert.equal(restored.activeAcademicProfileId, "profile-a");
  assert.equal(restored.activeProfile.degree, "B.Tech");
  assert.equal(restored.academicProfiles.length, 2);

  expectMutationError(
    () => transitionAcademicProfiles(undergraduate, { restoreAcademicProfile: true }),
    409,
    "ACADEMIC_PROFILE_RESTORE_UNAVAILABLE",
  );
});

test("deletion pending keeps the target slot fenced until verified finalization", () => {
  const profiles = [
    academicProfileRecord("profile-a", { ...undergraduate, dataId: "academic-profile:data-a" }),
    academicProfileRecord("profile-b", { ...postgraduate, dataId: "academic-profile:data-b" }),
  ];
  const user = {
    ...postgraduate,
    academicProfiles: profiles,
    activeAcademicProfileId: "profile-b",
  };
  const pending = beginAcademicProfileDeletion(user, "profile-b", {
    targetDataId: "academic-profile:data-b",
    operationId: "profile-delete:operation-1",
    requestedAt: new Date("2026-08-14T00:00:00.000Z"),
  });
  assert.equal(pending.action, "delete-pending");
  assert.equal(pending.academicProfiles.length, 2);
  assert.equal(pending.activeAcademicProfileId, "profile-a");
  assert.equal(pending.targetProfile.deletionPending.operationId, "profile-delete:operation-1");

  const pendingUser = {
    ...pending.activeProfile,
    academicProfiles: pending.academicProfiles,
    activeAcademicProfileId: pending.activeAcademicProfileId,
  };
  const retry = beginAcademicProfileDeletion(pendingUser, "profile-b", {
    targetDataId: "academic-profile:data-b",
    operationId: "profile-delete:operation-2",
  });
  assert.equal(retry.deletionPending.operationId, "profile-delete:operation-1");
  expectMutationError(
    () => beginAcademicProfileDeletion(pendingUser, "profile-a", {
      targetDataId: "academic-profile:data-a",
    }),
    409,
    "ACADEMIC_PROFILE_DELETION_PENDING",
  );

  const finalized = finalizeAcademicProfileDeletionState(pendingUser, {
    targetDataId: "academic-profile:data-b",
    operationId: "profile-delete:operation-1",
  });
  assert.equal(finalized.action, "delete-finalized");
  assert.equal(finalized.academicProfiles.length, 1);
  assert.equal(finalized.deletedProfile.dataId, "academic-profile:data-b");
});
