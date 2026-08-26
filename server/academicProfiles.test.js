import assert from "node:assert/strict";
import test from "node:test";
import {
  ACADEMIC_PROFILE_DATA_VERSION,
  ACADEMIC_PROFILE_KEYS,
  AcademicProfileMutationError,
  academicProfileRecord,
  academicProfileSnapshot,
  beginAcademicProfileDeletion,
  createInitialAcademicProfiles,
  deriveAcademicProfilesState,
  finalizeAcademicProfileDeletionState,
  transitionAcademicProfiles,
} from "./academicProfiles.js";
import { ACADEMIC_PROFILE_DISPLAY_NAME_MAX_LENGTH } from "../src/utils/academicProfileNames.js";

const undergraduate = {
  academicLevel: "Undergraduate / Bachelor's",
  academicTrack: "Engineering & Technology",
  degree: "B.Tech",
  department: "Information Technology",
  institutionName: "R.M.K Engineering College",
};

const postgraduate = {
  academicLevel: "Postgraduate / Master's",
  academicTrack: "Engineering & Technology",
  degree: "M.Tech",
  department: "Artificial Intelligence",
  institutionName: "Priyadharshini Dental College",
};

const doctorate = {
  academicLevel: "Doctorate / PhD",
  academicTrack: "Engineering & Technology",
  degree: "PhD",
  department: "Artificial Intelligence",
  institutionName: "National Research Institute",
};

const PROFILE_A_DATA_ID = "academic-profile:test-data-a";
const PROFILE_B_DATA_ID = "academic-profile:test-data-b";

function twoProfileUser({
  activeId = "profile-a",
  displayNameA = "Profile A",
  displayNameB = "Profile B",
  profileA = {},
  profileB = {},
} = {}) {
  const academicProfiles = [
    academicProfileRecord("profile-a", {
      ...undergraduate,
      ...profileA,
      dataId: PROFILE_A_DATA_ID,
      displayName: displayNameA,
    }),
    academicProfileRecord("profile-b", {
      ...postgraduate,
      ...profileB,
      dataId: PROFILE_B_DATA_ID,
      displayName: displayNameB,
    }),
  ];
  const activeProfile = academicProfiles.find((profile) => profile.id === activeId);
  return {
    ...academicProfileSnapshot(activeProfile),
    academicProfiles,
    activeAcademicProfileId: activeProfile.id,
    academicProfileDataVersion: ACADEMIC_PROFILE_DATA_VERSION,
  };
}

function renameProfile(user, profileId, dataId, displayName) {
  return transitionAcademicProfiles(user, {
    renameAcademicProfileId: profileId,
    renameAcademicProfileDataId: dataId,
    academicProfileDisplayName: displayName,
  });
}

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
  assert.equal(state.activeProfile.institutionName, "R.M.K Engineering College");
  assert.equal(ACADEMIC_PROFILE_DATA_VERSION, 2);
  assert.equal(ACADEMIC_PROFILE_KEYS.includes("institutionName"), true);
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

test("version two keeps the active slot institution authoritative", () => {
  const state = deriveAcademicProfilesState({
    ...postgraduate,
    institutionName: "Stale shared institution",
    academicProfileDataVersion: 2,
    academicProfiles: [
      academicProfileRecord("profile-a", undergraduate),
      academicProfileRecord("profile-b", postgraduate),
    ],
    activeAcademicProfileId: "profile-b",
  });

  assert.equal(
    state.activeProfile.institutionName,
    "Priyadharshini Dental College",
  );
});

