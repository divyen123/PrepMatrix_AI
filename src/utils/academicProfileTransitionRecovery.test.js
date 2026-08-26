import assert from "node:assert/strict";
import test from "node:test";

import { recoverAcademicProfileTransitionAfterFailure } from "./academicProfileTransitionRecovery.js";

const PROFILE_A = {
  id: "profile-a",
  dataId: "academic_profile_data_a",
  label: "Profile A",
  academicLevel: "Undergraduate / Bachelor's",
  academicTrack: "Engineering & Technology",
  schoolType: "college",
  grade: "",
  degree: "B.Tech",
  department: "Information Technology",
  institutionName: "R.M.K Engineering College",
};

const PROFILE_B = {
  id: "profile-b",
  dataId: "academic_profile_data_b",
  label: "Profile B",
  academicLevel: "Postgraduate / Master's",
  academicTrack: "Computer Science & IT",
  schoolType: "college",
  grade: "",
  degree: "M.Tech",
  department: "Computer Science",
  institutionName: "Priyadharshini Dental College",
};

async function recoverAfterCommittedTimeout({ payload, recovered }) {
  let loaderOptions = null;
  const committedRequestWhoseResponseWasLost = async () => {
    throw Object.assign(new Error("The profile request timed out."), { name: "AbortError" });
  };

  try {
    await committedRequestWhoseResponseWasLost();
    assert.fail("The simulated client request must time out.");
  } catch {
    const outcome = await recoverAcademicProfileTransitionAfterFailure({
      loadAuthoritativeState: async (options) => {
        loaderOptions = options;
        return recovered;
      },
      timeoutMs: 65000,
      payload,
      previousDataId: PROFILE_A.dataId,
    });
    return { outcome, loaderOptions };
  }
}

test("Create: a committed profile change followed by a client timeout recovers as success", async () => {
  const payload = {
    academicLevel: PROFILE_B.academicLevel,
    academicTrack: PROFILE_B.academicTrack,
    schoolType: PROFILE_B.schoolType,
    grade: PROFILE_B.grade,
    degree: PROFILE_B.degree,
    department: PROFILE_B.department,
    institutionName: PROFILE_B.institutionName,
  };
  const recovered = {
    user: {
      academicProfiles: [PROFILE_A, PROFILE_B],
      activeAcademicProfileId: PROFILE_B.id,
    },
    workspace: { academicProfileId: PROFILE_B.dataId, subjects: [] },
    profileContext: {
      dataId: PROFILE_B.dataId,
      academicProfileId: PROFILE_B.dataId,
      slotId: PROFILE_B.id,
    },
  };

  const { outcome, loaderOptions } = await recoverAfterCommittedTimeout({ payload, recovered });

  assert.deepEqual(loaderOptions, { academicProfileId: null, timeoutMs: 65000 });
  assert.equal(outcome.committed, true);
  assert.equal(outcome.recoveredContext.dataId, PROFILE_B.dataId);
  assert.strictEqual(outcome.recovered, recovered);
});

test("Visit: a committed profile switch followed by a client timeout recovers as success", async () => {
  const recovered = {
    user: {
      academicProfiles: [PROFILE_A, PROFILE_B],
      activeAcademicProfileId: PROFILE_B.id,
    },
    workspace: { academicProfileId: PROFILE_B.dataId, subjects: [] },
    profileContext: {
      dataId: PROFILE_B.dataId,
      academicProfileId: PROFILE_B.dataId,
      slotId: PROFILE_B.id,
    },
  };

  const { outcome, loaderOptions } = await recoverAfterCommittedTimeout({
    payload: { visitAcademicProfileId: PROFILE_B.id },
    recovered,
  });

  assert.deepEqual(loaderOptions, { academicProfileId: null, timeoutMs: 65000 });
  assert.equal(outcome.committed, true);
  assert.equal(outcome.recoveredUser.activeAcademicProfileId, PROFILE_B.id);
  assert.equal(outcome.recoveredContext.dataId, PROFILE_B.dataId);
});

test("Delete: a recreated slot never inherits the deleted incarnation's retry", async () => {
  const recreatedProfileB = {
    ...PROFILE_B,
    dataId: "academic_profile_data_b_recreated",
  };
  const recovered = {
    user: {
      academicProfiles: [PROFILE_A, recreatedProfileB],
      activeAcademicProfileId: PROFILE_A.id,
    },
    workspace: { academicProfileId: PROFILE_A.dataId, subjects: [] },
    profileContext: {
      dataId: PROFILE_A.dataId,
      academicProfileId: PROFILE_A.dataId,
      slotId: PROFILE_A.id,
    },
  };

  const outcome = await recoverAcademicProfileTransitionAfterFailure({
    loadAuthoritativeState: async () => recovered,
    timeoutMs: 65000,
    payload: {
      deleteAcademicProfileId: PROFILE_B.id,
      deleteAcademicProfileDataId: PROFILE_B.dataId,
    },
    previousDataId: PROFILE_A.dataId,
    deletedProfile: PROFILE_B,
  });

  assert.equal(
    outcome.recoveredUser.academicProfiles.some((profile) => profile.id === PROFILE_B.id),
    true,
  );
  assert.equal(outcome.committed, true);
});
