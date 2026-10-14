import { analyzeSkillGap } from "./skillGapAnalysis";

const cleanLine = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const REQUIRED_LANGUAGE = /\b(?:required|must(?:\s+(?:have|be|possess))?|minimum|at\s+least|mandatory|essential|need(?:s)?\s+to)\b/i;
const PREFERENCE_LANGUAGE = /\b(?:preferred|preferably|nice\s+to\s+have|optional|desirable)\b/i;
const NOT_REQUIRED_LANGUAGE = /\b(?:not\s+(?:required|mandatory|essential)|no\s+.{0,40}\brequired|must\s+not)\b/i;
const REQUIRED_SECTION_HEADING = /^(?:(?:minimum\s+)?requirements?|qualifications?|must[- ]?haves?|what\s+(?:you(?:'|’)ll|we)\s+need|essential\s+(?:skills|qualifications)|candidate\s+requirements?)$/i;
const NON_REQUIREMENT_SECTION_HEADING = /^(?:about(?:\s+(?:the\s+)?(?:role|team|company))?|responsibilities|what\s+you(?:'|’)ll\s+do|benefits?|perks?|compensation|salary|application\s+process|equal\s+opportunity|preferred\s+(?:skills|qualifications)|nice\s+to\s+have)$/i;

function safeList(value) {
  return Array.isArray(value) ? value : [];
}

function contentOfDraft(draft = {}) {
  const safeDraft = draft && typeof draft === "object" ? draft : {};
  const personal = safeDraft.personal && typeof safeDraft.personal === "object" ? safeDraft.personal : {};
  const groups = [
    personal.headline, personal.location, safeDraft.summary, safeDraft.skills, safeDraft.tools,
    safeList(safeDraft.experience).flatMap((item) => [item?.role, item?.organization, item?.startDate, item?.endDate, item?.highlights]),
    safeList(safeDraft.projects).flatMap((item) => [item?.name, item?.technologies, item?.highlights]),
    safeList(safeDraft.education).flatMap((item) => [item?.degree, item?.field, item?.institution, item?.startDate, item?.endDate]),
    safeList(safeDraft.certifications).flatMap((item) => [item?.name, item?.issuer]),
    safeList(safeDraft.achievements).flatMap((item) => [item?.title, item?.description]),
  ];
  return groups.flat(3).filter(Boolean).map(cleanLine).filter(Boolean).join("\n");
}

function requirementSentences(jobDescription) {
  let inRequiredSection = false;
  return String(jobDescription ?? "")
    .replace(/[•●▪]/g, "\n")
    .split(/\r?\n/u)
    .flatMap((rawLine) => {
      const line = cleanLine(rawLine.replace(/^[-*]\s*/u, ""));
      if (!line) return [];
      const heading = line.replace(/[:\s]+$/u, "");
      const inlineRequirement = /^(?:(?:minimum\s+)?requirements?|qualifications?)\s*:\s*(.+)$/i.exec(line);
      if (inlineRequirement) {
        inRequiredSection = true;
        return [{ line: inlineRequirement[1], requiredBySection: true }];
      }
      if (REQUIRED_SECTION_HEADING.test(heading)) {
        inRequiredSection = true;
        return [];
      }
      if (NON_REQUIREMENT_SECTION_HEADING.test(heading)) {
        inRequiredSection = false;
        return [];
      }
      return [{ line, requiredBySection: inRequiredSection }];
    })
    .flatMap(({ line, requiredBySection }) => line.split(/[.!?;]+/u).map(cleanLine)
      .map((sentence) => ({ line: sentence, requiredBySection })))
    .filter(({ line, requiredBySection }) => line.length >= 3 && !PREFERENCE_LANGUAGE.test(line) && !NOT_REQUIRED_LANGUAGE.test(line)
      && (requiredBySection || REQUIRED_LANGUAGE.test(line)))
    .map(({ line }) => line);
}

function requirementTypes(line) {
  const types = [];
  if (/\b(?:degree|bachelor|master|doctorate|ph\.?d|diploma|graduate|qualification)\b/i.test(line)) types.push("education");
  if (/\b\d+\s*(?:\+|or\s+more)?\s*(?:years?|yrs?)\b.{0,40}\bexperience\b|\bexperience\b.{0,40}\b\d+\s*(?:\+|or\s+more)?\s*(?:years?|yrs?)\b/i.test(line)) types.push("experience");
  if (/\b(?:certification|certified|certificate|license|licence|credential)\b/i.test(line)) types.push("credential");
  if (/\b(?:clearance|work\s+authori[sz]ation|authori[sz]ed\s+to\s+work|eligible\s+to\s+work|work\s+eligibility|work\s+permit|visa\s+sponsor|citizenship|relocat|on[- ]?site|in[- ]office|based\s+in|located\s+in|must\s+reside|location)\b/i.test(line)) types.push("manual");
  return types;
}

function findEvidenceLine(resumeText, pattern) {
  const line = String(resumeText ?? "").split(/[\n.!?;]+/u).map(cleanLine).find((item) => pattern.test(item)
    && !/\b(?:no|not|without|never|lack(?:ing|s)?)\b/i.test(item));
  return line ? (line.length > 220 ? `${line.slice(0, 217).trimEnd()}...` : line) : "";
}

const GENERIC_CREDENTIAL_TERMS = new Set([
  "certified", "certification", "certificate", "license", "licence", "credential", "clearance",
  "required", "must", "have", "hold", "possess", "minimum", "mandatory", "essential", "need", "needs",
  "professional", "associate", "expert", "specialist", "the", "and", "or", "for", "with", "in", "a", "an",
]);
const PROVIDER_ONLY_CREDENTIAL_TERMS = new Set(["aws", "azure", "google", "microsoft", "oracle", "salesforce", "sap"]);
const PROVIDER_SKILL_NAMES = new Set(["aws", "azure", "google cloud", "salesforce", "sap"]);
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function credentialTokens(requirement) {
  const text = cleanLine(requirement);
  const beforeCredential = text.match(/([A-Za-z0-9+#.()/ -]{2,80})\s+(?:certification|certificate|credential|license|licence)\b/i)?.[1] || "";
  const afterCredential = text.match(/(?:certification|certificate|credential|license|licence)\s+(?:in|for|as)\s+([^.;]{2,80})/i)?.[1] || "";
  const candidate = beforeCredential || afterCredential || text;
  return candidate.match(/[A-Za-z][A-Za-z0-9+#.-]{1,}/g) || [];
}

function credentialStatus(requirement, resumeText) {
  const rawTokens = credentialTokens(requirement);
  const terms = rawTokens.filter((term) => !GENERIC_CREDENTIAL_TERMS.has(term.toLowerCase()));
  const specificAcronyms = rawTokens.filter((term) => /^[A-Z]{2,8}$/.test(term)
    && !PROVIDER_ONLY_CREDENTIAL_TERMS.has(term.toLowerCase()));
  const namedTerms = terms.filter((term) => !PROVIDER_ONLY_CREDENTIAL_TERMS.has(term.toLowerCase()));
  const hasSpecificName = namedTerms.length >= 2 || specificAcronyms.length > 0;

  if (!hasSpecificName) {
    return { status: "manual", evidence: "", note: "The posting does not name a specific credential clearly enough to compare. Confirm this requirement directly." };
  }

  const termMatches = (line, term) => new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}(?=$|[^a-z0-9])`, "i").test(line);
  const evidence = findEvidenceLine(resumeText, {
    test: (line) => specificAcronyms.some((term) => termMatches(line, term))
      || namedTerms.every((term) => termMatches(line, term)),
  });
  if (evidence) {
    return { status: "evidence", evidence, note: "A matching credential name appears in the resume." };
  }
  return { status: "not-shown", evidence: "", note: "This credential is not clearly named in the resume. Add it if you hold it; otherwise verify the requirement." };
}

function educationStatus(requirement, resumeText) {
  const resume = resumeText.toLowerCase();
  const levels = [
    { pattern: /\b(?:ph\.?d|doctorate|doctoral)\b/i, evidence: /\b(?:ph\.?d|doctorate|doctoral)\b/i },
    { pattern: /\b(?:master'?s?|mba|msc|m\.s\.)\b/i, evidence: /\b(?:master'?s?|mba|msc|m\.s\.)\b/i },
    { pattern: /\b(?:bachelor'?s?|undergraduate|bsc|b\.s\.?|b\.e\.?|btech|b\.tech)\b/i, evidence: /\b(?:bachelor'?s?|undergraduate|bsc|b\.s\.?|b\.e\.?|btech|b\.tech)\b/i },
    { pattern: /\bdiploma\b/i, evidence: /\bdiploma\b/i },
  ];
  const level = levels.find((item) => item.pattern.test(requirement));
  const educationText = resumeText.toLowerCase();
  if (!resume || !/\b(?:degree|bachelor|master|doctorate|ph\.?d|diploma|graduate|qualification)\b/i.test(educationText)) {
    return { status: "not-shown", evidence: "", note: "Add the relevant education details to your resume, or confirm them manually." };
  }
  if (level && level.evidence.test(educationText)) {
    const fieldMatch = /\bin\s+([a-z]+(?:\s+[a-z]+){0,2})(?=\s+(?:is|are|be|or|and|required|preferred|mandatory|minimum)\b|[,;.]|$)/i.exec(requirement);
    const requestedField = fieldMatch?.[1]?.trim();
    const evidence = findEvidenceLine(resumeText, level.evidence);
    if (requestedField && !new RegExp(requestedField.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(educationText)) {
      return { status: "review", evidence, note: "The qualification level appears, but the requested field of study needs a manual check." };
    }
    if (evidence) return { status: "evidence", evidence, note: "A matching qualification appears in the resume." };
    return { status: "not-shown", evidence: "", note: "Add the relevant education details to your resume, or confirm them manually." };
  }
  if (!level && /\bdegree\b/i.test(educationText)) {
    const fieldMatch = /\bin\s+([a-z]+(?:\s+[a-z]+){0,2})(?=\s+(?:is|are|be|or|and|required|preferred|mandatory|minimum)\b|[,;.]|$)/i.exec(requirement);
    const requestedField = fieldMatch?.[1]?.trim();
    const evidence = findEvidenceLine(resumeText, /\bdegree\b/i);
    if (requestedField && !new RegExp(requestedField.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(educationText)) {
      return { status: "review", evidence, note: "Education is listed, but the required field of study needs a manual check." };
    }
    if (evidence) return { status: "evidence", evidence, note: "Education is listed in the resume." };
    return { status: "not-shown", evidence: "", note: "Add the relevant education details to your resume, or confirm them manually." };
  }
  return { status: "review", evidence: findEvidenceLine(resumeText, /\b(?:degree|bachelor|master|doctorate|ph\.?d|diploma|graduate|qualification)\b/i), note: "Education is listed, but the qualification level needs a manual check." };
}

function evaluateRequirement(type, requirement, resumeText) {
  if (type === "education") return educationStatus(requirement, resumeText);
  if (type === "experience") {
    const requiredYears = Number(/\b(\d+)\s*(?:\+|or\s+more)?\s*(?:years?|yrs?)\b/i.exec(requirement)?.[1]
      || /\bexperience\b.{0,40}?\b(\d+)\s*(?:\+|or\s+more)?\s*(?:years?|yrs?)\b/i.exec(requirement)?.[1]);
    const yearsPattern = /\b\d+\s*(?:\+|or\s+more)?\s*(?:years?|yrs?)\s+(?:of\s+)?experience\b/i;
    const yearsEvidence = findEvidenceLine(resumeText, yearsPattern);
    const statedYears = Number(yearsPattern.exec(yearsEvidence)?.[0]?.match(/\d+/)?.[0]);
    if (statedYears && requiredYears && statedYears >= requiredYears) {
      return { status: "evidence", evidence: yearsEvidence, note: "The resume states at least the requested years of experience." };
    }
    if (statedYears && requiredYears && statedYears < requiredYears) {
      return { status: "review", evidence: yearsEvidence, note: `The resume states ${statedYears} years; check whether other experience or dates should be included.` };
    }
    return { status: "review", evidence: "", note: "Experience dates can be hard to interpret from resume text. Verify this requirement manually." };
  }
  if (type === "credential") {
    return credentialStatus(requirement, resumeText);
  }
  return { status: "manual", evidence: "", note: "The resume cannot reliably confirm this. Check the requirement directly." };
}

function scoreWeightForRequirement(status) {
  if (status === "evidence") return 1;
  if (status === "review" || status === "manual") return 0.5;
  return 0;
}

function explicitRequirementCriteria(jobDescription, resumeText) {
  const seen = new Set();
  return requirementSentences(jobDescription).flatMap((requirement, index) => requirementTypes(requirement).flatMap((type) => {
    const key = `${type}:${requirement.toLowerCase()}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const evaluation = evaluateRequirement(type, requirement, resumeText);
    return [{
      id: `eligibility-${index}-${type}`,
      type,
      source: "job-description",
      title: type === "education" ? "Education or qualification"
        : type === "experience" ? "Years of experience"
          : type === "credential" ? "Certification or license"
            : "Location or work eligibility",
      requirement: requirement.length > 280 ? `${requirement.slice(0, 277).trimEnd()}...` : requirement,
      scoreWeight: scoreWeightForRequirement(evaluation.status),
      ...evaluation,
    }];
  }));
}

function skillStatusIndex(roleAnalysis) {
  const statusBySkill = new Map();
  const collect = (items, status) => safeList(items).forEach((item) => {
    const skill = cleanLine(item?.skill);
    if (!skill) return;
    statusBySkill.set(skill.toLowerCase(), { ...item, status });
  });
  collect(roleAnalysis?.notShown, "not-shown");
  collect(roleAnalysis?.needsEvidence, "review");
  collect(roleAnalysis?.matched, "evidence");
  return statusBySkill;
}

function skillCriteria(roleAnalysis, roleTitle = "", excludedSkillKeys = new Set()) {
  const requestedSkills = safeList(roleAnalysis?.requestedSkills);
  if (!requestedSkills.length) return [];
  const source = roleAnalysis?.inputType === "role" ? "role-profile" : "job-description";
  const targetRole = cleanLine(roleTitle) || cleanLine(roleAnalysis?.targetRole) || "target role";
  const statuses = skillStatusIndex(roleAnalysis);
  const seen = new Set();

  return requestedSkills.flatMap((requested, index) => {
    const skill = cleanLine(requested?.skill);
    const key = skill.toLowerCase();
    if (!skill || seen.has(key) || excludedSkillKeys.has(key)) return [];
    seen.add(key);
    const sourceRequirement = cleanLine(requested?.requirement);
    const providerOnlyCredential = source === "job-description"
      && PROVIDER_SKILL_NAMES.has(key)
      && /\b(?:certification|certificate|credential|license|licence)\b/i.test(sourceRequirement)
      && !/\b(?:experience|proficien(?:t|cy)|skills?|knowledge|expertise|using|with)\b/i.test(sourceRequirement);
    if (providerOnlyCredential) return [];
    const matched = statuses.get(key);
    const status = matched?.status || "not-shown";
    const evidence = cleanLine(matched?.evidence);
    return [{
      id: `eligibility-skill-${index}-${key.replace(/[^a-z0-9]+/g, "-")}`,
      type: "skill",
      source,
      title: skill,
      requirement: source === "role-profile"
        ? `Common skill for ${targetRole}`
        : sourceRequirement || "Named in the job description",
      status,
      evidence,
      scoreWeight: status === "evidence" ? 1 : status === "review" ? 0.45 : 0,
      note: status === "evidence"
        ? "A project or experience example in the resume supports this skill."
        : status === "review"
          ? "The skill is mentioned, but a clear project or experience example would make the evidence stronger."
          : "The resume does not clearly mention this skill. Add it only if it reflects your real experience.",
    }];
  });
}

function assessmentBasis({ inputType, explicitCriteria, jobSkills, profileSkills }) {
  if (inputType === "role" && profileSkills.length) return "role-profile";
  if (profileSkills.length && (explicitCriteria.length || jobSkills.length)) return "hybrid";
  if (explicitCriteria.length || jobSkills.length) return "job-description";
  if (profileSkills.length) return "role-profile";
  return "unassessed";
}

/**
 * Compare resume evidence against a short recognized role title or a full job
 * description. A role title produces a role-profile match; a full posting
 * adds its stated qualifications, experience, credentials, and named skills.
 */
export function analyzeResumeEligibility({ draft = null, resumeText = "", jobDescription = "", roleAnalysis = null } = {}) {
  const resume = [contentOfDraft(draft), String(resumeText ?? "")].filter(Boolean).join("\n");
  const resolvedRoleAnalysis = roleAnalysis && typeof roleAnalysis === "object"
    ? roleAnalysis
    : analyzeSkillGap({ draft, resumeText, jobDescription });
  const explicitCriteria = explicitRequirementCriteria(jobDescription, resume);
  const roleNames = safeList(resolvedRoleAnalysis?.roleNames);
  const targetRole = resolvedRoleAnalysis?.inputType === "role"
    ? (roleNames.length > 1 ? roleNames.join(" + ") : cleanLine(resolvedRoleAnalysis?.targetRole) || cleanLine(jobDescription))
    : cleanLine(resolvedRoleAnalysis?.targetRole) || cleanLine(jobDescription) || "Target role";
  const jobSkillCriteria = resolvedRoleAnalysis?.inputType === "role"
    ? []
    : skillCriteria(resolvedRoleAnalysis, targetRole);
  const titleRoleAnalysis = resolvedRoleAnalysis?.inputType === "role"
    ? resolvedRoleAnalysis
    : analyzeSkillGap({ draft, resumeText, jobDescription: targetRole });
  const roleProfileCriteria = titleRoleAnalysis?.inputType === "role"
    ? skillCriteria(titleRoleAnalysis, targetRole, new Set(jobSkillCriteria.map(({ title }) => title.toLowerCase())))
    : [];
  const profileCriteria = roleProfileCriteria;
  const criteria = [...explicitCriteria, ...jobSkillCriteria, ...profileCriteria];
  const scoreable = criteria.filter((criterion) => Number.isFinite(criterion.scoreWeight));
  const evidenceCount = scoreable.filter((criterion) => criterion.status === "evidence").length;
  const mentionedCount = scoreable.filter((criterion) => criterion.status === "review").length;
  const roleSkillCount = profileCriteria.length;
  const score = scoreable.length
    ? Math.round((scoreable.reduce((total, criterion) => total + criterion.scoreWeight, 0) / scoreable.length) * 100)
    : null;
  const basis = assessmentBasis({
    inputType: resolvedRoleAnalysis?.inputType,
    explicitCriteria,
    jobSkills: jobSkillCriteria,
    profileSkills: profileCriteria,
  });

  return {
    criteria,
    score,
    basis,
    targetRole,
    scoreLabel: basis === "role-profile" ? "role match" : basis === "hybrid" ? "role + job" : basis === "unassessed" ? "" : "job match",
    metCount: evidenceCount,
    evidenceCount,
    mentionedCount,
    roleSkillCount,
    checkableCount: scoreable.length,
    reviewCount: criteria.filter(({ status }) => status === "manual" || status === "review").length,
    isAssessed: criteria.length > 0,
  };
}
