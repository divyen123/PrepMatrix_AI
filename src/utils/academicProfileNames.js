export const ACADEMIC_PROFILE_DISPLAY_NAME_MAX_LENGTH = 32;

export const DEFAULT_ACADEMIC_PROFILE_DISPLAY_NAMES = Object.freeze({
  "profile-a": "Profile A",
  "profile-b": "Profile B",
});

function cleanControlCharacters(value) {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    const isControl = codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
    return isControl ? " " : character;
  }).join("");
}

export function getDefaultAcademicProfileDisplayName(profileOrId = {}, index = 0) {
  const id = typeof profileOrId === "string"
    ? profileOrId.trim()
    : String(profileOrId?.id || "").trim();
  return DEFAULT_ACADEMIC_PROFILE_DISPLAY_NAMES[id]
    || `Profile ${index === 1 ? "B" : "A"}`;
}

export function normalizeAcademicProfileDisplayName(value) {
  if (typeof value !== "string") return "";
  return cleanControlCharacters(value.normalize("NFKC"))
    .replace(/\s+/gu, " ")
    .trim();
}

export function validateAcademicProfileDisplayName(value) {
  const displayName = normalizeAcademicProfileDisplayName(value);
  if (!displayName) {
    return { valid: false, value: "", error: "Enter a profile name." };
  }
  if (Array.from(displayName).length > ACADEMIC_PROFILE_DISPLAY_NAME_MAX_LENGTH) {
    return {
      valid: false,
      value: displayName,
      error: `Keep the profile name within ${ACADEMIC_PROFILE_DISPLAY_NAME_MAX_LENGTH} characters.`,
    };
  }
  return { valid: true, value: displayName, error: "" };
}

export function sanitizeAcademicProfileDisplayName(value, fallback = "Profile A") {
  const displayName = normalizeAcademicProfileDisplayName(value);
  const boundedName = Array.from(displayName)
    .slice(0, ACADEMIC_PROFILE_DISPLAY_NAME_MAX_LENGTH)
    .join("")
    .trim();
  return boundedName || normalizeAcademicProfileDisplayName(fallback) || "Profile A";
}

export function getAcademicProfileDisplayName(profile = {}, index = 0) {
  const fallback = String(profile?.label || "").trim()
    || getDefaultAcademicProfileDisplayName(profile, index);
  return sanitizeAcademicProfileDisplayName(profile?.displayName, fallback);
}
