// A deliberately small vocabulary recognizes skills in resumes and job text.
// This checks what a resume mentions, not what the candidate knows.
const SKILLS = [
  ["JavaScript", "javascript", "js"],
  ["TypeScript", "typescript"],
  ["Python", "python"],
  ["Java", "java"],
  ["C++", "c++"],
  ["C#", "c#"],
  ["HTML", "html"],
  ["CSS", "css"],
  ["React", "react", "react.js", "reactjs"],
  ["Angular", "angular"],
  ["Vue", "vue", "vue.js", "vuejs"],
  ["Next.js", "next.js", "nextjs"],
  ["Node.js", "node.js", "nodejs"],
  ["Express.js", "express.js", "expressjs"],
  ["FastAPI", "fastapi"],
  ["Django", "django"],
  ["Flask", "flask"],
  ["Ruby", "ruby"],
  ["PHP", "php"],
  ["Kotlin", "kotlin"],
  ["Swift", "swift"],
  ["Rust", "rust"],
  ["Spring Boot", "spring boot"],
  [".NET", ".net", "dotnet"],
  ["SQL", "sql"],
  ["PostgreSQL", "postgresql", "postgres"],
  ["MySQL", "mysql"],
  ["MongoDB", "mongodb"],
  ["Oracle Database", "oracle database", "oracle db"],
  ["Redis", "redis"],
  ["Firebase", "firebase"],
  ["Snowflake", "snowflake"],
  ["REST APIs", "rest api", "rest apis", "restful api", "restful apis"],
  ["GraphQL", "graphql"],
  ["Git", "git"],
  ["GitHub", "github"],
  ["Docker", "docker"],
  ["Kubernetes", "kubernetes", "k8s"],
  ["Linux", "linux"],
  ["AWS", "aws", "amazon web services"],
  ["Azure", "azure", "microsoft azure"],
  ["Google Cloud", "google cloud", "gcp"],
  ["CI/CD", "ci/cd", "continuous integration", "continuous deployment"],
  ["Jest", "jest"],
  ["Playwright", "playwright"],
  ["Selenium", "selenium"],
  ["Cypress", "cypress"],
  ["Jira", "jira"],
  ["Salesforce", "salesforce"],
  ["SAP", "sap"],
  ["Figma", "figma"],
  ["Adobe Photoshop", "adobe photoshop", "photoshop"],
  ["Adobe Illustrator", "adobe illustrator", "illustrator"],
  ["AutoCAD", "autocad"],
  ["MATLAB", "matlab"],
  ["Power BI", "power bi", "powerbi"],
  ["Tableau", "tableau"],
  ["Microsoft Excel", "microsoft excel", "ms excel", "excel"],
  ["Pandas", "pandas"],
  ["NumPy", "numpy"],
  ["TensorFlow", "tensorflow"],
  ["PyTorch", "pytorch"],
  ["Scikit-learn", "scikit-learn", "sklearn"],
  ["LangChain", "langchain"],
  ["Machine learning", "machine learning"],
  ["Data analysis", "data analysis", "data analytics"],
  ["Data visualization", "data visualization", "data visualisation"],
  ["Statistical analysis", "statistical analysis"],
  ["Project management", "project management"],
  ["Agile", "agile methodology", "agile methods", "agile"],
  ["Scrum", "scrum"],
  ["Testing", "software testing", "unit testing", "integration testing", "testing", "tested"],
  ["Debugging", "debugging", "debug"],
  ["Data structures", "data structures"],
  ["Algorithms", "algorithms", "algorithm design"],
  ["Responsive design", "responsive design", "responsive web design"],
  ["Accessibility", "web accessibility", "digital accessibility", "accessibility", "wcag"],
  ["Wireframing", "wireframing", "wireframes", "wireframe"],
  ["Prototyping", "prototyping", "prototypes", "prototype"],
  ["User research", "user research", "usability research"],
  ["Design systems", "design systems", "design system"],
  ["Communication", "communication skills", "communication"],
  ["Leadership", "leadership"],
  ["Teamwork", "teamwork", "team collaboration"],
  ["Problem solving", "problem solving", "problem-solving"],
  ["Customer service", "customer service"],
  ["Sales", "sales"],
  ["SEO", "seo", "search engine optimization", "search engine optimisation"],
  ["Content writing", "content writing"],
  ["Financial analysis", "financial analysis"],
  ["Accounting", "accounting"],
  ["Bookkeeping", "bookkeeping"],
  ["Clinical assessment", "clinical assessment"],
  ["Patient care", "patient care"],
  ["Electronic health records", "electronic health records", "ehr", "emr"],
  ["Curriculum development", "curriculum development"],
];

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const skillPatterns = SKILLS.map(([skill, ...aliases]) => ({
  skill,
  aliases: aliases.map((alias) => new RegExp(`(^|[^a-z0-9])(${escapeRegExp(alias)})(?=$|[^a-z0-9])`, "i")),
}));

