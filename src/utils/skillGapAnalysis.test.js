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
  const result = analyzeSkillGap({
    resumeText: "Built software for customers.",
    jobDescription: "Looking for an enthusiastic candidate.",
  });
  assert.deepEqual(result.matched, []);
  assert.deepEqual(result.needsEvidence, []);
  assert.deepEqual(result.notShown, []);
  assert.deepEqual(result.requestedSkills, []);
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

test("compares a software developer role with skills actually present in the resume", () => {
  const result = analyzeSkillGap({
    resumeText: "Skills\nGit, SQL\nExperience\nBuilt and tested a reporting service using SQL.",
    jobDescription: "Software developer",
  });

  assert.deepEqual(result.roleNames, ["Software developer"]);
  assert.equal(result.inputType, "role");
  assert.deepEqual(result.matched.map((item) => item.skill), ["Testing", "SQL"]);
  assert.deepEqual(result.needsEvidence.map((item) => item.skill), ["Git"]);
  assert.ok(result.notShown.some((item) => item.skill === "Data structures"));
  assert.ok(result.notShown.some((item) => item.skill === "Debugging"));
  assert.equal(result.requestedSkills.some((item) => item.requirement), false);
});

test("combines overlapping UI design and frontend role profiles without duplicate skills", () => {
  const result = analyzeSkillGap({
    draft: { skills: ["Figma", "HTML", "CSS"], projects: [{ highlights: ["Designed a Figma prototype and built a responsive HTML interface."] }] },
    jobDescription: "UI designer, frontend developer",
  });

  assert.deepEqual(result.roleNames, ["UI/UX designer", "Frontend developer"]);
  const skills = result.requestedSkills.map((item) => item.skill);
  assert.equal(new Set(skills).size, skills.length);
  assert.ok(result.matched.some((item) => item.skill === "Figma"));
  assert.ok(result.matched.some((item) => item.skill === "HTML"));
  assert.ok(result.notShown.some((item) => item.skill === "JavaScript"));
  assert.ok(result.notShown.some((item) => item.skill === "User research"));
});

test("does not add a role baseline to a job description with explicit requirements", () => {
  const result = analyzeSkillGap({
    jobDescription: "Software developer. React and Docker required.",
  });

  assert.deepEqual(result.requestedSkills.map((item) => item.skill), ["Docker", "React"]);
  assert.equal("roleNames" in result, false);
});

test("includes explicitly named skills alongside a short role title", () => {
  const result = analyzeSkillGap({
    draft: { skills: ["TypeScript"] },
    jobDescription: "Frontend developer, TypeScript",
  });

  assert.equal(result.inputType, "role");
  assert.equal(result.requestedSkills.filter((item) => item.skill === "TypeScript").length, 1);
  assert.deepEqual(result.needsEvidence.map((item) => item.skill), ["TypeScript"]);
});

test("accepts a role title pasted with a trailing newline", () => {
  const result = analyzeSkillGap({ jobDescription: "Software developer\n" });
  assert.equal(result.inputType, "role");
  assert.ok(result.notShown.length > 0);
});

test("compares non-technical roles against the selected resume text", () => {
  const result = analyzeSkillGap({
    resumeText: "Skills\nAccounting, Microsoft Excel",
    jobDescription: "Accountant",
  });

  assert.deepEqual(result.roleNames, ["Accountant"]);
  assert.deepEqual(result.notShown.map((item) => item.skill), ["Bookkeeping", "Communication"]);
  assert.deepEqual(result.needsEvidence.map((item) => item.skill), ["Accounting", "Microsoft Excel"]);
});

test("does not fabricate requirements for an unknown role title", () => {
  const result = analyzeSkillGap({ jobDescription: "Rocket pilot" });
  assert.deepEqual(result.matched, []);
  assert.deepEqual(result.needsEvidence, []);
  assert.deepEqual(result.notShown, []);
  assert.deepEqual(result.requestedSkills, []);
});

