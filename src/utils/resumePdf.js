import { jsPDF } from "jspdf";
import { normalizeResumeDraft, normalizeResumeLayout } from "./resumeBuilder.js";

const PAGE = Object.freeze({ width: 210, height: 297 });
const INK = "#162033";
const MUTED = "#64748b";
const LIGHT = "#d8e0ea";
const SOFT = "#f3f6f9";

const cleanFilePart = (value) =>
  String(value || "resume")
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "resume";

export function getResumePdfFilename(draft) {
  const name = normalizeResumeDraft(draft).personal.fullName;
  return `${cleanFilePart(name)}-resume.pdf`;
}

function colorToRgb(hex) {
  const safe = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#0f9f8f";
  return [
    Number.parseInt(safe.slice(1, 3), 16),
    Number.parseInt(safe.slice(3, 5), 16),
    Number.parseInt(safe.slice(5, 7), 16),
  ];
}

function safeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function displayUrl(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");
}

function textExists(value) {
  return String(value || "").trim().length > 0;
}

function hasEntryContent(item) {
  return Object.entries(item || {}).some(
    ([key, value]) =>
      key !== "id" &&
      key !== "current" &&
      (Array.isArray(value) ? value.some(textExists) : textExists(value))
  );
}

export function createResumePdf(draftValue, layoutValue = {}) {
  const draft = normalizeResumeDraft(draftValue);
  const layout = normalizeResumeLayout(layoutValue);
  const accent = colorToRgb(layout.accent);
  const isClassic = layout.template === "classic";
  const isCompact = layout.template === "compact";
  const typographyScale = layout.typography === "large" ? 1.08 : layout.typography === "compact" ? 0.92 : 1;
  const densityScale = layout.density === "airy" ? 1.16 : layout.density === "compact" ? 0.86 : 1;
  const marginX = isCompact ? 15 : 18;
  const marginTop = isCompact ? 14 : 17;
  const contentWidth = PAGE.width - marginX * 2;
  const bottomMargin = 16;
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  let y = marginTop;
  let pageNumber = 1;

  pdf.setProperties({
    title: `${draft.personal.fullName || "Professional"} Resume`,
    subject: draft.personal.headline || "Professional resume",
    author: draft.personal.fullName || "PrepMatrix user",
    creator: "PrepMatrix Resume Builder",
    keywords: "resume, curriculum vitae, professional profile",
  });

  const fontSize = (value) => Math.max(7.3, value * typographyScale);
  const lineHeight = (value) => value * 0.3528 * 1.25;
  const setColor = (color) => {
    const rgb = Array.isArray(color) ? color : colorToRgb(color);
    pdf.setTextColor(...rgb);
  };
  const setDrawColor = (color) => {
    const rgb = Array.isArray(color) ? color : colorToRgb(color);
    pdf.setDrawColor(...rgb);
  };

  const paintPage = () => {
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, PAGE.width, PAGE.height, "F");
    if (layout.template === "modern") {
      pdf.setFillColor(...accent);
      pdf.rect(0, 0, 5.5, PAGE.height, "F");
    }
  };

  const addFooter = () => {
    setDrawColor(LIGHT);
    pdf.setLineWidth(0.25);
    pdf.line(marginX, PAGE.height - 10.5, PAGE.width - marginX, PAGE.height - 10.5);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    setColor(MUTED);
    pdf.text(draft.personal.fullName || "Resume", marginX, PAGE.height - 6.7);
    pdf.text(String(pageNumber), PAGE.width - marginX, PAGE.height - 6.7, { align: "right" });
  };

  const addPage = () => {
    addFooter();
    pdf.addPage();
    pageNumber += 1;
    paintPage();
    y = marginTop;
  };

  const ensure = (needed) => {
    if (y + needed > PAGE.height - bottomMargin) addPage();
  };

  const writeWrapped = (
    text,
    {
      x = marginX,
      width = contentWidth,
      size = 9.4,
      style = "normal",
      color = INK,
      leading = lineHeight(size),
      after = 0,
      link = "",
    } = {}
  ) => {
    const value = String(text || "").trim();
    if (!value) return;
    pdf.setFont("helvetica", style);
    pdf.setFontSize(fontSize(size));
    setColor(color);
    const lines = pdf.splitTextToSize(value, width);
    lines.forEach((line) => {
      ensure(leading);
      if (link) pdf.textWithLink(line, x, y, { url: link });
      else pdf.text(line, x, y);
      y += leading;
    });
    y += after;
  };

  const writeInlinePair = (left, right, options = {}) => {
    const {
      size = 10,
      rightSize = 8.5,
      style = "bold",
      rightStyle = "normal",
      color = INK,
      rightColor = MUTED,
      after = 1.2,
    } = options;
    const rightValue = String(right || "").trim();
    let rightWidth = 0;
    if (rightValue) {
      pdf.setFont("helvetica", rightStyle);
      pdf.setFontSize(fontSize(rightSize));
      rightWidth = Math.min(62, pdf.getTextWidth(rightValue));
    }
    pdf.setFont("helvetica", style);
    pdf.setFontSize(fontSize(size));
    const leftWidth = Math.max(54, contentWidth - (rightValue ? rightWidth + 8 : 0));
    const leftLines = pdf.splitTextToSize(String(left || ""), leftWidth);
    const leading = lineHeight(size);
    ensure(leftLines.length * leading + after);
    setColor(color);
    leftLines.forEach((line, index) => {
      pdf.text(line, marginX, y + index * leading);
    });
    if (rightValue) {
      pdf.setFont("helvetica", rightStyle);
      pdf.setFontSize(fontSize(rightSize));
      setColor(rightColor);
      pdf.text(rightValue, PAGE.width - marginX, y, { align: "right" });
    }
    y += leftLines.length * leading + after;
  };

  const drawBulletList = (items, options = {}) => {
    const filtered = (items || []).map((item) => String(item || "").trim()).filter(Boolean);
    filtered.forEach((item) => {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(fontSize(options.size || 8.8));
      const lines = pdf.splitTextToSize(item, contentWidth - 6);
      ensure(lines.length * lineHeight(options.size || 8.8) + 0.8);
      pdf.setFillColor(...accent);
      pdf.circle(marginX + 1, y - 1.05, 0.62, "F");
      setColor(INK);
      lines.forEach((line, index) => {
        pdf.text(line, marginX + 4, y + index * lineHeight(options.size || 8.8));
      });
      y += lines.length * lineHeight(options.size || 8.8) + 1.05 * densityScale;
    });
  };

  const sectionHeading = (title) => {
    ensure(18 * densityScale);
    y += 2.5 * densityScale;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(fontSize(isCompact ? 10.2 : 11.2));
    if (isClassic) {
      setColor(INK);
      pdf.text(title.toUpperCase(), marginX, y);
      y += 2.2;
      setDrawColor(INK);
      pdf.setLineWidth(0.35);
      pdf.line(marginX, y, PAGE.width - marginX, y);
    } else {
      setColor(accent);
      pdf.text(title.toUpperCase(), marginX, y);
      const headingWidth = pdf.getTextWidth(title.toUpperCase());
      setDrawColor(LIGHT);
      pdf.setLineWidth(0.32);
      pdf.line(marginX + headingWidth + 4, y - 0.8, PAGE.width - marginX, y - 0.8);
    }
    y += 4.4 * densityScale;
  };

  const dateRange = (item) => {
    const end = item.current ? "Present" : item.endDate;
    return [item.startDate, end].filter(Boolean).join(" - ");
  };

  const contactItems = [
    draft.personal.location && { label: draft.personal.location },
    draft.personal.email && {
      label: draft.personal.email,
      link: safeUrl(`mailto:${draft.personal.email}`),
    },
    draft.personal.phone && {
      label: draft.personal.phone,
      link: safeUrl(`tel:${draft.personal.phone.replace(/\s+/g, "")}`),
    },
    draft.personal.linkedin && {
      label: displayUrl(draft.personal.linkedin),
      link: safeUrl(draft.personal.linkedin),
    },
    draft.personal.github && {
      label: displayUrl(draft.personal.github),
      link: safeUrl(draft.personal.github),
    },
    draft.personal.portfolio && {
      label: displayUrl(draft.personal.portfolio),
      link: safeUrl(draft.personal.portfolio),
    },
  ].filter(Boolean);

  const renderHeader = () => {
    if (layout.template === "modern") {
      pdf.setFillColor(...accent);
      pdf.roundedRect(marginX, marginTop - 3, contentWidth, 31, 2.5, 2.5, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(fontSize(isCompact ? 20 : 23));
      pdf.setTextColor(255, 255, 255);
      pdf.text(draft.personal.fullName || "Your name", marginX + 6, marginTop + 7);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(fontSize(10));
      pdf.text(draft.personal.headline || "Professional headline", marginX + 6, marginTop + 14);
      const contactText = contactItems.map((item) => item.label).join("  |  ");
      const contactLines = pdf.splitTextToSize(contactText, contentWidth - 12);
      pdf.setFontSize(fontSize(7.5));
      contactLines.slice(0, 2).forEach((line, index) => {
        pdf.text(line, marginX + 6, marginTop + 20.5 + index * 3.3);
      });
      y = marginTop + 34;
      return;
    }

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(fontSize(isCompact ? 19 : 22));
    setColor(isClassic ? INK : accent);
    pdf.text(draft.personal.fullName || "Your name", PAGE.width / 2, y, { align: "center" });
    y += lineHeight(isCompact ? 19 : 22);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(fontSize(10));
    setColor(MUTED);
    pdf.text(draft.personal.headline || "Professional headline", PAGE.width / 2, y, { align: "center" });
    y += 5;
    pdf.setFontSize(fontSize(7.8));
    const contactText = contactItems.map((item) => item.label).join("  |  ");
    const contactLines = pdf.splitTextToSize(contactText, contentWidth);
    contactLines.forEach((line) => {
      pdf.text(line, PAGE.width / 2, y, { align: "center" });
      y += 3.5;
    });
    y += 1.5;
    setDrawColor(isClassic ? INK : accent);
    pdf.setLineWidth(0.5);
    pdf.line(marginX, y, PAGE.width - marginX, y);
    y += 3.5;
  };

  const renderSummary = () => {
    if (!draft.summary) return;
    sectionHeading("Professional summary");
    writeWrapped(draft.summary, { size: isCompact ? 8.5 : 9.1, color: INK });
  };

  const renderSkills = () => {
    if (!draft.skills.length) return;
    sectionHeading("Skills");
    const skillText = draft.skills.join("  |  ");
    writeWrapped(skillText, { size: isCompact ? 8.3 : 8.9, color: INK });
  };

  const renderExperience = () => {
    const entries = draft.experience.filter(hasEntryContent);
    if (!entries.length) return;
    sectionHeading("Experience");
    entries.forEach((item, index) => {
      ensure(13);
      writeInlinePair(item.role || item.organization, dateRange(item), { size: isCompact ? 9.3 : 10.1 });
      const organizationLine = [item.role ? item.organization : "", item.location].filter(Boolean).join(" | ");
      writeWrapped(organizationLine, {
        size: isCompact ? 8 : 8.5,
        style: "bold",
        color: accent,
        leading: 3.4,
        after: 0.7,
      });
      drawBulletList(item.highlights, { size: isCompact ? 8.1 : 8.7 });
      if (index < entries.length - 1) y += 1.1 * densityScale;
    });
  };

  const renderProjects = () => {
    const entries = draft.projects.filter(hasEntryContent);
    if (!entries.length) return;
    sectionHeading("Projects");
    entries.forEach((item, index) => {
      ensure(12);
      writeInlinePair(item.name || "Project", dateRange(item), { size: isCompact ? 9.3 : 10 });
      const detail = [item.role, item.technologies].filter(Boolean).join(" | ");
      writeWrapped(detail, { size: 8.2, style: "bold", color: accent, leading: 3.4, after: 0.7 });
      if (item.link) {
        writeWrapped(displayUrl(item.link), {
          size: 7.8,
          color: MUTED,
          leading: 3.2,
          after: 0.7,
          link: safeUrl(item.link),
        });
      }
      drawBulletList(item.highlights, { size: isCompact ? 8.1 : 8.7 });
      if (index < entries.length - 1) y += 1.1 * densityScale;
    });
  };

  const renderEducation = () => {
    const entries = draft.education.filter(hasEntryContent);
    if (!entries.length) return;
    sectionHeading("Education");
    entries.forEach((item, index) => {
      ensure(11);
      const title = [item.degree, item.field].filter(Boolean).join(" in ") || item.institution;
      writeInlinePair(title, dateRange(item), { size: isCompact ? 9.3 : 10 });
      const secondary = [title === item.institution ? "" : item.institution, item.location, item.score]
        .filter(Boolean)
        .join(" | ");
      writeWrapped(secondary, { size: 8.2, style: "bold", color: accent, leading: 3.4, after: 0.6 });
      drawBulletList(item.highlights, { size: isCompact ? 8.1 : 8.7 });
      if (index < entries.length - 1) y += 1.1 * densityScale;
    });
  };

  const renderCertifications = () => {
    const entries = draft.certifications.filter(hasEntryContent);
    if (!entries.length) return;
    sectionHeading("Certifications");
    entries.forEach((item) => {
      ensure(7);
      writeInlinePair(item.name || item.issuer, item.date, { size: isCompact ? 8.9 : 9.5, after: 0.5 });
      const issuer = item.name ? item.issuer : "";
      if (issuer) writeWrapped(issuer, { size: 8.1, color: MUTED, leading: 3.3, after: 0.3 });
      if (item.credentialUrl) {
        writeWrapped(displayUrl(item.credentialUrl), {
          size: 7.7,
          color: MUTED,
          leading: 3.1,
          after: 0.6,
          link: safeUrl(item.credentialUrl),
        });
      }
    });
  };

  const renderAchievements = () => {
    const entries = draft.achievements.filter(hasEntryContent);
    if (!entries.length) return;
    sectionHeading("Achievements");
    entries.forEach((item) => {
      writeWrapped(item.title, { size: 9, style: "bold", leading: 3.7, after: 0.4 });
      writeWrapped(item.description, { size: 8.5, leading: 3.6, after: 1 });
    });
  };

  const renderLanguages = () => {
    const entries = draft.languages.filter(hasEntryContent);
    if (!entries.length) return;
    sectionHeading("Languages");
    writeWrapped(
      entries.map((item) => [item.name, item.proficiency].filter(Boolean).join(" - ")).join("  |  "),
      { size: 8.8 }
    );
  };

  const sectionRenderers = {
    summary: renderSummary,
    skills: renderSkills,
    experience: renderExperience,
    projects: renderProjects,
    education: renderEducation,
    certifications: renderCertifications,
    achievements: renderAchievements,
    languages: renderLanguages,
  };

  paintPage();
  renderHeader();
  layout.sectionOrder.forEach((section) => {
    if (!layout.hiddenSections.includes(section)) sectionRenderers[section]?.();
  });
  addFooter();

  return pdf;
}

export function exportResumePdf(draft, layout) {
  const pdf = createResumePdf(draft, layout);
  pdf.save(getResumePdfFilename(draft));
  return pdf;
}