// A role title has no explicit requirements to extract. These compact profiles
// provide a useful starting comparison without applying them to full job ads.
const ROLE_PROFILES = [
  {
    name: "Software developer",
    pattern: /\bsoftware\s+(?:developer|engineer|programmer)\b/i,
    skills: ["Git", "Data structures", "Algorithms", "Debugging", "Testing", "SQL", "Problem solving"],
  },
  {
    name: "Frontend developer",
    pattern: /\b(?:front[\s-]?end|web)\s+(?:developer|engineer)\b/i,
    skills: ["HTML", "CSS", "JavaScript", "React", "Responsive design", "Accessibility", "Git", "REST APIs"],
  },
  {
    name: "Backend developer",
    pattern: /\bback[\s-]?end\s+(?:developer|engineer)\b/i,
    skills: ["REST APIs", "SQL", "Git", "Testing", "Debugging", "Docker"],
  },
  {
    name: "Full-stack developer",
    pattern: /\bfull[\s-]?stack\s+(?:developer|engineer)\b/i,
    skills: ["HTML", "CSS", "JavaScript", "React", "REST APIs", "SQL", "Git", "Testing"],
  },
  {
    name: "UI/UX designer",
    pattern: /\b(?:ui(?:\s*\/\s*ux)?|ux|user\s+(?:interface|experience))\s+design(?:er)?\b/i,
    skills: ["Figma", "Wireframing", "Prototyping", "User research", "Design systems", "Accessibility", "Communication"],
  },
  {
    name: "Data analyst",
    pattern: /\bdata\s+analyst\b/i,
    skills: ["SQL", "Microsoft Excel", "Data analysis", "Data visualization", "Statistical analysis", "Power BI"],
  },
  {
    name: "Data scientist",
    pattern: /\bdata\s+scientist\b/i,
    skills: ["Python", "SQL", "Pandas", "Statistical analysis", "Machine learning", "Data visualization"],
  },
  {
    name: "Machine learning engineer",
    pattern: /\b(?:machine\s+learning|ml)\s+engineer\b/i,
    skills: ["Python", "Machine learning", "Data analysis", "Git", "Testing", "Docker"],
  },
  {
    name: "DevOps engineer",
    pattern: /\b(?:dev[\s-]?ops|site\s+reliability)\s+(?:engineer|specialist)\b/i,
    skills: ["Linux", "Git", "CI/CD", "Docker", "Kubernetes", "AWS"],
  },
  {
    name: "QA engineer",
    pattern: /\b(?:qa|quality\s+assurance|test\s+automation)\s+(?:engineer|analyst|tester)\b/i,
    skills: ["Testing", "Debugging", "Jira", "Selenium", "Playwright", "Communication"],
  },
  {
    name: "Product manager",
    pattern: /\bproduct\s+(?:manager|owner)\b/i,
    skills: ["User research", "Data analysis", "Project management", "Agile", "Communication"],
  },
  {
    name: "Project manager",
    pattern: /\bproject\s+manager\b/i,
    skills: ["Project management", "Communication", "Leadership", "Agile", "Microsoft Excel"],
  },
  {
    name: "Business analyst",
    pattern: /\bbusiness\s+analyst\b/i,
    skills: ["Data analysis", "Microsoft Excel", "SQL", "Communication", "Project management"],
  },
  {
    name: "Graphic designer",
    pattern: /\b(?:graphic|visual)\s+designer\b/i,
    skills: ["Figma", "Adobe Photoshop", "Adobe Illustrator", "Communication"],
  },
  {
    name: "Digital marketer",
    pattern: /\b(?:digital\s+marketer|digital\s+marketing\s+(?:specialist|manager))\b/i,
    skills: ["SEO", "Content writing", "Data analysis", "Communication"],
  },
  {
    name: "Financial analyst",
    pattern: /\bfinancial\s+analyst\b/i,
    skills: ["Financial analysis", "Microsoft Excel", "Accounting", "Data analysis"],
  },
  {
    name: "Accountant",
    pattern: /\baccountant\b/i,
    skills: ["Accounting", "Bookkeeping", "Microsoft Excel", "Communication"],
  },
  {
    name: "Sales representative",
    pattern: /\b(?:sales\s+(?:representative|executive|associate)|account\s+executive)\b/i,
    skills: ["Sales", "Communication", "Customer service", "Microsoft Excel"],
  },
  {
    name: "Nurse",
    pattern: /\b(?:registered\s+)?nurse\b/i,
    skills: ["Patient care", "Clinical assessment", "Electronic health records", "Communication"],
  },
];