test("reviews the summary even when the resume lists every requested skill", () => {
  const result = analyzeSkillGap({
    draft: {
      summary: "Hardworking and passionate professional looking for an opportunity.",
      skills: ["React"],
      experience: [{
        role: "Frontend developer",
        highlights: ["Built a React checkout flow that reduced support requests by 20% while serving 5,000 customers."],
      }],
    },
    jobDescription: "React required.",
  });

  assert.equal(result.notShown.length, 0);
  const summary = result.findings.find((item) => item.category === "summary");
  assert.ok(summary, "generic summary should receive feedback independently of skill coverage");
  assert.equal(typeof summary.id, "string");
  assert.ok(["high", "medium", "low"].includes(summary.priority));
  assert.ok(summary.title && summary.suggestion);
});

test("suggests a concrete improvement for vague experience descriptions", () => {
  const result = analyzeSkillGap({
    draft: {
      experience: [{ role: "Developer", organization: "Acme", highlights: ["Responsible for development tasks."] }],
    },
    jobDescription: "Software developer",
  });

  const experience = result.findings.find((item) => item.category === "experience");
  assert.ok(experience);
  assert.match(`${experience.evidence} ${experience.title}`, /responsible|development|experience|impact|result/iu);
  assert.ok(experience.suggestion.trim().length > 20);
});

test("flags a project that names technologies but explains no contribution or result", () => {
  const result = analyzeSkillGap({
    draft: { projects: [{ name: "Dashboard", technologies: "React, SQL", highlights: [] }] },
    jobDescription: "React and SQL required.",
  });

  const project = result.findings.find((item) => item.category === "projects");
  assert.ok(project);
  assert.match(`${project.title} ${project.evidence} ${project.suggestion}`, /Dashboard|project/iu);
  assert.ok(project.suggestion.trim().length > 20);
});

test("distinguishes a listed skill lacking proof from an absent role skill in feedback", () => {
  const result = analyzeSkillGap({
    draft: { skills: ["React"], projects: [{ name: "Web app", highlights: ["Built the web app for a class."] }] },
    jobDescription: "React and Docker required.",
  });

  assert.deepEqual(result.needsEvidence.map((item) => item.skill), ["React"]);
  assert.deepEqual(result.notShown.map((item) => item.skill), ["Docker"]);
  const roleFindings = result.findings.filter((item) => item.category === "role");
  assert.ok(roleFindings.length > 0);
  assert.match(roleFindings.map((item) => `${item.title} ${item.suggestion}`).join(" "), /React|Docker/iu);
});

test("reviews structured draft completeness without requiring a recognized job role", () => {
  const result = analyzeSkillGap({
    draft: {
      personal: { fullName: "Alex Example", headline: "Developer" },
      summary: "Developer creating web applications for community organizations.",
      projects: [{ name: "Volunteer portal", highlights: ["Built a booking flow used by local volunteers."] }],
    },
    jobDescription: "Rocket pilot",
  });

  assert.deepEqual(result.requestedSkills, []);
  assert.ok(result.findings.length > 0, "resume review should still work for an unknown role");
  assert.ok(result.findings.some((item) => item.category === "completeness"));
  assert.ok(result.findings.every((item) => item.id && item.title && item.suggestion));
});

test("reviews pasted or extracted resume descriptions as well as builder drafts", () => {
  const result = analyzeSkillGap({
    resumeText: [
      "Summary",
      "Passionate and hardworking student.",
      "Experience",
      "Developer, Acme",
      "Responsible for software development.",
      "Projects",
      "Inventory app",
      "Python, SQL",
    ].join("\n"),
    jobDescription: "Software developer",
  });

  assert.ok(result.findings.some((item) => item.category === "summary"));
  assert.ok(result.findings.some((item) => item.category === "experience"));
  assert.ok(result.findings.some((item) => item.category === "projects"));
  assert.equal(new Set(result.findings.map((item) => item.id)).size, result.findings.length);
});