test("a semantic change creates and activates the missing slot, then enforces the two-profile limit", () => {
  const original = {
    ...undergraduate,
    ...createInitialAcademicProfiles(undergraduate),
    academicProfileDataVersion: 2,
  };
  const created = transitionAcademicProfiles(original, {
    requestedAcademic: postgraduate,
  });
  assert.equal(created.action, "create");
  assert.equal(created.activeAcademicProfileId, "profile-b");
  assert.equal(created.activeProfile.degree, "M.Tech");
  assert.equal(created.activeProfile.institutionName, "Priyadharshini Dental College");
  assert.equal(created.academicProfiles.length, 2);
  assert.equal(created.academicProfiles[0].institutionName, "R.M.K Engineering College");
  assert.equal(
    persistedUserAfterTransition(original, created).institutionName,
    "Priyadharshini Dental College",
  );

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

test("updates only the active profile when its institution changes", () => {
  const profiles = [
    academicProfileRecord("profile-a", undergraduate),
    academicProfileRecord("profile-b", postgraduate),
  ];
  const user = {
    ...postgraduate,
    academicProfiles: profiles,
    activeAcademicProfileId: "profile-b",
    academicProfileDataVersion: 2,
  };
  const updated = transitionAcademicProfiles(user, {
    requestedAcademic: {
      ...postgraduate,
      institutionName: "Priyadharshini Medical University",
    },
  });

  assert.equal(updated.action, "update");
  assert.equal(updated.activeAcademicChanged, false);
  assert.equal(updated.academicProfiles.length, 2);
  assert.equal(updated.academicProfiles[0].institutionName, "R.M.K Engineering College");
  assert.equal(updated.academicProfiles[1].institutionName, "Priyadharshini Medical University");
  assert.equal(
    persistedUserAfterTransition(user, updated).institutionName,
    "Priyadharshini Medical University",
  );
});

test("visiting switches the active slot and is idempotent for the current slot", () => {
  const user = {
    ...postgraduate,
    academicProfiles: [
      academicProfileRecord("profile-a", undergraduate),
      academicProfileRecord("profile-b", postgraduate),
    ],
    activeAcademicProfileId: "profile-b",
    academicProfileDataVersion: 2,
  };
  const visited = transitionAcademicProfiles(user, { visitAcademicProfileId: "profile-a" });
  assert.equal(visited.activeAcademicChanged, true);
  assert.equal(visited.activeProfile.degree, "B.Tech");
  assert.equal(visited.activeProfile.institutionName, "R.M.K Engineering College");
  assert.equal(persistedUserAfterTransition(user, visited).institutionName, "R.M.K Engineering College");

  const same = transitionAcademicProfiles(user, { visitAcademicProfileId: "profile-b" });
  assert.equal(same.activeAcademicChanged, false);
  assert.equal(same.activeProfile.degree, "M.Tech");
  assert.equal(same.activeProfile.institutionName, "Priyadharshini Dental College");
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

test("renaming normalizes the custom name without changing slot identity, academics, or active state", () => {
  const user = twoProfileUser({ activeId: "profile-a" });
  const beforeTarget = user.academicProfiles.find((profile) => profile.id === "profile-a");
  const beforeOther = user.academicProfiles.find((profile) => profile.id === "profile-b");

  const renamed = renameProfile(
    user,
    "profile-a",
    PROFILE_A_DATA_ID,
    "  Ｍｅｄｉｃａｌ   –  BDS\n",
  );
  const afterTarget = renamed.academicProfiles.find((profile) => profile.id === "profile-a");
  const afterOther = renamed.academicProfiles.find((profile) => profile.id === "profile-b");

  assert.equal(renamed.action, "rename");
  assert.equal(renamed.activeAcademicChanged, false);
  assert.equal(renamed.activeAcademicProfileId, user.activeAcademicProfileId);
  assert.equal(renamed.activeProfile.id, beforeTarget.id);
  assert.equal(renamed.activeProfile.dataId, beforeTarget.dataId);
  assert.equal(afterTarget.displayName, "Medical – BDS");
  assert.equal(afterTarget.id, beforeTarget.id);
  assert.equal(afterTarget.label, beforeTarget.label);
  assert.equal(afterTarget.dataId, beforeTarget.dataId);
  assert.deepEqual(academicProfileSnapshot(afterTarget), academicProfileSnapshot(beforeTarget));
  assert.deepEqual(afterOther, beforeOther);

  const persisted = deriveAcademicProfilesState({
    ...user,
    academicProfiles: renamed.academicProfiles,
    activeAcademicProfileId: renamed.activeAcademicProfileId,
  });
  assert.equal(persisted.activeProfile.displayName, "Medical – BDS");
  assert.equal(persisted.activeProfile.id, "profile-a");
  assert.equal(persisted.activeProfile.dataId, PROFILE_A_DATA_ID);
});

test("rename rejects a missing or stale immutable data id", () => {
  const user = twoProfileUser();

  expectMutationError(
    () => renameProfile(user, "profile-a", "", "Engineering"),
    400,
    "ACADEMIC_PROFILE_RENAME_INVALID",
  );
  expectMutationError(
    () => renameProfile(user, "profile-a", "academic-profile:stale-data", "Engineering"),
    409,
    "ACADEMIC_PROFILE_CONTEXT_CHANGED",
  );
});

test("rename rejects blank, control-only, and overlong custom names", () => {
  const user = twoProfileUser();
  const invalidNames = [
    "",
    " \n\t ",
    "\u0000\u0007",
    "x".repeat(ACADEMIC_PROFILE_DISPLAY_NAME_MAX_LENGTH + 1),
  ];

  invalidNames.forEach((displayName) => {
    expectMutationError(
      () => renameProfile(user, "profile-a", PROFILE_A_DATA_ID, displayName),
      400,
      "ACADEMIC_PROFILE_NAME_INVALID",
    );
  });
});

test("rename rejects duplicate names after normalization and case folding", () => {
  const user = twoProfileUser({
    displayNameA: "Engineering",
    displayNameB: "Medicine",
  });

  expectMutationError(
    () => renameProfile(user, "profile-b", PROFILE_B_DATA_ID, "  ENGINEERING  "),
    409,
    "ACADEMIC_PROFILE_NAME_DUPLICATE",
  );
});

test("fixed default names stay reserved for their matching slots", () => {
  const user = twoProfileUser({
    displayNameA: "Engineering",
    displayNameB: "Medicine",
  });

  expectMutationError(
    () => renameProfile(user, "profile-a", PROFILE_A_DATA_ID, "Profile B"),
    409,
    "ACADEMIC_PROFILE_NAME_DUPLICATE",
  );
  expectMutationError(
    () => renameProfile(user, "profile-b", PROFILE_B_DATA_ID, "Profile A"),
    409,
    "ACADEMIC_PROFILE_NAME_DUPLICATE",
  );
});

test("rename rejects a profile whose data deletion is pending", () => {
  const user = twoProfileUser({
    profileB: {
      deletionPending: {
        operationId: "profile-delete:pending-rename",
        requestedAt: new Date("2026-08-26T00:00:00.000Z"),
      },
    },
  });

  expectMutationError(
    () => renameProfile(user, "profile-b", PROFILE_B_DATA_ID, "Medicine"),
    409,
    "ACADEMIC_PROFILE_DELETION_PENDING",
  );
});

test("rename remains isolated from visit, delete, restore, and academic-detail actions", () => {
  const user = twoProfileUser();
  const renameAction = {
    renameAcademicProfileId: "profile-a",
    renameAcademicProfileDataId: PROFILE_A_DATA_ID,
    academicProfileDisplayName: "Engineering",
  };

  [
    { ...renameAction, visitAcademicProfileId: "profile-b" },
    { ...renameAction, deleteAcademicProfileId: "profile-b" },
    { ...renameAction, restoreAcademicProfile: true },
    { ...renameAction, requestedAcademic: doctorate },
  ].forEach((request) => {
    expectMutationError(
      () => transitionAcademicProfiles(user, request),
      400,
      "ACADEMIC_PROFILE_ACTION_CONFLICT",
    );
  });

  expectMutationError(
    () => transitionAcademicProfiles(user, {
      academicProfileDisplayName: "Engineering",
      renameAcademicProfileDataId: PROFILE_A_DATA_ID,
    }),
    400,
    "ACADEMIC_PROFILE_RENAME_INVALID",
  );
  expectMutationError(
    () => transitionAcademicProfiles(user, {
      renameAcademicProfileId: "profile-a",
      renameAcademicProfileDataId: PROFILE_A_DATA_ID,
    }),
    400,
    "ACADEMIC_PROFILE_RENAME_INVALID",
  );
  expectMutationError(
    () => transitionAcademicProfiles(user, {
      renameAcademicProfileDataId: PROFILE_A_DATA_ID,
    }),
    400,
    "ACADEMIC_PROFILE_RENAME_INVALID",
  );
});