const cleanLine = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const linesOf = (value) => String(value ?? "").split(/\r?\n/).map(cleanLine).filter(Boolean);
const clip = (value) => value.length > 240 ? `${value.slice(0, 237).trimEnd()}...` : value;

function skillMention(line, patterns) {
  return patterns.some((pattern) => pattern.test(line));
}

function resumeLinesFromDraft(draft) {
  if (!draft || typeof draft !== "object") return [];
  const lines = [];
  const add = (value, evidence = false) => {
    if (Array.isArray(value)) {
      value.forEach((item) => add(item, evidence));
      return;
    }
    const text = cleanLine(value);
    if (text) lines.push({ text, evidence: evidence && ACTION_VERB.test(text) });
  };

  add(draft.summary);
  add(draft.skills);
  add(draft.tools);
  (Array.isArray(draft.experience) ? draft.experience : []).forEach((item) => {
    add(item?.role);
    add(item?.highlights, true);
  });
  (Array.isArray(draft.projects) ? draft.projects : []).forEach((item) => {
    add(item?.name);
    add(item?.technologies);
    add(item?.highlights, true);
  });
  (Array.isArray(draft.certifications) ? draft.certifications : []).forEach((item) => add(item?.name));
  (Array.isArray(draft.achievements) ? draft.achievements : []).forEach((item) => {
    add(item?.title);
    add(item?.description);
  });
  return lines;
}

const RESUME_SECTION = /^(?:(?:(?:work|professional|relevant)\s+)?experience|employment(?:\s+history)?|work\s+history|(?:selected|personal|academic)\s+projects?|projects?(?:\s+experience)?|skills?|technical\s+skills|tools?|(?:professional\s+)?summary|profile|about\s+me|education|certifications?|achievements?|awards?)$/i;
const EVIDENCE_SECTION = /^(?:(?:(?:work|professional|relevant)\s+)?experience|employment(?:\s+history)?|work\s+history|(?:(?:selected|personal|academic)\s+)?projects?(?:\s+experience)?)$/i;
const ACTION_VERB = /\b(?:built|developed|designed|implemented|deployed|delivered|created|managed|led|analyzed|analysed|tested|automated|optimized|optimised|maintained|configured|used|applied|integrated|trained|conducted|provided|improved|collaborated|coordinated)\b/i;

function resumeLinesFromText(text) {
  let sectionIsEvidence = false;
  return linesOf(text).flatMap((line) => {
    const heading = line.replace(/[:\s]+$/, "");
    if (RESUME_SECTION.test(heading)) {
      sectionIsEvidence = EVIDENCE_SECTION.test(heading);
      return [];
    }
    return [{ text: line, evidence: ACTION_VERB.test(line) && (sectionIsEvidence || line.length >= 28) }];
  });
}

function requestedSkillsFromJob(jobDescription) {
  const lines = linesOf(jobDescription);
  const found = [];
  skillPatterns.forEach(({ skill, aliases }) => {
    const lineIndex = lines.findIndex((line) => aliases.some((pattern) => {
      const match = pattern.exec(line);
      if (!match) return false;
      const before = line.slice(0, match.index + match[1].length);
      const after = line.slice(match.index + match[0].length);
      if (/^\s+(?:is\s+)?not\s+required\b/i.test(after)) return false;
      if (/\bno\s+(?:(?:prior\s+)?experience\s+(?:with|in)\s+)?$/i.test(before)
        && /^\s+required\b/i.test(after)) return false;
      return true;
    }));
    if (lineIndex < 0) return;
    const line = lines[lineIndex];
    found.push({ skill, requirement: clip(line), order: lineIndex });
  });
  return found.sort((a, b) => a.order - b.order || a.skill.localeCompare(b.skill));
}

