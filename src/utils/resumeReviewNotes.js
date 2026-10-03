export function getResumeReviewPriority(findings = []) {
  if (findings.some((item) => String(item?.priority).toLowerCase() === "high")) return "High";
  if (findings.some((item) => String(item?.priority).toLowerCase() === "medium")) return "Medium";
  return "Low";
}

export function formatResumeReviewNote(results, findings = []) {
  const targetRole = results?.targetRole || results?.roleNames?.[0] || "Target role";
  const sections = [`Target Role: ${targetRole}`];

  if (findings.length > 0) {
    const findingsText = findings.map((finding, index) => {
      const priorityTag = String(finding.priority || "medium").toUpperCase();
      const lines = [`${index + 1}. [${priorityTag}] ${finding.title}`];
      if (finding.suggestion) lines.push(`   Suggestion: ${finding.suggestion}`);
      if (finding.evidence) lines.push(`   Found: ${finding.evidence}`);
      if (finding.example) lines.push(`   Example: ${finding.example}`);
      return lines.join("\n");
    }).join("\n\n");
    sections.push(`Areas to improve:\n${findingsText}`);
  } else {
    sections.push("Areas to improve:\nNo clear issues were found in the text provided.");
  }

  const notShown = results?.notShown || [];
  if (notShown.length > 0) {
    const list = notShown.map((item) => `• ${item.skill}${item.action ? ` - ${item.action}` : ""}`).join("\n");
    sections.push(`Skills to add / develop:\n${list}`);
  }

  const needsEvidence = results?.needsEvidence || [];
  if (needsEvidence.length > 0) {
    const list = needsEvidence.map((item) => `• ${item.skill}${item.action ? ` - ${item.action}` : ""}`).join("\n");
    sections.push(`Skills needing evidence:\n${list}`);
  }

  const matched = results?.matched || [];
  if (matched.length > 0) {
    const list = matched.map((item) => `• ${item.skill}`).join("\n");
    sections.push(`Matched skills:\n${list}`);
  }

  sections.push("Saved from Resume Analyzer.");
  return sections.join("\n\n");
}
