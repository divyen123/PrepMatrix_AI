import { normalizeAcademicProfile } from "./academicProfile.js";
import {
  getAcademicProfileDataId,
  resolveAcademicProfileContext,
} from "./academicProfileScope.js";

const ACADEMIC_FIELDS = Object.freeze([
  "academicLevel",
  "academicTrack",
  "schoolType",
  "grade",
  "degree",
  "department",
  "institutionName",
]);

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function activeRecoveredProfile(user = {}, context = {}) {
  const profiles = Array.isArray(user?.academicProfiles) ? user.academicProfiles : [];
  const activeSlotId = clean(user?.activeAcademicProfileId || context?.slotId);
  const activeDataId = getAcademicProfileDataId(context);
  return profiles.find((profile) => clean(profile?.id) === activeSlotId)
    || profiles.find((profile) => getAcademicProfileDataId(profile) === activeDataId)
    || null;
}

function academicSnapshotMatches(expectedInput = {}, actualInput = {}) {
  const expected = normalizeAcademicProfile(expectedInput);
  const actual = normalizeAcademicProfile(actualInput);
  return ACADEMIC_FIELDS.every((field) => clean(actual[field]) === clean(expected[field]));
}

export function recoveredAcademicProfileTransitionCommitted({
  payload = {},
  previousDataId = "",
  deletedProfile = null,
  recoveredUser = {},
  recoveredContext = {},
} = {}) {
  const profiles = Array.isArray(recoveredUser?.academicProfiles)
    ? recoveredUser.academicProfiles
    : [];

  if (deletedProfile?.id) {
    const deletedDataId = getAcademicProfileDataId(deletedProfile);
    if (!deletedDataId) return false;
    return !profiles.some((profile) => (
      clean(profile?.id) === clean(deletedProfile.id)
      && getAcademicProfileDataId(profile) === deletedDataId
    ));
  }

  const visitSlotId = clean(payload?.visitAcademicProfileId);
  if (visitSlotId) {
    return clean(recoveredUser?.activeAcademicProfileId || recoveredContext?.slotId) === visitSlotId;
  }

  const hasAcademicMutation = ACADEMIC_FIELDS.some(
    (field) => Object.prototype.hasOwnProperty.call(payload || {}, field),
  );
  if (!hasAcademicMutation) return false;

  const recoveredDataId = getAcademicProfileDataId(recoveredContext);
  if (!recoveredDataId || recoveredDataId === clean(previousDataId)) return false;
  const recoveredProfile = activeRecoveredProfile(recoveredUser, recoveredContext);
  return Boolean(recoveredProfile && academicSnapshotMatches(payload, recoveredProfile));
}

export async function recoverAcademicProfileTransitionAfterFailure({
  loadAuthoritativeState,
  timeoutMs,
  payload = {},
  previousDataId = "",
  deletedProfile = null,
} = {}) {
  if (typeof loadAuthoritativeState !== "function") {
    throw new TypeError("An authoritative profile loader is required.");
  }

  const recovered = await loadAuthoritativeState({
    academicProfileId: null,
    ...(timeoutMs ? { timeoutMs } : {}),
  });
  const recoveredUser = recovered?.user;
  const recoveredContext = resolveAcademicProfileContext(
    recovered?.profileContext || {},
    recoveredUser || {},
  );
  if (!recoveredUser || !recoveredContext.dataId) {
    throw new Error("The active academic profile could not be recovered.");
  }

  return {
    recovered,
    recoveredUser,
    recoveredContext,
    committed: recoveredAcademicProfileTransitionCommitted({
      payload,
      previousDataId,
      deletedProfile,
      recoveredUser,
      recoveredContext,
    }),
  };
}