function requestedSkillsFromRole(input) {
  const title = cleanLine(input);
  const words = title.match(/\b[\p{L}\p{N}]+\b/gu) || [];
  // Long or instruction-like input is a job description, even if it names a
  // role. In that case only skills actually stated in the description count.
  if (title.length > 120 || words.length > 12 || linesOf(input).length > 1 || /[:;.!?]/u.test(title)
    || /\b(?:required?|requirements?|qualifications?|responsibilities|experience|proficient|must|should|knowledge|candidate|looking\s+for)\b/iu.test(title)) {
    return null;
  }

  const roles = ROLE_PROFILES.flatMap((profile) => {
    const match = profile.pattern.exec(title);
    return match ? [{ ...profile, position: match.index }] : [];
  }).sort((a, b) => a.position - b.position);
  if (!roles.length) return null;

  const requestedSkills = [];
  const seen = new Set();
  roles.forEach(({ skills }) => skills.forEach((skill) => {
    if (seen.has(skill)) return;
    seen.add(skill);
    requestedSkills.push({ skill, requirement: "" });
  }));
  requestedSkillsFromJob(title).forEach(({ skill }) => {
    if (seen.has(skill)) return;
    seen.add(skill);
    requestedSkills.push({ skill, requirement: "" });
  });
  return { roleNames: roles.map(({ name }) => name), requestedSkills };
}

const VAGUE_BULLET = /^(?:[-•*]\s*)?(?:responsible for|worked on|helped with|assisted with|involved in|participated in|various tasks|handled|did)\b/i;
const MEASURABLE_RESULT = /(?:\b\d+(?:[.,]\d+)?\s*%|\b\d+(?:[.,]\d+)?\s*(?:percent|users?|customers?|clients?|hours?|days?|minutes?|seconds?|requests?|records?|transactions?|projects?|teams?|people|students?|sales|revenue|downloads?)\b|[$₹€£]\s*\d|\b(?:reduced|increased|saved|grew|raised|cut|improved|accelerated|expanded)\b.{0,45}\b(?:by|from|to)\b)/i;
const PURPOSE_OR_RESULT = /\b(?:so that|which enabled|enabling|resulting in|leading to|for (?:users|customers|clients|students|the team)|to (?:reduce|improve|increase|support|help|enable|automate|simplify|speed up|track|measure|deliver))\b/i;

