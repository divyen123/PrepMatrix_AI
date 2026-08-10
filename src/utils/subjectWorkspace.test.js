import assert from "node:assert/strict";
import test from "node:test";
import {
  SUBJECT_SCHEDULE_MUTATION_MODES,
  getSubjectScheduleMutationMode,
} from "./subjectWorkspace.js";

test("kids can update their subject library without mutating a parent-protected schedule", () => {
  assert.equal(getSubjectScheduleMutationMode({
    isYoungKidsLearner: true,
    parentAccessGranted: false,
    preserveSchedule: false,
  }), SUBJECT_SCHEDULE_MUTATION_MODES.KEEP);
  assert.equal(getSubjectScheduleMutationMode({
    isYoungKidsLearner: true,
    parentAccessGranted: false,
    preserveSchedule: true,
  }), SUBJECT_SCHEDULE_MUTATION_MODES.KEEP);
});

test("an unlocked parent and standard learners keep the existing reset and reconcile behavior", () => {
  assert.equal(getSubjectScheduleMutationMode({
    isYoungKidsLearner: true,
    parentAccessGranted: true,
  }), SUBJECT_SCHEDULE_MUTATION_MODES.RESET);
  assert.equal(getSubjectScheduleMutationMode({
    isYoungKidsLearner: true,
    parentAccessGranted: true,
    preserveSchedule: true,
  }), SUBJECT_SCHEDULE_MUTATION_MODES.RECONCILE);
  assert.equal(getSubjectScheduleMutationMode({
    isYoungKidsLearner: false,
    preserveSchedule: true,
  }), SUBJECT_SCHEDULE_MUTATION_MODES.RECONCILE);
});
