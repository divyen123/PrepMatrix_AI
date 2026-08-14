import {
  isSchoolAcademicLevel,
  normalizeAcademicProfile,
} from "./academicProfile.js";

const SCHOOL_CURRICULUM_TRACKS = new Set([
  "General",
  "CBSE",
  "ICSE / ISC",
  "State Board",
  "International Baccalaureate (IB)",
  "Cambridge / IGCSE",
  "NIOS / Open Schooling",
]);

function draftFromProfile(input = {}) {
  const profile = normalizeAcademicProfile(input);
  return {
    academicLevel: profile.academicLevel,
    academicTrack: profile.academicTrack,
    department: profile.department,
    degree: profile.degree,
    grade: profile.grade,
    schoolType: profile.schoolType,
  };
}

function validSavedProfile(input) {
  if (!input || typeof input !== "object" || !String(input.academicLevel || "").trim()) {
    return null;
  }
  return draftFromProfile(input);
}

export function createSettingsAcademicDrafts(activeProfile = {}, savedProfile = null) {
  const active = draftFromProfile(activeProfile);
  const saved = validSavedProfile(savedProfile);
  const byStage = { [active.academicLevel]: active };
  if (saved && saved.academicLevel !== active.academicLevel) {
    byStage[saved.academicLevel] = saved;
  }
  return { activeStage: active.academicLevel, byStage };
}

export function getActiveSettingsAcademicDraft(state) {
  return state?.byStage?.[state?.activeStage]
    || draftFromProfile({ academicLevel: state?.activeStage });
}

export function updateSettingsAcademicDraft(state, patch = {}) {
  const current = getActiveSettingsAcademicDraft(state);
  const next = { ...current, ...patch, academicLevel: state.activeStage };
  return {
    ...state,
    byStage: { ...state.byStage, [state.activeStage]: next },
  };
}

export function switchSettingsAcademicStage(state, nextStage) {
  const normalizedStage = normalizeAcademicProfile({ academicLevel: nextStage }).academicLevel;
  const current = getActiveSettingsAcademicDraft(state);
  const existing = state?.byStage?.[normalizedStage];
  const currentIsSchool = isSchoolAcademicLevel(current.academicLevel);
  const nextIsSchool = isSchoolAcademicLevel(normalizedStage);
  let compatibleTrack = current.academicTrack;
  if (nextIsSchool && !currentIsSchool) compatibleTrack = "General";
  if (!nextIsSchool && currentIsSchool && SCHOOL_CURRICULUM_TRACKS.has(current.academicTrack)) {
    compatibleTrack = "General";
  }
  const next = existing || draftFromProfile({
    academicLevel: normalizedStage,
    academicTrack: compatibleTrack,
    grade: "",
    degree: "",
    department: "",
  });
  return {
    activeStage: normalizedStage,
    byStage: { ...state.byStage, [normalizedStage]: next },
  };
}

export function hydrateSettingsAcademicDrafts(state, activeProfile = {}, savedProfile = null) {
  const active = draftFromProfile(activeProfile);
  const saved = validSavedProfile(savedProfile);
  const byStage = { ...(state?.byStage || {}), [active.academicLevel]: active };
  if (saved && saved.academicLevel !== active.academicLevel) {
    byStage[saved.academicLevel] = saved;
  }
  return { activeStage: active.academicLevel, byStage };
}

export function buildSettingsAcademicSaveProfile(state, institutionName = "") {
  const active = getActiveSettingsAcademicDraft(state);
  const school = isSchoolAcademicLevel(state.activeStage);
  return normalizeAcademicProfile({
    academicLevel: state.activeStage,
    academicTrack: active.academicTrack,
    department: school ? "" : active.department,
    degree: school ? "" : active.degree,
    grade: school ? active.grade : "",
    institutionName,
    schoolType: school ? "school" : "college",
  });
}
