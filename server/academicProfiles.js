import { randomUUID } from "node:crypto";
import { normalizeAcademicProfile } from "../src/utils/academicProfile.js";

export const ACADEMIC_PROFILE_IDS = Object.freeze(["profile-a", "profile-b"]);
export const ACADEMIC_PROFILE_DATA_VERSION = 2;
export const ACADEMIC_PROFILE_CONTEXT_KEYS = Object.freeze([
  "academicLevel",
  "academicTrack",
  "schoolType",
  "grade",
  "degree",
  "department",
]);
export const ACADEMIC_PROFILE_KEYS = Object.freeze([
  ...ACADEMIC_PROFILE_CONTEXT_KEYS,
  "institutionName",
]);
const ACADEMIC_PROFILE_INSTITUTION_VERSION = 2;

const PROFILE_LABELS = Object.freeze({
  "profile-a": "Profile A",
  "profile-b": "Profile B",
});

export class AcademicProfileMutationError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "AcademicProfileMutationError";
    this.status = status;
    this.code = code;
  }
}

function hasAcademicLevel(input) {
  return input && typeof input === "object" && String(input.academicLevel || "").trim();
}

function validDataId(value) {
  const dataId = typeof value === "string" ? value.trim() : "";
  return /^[a-zA-Z0-9:_-]{8,160}$/.test(dataId) ? dataId : "";
}

export function createAcademicProfileDataId() {
  return `academic-profile:${randomUUID()}`;
}

function sanitizeDeletionPending(value) {
  if (!value || typeof value !== "object") return null;
  const operationId = validDataId(value.operationId);
  if (!operationId) return null;
  return {
    operationId,
    requestedAt: value.requestedAt instanceof Date
      ? value.requestedAt
      : new Date(value.requestedAt || Date.now()),
  };
}

export function academicProfileSnapshot(input = {}) {
  const normalized = normalizeAcademicProfile(input);
  return ACADEMIC_PROFILE_KEYS.reduce((snapshot, key) => {
    snapshot[key] = normalized[key];
    return snapshot;
  }, {});
}

export function academicProfileHasChanged(current = {}, next = {}) {
  const currentSnapshot = academicProfileSnapshot(current);
  const nextSnapshot = academicProfileSnapshot(next);
  return ACADEMIC_PROFILE_CONTEXT_KEYS.some(
    (key) => currentSnapshot[key] !== nextSnapshot[key],
  );
}

function academicProfileSnapshotHasChanged(current = {}, next = {}) {
  const currentSnapshot = academicProfileSnapshot(current);
  const nextSnapshot = academicProfileSnapshot(next);
  return ACADEMIC_PROFILE_KEYS.some((key) => currentSnapshot[key] !== nextSnapshot[key]);
}

export function sanitizeLegacyAcademicProfileRestore(input) {
  return hasAcademicLevel(input) ? academicProfileSnapshot(input) : null;
}

export function academicProfileRecord(id, input = {}, { fallbackDataId = `legacy:${id}` } = {}) {
  if (!ACADEMIC_PROFILE_IDS.includes(id)) {
    throw new AcademicProfileMutationError(
      400,
      "ACADEMIC_PROFILE_ID_INVALID",
      "Choose either profile-a or profile-b.",
    );
  }
  const deletionPending = sanitizeDeletionPending(input.deletionPending);
  return {
    id,
    label: PROFILE_LABELS[id],
    dataId: validDataId(input.dataId) || validDataId(input.profileInstanceId) || fallbackDataId,
    ...academicProfileSnapshot(input),
    ...(deletionPending ? { deletionPending } : {}),
  };
}

function sanitizeStoredAcademicProfiles(input, userId = "legacy-user") {
  if (!Array.isArray(input)) return [];
  return ACADEMIC_PROFILE_IDS.flatMap((id) => {
    const stored = input.find((profile) => profile?.id === id && hasAcademicLevel(profile));
    return stored ? [academicProfileRecord(id, stored, { fallbackDataId: `legacy:${userId}:${id}` })] : [];
  });
}

function matchingProfileId(profiles, academic) {
  return profiles.find((profile) => !academicProfileHasChanged(profile, academic))?.id || null;
}

