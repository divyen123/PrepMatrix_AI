export const STUDENT_NAME_MAX_LENGTH = 100;
export const STUDENT_AGE_MIN = 1;
export const STUDENT_AGE_MAX = 120;

export function validateStudentDetails({ username, age } = {}) {
  const name = typeof username === "string" ? username.trim() : "";
  if (!name || name.length > STUDENT_NAME_MAX_LENGTH) {
    return { error: "Enter your name (up to 100 characters)." };
  }
  const years = typeof age === "number" || (typeof age === "string" && /^\d+$/.test(age.trim()))
    ? Number(age) : NaN;
  if (!Number.isInteger(years) || years < STUDENT_AGE_MIN || years > STUDENT_AGE_MAX) {
    return { error: "Enter a whole-number age between 1 and 120." };
  }
  return { username: name, age: years };
}

// Only explicit registration flags opt an account into first-time setup.
export function getStudentOnboardingState(user = {}) {
  return {
    needsOnboardingGuide: user.onboardingGuidePending === true,
    needsProfileDetails: user.profileDetailsPending === true,
    setupChecklistEnabled: user.setupChecklistEnabled === true,
  };
}

export function mergeOnboardingProfile(current, saved) {
  if (!current?.id || current.id !== saved?.id) return current;
  const patch = {};
  for (const key of ["username", "age", "needsOnboardingGuide", "needsProfileDetails"]) {
    if (Object.hasOwn(saved, key)) patch[key] = saved[key];
  }
  // An account-wide identity save must not switch the active academic profile.
  return { ...current, ...patch };
}
