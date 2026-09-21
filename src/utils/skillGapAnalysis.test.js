import assert from "node:assert/strict";
import test from "node:test";
import { analyzeSkillGap } from "./skillGapAnalysis.js";

test("separates demonstrated, listed-only, and unmentioned requested skills", () => {
  const result = analyzeSkillGap({
    draft: {
      skills: ["React", "SQL"],
      experience: [{ role: "Developer", highlights: ["Built a React dashboard for sales reporting."] }],
      projects: [],
    },
    jobDescription: "Required skills: React, SQL, Docker, Python.",
  });

  assert.deepEqual(result.matched.map((item) => item.skill), ["React"]);
  assert.match(result.matched[0].evidence, /Built a React dashboard/u);
  assert.deepEqual(result.needsEvidence.map((item) => item.skill), ["SQL"]);
  assert.equal(result.needsEvidence[0].evidence, "SQL");
  assert.deepEqual(result.notShown.map((item) => item.skill), ["Docker", "Python"]);
  assert.equal(result.requestedSkills.length, 4);
  assert.ok(result.notShown.every((item) => /resume|skill|developing/iu.test(item.action)));
});

test("uses action lines in pasted resume text as evidence", () => {
  const result = analyzeSkillGap({
    resumeText: "Skills\nPython, SQL\nExperience\nBuilt a reporting pipeline with Python.\nEducation\nBachelor's degree",
    jobDescription: "Python and SQL are required.",
  });

  assert.deepEqual(result.matched.map((item) => item.skill), ["Python"]);
  assert.deepEqual(result.needsEvidence.map((item) => item.skill), ["SQL"]);
});

test("a project technology list needs a concrete project example", () => {
  const result = analyzeSkillGap({
    draft: { projects: [{ technologies: "React, Figma", highlights: ["Developed a React interface."] }] },
    jobDescription: "React and Figma experience",
  });

  assert.deepEqual(result.matched.map((item) => item.skill), ["React"]);
  assert.deepEqual(result.needsEvidence.map((item) => item.skill), ["Figma"]);
});

test("does not turn generic job prose into invented skills or confuse Java with JavaScript", () => {
  const result = analyzeSkillGap({
    resumeText: "Built JavaScript applications.",
    jobDescription: "Build modern user interfaces and analyze data. JavaScript experience required.",
  });

  assert.deepEqual(result.requestedSkills.map((item) => item.skill), ["JavaScript"]);
  assert.deepEqual(result.matched.map((item) => item.skill), ["JavaScript"]);
});

test("returns empty groups when the job description names no recognized skill", () => {
  assert.deepEqual(analyzeSkillGap({
    resumeText: "Built software for customers.",
    jobDescription: "Looking for an enthusiastic candidate.",
  }), { matched: [], needsEvidence: [], notShown: [], requestedSkills: [] });
});

test("matches common aliases without treating substrings as skills", () => {
  const result = analyzeSkillGap({
    draft: { tools: ["Amazon Web Services", "Postgres"], projects: [{ highlights: ["Deployed the service on AWS."] }] },
    jobDescription: "Experience with AWS and PostgreSQL. Good relationship skills.",
  });

  assert.deepEqual(result.matched.map((item) => item.skill), ["AWS"]);
  assert.deepEqual(result.needsEvidence.map((item) => item.skill), ["PostgreSQL"]);
  assert.equal(result.requestedSkills.some((item) => item.skill === "SQL"), false);
});

test("excludes a skill explicitly marked unnecessary without hiding another skill on the line", () => {
  const result = analyzeSkillGap({
    jobDescription: "React required; Python not required. No experience with Docker required.",
  });

  assert.deepEqual(result.requestedSkills.map((item) => item.skill), ["React"]);
});
