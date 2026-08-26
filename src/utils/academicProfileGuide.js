import {
  academicProfileStorageKey,
  getAcademicProfileDataId,
} from "./academicProfileScope.js";

export const ACADEMIC_PROFILE_GUIDE_ROUTE = "/settings/profiles";
export const ACADEMIC_PROFILE_GUIDE_VERSION = "v1";

export const ACADEMIC_PROFILE_GUIDE_STEPS = Object.freeze([
  {
    id: "welcome",
    tone: "violet",
    label: "Welcome",
    title: "You are now in Profile B",
    summary: "Profile B is a fresh academic workspace for a second learning context—without replacing Profile A.",
    points: [
      "Set Profile B to the class, degree, stream, or syllabus you want to study here.",
      "Start with a clean subject list, planner, learning workspace, and progress history.",
      "Look for the Current profile label before adding new study work.",
    ],
    tip: "Use Profile B for a genuinely different academic context, not as a duplicate of Profile A.",
  },
  {
    id: "profile-a-safe",
    tone: "cyan",
    label: "Profile A",
    title: "Everything in Profile A stays safe",
    summary: "Creating Profile B does not overwrite the subjects, schedule, notes, or progress already stored in Profile A.",
    points: [
      "Profile A remains your original study workspace.",
      "Its planner completion and learning records stay attached to Profile A.",
      "You can return to it at any time from Settings.",
    ],
    tip: "Switching profiles loads the selected workspace; it does not merge the two workspaces.",
  },
  {
    id: "separate-workspaces",
    tone: "emerald",
    label: "Separate work",
    title: "Each profile keeps its learning work separate",
    summary: "The active academic profile decides which study data PrepMatrix loads and updates.",
    points: [
      "Subjects, planner tasks, completion, notes, quizzes, exams, and learning notebooks belong to the active profile.",
      "Your sign-in identity, account security, and account-wide AI allowance remain shared.",
      "Deleting a profile removes that profile's study workspace, so review the confirmation carefully.",
    ],
    tip: "A clear profile name and academic setup make it easier to recognize the correct workspace.",
  },
  {
    id: "switching",
    tone: "amber",
    label: "Switch safely",
    title: "Switch profiles from Settings with confidence",
    summary: "PrepMatrix saves the current workspace, then loads the profile you choose.",
    points: [
      "Open Settings and find the Profile & Information card.",
      "Check Current: Profile A or Current: Profile B before making changes.",
      "Select Visit Profile A or Visit Profile B, then wait for the new workspace to finish loading.",
    ],
    tip: "When the switch is complete, the Current label and sidebar content will reflect the selected profile.",
  },
]);

export const ACADEMIC_PROFILE_SEPARATE_ITEMS = Object.freeze([
  "Academic level, stream, degree, grade, and specialization",
  "Subjects, planner schedule, and completed tasks",
  "Notes, quizzes, exams, learning notebooks, and progress",
]);

export const ACADEMIC_PROFILE_SHARED_ITEMS = Object.freeze([
  "Account name, photo, and sign-in",
  "Email, password, and account security",
  "Account-wide AI credit allowance",
]);

function resolveStorage(storageRef) {
  if (storageRef) return storageRef;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getAcademicProfileGuideMarkerKey(profile = {}) {
  const dataId = getAcademicProfileDataId(profile);
  return dataId
    ? academicProfileStorageKey(dataId, "academic-profiles-guide", ACADEMIC_PROFILE_GUIDE_VERSION)
    : "";
}

export function claimFirstProfileBGuide(profile = {}, storageRef) {
  const key = getAcademicProfileGuideMarkerKey(profile);
  if (String(profile?.id || "").trim() !== "profile-b" || !key) return false;

  const storage = resolveStorage(storageRef);
  if (!storage) return true;
  try {
    if (storage.getItem(key) === ACADEMIC_PROFILE_GUIDE_VERSION) return false;
    storage.setItem(key, ACADEMIC_PROFILE_GUIDE_VERSION);
    return true;
  } catch {
    return true;
  }
}