function sectionKind(heading) {
  const normalized = heading.replace(/^#+\s*/, "").replace(/[:\s]+$/, "").trim();
  if (!RESUME_SECTION.test(normalized)) return "";
  if (/\b(?:summary|profile)\b|^about\s+me$/i.test(normalized)) return "summary";
  if (/\b(?:experience|employment|work\s+history)\b/i.test(normalized)) return "experience";
  if (/\bprojects?\b/i.test(normalized)) return "projects";
  if (/\bskills?\b|^tools?$/i.test(normalized)) return "skills";
  return "other";
}

function textSections(text) {
  const sections = { summary: [], experience: [], projects: [], skills: [], other: [], unsectioned: [] };
  let section = "unsectioned";
  linesOf(text).forEach((line) => {
    const nextSection = sectionKind(line);
    if (nextSection) section = nextSection;
    else sections[section].push(line);
  });
  return sections;
}

function meaningfulHighlights(items) {
  return (Array.isArray(items) ? items : []).flatMap((item) =>
    Array.isArray(item?.highlights) ? item.highlights.map(cleanLine).filter(Boolean) : []);
}

function addFinding(findings, id, category, priority, title, evidence, suggestion, example) {
  findings.push({ id, category, priority, title, evidence: clip(evidence || ""), suggestion, ...(example ? { example } : {}) });
}

function critiqueResume({ draft, resumeText, needsEvidence, notShown, role }) {
  const findings = [];
  const structured = draft && typeof draft === "object";
  const parsed = textSections(resumeText);
  const summary = structured ? cleanLine(draft.summary) : parsed.summary.join(" ");
  const experience = structured
    ? (Array.isArray(draft.experience) ? draft.experience : []).filter((item) => item && (cleanLine(item.role) || meaningfulHighlights([item]).length))
    : parsed.experience;
  const projects = structured
    ? (Array.isArray(draft.projects) ? draft.projects : []).filter((item) => item && (cleanLine(item.name) || meaningfulHighlights([item]).length))
    : parsed.projects;
  const experienceBullets = structured ? meaningfulHighlights(experience) : parsed.experience.filter((line) => /^(?:[-•*]\s*)?\b(?:built|developed|designed|implemented|managed|led|created|improved|worked|responsible|helped|assisted|handled|delivered|analyzed|analysed|tested|automated|optimized|optimised|deployed|configured|integrated)\b/i.test(line));
  const projectBullets = structured ? meaningfulHighlights(projects) : parsed.projects.filter((line) => /^(?:[-•*]\s*)?\b(?:built|developed|designed|implemented|created|improved|worked|helped|delivered|analyzed|analysed|tested|automated|deployed|configured|integrated)\b/i.test(line));
  // Plain text extracted from a PDF may lose section headings. Treat action
  // statements as work evidence, but do not guess whether they are jobs or projects.
  const unsectionedWork = structured ? [] : parsed.unsectioned.filter((line) => ACTION_VERB.test(line) || VAGUE_BULLET.test(line));
  const hasResume = structured
    ? Boolean(summary || experience.length || projects.length || draft.skills?.length || draft.tools?.length)
    : Boolean(linesOf(resumeText).length);
  if (!hasResume) return findings;

  if (!summary) {
    addFinding(findings, "summary-missing", "summary", "medium", "Add a focused opening summary", "",
      "In two or three lines, state your target role, strongest relevant experience, and the kind of work you have done. Leave out claims you cannot support elsewhere in the resume.",
      "[Target role] with experience in [relevant work]. Built [specific project or outcome] using [relevant tools].");
  } else if (summary.split(/\s+/).length < 12 || /\b(?:hardworking|passionate|dedicated|self-motivated|team player|seeking an opportunity)\b/i.test(summary)) {
    addFinding(findings, "summary-generic", "summary", "medium", "Make the summary more specific", summary,
      "Replace general traits or a very short objective with your specialty, a relevant example, and the value of your work. Keep every claim tied to real experience.",
      "[Role or specialty] who [built or improved a specific thing] using [relevant skills] for [audience or purpose].");
  }

  if (!experience.length && !projects.length && !unsectionedWork.length) {
    addFinding(findings, "evidence-sections-missing", "completeness", "high", "Show work behind the skill list", "",
      "Add experience, coursework, volunteering, or projects with concrete examples of what you personally built or improved. A skill list alone does not show how you used those skills.");
  }
  if (experience.length && !experienceBullets.length) {
    addFinding(findings, "experience-no-detail", "experience", "high", "Describe what you did in each role", "",
      "Add concise bullets under each role covering your action, the tools or methods you used, and the result or purpose.",
      "[Action verb] [specific work] using [method or tool] to [result or purpose].");
  } else if (experienceBullets.length) {
    const vague = experienceBullets.find((line) => VAGUE_BULLET.test(line));
    if (vague) addFinding(findings, "experience-vague", "experience", "high", "Replace a vague responsibility with your contribution", vague,
      "Name the specific task you owned, how you did it, and what changed. Avoid phrases such as “worked on” or “responsible for” when an action is available.",
      "[Built/designed/analyzed] [specific deliverable] with [method or tool] to [purpose or verified result].");
    if (!experienceBullets.some((line) => MEASURABLE_RESULT.test(line) || PURPOSE_OR_RESULT.test(line))) {
      addFinding(findings, "experience-no-outcome", "experience", "medium", "Connect experience bullets to outcomes", experienceBullets[0],
        "Explain who benefited or what the work achieved. Add a real number if you have one; a concrete purpose or qualitative result is useful when you do not.",
        "[Action] [deliverable] for [audience], enabling [verified outcome].");
    }
  }

  if (projects.length && !projectBullets.length) {
    addFinding(findings, "projects-no-detail", "projects", "high", "Explain what each project actually does", structured ? cleanLine(projects[0]?.name) : parsed.projects[0],
      "Add one or two bullets for each important project: the problem, your contribution, how you built it, and what the result was.",
      "Built [feature or system] using [technology] to solve [specific problem]; [verified result or demonstration].");
  } else if (projectBullets.length && !projectBullets.some((line) => MEASURABLE_RESULT.test(line) || PURPOSE_OR_RESULT.test(line))) {
    addFinding(findings, "projects-no-purpose", "projects", "medium", "Show the project’s purpose or result", projectBullets[0],
      "Describe the user problem, your own contribution, and what the finished project enables. Include measured results only if you can verify them.",
      "Built [specific feature] for [user or problem], enabling [real use or result].");
  }
  if (structured && projects.length && projects.some((item) => !cleanLine(item.technologies) && !meaningfulHighlights([item]).some((line) => skillPatterns.some(({ aliases }) => skillMention(line, aliases))))) {
    addFinding(findings, "projects-no-method", "projects", "low", "Name the methods or tools used in a project", cleanLine(projects.find((item) => !cleanLine(item.technologies))?.name),
      "Where it helps explain your work, name the actual tools, methods, or design choices in the project description. Avoid adding tools you did not use.");
  }

  if (needsEvidence.length) {
    const names = needsEvidence.slice(0, 4).map(({ skill }) => skill).join(", ");
    addFinding(findings, "role-skills-need-evidence", "role", "high", "Prove skills already listed", needsEvidence[0].evidence,
      `The resume mentions ${names}, but does not show a concrete use of ${needsEvidence.length === 1 ? "it" : "them"}. Add a truthful experience or project bullet showing what you did with ${needsEvidence.length === 1 ? "the skill" : "these skills"}.`);
  }
  if (notShown.length) {
    const names = notShown.slice(0, 4).map(({ skill }) => skill).join(", ");
    addFinding(findings, "role-skills-not-shown", "role", role ? "medium" : "high", role ? "Consider common skills for this role" : "Address skills named in the job posting", "",
      `${names}${notShown.length > 4 ? ` and ${notShown.length - 4} more` : ""} ${notShown.length === 1 ? "is" : "are"} not evident in the resume. If you have used ${notShown.length === 1 ? "it" : "them"}, show where and how. Otherwise, treat ${notShown.length === 1 ? "it" : "them"} as a development area; do not claim experience you lack.`);
  }
  if (structured && !cleanLine(draft.personal?.headline)) {
    addFinding(findings, "headline-missing", "completeness", "low", "Add a clear professional headline", "",
      "Use a role or specialty that matches your actual experience and the positions you are targeting.");
  }
  if (structured && !cleanLine(draft.personal?.email)) {
    addFinding(findings, "email-missing", "completeness", "medium", "Add a contact email", "",
      "Include an email address you check regularly so employers can reach you. Review the contact details before sharing the resume.");
  }

  return findings;
}

/**
 * Compare the selected resume with either explicit job requirements or a
 * short recognized role title. `notShown` only means the resume omits them.
 */
export function analyzeSkillGap({ resumeText = "", draft = null, jobDescription = "" } = {}) {
  const role = requestedSkillsFromRole(jobDescription);
  const requested = role?.requestedSkills || requestedSkillsFromJob(jobDescription);
  const resumeLines = [...resumeLinesFromDraft(draft), ...resumeLinesFromText(resumeText)];
  const matched = [];
  const needsEvidence = [];
  const notShown = [];
  const requestedSkills = [];

  requested.forEach(({ skill, requirement }) => {
    const patterns = skillPatterns.find((item) => item.skill === skill).aliases;
    const mentions = resumeLines.filter(({ text }) => skillMention(text, patterns));
    const supported = mentions.find(({ evidence }) => evidence);
    const item = { skill, requirement };
    if (supported) {
      item.evidence = clip(supported.text);
      item.action = "Keep this concrete example in your resume.";
      matched.push(item);
    } else if (mentions.length) {
      item.evidence = clip(mentions[0].text);
      item.action = "Add a truthful experience or project example showing how you used this skill.";
      needsEvidence.push(item);
    } else {
      item.action = "If you have used this skill, add a truthful example. Otherwise, consider developing it.";
      notShown.push(item);
    }
    requestedSkills.push(item);
  });

  const findings = critiqueResume({ draft, resumeText, needsEvidence, notShown, role });
  return role
    ? { matched, needsEvidence, notShown, requestedSkills, findings, roleNames: role.roleNames, inputType: "role" }
    : { matched, needsEvidence, notShown, requestedSkills, findings };
}
