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

const RESUME_SECTION = /^(?:(?:work\s+)?experience|employment(?:\s+history)?|work\s+history|projects?(?:\s+experience)?|skills?|technical\s+skills|tools?|summary|profile|education|certifications?)$/i;
const EVIDENCE_SECTION = /^(?:(?:work\s+)?experience|employment(?:\s+history)?|work\s+history|projects?(?:\s+experience)?)$/i;
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

  return role
    ? { matched, needsEvidence, notShown, requestedSkills, roleNames: role.roleNames, inputType: "role" }
    : { matched, needsEvidence, notShown, requestedSkills };
}
