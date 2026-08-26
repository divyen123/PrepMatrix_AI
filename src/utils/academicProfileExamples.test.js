import test from "node:test";
import assert from "node:assert/strict";
import {
  DEPARTMENT_OPTIONS,
  TRACK_OPTIONS,
} from "./academicProfile.js";
import {
  getAcademicProfileExamples,
  resolveAcademicProfileExampleDomain,
} from "./academicProfileExamples.js";

test("uses dentistry examples for an active BDS profile", () => {
  const examples = getAcademicProfileExamples({
    academicLevel: "Medical / Health Sciences",
    academicTrack: "Medical & Health Sciences",
    degree: "BDS",
    department: "Dentistry",
  });

  assert.equal(examples.domain, "dentistry");
  assert.equal(examples.subjectPlaceholder, "e.g. Oral Pathology");
  assert.match(examples.learningPromptPlaceholder, /dental caries/i);
  assert.doesNotMatch(
    Object.values(examples).filter((value) => typeof value === "string").join(" "),
    /operating systems|cpu scheduling|banker's algorithm/i,
  );
});

test("distinguishes major health-sciences pathways", () => {
  assert.equal(resolveAcademicProfileExampleDomain({ degree: "MBBS", department: "Medicine" }), "medicine");
  assert.equal(resolveAcademicProfileExampleDomain({ degree: "B.Sc Nursing", department: "Nursing" }), "nursing");
  assert.equal(resolveAcademicProfileExampleDomain({ degree: "B.Pharm", department: "Pharmacy" }), "pharmacy");
  assert.equal(resolveAcademicProfileExampleDomain({ degree: "BPT", department: "Physiotherapy" }), "physiotherapy");
  assert.equal(resolveAcademicProfileExampleDomain({ degree: "MPH", department: "Public Health" }), "publicHealth");
});

test("uses class and stream appropriate school examples", () => {
  const primary = getAcademicProfileExamples({ academicLevel: "Primary School", grade: "Class 3", academicTrack: "CBSE" });
  const science = getAcademicProfileExamples({ academicLevel: "Senior / Higher Secondary School", grade: "Class 12", academicTrack: "Science / STEM" });
  const commerce = getAcademicProfileExamples({ academicLevel: "Senior / Higher Secondary School", grade: "Class 12", academicTrack: "Commerce / Business" });
  const humanities = getAcademicProfileExamples({ academicLevel: "Senior / Higher Secondary School", grade: "Class 12", academicTrack: "Humanities / Arts" });

  assert.equal(primary.domain, "primary");
  assert.equal(primary.subject, "Science");
  assert.equal(science.domain, "seniorScience");
  assert.equal(science.subject, "Physics");
  assert.equal(commerce.domain, "seniorCommerce");
  assert.equal(commerce.subject, "Accountancy");
  assert.equal(humanities.domain, "seniorHumanities");
  assert.equal(humanities.subject, "Political Science");
});

test("maps common higher-education fields to relevant examples", () => {
  const cases = [
    [{ degree: "B.Tech", department: "Information Technology" }, "computing"],
    [{ degree: "B.E.", department: "Electrical Engineering" }, "electronics"],
    [{ degree: "LLB", department: "Law" }, "law"],
    [{ degree: "B.Com", department: "Accounting & Finance" }, "commerce"],
    [{ degree: "MBA", department: "Management" }, "business"],
    [{ degree: "B.Ed", department: "Education & Teaching" }, "education"],
    [{ degree: "B.Sc", department: "Biological Sciences" }, "lifeScience"],
    [{ degree: "B.Arch", department: "Architecture & Planning" }, "architecture"],
  ];

  for (const [profile, expectedDomain] of cases) {
    assert.equal(resolveAcademicProfileExampleDomain(profile), expectedDomain);
  }
});

test("returns complete safe examples for every configured track and department", () => {
  for (const academicTrack of TRACK_OPTIONS) {
    const examples = getAcademicProfileExamples({
      academicLevel: "Undergraduate / Bachelor's",
      academicTrack,
    });
    assert.ok(examples.subject);
    assert.ok(examples.chapter);
    assert.ok(examples.topic);
    assert.ok(examples.learningPromptPlaceholder.startsWith("e.g. "));
  }

  for (const department of DEPARTMENT_OPTIONS) {
    const examples = getAcademicProfileExamples({
      academicLevel: "Undergraduate / Bachelor's",
      department,
    });
    assert.ok(examples.contextLabel);
    assert.ok(examples.subjectPlanTopicsPlaceholder.includes(examples.topic));
    assert.equal(examples.additionalChapters.length, 2);
  }
});
