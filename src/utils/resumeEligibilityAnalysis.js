const cleanLine = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const REQUIRED_LANGUAGE = /\b(?:required|must(?:\s+(?:have|be|possess))?|minimum|at\s+least|mandatory|essential|need(?:s)?\s+to)\b/i;
const PREFERENCE_LANGUAGE = /\b(?:preferred|preferably|nice\s+to\s+have|optional|desirable)\b/i;
const NOT_REQUIRED_LANGUAGE = /\b(?:not\s+(?:required|mandatory|essential)|no\s+.{0,40}\brequired|must\s+not)\b/i;

function contentOfDraft(draft = {}) {
  const safeDraft = draft && typeof draft === "object" ? draft : {};
  const personal = safeDraft.personal && typeof safeDraft.personal === "object" ? safeDraft.personal : {};
  const groups = [
    personal.headline, personal.location, safeDraft.summary, safeDraft.skills, safeDraft.tools,
    safeDraft.experience?.flatMap((item) => [item?.role, item?.organization, item?.startDate, item?.endDate, item?.highlights]),
    safeDraft.projects?.flatMap((item) => [item?.name, item?.technologies, item?.highlights]),
    safeDraft.education?.flatMap((item) => [item?.degree, item?.field, item?.institution, item?.startDate, item?.endDate]),
    safeDraft.certifications?.flatMap((item) => [item?.name, item?.issuer]),
    safeDraft.achievements?.flatMap((item) => [item?.title, item?.description]),
  ];
  return groups.flat(3).filter(Boolean).map(cleanLine).filter(Boolean).join("\n");
}

function requirementSentences(jobDescription) {
  return String(jobDescription ?? "")
    .replace(/[•●▪]/g, "\n")
    .split(/[\n.!?;]+/u)
    .map(cleanLine)
    .filter((line) => line.length >= 8 && REQUIRED_LANGUAGE.test(line)
      && !PREFERENCE_LANGUAGE.test(line) && !NOT_REQUIRED_LANGUAGE.test(line));
}

function requirementTypes(line) {
  const types = [];
  if (/\b(?:degree|bachelor|master|doctorate|ph\.?d|diploma|graduate|qualification)\b/i.test(line)) types.push("education");
  if (/\b\d+\s*(?:\+|or\s+more)?\s*(?:years?|yrs?)\b.{0,40}\bexperience\b|\bexperience\b.{0,40}\b\d+\s*(?:\+|or\s+more)?\s*(?:years?|yrs?)\b/i.test(line)) types.push("experience");
  if (/\b(?:certification|certified|certificate|license|licence|credential)\b/i.test(line)) types.push("credential");
  if (/\b(?:clearance|work\s+authori[sz]ation|authori[sz]ed\s+to\s+work|eligible\s+to\s+work|work\s+eligibility|work\s+permit|visa\s+sponsor|citizenship|relocat|on[- ]?site|in[- ]office|based\s+in|located\s+in|must\s+reside|location)\b/i.test(line)) types.push("manual");
  return types;
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
    const fieldMatch = /\bin\s+([a-z]+(?:\s+[a-z]+){0,2})(?=\s+(?:or|and|required|preferred|mandatory|minimum)\b|[,;.]|$)/i.exec(requirement);
    const requestedField = fieldMatch?.[1]?.trim();
    const evidence = findEvidenceLine(resumeText, level.evidence);
    if (requestedField && !new RegExp(requestedField.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(educationText)) {
      return { status: "review", evidence, note: "The qualification level appears, but the requested field of study needs a manual check." };
    }
    if (evidence) return { status: "evidence", evidence, note: "A matching qualification appears in the resume." };
    return { status: "not-shown", evidence: "", note: "Add the relevant education details to your resume, or confirm them manually." };
  }
  if (!level && /\bdegree\b/i.test(educationText)) {
    const fieldMatch = /\bin\s+([a-z]+(?:\s+[a-z]+){0,2})(?=\s+(?:or|and|required|preferred|mandatory|minimum)\b|[,;.]|$)/i.exec(requirement);
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

function findEvidenceLine(resumeText, pattern) {
  const line = String(resumeText ?? "").split(/[\n.!?;]+/u).map(cleanLine).find((item) => pattern.test(item)
    && !/\b(?:no|not|without|never|lack(?:ing|s)?)\b/i.test(item));
  return line ? (line.length > 220 ? `${line.slice(0, 217).trimEnd()}...` : line) : "";
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
    const credentialTerms = requirement
      .replace(/\b(?:required|must|have|be|possess|minimum|at least|mandatory|essential|certification|certificate|license|licence|credential|clearance)\b/gi, " ")
      .match(/[A-Za-z][A-Za-z0-9+#.-]{1,}/g) || [];
    const distinctive = credentialTerms.filter((term) => term.length > 2);
    if (!distinctive.length) return { status: "manual", evidence: "", note: "The posting doesn’t name a specific credential to compare. Confirm the requirement directly." };
    const matched = distinctive.find((term) => new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z0-9])`, "i").test(resumeText));
    if (matched) {
      const evidencePattern = new RegExp(`(^|[^a-z0-9])${matched.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z0-9])`, "i");
      const evidence = findEvidenceLine(resumeText, evidencePattern);
      if (evidence) return { status: "evidence", evidence, note: "A matching credential name appears in the resume." };
    }
    return { status: "not-shown", evidence: "", note: "This credential is not clearly named in the resume. Add it if you hold it; otherwise verify the requirement." };
  }
  return { status: "manual", evidence: "", note: "The resume cannot reliably confirm this. Check the requirement directly." };
}

/**
 * Summarize explicit must-have job requirements without treating absent resume
 * evidence as proof that someone is ineligible.
 */
export function analyzeResumeEligibility({ draft = null, resumeText = "", jobDescription = "" } = {}) {
  const resume = [contentOfDraft(draft), String(resumeText ?? "")].filter(Boolean).join("\n");
  const seen = new Set();
  const criteria = requirementSentences(jobDescription).flatMap((requirement, index) => requirementTypes(requirement).flatMap((type) => {
    const key = `${type}:${requirement.toLowerCase()}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const evaluation = evaluateRequirement(type, requirement, resume);
    return [{
      id: `eligibility-${index}-${type}`,
      type,
      title: type === "education" ? "Education or qualification"
        : type === "experience" ? "Years of experience"
          : type === "credential" ? "Certification or license"
            : "Location or work eligibility",
      requirement: requirement.length > 280 ? `${requirement.slice(0, 277).trimEnd()}...` : requirement,
      ...evaluation,
    }];
  })).slice(0, 8);
  const checkable = criteria.filter(({ status }) => status === "evidence" || status === "not-shown");
  const metCount = checkable.filter(({ status }) => status === "evidence").length;
  const reviewCount = criteria.filter(({ status }) => status === "manual" || status === "review").length;
  return {
    criteria,
    score: checkable.length ? Math.round((metCount / checkable.length) * 100) : null,
    metCount,
    checkableCount: checkable.length,
    reviewCount,
    isAssessed: criteria.length > 0,
  };
}