export function deriveAcademicProfilesState(user = {}) {
  const currentAcademic = academicProfileSnapshot(user);
  const legacyUserId = String(user?._id || user?.id || "legacy-user");
  const storedProfiles = sanitizeStoredAcademicProfiles(user.academicProfiles, legacyUserId);
  const institutionStoredPerProfile = Number(user.academicProfileDataVersion || 0)
    >= ACADEMIC_PROFILE_INSTITUTION_VERSION;

  if (storedProfiles.length) {
    const requestedActiveId = ACADEMIC_PROFILE_IDS.includes(user.activeAcademicProfileId)
      && storedProfiles.some((profile) => profile.id === user.activeAcademicProfileId)
      ? user.activeAcademicProfileId
      : null;
    const activeAcademicProfileId = requestedActiveId
      || matchingProfileId(storedProfiles, currentAcademic)
      || storedProfiles[0].id;
    const academicProfiles = storedProfiles.map((profile) => {
      if (profile.id !== activeAcademicProfileId) return profile;
      const institutionName = institutionStoredPerProfile
        ? profile.institutionName
        : currentAcademic.institutionName || profile.institutionName;
      return academicProfileRecord(profile.id, {
        ...currentAcademic,
        institutionName,
        dataId: profile.dataId,
        deletionPending: profile.deletionPending,
      });
    });
    return {
      academicProfiles,
      activeAcademicProfileId,
      activeProfile: academicProfiles.find((profile) => profile.id === activeAcademicProfileId),
      legacyMaterialized: false,
    };
  }

  const legacyRestore = sanitizeLegacyAcademicProfileRestore(user.academicProfileRestore);
  if (legacyRestore) {
    const academicProfiles = [
      academicProfileRecord("profile-a", {
        ...legacyRestore,
        institutionName: legacyRestore.institutionName || currentAcademic.institutionName,
      }, { fallbackDataId: `legacy:${legacyUserId}:profile-a` }),
      academicProfileRecord("profile-b", currentAcademic, { fallbackDataId: `legacy:${legacyUserId}:profile-b` }),
    ];
    return {
      academicProfiles,
      activeAcademicProfileId: "profile-b",
      activeProfile: academicProfiles[1],
      legacyMaterialized: true,
    };
  }

  const activeProfile = academicProfileRecord("profile-a", currentAcademic, { fallbackDataId: `legacy:${legacyUserId}:profile-a` });
  return {
    academicProfiles: [activeProfile],
    activeAcademicProfileId: "profile-a",
    activeProfile,
    legacyMaterialized: false,
  };
}

export function createInitialAcademicProfiles(input = {}) {
  const activeProfile = academicProfileRecord("profile-a", {
    ...input,
    dataId: createAcademicProfileDataId(),
  });
  return {
    academicProfiles: [activeProfile],
    activeAcademicProfileId: activeProfile.id,
    activeProfile,
  };
}

function requireProfileId(value) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!ACADEMIC_PROFILE_IDS.includes(id)) {
    throw new AcademicProfileMutationError(
      400,
      "ACADEMIC_PROFILE_ID_INVALID",
      "Choose either profile-a or profile-b.",
    );
  }
  return id;
}

function findProfile(state, id) {
  const profile = state.academicProfiles.find((candidate) => candidate.id === id);
  if (!profile) {
    throw new AcademicProfileMutationError(
      404,
      "ACADEMIC_PROFILE_NOT_FOUND",
      "That academic profile does not exist.",
    );
  }
  return profile;
}

export function beginAcademicProfileDeletion(user = {}, requestedId, {
  targetDataId,
  operationId = `profile-delete:${randomUUID()}`,
  requestedAt = new Date(),
} = {}) {
  const state = deriveAcademicProfilesState(user);
  const id = requireProfileId(requestedId);
  const target = findProfile(state, id);
  if (state.academicProfiles.length !== 2) {
    throw new AcademicProfileMutationError(
      409,
      "ACADEMIC_PROFILE_DELETE_UNAVAILABLE",
      "An academic profile can be deleted only when two profiles exist.",
    );
  }
  const pendingProfile = state.academicProfiles.find((profile) => profile.deletionPending);
  if (pendingProfile && pendingProfile.dataId !== target.dataId) {
    throw new AcademicProfileMutationError(
      409,
      "ACADEMIC_PROFILE_DELETION_PENDING",
      "Finish deleting the pending academic profile before deleting another one.",
    );
  }
  if (targetDataId && target.dataId !== String(targetDataId).trim()) {
    throw new AcademicProfileMutationError(
      409,
      "ACADEMIC_PROFILE_CONTEXT_CHANGED",
      "That profile was replaced. Reload before deleting it.",
    );
  }
  const deletionPending = target.deletionPending || { operationId, requestedAt };
  const academicProfiles = state.academicProfiles.map((profile) => (
    profile.dataId === target.dataId ? { ...profile, deletionPending } : profile
  ));
  const remainingProfile = academicProfiles.find((profile) => profile.dataId !== target.dataId);
  const activeProfile = state.activeProfile.dataId === target.dataId
    ? remainingProfile
    : state.activeProfile;
  return {
    academicProfiles,
    activeAcademicProfileId: activeProfile.id,
    activeProfile,
    targetProfile: { ...target, deletionPending },
    deletionPending: {
      status: "deletion_pending",
      operationId: deletionPending.operationId,
      targetSlotId: target.id,
      targetDataId: target.dataId,
      requestedAt: deletionPending.requestedAt,
    },
    action: "delete-pending",
    activeAcademicChanged: state.activeProfile.dataId !== activeProfile.dataId,
  };
}

