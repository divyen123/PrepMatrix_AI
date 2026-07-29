function normalizeSubjectName(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function getMatchRank(subjectName, query) {
  if (subjectName === query) return 4;
  if (subjectName.startsWith(query)) return 3;
  if (subjectName.split(/\s+/).some((word) => word.startsWith(query))) return 2;
  if (subjectName.includes(query)) return 1;
  return 0;
}

export function getRankedQuizSubjects(subjects, query) {
  const normalizedQuery = normalizeSubjectName(query);
  if (!normalizedQuery || !Array.isArray(subjects)) return [];

  return subjects
    .map((subject, index) => ({
      subject,
      index,
      rank: getMatchRank(normalizeSubjectName(subject?.name), normalizedQuery),
    }))
    .filter(({ rank }) => rank > 0)
    .sort((left, right) => right.rank - left.rank || left.index - right.index)
    .map(({ subject }) => subject);
}
