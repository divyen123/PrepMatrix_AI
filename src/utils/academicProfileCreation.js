import {
  academicProfilePayload,
  isSchoolAcademicLevel,
  normalizeAcademicProfile,
} from "./academicProfile.js";
import { getSettingsAcademicProfileChanges } from "./settingsAcademicDrafts.js";

export function buildAcademicProfileCreationPayload(draft = {}) {
  const schoolProfile = isSchoolAcademicLevel(draft.academicLevel);
  const normalized = normalizeAcademicProfile({
    ...draft,
    department: schoolProfile ? "" : draft.department,
    degree: schoolProfile ? "" : draft.degree,
    grade: schoolProfile ? draft.grade : "",
    institutionName: String(draft.institutionName || "").trim(),
    schoolType: schoolProfile ? "school" : "college",
  });
  return {
    ...academicProfilePayload(normalized),
    institutionName: normalized.institutionName,
  };
}

export function validateAcademicProfileCreationDraft(draft, activeProfile = {}) {
  if (!String(draft?.institutionName || "").trim()) {
    return "Enter your institution name to continue.";
  }

  if (isSchoolAcademicLevel(draft?.academicLevel) && !String(draft?.grade || "").trim()) {
    return "Choose the learner's exact class.";
  }

  const candidate = buildAcademicProfileCreationPayload(draft);
  if (!getSettingsAcademicProfileChanges(activeProfile, candidate).length) {
    return "Choose academic details that are different from Profile A. Profile B needs its own learning context.";
  }

  return "";
}
