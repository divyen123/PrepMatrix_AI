import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createServer } from "vite";

test("validates a distinct Profile B and builds the registration academic payload", async () => {
  let vite;
  try {
    vite = await createServer({
      appType: "custom",
      logLevel: "silent",
      server: { middlewareMode: true },
    });
    const {
      buildAcademicProfileCreationPayload,
      validateAcademicProfileCreationDraft,
    } = await vite.ssrLoadModule("/src/utils/academicProfileCreation.js");

    const activeProfile = {
      academicLevel: "Primary School",
      academicTrack: "CBSE",
      grade: "Class 2",
      schoolType: "school",
    };

    assert.equal(
      validateAcademicProfileCreationDraft({
        academicLevel: "Primary School",
        academicTrack: "CBSE",
        grade: "Class 3",
        institutionName: "",
      }, activeProfile),
      "Enter your institution name to continue.",
    );
    assert.equal(
      validateAcademicProfileCreationDraft({
        academicLevel: "Primary School",
        academicTrack: "CBSE",
        grade: "",
        institutionName: "Prep School",
      }, activeProfile),
      "Choose the learner's exact class.",
    );
    assert.match(
      validateAcademicProfileCreationDraft({
        ...activeProfile,
        institutionName: "Prep School",
      }, activeProfile),
      /different from Profile A/u,
    );
    assert.equal(
      validateAcademicProfileCreationDraft({
        academicLevel: "Primary School",
        academicTrack: "CBSE",
        grade: "Class 3",
        institutionName: "Prep School",
      }, activeProfile),
      "",
    );

    assert.deepEqual(
      buildAcademicProfileCreationPayload({
        academicLevel: "Primary School",
        academicTrack: "CBSE",
        degree: "Must be cleared",
        department: "Must be cleared",
        grade: "Class 3",
        institutionName: "  Prep School  ",
      }),
      {
        academicLevel: "Primary School",
        academicTrack: "CBSE",
        schoolType: "school",
        grade: "Class 3",
        degree: "",
        department: "",
        institutionName: "Prep School",
      },
    );

    const collegePayload = buildAcademicProfileCreationPayload({
      academicLevel: "Postgraduate / Master's",
      academicTrack: "Business & Management",
      degree: "MBA",
      department: "Management",
      grade: "Class 9",
      institutionName: "Prep University",
    });
    assert.equal(collegePayload.grade, "");
    assert.equal(collegePayload.degree, "MBA");
    assert.equal(collegePayload.department, "Management");
  } finally {
    await vite?.close();
  }
});

test("uses an accessible, animated, responsive dialog with registration-grade fields", () => {
  const source = readFileSync(
    new URL("./AcademicProfileCreateDialog.jsx", import.meta.url),
    "utf8",
  );
  const stylesheet = readFileSync(
    new URL("./AcademicProfileCreateDialog.css", import.meta.url),
    "utf8",
  );

  for (const label of [
    "Institution name",
    "Academic stage",
    "Board / curriculum / field",
    "Exact class",
    "Degree / qualification",
    "Department / specialization",
  ]) {
    assert.match(source, new RegExp(label.replaceAll("/", "\\/"), "u"));
  }
  assert.doesNotMatch(source, /Email address|Password/u);
  assert.match(source, /aria-modal="true"/u);
  assert.match(source, /role="dialog"/u);
  assert.match(source, /aria-busy=\{submitting\}/u);
  assert.match(source, /aria-live="polite"/u);
  assert.match(source, /inert=\{!open \? true : undefined\}/u);
  assert.match(source, /event\.key === "Escape"/u);
  assert.match(source, /event\.key !== "Tab"/u);
  assert.match(source, /textarea:not\(\[disabled\]\)/u);
  assert.match(source, /institutionInputRef\.current\?\.focus\(\)/u);
  assert.match(source, /document\.body\.style\.overflow = "hidden"/u);
  assert.match(source, /focusTarget\.focus\(\)/u);
  assert.match(source, /onCreateAcademicProfile\(buildAcademicProfileCreationPayload\(draft\)\)/u);
  assert.match(source, /ACADEMIC_PROFILE_CREATE_EXIT_MS = 460/u);

  assert.match(stylesheet, /max-height: min\(880px, calc\(100vh - 48px\)\)/u);
  assert.match(stylesheet, /transition: opacity 460ms/u);
  assert.match(stylesheet, /transform 460ms/u);
  assert.match(stylesheet, /min-height: 48px/u);
  assert.match(stylesheet, /body\.has-bg-image:not\(\.no-glass-cards\) \.academic-profile-create-dialog/u);
  assert.match(stylesheet, /var\(--glass-opacity, 0\.6\)/u);
  assert.match(stylesheet, /@media \(max-width: 640px\)/u);
  assert.match(stylesheet, /grid-template-columns: 1fr/u);
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)/u);
});
