export const SUBJECT_SCHEDULE_MUTATION_MODES = Object.freeze({
  KEEP: "keep",
  RECONCILE: "reconcile",
  RESET: "reset",
});

export function getSubjectScheduleMutationMode({
  isYoungKidsLearner = false,
  parentAccessGranted = false,
  preserveSchedule = false,
} = {}) {
  if (isYoungKidsLearner && !parentAccessGranted) {
    return SUBJECT_SCHEDULE_MUTATION_MODES.KEEP;
  }
  return preserveSchedule
    ? SUBJECT_SCHEDULE_MUTATION_MODES.RECONCILE
    : SUBJECT_SCHEDULE_MUTATION_MODES.RESET;
}
