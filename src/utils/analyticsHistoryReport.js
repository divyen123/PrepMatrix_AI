export function filterHistoricalQuizAttempts(attempts = [], snapshot = {}) {
  const cutoff = new Date(snapshot.archivedAt).getTime();
  if (!Number.isFinite(cutoff)) return [];
  const scheduleId = snapshot.momentumSchedule?.id || "";
  const start = new Date(snapshot.momentumSchedule?.startedAt || snapshot.scheduleStartDate).getTime();
  const subjectNames = new Set((snapshot.subjects || []).map((subject) => String(subject.name || "").toLowerCase()));
  return (Array.isArray(attempts) ? attempts : []).filter((attempt) => {
    if (attempt.status && attempt.status !== "completed") return false;
    const timestamp = new Date(attempt.completedAt || attempt.createdAt).getTime();
    if (!Number.isFinite(timestamp) || timestamp > cutoff) return false;
    if (scheduleId && attempt.momentumScheduleId) return attempt.momentumScheduleId === scheduleId;
    if (!Number.isFinite(start) || timestamp < start) return false;
    return subjectNames.has(String(attempt.subjectName || "").toLowerCase());
  });
}
