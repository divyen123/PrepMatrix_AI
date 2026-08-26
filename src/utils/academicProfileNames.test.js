import test from "node:test";
import assert from "node:assert/strict";
import {
  ACADEMIC_PROFILE_DISPLAY_NAME_MAX_LENGTH,
  getAcademicProfileDisplayName,
  normalizeAcademicProfileDisplayName,
  sanitizeAcademicProfileDisplayName,
  validateAcademicProfileDisplayName,
} from "./academicProfileNames.js";

test("uses Profile A and Profile B as backward-compatible default display names", () => {
  assert.equal(getAcademicProfileDisplayName({ id: "profile-a", label: "Profile A" }), "Profile A");
  assert.equal(getAcademicProfileDisplayName({ id: "profile-b", label: "Profile B" }), "Profile B");
});

test("normalizes student-defined profile names without changing meaningful Unicode", () => {
  assert.equal(normalizeAcademicProfileDisplayName("  Medical   –  BDS\n"), "Medical – BDS");
  assert.deepEqual(validateAcademicProfileDisplayName(" Dentistry "), {
    valid: true,
    value: "Dentistry",
    error: "",
  });
});

test("rejects empty and overlong profile names", () => {
  assert.equal(validateAcademicProfileDisplayName(" \n ").valid, false);
  assert.equal(
    validateAcademicProfileDisplayName("x".repeat(ACADEMIC_PROFILE_DISPLAY_NAME_MAX_LENGTH + 1)).valid,
    false,
  );
});

test("sanitizes legacy stored values to a safe bounded fallback", () => {
  assert.equal(sanitizeAcademicProfileDisplayName("\u0000  ", "Profile B"), "Profile B");
  assert.equal(
    Array.from(sanitizeAcademicProfileDisplayName("x".repeat(100), "Profile A")).length,
    ACADEMIC_PROFILE_DISPLAY_NAME_MAX_LENGTH,
  );
});