export function finalizeAcademicProfileDeletionState(user = {}, {
  targetDataId,
  operationId,
} = {}) {
  const state = deriveAcademicProfilesState(user);
  const target = state.academicProfiles.find((profile) => profile.dataId === targetDataId);
  if (!target?.deletionPending
    || target.deletionPending.operationId !== operationId
    || state.academicProfiles.length !== 2) {
    throw new AcademicProfileMutationError(
      409,
      "ACADEMIC_PROFILE_DELETION_STATE_CHANGED",
      "The profile deletion state changed. Reload before trying again.",
    );
  }
  const academicProfiles = state.academicProfiles.filter((profile) => profile.dataId !== targetDataId);
  const activeProfile = academicProfiles[0];
  return {
    academicProfiles,
    activeAcademicProfileId: activeProfile.id,
    activeProfile,
    deletedProfile: target,
    action: "delete-finalized",
    activeAcademicChanged: state.activeProfile.dataId !== activeProfile.dataId,
  };
}

function visitProfile(state, requestedId, action = "visit") {
  const id = requireProfileId(requestedId);
  const activeProfile = findProfile(state, id);
  if (activeProfile.deletionPending) {
    throw new AcademicProfileMutationError(
      409,
      "ACADEMIC_PROFILE_DELETION_PENDING",
      "That academic profile is being deleted and cannot be visited.",
    );
  }
  return {
    academicProfiles: state.academicProfiles,
    activeAcademicProfileId: id,
    activeProfile,
    action,
    activeAcademicChanged: academicProfileHasChanged(state.activeProfile, activeProfile),
  };
}

export function transitionAcademicProfiles(user = {}, {
  requestedAcademic = null,
  visitAcademicProfileId,
  deleteAcademicProfileId,
  restoreAcademicProfile = false,
} = {}) {
  const state = deriveAcademicProfilesState(user);
  const actionCount = [
    visitAcademicProfileId !== undefined,
    deleteAcademicProfileId !== undefined,
    restoreAcademicProfile === true,
  ].filter(Boolean).length;
  if (actionCount > 1 || (requestedAcademic && actionCount)) {
    throw new AcademicProfileMutationError(
      400,
      "ACADEMIC_PROFILE_ACTION_CONFLICT",
      "Visit, delete, restore, and academic-detail changes must be saved separately.",
    );
  }

  if (restoreAcademicProfile === true) {
    if (state.academicProfiles.length < 2 || !state.academicProfiles.some((profile) => profile.id === "profile-a")) {
      throw new AcademicProfileMutationError(
        409,
        "ACADEMIC_PROFILE_RESTORE_UNAVAILABLE",
        "No previous academic profile is available.",
      );
    }
    return visitProfile(state, "profile-a", "legacy-restore");
  }

  if (visitAcademicProfileId !== undefined) {
    return visitProfile(state, visitAcademicProfileId);
  }

  if (deleteAcademicProfileId !== undefined) {
    requireProfileId(deleteAcademicProfileId);
    throw new AcademicProfileMutationError(
      409,
      "ACADEMIC_PROFILE_DELETE_REQUIRES_PURGE",
      "Academic profile deletion must remove its study data before profile metadata is finalized.",
    );
  }

  if (requestedAcademic) {
    const includesInstitutionName = Object.prototype.hasOwnProperty.call(
      requestedAcademic,
      "institutionName",
    );
    const nextAcademic = academicProfileSnapshot({
      ...requestedAcademic,
      institutionName: includesInstitutionName
        ? requestedAcademic.institutionName
        : state.activeProfile.institutionName,
    });
    const learningContextChanged = academicProfileHasChanged(state.activeProfile, nextAcademic);
    if (!academicProfileSnapshotHasChanged(state.activeProfile, nextAcademic)) {
      return {
        ...state,
        action: "unchanged",
        activeAcademicChanged: false,
      };
    }
    if (!learningContextChanged) {
      const activeProfile = academicProfileRecord(state.activeProfile.id, {
        ...state.activeProfile,
        ...nextAcademic,
        dataId: state.activeProfile.dataId,
        deletionPending: state.activeProfile.deletionPending,
      });
      const academicProfiles = state.academicProfiles.map((profile) => (
        profile.id === activeProfile.id ? activeProfile : profile
      ));
      return {
        academicProfiles,
        activeAcademicProfileId: activeProfile.id,
        activeProfile,
        action: "update",
        activeAcademicChanged: false,
      };
    }
    if (state.academicProfiles.length >= 2) {
      throw new AcademicProfileMutationError(
        409,
        "ACADEMIC_PROFILE_LIMIT_REACHED",
        "Delete one academic profile before creating another.",
      );
    }
    const availableId = ACADEMIC_PROFILE_IDS.find(
      (id) => !state.academicProfiles.some((profile) => profile.id === id),
    );
    const activeProfile = academicProfileRecord(availableId, {
      ...nextAcademic,
      dataId: createAcademicProfileDataId(),
    });
    const academicProfiles = [...state.academicProfiles, activeProfile]
      .sort((left, right) => ACADEMIC_PROFILE_IDS.indexOf(left.id) - ACADEMIC_PROFILE_IDS.indexOf(right.id));
    return {
      academicProfiles,
      activeAcademicProfileId: activeProfile.id,
      activeProfile,
      action: "create",
      activeAcademicChanged: true,
    };
  }

  return {
    ...state,
    action: "none",
    activeAcademicChanged: false,
  };
}
