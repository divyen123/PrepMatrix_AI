const MAX_SUBJECT_CHARS = 140;

function replaceInlineControlCharacters(value) {
  return Array.from(String(value ?? ""), (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? " " : character;
  }).join("");
}

export function cleanMaterialGuideSubject(value) {
  return replaceInlineControlCharacters(value)
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, MAX_SUBJECT_CHARS);
}

function subjectKey(value) {
  return cleanMaterialGuideSubject(value).toLocaleLowerCase();
}

export function buildMaterialGuidePath(subject) {
  const cleanSubject = cleanMaterialGuideSubject(subject);
  return cleanSubject ? `/resources?subject=${encodeURIComponent(cleanSubject)}` : "/resources";
}

export function getMaterialGuideCardId(subject) {
  const cleanSubject = cleanMaterialGuideSubject(subject);
  return `subject-${cleanSubject.replace(/\s+/gu, "-") || "guide"}`;
}

export function resolveMaterialGuideSubjects(subjects = [], requestedSubject = "") {
  const safeSubjects = Array.isArray(subjects)
    ? subjects.filter((subject) => cleanMaterialGuideSubject(subject?.name))
    : [];
  const cleanRequestedSubject = cleanMaterialGuideSubject(requestedSubject);
  if (!cleanRequestedSubject) {
    return { focusedSubject: "", isTransient: false, subjects: safeSubjects };
  }

  const existing = safeSubjects.find(
    (subject) => subjectKey(subject.name) === subjectKey(cleanRequestedSubject),
  );
  if (existing) {
    return { focusedSubject: existing.name, isTransient: false, subjects: safeSubjects };
  }

  return {
    focusedSubject: cleanRequestedSubject,
    isTransient: true,
    subjects: [
      ...safeSubjects,
      { chapters: 1, materialGuideOnly: true, name: cleanRequestedSubject },
    ],
  };
}
