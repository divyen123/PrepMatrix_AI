import { jsPDF } from "jspdf";
import { normalizeResumeDraft, normalizeResumeLayout } from "./resumeBuilder.js";

const PAGE = Object.freeze({ width: 210, height: 297 });
const INK = "#162033";
const MUTED = "#64748b";
const LIGHT = "#d8e0ea";
const SOFT = "#f3f6f9";

const TYPOGRAPHY_SCALES = Object.freeze({ compact: 0.92, balanced: 1, large: 1.08 });
const DENSITY_SCALES = Object.freeze({ compact: 0.86, balanced: 1, airy: 1.16 });

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

export function getResumePdfMetrics(layoutValue = {}) {
  const layout = normalizeResumeLayout(layoutValue);
  const isCompact = layout.template === "compact";
  const typographyScale = TYPOGRAPHY_SCALES[layout.typography];
  const densityScale = DENSITY_SCALES[layout.density];
  return Object.freeze({
    template: layout.template,
    headerAlignment: layout.template === "classic" ? "center" : "left",
    marginX: isCompact ? 15 : 18,
    marginTop: isCompact ? 14 : 17,
    bottomMargin: 16,
    typographyScale,
    densityScale,
    bodyFontSize: 9.1 * typographyScale,
    bodyLineHeight: 9.1 * typographyScale * 0.3528 * 1.25,
    sectionGap: 6.9 * densityScale,
  });
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
  const metrics = getResumePdfMetrics(layout);
  const accent = colorToRgb(layout.accent);
  const isClassic = layout.template === "classic";
  const isCompact = layout.template === "compact";
  const { typographyScale, densityScale, marginX, marginTop, bottomMargin } = metrics;
  const contentWidth = PAGE.width - marginX * 2;
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

  const fontSize = (value) => Math.max(6.6, value * typographyScale);
  const lineHeight = (value, multiplier = 1.25) => fontSize(value) * 0.3528 * multiplier;
  const space = (value) => value * densityScale;
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
      after = space(1.2),
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
      y += lines.length * lineHeight(options.size || 8.8) + space(1.05);
    });
  };

  const sectionHeading = (title) => {
    ensure(space(18));
    y += space(2.5);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(fontSize(isCompact ? 10.2 : 11.2));
    if (isClassic) {
      setColor(INK);
      pdf.text(title.toUpperCase(), marginX, y);
      y += space(2.2);
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
    y += space(4.4);
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
      const headerTop = marginTop - 3;
      const innerX = marginX + 6;
      const innerWidth = contentWidth - 12;
      const nameSize = 23;
      const headlineSize = 10;
      const contactSize = 7.5;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(fontSize(nameSize));
      const nameLines = pdf.splitTextToSize(draft.personal.fullName || "Your name", innerWidth);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(fontSize(headlineSize));
      const headlineLines = pdf.splitTextToSize(
        draft.personal.headline || "Professional headline",
        innerWidth
      );
      const contactText = contactItems.map((item) => item.label).join("  |  ");
      pdf.setFontSize(fontSize(contactSize));
      const contactLines = contactText ? pdf.splitTextToSize(contactText, innerWidth) : [];
      const nameLeading = lineHeight(nameSize, 1.05);
      const headlineLeading = lineHeight(headlineSize, 1.15);
      const contactLeading = lineHeight(contactSize, 1.15);
      const headerHeight = Math.max(
        31,
        9 +
          nameLines.length * nameLeading +
          1 +
          headlineLines.length * headlineLeading +
          (contactLines.length ? 1 + contactLines.length * contactLeading : 0) +
          3
      );
      pdf.setFillColor(...accent);
      pdf.roundedRect(marginX, headerTop, contentWidth, headerHeight, 2.5, 2.5, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(fontSize(nameSize));
      pdf.setTextColor(255, 255, 255);
      let headerY = headerTop + 9;
      nameLines.forEach((line, index) => pdf.text(line, innerX, headerY + index * nameLeading));
      headerY += nameLines.length * nameLeading + 1;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(fontSize(headlineSize));
      headlineLines.forEach((line, index) => pdf.text(line, innerX, headerY + index * headlineLeading));
      headerY += headlineLines.length * headlineLeading;
      if (contactLines.length) {
        headerY += 1;
        pdf.setFontSize(fontSize(contactSize));
        contactLines.forEach((line, index) => pdf.text(line, innerX, headerY + index * contactLeading));
      }
      y = headerTop + headerHeight + space(6);
      return;
    }

    const alignment = metrics.headerAlignment;
    const headerX = alignment === "center" ? PAGE.width / 2 : marginX;
    const textOptions = alignment === "center" ? { align: "center" } : undefined;
    const nameSize = isCompact ? 19 : 22;
    const headlineSize = 10;
    const contactSize = 7.8;
    pdf.setFont("times", "bold");
    pdf.setFontSize(fontSize(nameSize));
    setColor(INK);
    const nameLines = pdf.splitTextToSize(draft.personal.fullName || "Your name", contentWidth);
    const nameLeading = lineHeight(nameSize, 1.05);
    nameLines.forEach((line, index) => pdf.text(line, headerX, y + index * nameLeading, textOptions));
    y += nameLines.length * nameLeading + space(1);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(fontSize(headlineSize));
    setColor(accent);
    const headlineLines = pdf.splitTextToSize(
      draft.personal.headline || "Professional headline",
      contentWidth
    );
    const headlineLeading = lineHeight(headlineSize, 1.15);
    headlineLines.forEach((line, index) => pdf.text(line, headerX, y + index * headlineLeading, textOptions));
    y += headlineLines.length * headlineLeading + space(1.2);
    pdf.setFontSize(fontSize(contactSize));
    setColor(MUTED);
    const contactText = contactItems.map((item) => item.label).join("  |  ");
    const contactLines = contactText ? pdf.splitTextToSize(contactText, contentWidth) : [];
    const contactLeading = lineHeight(contactSize, 1.15);
    contactLines.forEach((line) => {
      pdf.text(line, headerX, y, textOptions);
      y += contactLeading;
    });
    y += space(1.5);
    setDrawColor(isClassic ? INK : accent);
    pdf.setLineWidth(0.5);
    pdf.line(marginX, y, PAGE.width - marginX, y);
    y += space(4);
  };

  const renderSummary = () => {
    if (!draft.summary) return;
    sectionHeading("Professional summary");
    writeWrapped(draft.summary, { size: isCompact ? 8.5 : 9.1, color: INK });
  };

  const renderSkillChips = () => {
    const skillSize = isCompact ? 8.1 : 8.5;
    const horizontalPadding = 2.3;
    const chipHeight = lineHeight(skillSize, 1.05) + 2.2;
    const rowGap = space(1.4);
    const soft = colorToRgb(SOFT);
    const tint = accent.map((channel, index) => Math.round(channel * 0.1 + soft[index] * 0.9));
    let x = marginX;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(fontSize(skillSize));
    draft.skills.forEach((skill) => {
      const chipWidth = Math.min(contentWidth, pdf.getTextWidth(skill) + horizontalPadding * 2);
      if (x > marginX && x + chipWidth > PAGE.width - marginX) {
        x = marginX;
        y += chipHeight + rowGap;
      }
      ensure(chipHeight);
      pdf.setFillColor(...tint);
      pdf.roundedRect(x, y, chipWidth, chipHeight, 0.9, 0.9, "F");
      setColor(INK);
      pdf.text(skill, x + horizontalPadding, y + chipHeight - 1.5);
      x += chipWidth + 1.5;
    });
    y += chipHeight;
  };

  const renderSkills = () => {
    if (!draft.skills.length) return;
    sectionHeading("Skills");
    if (isClassic) {
      writeWrapped(draft.skills.join("  |  "), { size: 8.9, color: INK });
      return;
    }
    renderSkillChips();
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
        leading: lineHeight(isCompact ? 8 : 8.5, 1.15),
        after: space(0.7),
      });
      drawBulletList(item.highlights, { size: isCompact ? 8.1 : 8.7 });
      if (index < entries.length - 1) y += space(1.1);
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
      writeWrapped(detail, { size: 8.2, style: "bold", color: accent, leading: lineHeight(8.2, 1.17), after: space(0.7) });
      if (item.link) {
        writeWrapped(displayUrl(item.link), {
          size: 7.8,
          color: MUTED,
          leading: lineHeight(7.8, 1.16),
          after: space(0.7),
          link: safeUrl(item.link),
        });
      }
      drawBulletList(item.highlights, { size: isCompact ? 8.1 : 8.7 });
      if (index < entries.length - 1) y += space(1.1);
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
      writeWrapped(secondary, { size: 8.2, style: "bold", color: accent, leading: lineHeight(8.2, 1.17), after: space(0.6) });
      drawBulletList(item.highlights, { size: isCompact ? 8.1 : 8.7 });
      if (index < entries.length - 1) y += space(1.1);
    });
  };

  const renderCertifications = () => {
    const entries = draft.certifications.filter(hasEntryContent);
    if (!entries.length) return;
    sectionHeading("Certifications");
    entries.forEach((item) => {
      ensure(7);
      writeInlinePair(item.name || item.issuer, item.date, { size: isCompact ? 8.9 : 9.5, after: space(0.5) });
      const issuer = item.name ? item.issuer : "";
      if (issuer) writeWrapped(issuer, { size: 8.1, color: MUTED, leading: lineHeight(8.1, 1.15), after: space(0.3) });
      if (item.credentialUrl) {
        writeWrapped(displayUrl(item.credentialUrl), {
          size: 7.7,
          color: MUTED,
          leading: lineHeight(7.7, 1.14),
          after: space(0.6),
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
      writeWrapped(item.title, { size: 9, style: "bold", leading: lineHeight(9, 1.16), after: space(0.4) });
      writeWrapped(item.description, { size: 8.5, leading: lineHeight(8.5, 1.2), after: space(1) });
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
