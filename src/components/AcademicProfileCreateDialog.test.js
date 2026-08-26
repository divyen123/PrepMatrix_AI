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

test("uses an accessible, animated, compact, responsive dialog with registration-grade fields", () => {
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
  assert.doesNotMatch(source, /Add a different class, degree, course, or learning path\./u);
  assert.doesNotMatch(source, /Your Profile A work stays separate and safe\./u);
  assert.doesNotMatch(source, /Academic credentials/u);
  assert.doesNotMatch(source, /Use the same details you would enter during registration\./u);
  assert.doesNotMatch(source, /aria-describedby="academic-profile-create-description"/u);
  assert.doesNotMatch(source, /\bGraduationCap\b/u);
  assert.doesNotMatch(source, /academic-profile-create-form-heading/u);

  for (const fieldId of ["profile-b-degree", "profile-b-department"]) {
    const labelTag = source.match(
      new RegExp('<label\\b[^>]*htmlFor="' + fieldId + '"[^>]*>', "u"),
    )?.[0];
    assert.ok(labelTag, "Missing label for " + fieldId);
    assert.doesNotMatch(labelTag, /\bis-full\b/u);
  }
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
  assert.match(source, /const currentProfileName = activeProfile\?\.displayName \|\| activeProfile\?\.label \|\| "Profile A"/u);
  assert.match(source, /<small>Current<\/small> \{currentProfileName\}/u);
  assert.match(source, /<small>New<\/small> Profile B/u);
  assert.match(source, /ACADEMIC_PROFILE_CREATE_EXIT_MS = 460/u);

  const dialogRule = stylesheet.match(
    /\.academic-profile-create-dialog\s*\{([^}]*)\}/u,
  )?.[1];
  assert.ok(dialogRule, "Missing dialog CSS rule");
  assert.match(dialogRule, /width:\s*min\(720px,\s*100%\);/u);
  assert.match(dialogRule, /max-height:\s*none;/u);
  assert.match(dialogRule, /overflow:\s*visible;/u);
  assert.doesNotMatch(
    dialogRule,
    /overflow(?:-[xy])?:\s*(?:auto|scroll)\b/u,
  );

  const controlsRule = stylesheet.match(
    /\.academic-profile-create-fields input,\s*\.academic-profile-create-fields select\s*\{([^}]*)\}/u,
  )?.[1];
  assert.ok(controlsRule, "Missing field control CSS rule");
  assert.match(controlsRule, /min-height:\s*40px;/u);
  assert.match(controlsRule, /padding:\s*0 12px;/u);
  assert.match(controlsRule, /border-radius:\s*11px;/u);

  const actionsRule = stylesheet.match(
    /\.academic-profile-create-actions button\s*\{([^}]*)\}/u,
  )?.[1];
  assert.ok(actionsRule, "Missing action button CSS rule");
  assert.match(actionsRule, /min-height:\s*38px;/u);
  assert.match(actionsRule, /padding:\s*0 14px;/u);
  assert.match(actionsRule, /border-radius:\s*11px;/u);
  assert.match(actionsRule, /font-size:\s*0\.82rem;/u);

  assert.match(stylesheet, /transition: opacity 460ms/u);
  assert.match(stylesheet, /transform 460ms/u);
  assert.match(
    stylesheet,
    /\.academic-profile-create-fields\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/u,
  );
  assert.match(stylesheet, /body\.has-bg-image:not\(\.no-glass-cards\) \.academic-profile-create-dialog/u);
  assert.match(stylesheet, /var\(--glass-opacity, 0\.6\)/u);
  assert.match(
    stylesheet,
    /@media \(max-width: 640px\)[\s\S]*?\.academic-profile-create-fields\s*\{[^}]*grid-template-columns:\s*1fr;/u,
  );
  assert.match(stylesheet, /@media \(max-height: 620px\)/u);
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)/u);
});
