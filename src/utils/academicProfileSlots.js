import { normalizeAcademicProfile } from "./academicProfile.js";
import { getAcademicProfileDataId } from "./academicProfileScope.js";

const SLOT_LABELS = Object.freeze(["Profile A", "Profile B"]);

function normalizeSlot(profile, index) {
  const normalized = normalizeAcademicProfile(profile || {});
  return {
    id: String(profile?.id || "").trim(),
    dataId: getAcademicProfileDataId(profile),
    label: String(profile?.label || SLOT_LABELS[index] || `Profile ${index + 1}`).trim(),
    academicLevel: normalized.academicLevel,
    academicTrack: normalized.academicTrack,
    schoolType: normalized.schoolType,
    grade: normalized.grade,
    degree: normalized.degree,
    department: normalized.department,
    deletionPending: profile?.deletionPending || null,
  };
}

export function getAcademicProfileSlots(userProfile = {}) {
  const storedProfiles = Array.isArray(userProfile?.academicProfiles)
    ? userProfile.academicProfiles.slice(0, 2).map(normalizeSlot)
    : [];
  const profiles = storedProfiles.length > 0
    ? storedProfiles
    : [normalizeSlot(userProfile, 0)];
  const requestedActiveId = String(userProfile?.activeAcademicProfileId || "").trim();
  const activeProfile = profiles.find((profile) => profile.id === requestedActiveId)
    || profiles[0];
  const usedLabels = new Set(profiles.map((profile) => profile.label.toLowerCase()));
  const availableProfileLabel = SLOT_LABELS.find(
    (label) => !usedLabels.has(label.toLowerCase()),
  ) || "New profile";

  return {
    profiles,
    activeProfile,
    inactiveProfile: profiles.find((profile) => profile !== activeProfile) || null,
    hasTwoProfiles: profiles.length === 2,
    availableProfileLabel,
  };
}

export function describeAcademicProfileSlot(profile = {}) {
  const qualification = profile.schoolType === "school"
    ? profile.grade
    : profile.degree;
  return [profile.academicLevel, qualification, profile.academicTrack]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" | ");
}

export function buildAcademicProfileDeletePayload(profile = {}) {
  const slotId = String(profile?.id || "").trim();
  const dataId = getAcademicProfileDataId(profile);
  if (!slotId || !dataId) return null;
  return {
    deleteAcademicProfileId: slotId,
    deleteAcademicProfileDataId: dataId,
  };
}
