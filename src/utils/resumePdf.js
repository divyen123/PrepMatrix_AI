import { jsPDF } from "jspdf";
import { normalizeResumeDraft, normalizeResumeLayout } from "./resumeBuilder.js";

const PAGE = Object.freeze({ width: 210, height: 297 });
const INK = "#162033";
const MUTED = "#64748b";
const LIGHT = "#d8e0ea";
const SOFT = "#f3f6f9";

const PREVIEW_WIDTH_PX = 500;
const CSS_PX_TO_MM = PAGE.width / PREVIEW_WIDTH_PX;
const CSS_PX_TO_PT = CSS_PX_TO_MM / (25.4 / 72);
const BASE_PREVIEW_FONT_PT = 8 * CSS_PX_TO_PT;
const TYPOGRAPHY_SCALES = Object.freeze({ compact: 7.35 / 8, balanced: 1, large: 8.65 / 8 });
const DENSITY_LAYOUT = Object.freeze({
  compact: Object.freeze({
    bodyTop: 12 * CSS_PX_TO_MM,
    sectionGap: 10 * CSS_PX_TO_MM,
    entryGap: 6 * CSS_PX_TO_MM,
  }),
  balanced: Object.freeze({
    bodyTop: 17 * CSS_PX_TO_MM,
    sectionGap: 14 * CSS_PX_TO_MM,
    entryGap: 9 * CSS_PX_TO_MM,
  }),
  airy: Object.freeze({
    bodyTop: 23 * CSS_PX_TO_MM,
    sectionGap: 19 * CSS_PX_TO_MM,
    entryGap: 12 * CSS_PX_TO_MM,
  }),
});

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
  const density = DENSITY_LAYOUT[layout.density];
  const densityScale = density.sectionGap / DENSITY_LAYOUT.balanced.sectionGap;
  const bodyFontSize = BASE_PREVIEW_FONT_PT * 1.02;
  return Object.freeze({
    template: layout.template,
    headerAlignment: layout.template === "classic" ? "center" : "left",
    marginX: 30 * CSS_PX_TO_MM,
    marginTop: isCompact ? 18 : layout.template === "classic" ? 20 : 17,
    bottomMargin: 16,
    typographyScale,
    densityScale,
    bodyFontSize,
    effectiveBodyFontSize: bodyFontSize * typographyScale,
    bodyLineHeight: bodyFontSize * typographyScale * 0.3528 * 1.48,
    bodyTop: density.bodyTop,
    sectionGap: density.sectionGap,
    entryGap: density.entryGap,
    headingContentGap: 7 * CSS_PX_TO_MM,
    bulletTopGap: 4 * CSS_PX_TO_MM,
    bulletItemGap: 2 * CSS_PX_TO_MM,
    nameFontSize: BASE_PREVIEW_FONT_PT * 3.15,
    headlineFontSize: BASE_PREVIEW_FONT_PT * 1.35,
    contactFontSize: BASE_PREVIEW_FONT_PT * 0.92,
    headingFontSize: BASE_PREVIEW_FONT_PT * 1.24,
    entryTitleFontSize: BASE_PREVIEW_FONT_PT * 1.14,
    entryDateFontSize: BASE_PREVIEW_FONT_PT * 0.86,
    metaFontSize: BASE_PREVIEW_FONT_PT * 0.92,
    bulletFontSize: BASE_PREVIEW_FONT_PT,
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
  let renderedSectionCount = 0;

  pdf.setProperties({
    title: `${draft.personal.fullName || "Professional"} Resume`,
    subject: draft.personal.headline || "Professional resume",
    author: draft.personal.fullName || "PrepMatrix user",
    creator: "PrepMatrix Resume Builder",
    keywords: "resume, curriculum vitae, professional profile",
  });

  const fontSize = (value) => Math.max(6.6, value * typographyScale);
  const fontHeight = (value) => fontSize(value) * 0.3528;
  const lineHeight = (value, multiplier = 1.25) => fontSize(value) * 0.3528 * multiplier;
  const baselineTransition = (fromSize, margin, toSize) =>
    fontHeight(fromSize) * 0.2 + margin + fontHeight(toSize) * 0.8;
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
      pdf.rect(0, 0, 6 * CSS_PX_TO_MM, PAGE.height, "F");
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
    if (y + needed <= PAGE.height - bottomMargin) return false;
    addPage();
    return true;
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
    if (!filtered.length) return;
    const size = options.size || metrics.bulletFontSize;
    const leading = lineHeight(size, 1.4);
    const pageChanged = ensure(metrics.bulletTopGap + leading);
    if (!pageChanged) y += metrics.bulletTopGap;
    filtered.forEach((item, index) => {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(fontSize(size));
      const lines = pdf.splitTextToSize(item, contentWidth - 5.88);
      ensure(lines.length * leading + metrics.bulletItemGap);
      pdf.setFillColor(...accent);
      pdf.circle(marginX + 1, y - 1.05, 0.62, "F");
      setColor(INK);
      lines.forEach((line, index) => {
        pdf.text(line, marginX + 5.88, y + index * leading);
      });
      y += lines.length * leading;
      if (index < filtered.length - 1) y += metrics.bulletItemGap;
    });
  };

  const sectionHeading = (title) => {
    const headingSize = metrics.headingFontSize;
    const headingLineHeight = lineHeight(headingSize, 1.2);
    const sectionGap =
      renderedSectionCount === 0
        ? metrics.bodyTop + fontHeight(headingSize) * 0.8
        : metrics.sectionGap;
    const pageChanged = ensure(sectionGap + headingLineHeight + metrics.headingContentGap + 12);
    if (!pageChanged) y += sectionGap;
    renderedSectionCount += 1;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(fontSize(headingSize));
    if (isClassic) {
      setColor(INK);
      pdf.text(title.toUpperCase(), marginX, y);
      const headingWidth = pdf.getTextWidth(title.toUpperCase());
      setDrawColor(INK);
      pdf.setLineWidth(0.35);
      pdf.line(marginX + headingWidth + 4, y - 0.8, PAGE.width - marginX, y - 0.8);
    } else {
      setColor(accent);
      pdf.text(title.toUpperCase(), marginX, y);
      const headingWidth = pdf.getTextWidth(title.toUpperCase());
      setDrawColor(LIGHT);
      pdf.setLineWidth(0.32);
      pdf.line(marginX + headingWidth + 4, y - 0.8, PAGE.width - marginX, y - 0.8);
    }
    y += headingLineHeight + metrics.headingContentGap;
  };

  const dateRange = (item) => {
    const end = item.current ? "Present" : item.endDate;
    return [item.startDate, end].filter(Boolean).join(" - ");
  };

  const beginEntry = (index, minimumHeight) => {
    if (index === 0) {
      ensure(minimumHeight);
      return;
    }
    const pageChanged = ensure(metrics.entryGap + minimumHeight);
    if (!pageChanged) y += metrics.entryGap;
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
      const headerTop = 15 * CSS_PX_TO_MM;
      const headerX = 15 * CSS_PX_TO_MM;
      const headerWidth = PAGE.width - headerX * 2;
      const innerX = headerX + 22 * CSS_PX_TO_MM;
      const innerWidth = headerWidth - 44 * CSS_PX_TO_MM;
      const nameSize = metrics.nameFontSize;
      const headlineSize = metrics.headlineFontSize;
      const contactSize = metrics.contactFontSize;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(fontSize(nameSize));
      const nameLines = pdf.splitTextToSize(draft.personal.fullName || "Your name", innerWidth);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(fontSize(headlineSize));
      const headlineLines = pdf.splitTextToSize(
        draft.personal.headline || "Professional headline",
        innerWidth
      );
      const contactText = contactItems.map((item) => item.label).join("  |  ");
      pdf.setFontSize(fontSize(contactSize));
      const contactLines = contactText ? pdf.splitTextToSize(contactText, innerWidth) : [];
      const nameLeading = lineHeight(nameSize, 1);
      const headlineLeading = lineHeight(headlineSize, 1.2);
      const contactLeading = lineHeight(contactSize, 1.2) + 5 * CSS_PX_TO_MM;
      const nameY = headerTop + 20 * CSS_PX_TO_MM + fontHeight(nameSize) * 0.8;
      const lastNameY = nameY + (nameLines.length - 1) * nameLeading;
      const headlineY =
        lastNameY + baselineTransition(nameSize, 7 * CSS_PX_TO_MM, headlineSize);
      const lastHeadlineY = headlineY + (headlineLines.length - 1) * headlineLeading;
      const contactY =
        lastHeadlineY + baselineTransition(headlineSize, 9 * CSS_PX_TO_MM, contactSize);
      const lastContentY = contactLines.length
        ? contactY + (contactLines.length - 1) * contactLeading
        : lastHeadlineY;
      const lastContentSize = contactLines.length ? contactSize : headlineSize;
      const headerHeight =
        lastContentY -
        headerTop +
        fontHeight(lastContentSize) * 0.2 +
        16 * CSS_PX_TO_MM;
      pdf.setFillColor(...accent);
      pdf.roundedRect(
        headerX,
        headerTop,
        headerWidth,
        headerHeight,
        7 * CSS_PX_TO_MM,
        7 * CSS_PX_TO_MM,
        "F"
      );
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(fontSize(nameSize));
      pdf.setTextColor(255, 255, 255);
      nameLines.forEach((line, index) => pdf.text(line, innerX, nameY + index * nameLeading));
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(fontSize(headlineSize));
      headlineLines.forEach((line, index) =>
        pdf.text(line, innerX, headlineY + index * headlineLeading)
      );
      if (contactLines.length) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(fontSize(contactSize));
        contactLines.forEach((line, index) =>
          pdf.text(line, innerX, contactY + index * contactLeading)
        );
      }
      y = headerTop + headerHeight + 15 * CSS_PX_TO_MM;
      return;
    }

    const alignment = metrics.headerAlignment;
    const headerX = alignment === "center" ? PAGE.width / 2 : marginX;
    const textOptions = alignment === "center" ? { align: "center" } : undefined;
    const nameSize = metrics.nameFontSize;
    const headlineSize = metrics.headlineFontSize;
    const contactSize = metrics.contactFontSize;
    pdf.setFont("times", "bold");
    pdf.setFontSize(fontSize(nameSize));
    setColor(INK);
    const nameLines = pdf.splitTextToSize(draft.personal.fullName || "Your name", contentWidth);
    const nameLeading = lineHeight(nameSize, 1);
    nameLines.forEach((line, index) => pdf.text(line, headerX, y + index * nameLeading, textOptions));
    const lastNameY = y + (nameLines.length - 1) * nameLeading;
    const headlineY =
      lastNameY + baselineTransition(nameSize, 7 * CSS_PX_TO_MM, headlineSize);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(fontSize(headlineSize));
    setColor(accent);
    const headlineLines = pdf.splitTextToSize(
      draft.personal.headline || "Professional headline",
      contentWidth
    );
    const headlineLeading = lineHeight(headlineSize, 1.2);
    headlineLines.forEach((line, index) =>
      pdf.text(line, headerX, headlineY + index * headlineLeading, textOptions)
    );
    const lastHeadlineY = headlineY + (headlineLines.length - 1) * headlineLeading;
    const contactY =
      lastHeadlineY + baselineTransition(headlineSize, 9 * CSS_PX_TO_MM, contactSize);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(fontSize(contactSize));
    setColor(MUTED);
    const contactText = contactItems.map((item) => item.label).join("  |  ");
    const contactLines = contactText ? pdf.splitTextToSize(contactText, contentWidth) : [];
    const contactLeading = lineHeight(contactSize, 1.2) + 5 * CSS_PX_TO_MM;
    contactLines.forEach((line, index) => {
      pdf.text(line, headerX, contactY + index * contactLeading, textOptions);
    });
    const lastContentY = contactLines.length
      ? contactY + (contactLines.length - 1) * contactLeading
      : lastHeadlineY;
    const lastContentSize = contactLines.length ? contactSize : headlineSize;
    y =
      lastContentY +
      fontHeight(lastContentSize) * 0.2 +
      (isCompact ? 15 : 19) * CSS_PX_TO_MM;
    setDrawColor(isClassic ? INK : accent);
    pdf.setLineWidth(0.5);
    pdf.line(marginX, y, PAGE.width - marginX, y);
  };

  const renderSummary = () => {
    if (!draft.summary) return;
    sectionHeading("Professional summary");
    writeWrapped(draft.summary, {
      size: metrics.bodyFontSize,
      color: INK,
      leading: metrics.bodyLineHeight,
    });
  };

  const renderSkillChips = () => {
    const skillSize = metrics.metaFontSize;
    const horizontalPadding = 6 * CSS_PX_TO_MM;
    const verticalPadding = 3 * CSS_PX_TO_MM;
    const chipHeight = lineHeight(skillSize, 1.2) + verticalPadding * 2;
    const rowGap = 4 * CSS_PX_TO_MM;
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
      pdf.text(skill, x + horizontalPadding, y + verticalPadding + fontHeight(skillSize) * 0.8);
      x += chipWidth + 4 * CSS_PX_TO_MM;
    });
    y += chipHeight;
  };

  const renderSkills = () => {
    if (!draft.skills.length) return;
    sectionHeading("Skills");
    if (isClassic) {
      writeWrapped(draft.skills.join("  |  "), {
        size: metrics.metaFontSize,
        color: INK,
        leading: lineHeight(metrics.metaFontSize, 1.2),
      });
      return;
    }
    renderSkillChips();
  };

  const renderExperience = () => {
    const entries = draft.experience.filter(hasEntryContent);
    if (!entries.length) return;
    sectionHeading("Experience");
    entries.forEach((item, index) => {
      beginEntry(index, 13);
      writeInlinePair(item.role || item.organization, dateRange(item), {
        size: metrics.entryTitleFontSize,
        rightSize: metrics.entryDateFontSize,
        after: 2 * CSS_PX_TO_MM,
      });
      const organizationLine = [item.role ? item.organization : "", item.location].filter(Boolean).join(" | ");
      writeWrapped(organizationLine, {
        size: metrics.metaFontSize,
        style: "bold",
        color: accent,
        leading: lineHeight(metrics.metaFontSize, 1.2),
      });
      drawBulletList(item.highlights);
    });
  };

  const renderProjects = () => {
    const entries = draft.projects.filter(hasEntryContent);
    if (!entries.length) return;
    sectionHeading("Projects");
    entries.forEach((item, index) => {
      beginEntry(index, 12);
      writeInlinePair(item.name || "Project", dateRange(item), {
        size: metrics.entryTitleFontSize,
        rightSize: metrics.entryDateFontSize,
        after: 2 * CSS_PX_TO_MM,
      });
      const detail = [item.role, item.technologies].filter(Boolean).join(" | ");
      writeWrapped(detail, {
        size: metrics.metaFontSize,
        style: "bold",
        color: accent,
        leading: lineHeight(metrics.metaFontSize, 1.2),
      });
      if (item.link) {
        writeWrapped(displayUrl(item.link), {
          size: metrics.metaFontSize,
          color: MUTED,
          leading: lineHeight(metrics.metaFontSize, 1.2),
          link: safeUrl(item.link),
        });
      }
      drawBulletList(item.highlights);
    });
  };

  const renderEducation = () => {
    const entries = draft.education.filter(hasEntryContent);
    if (!entries.length) return;
    sectionHeading("Education");
    entries.forEach((item, index) => {
      beginEntry(index, 11);
      const title = [item.degree, item.field].filter(Boolean).join(" in ") || item.institution;
      writeInlinePair(title, dateRange(item), {
        size: metrics.entryTitleFontSize,
        rightSize: metrics.entryDateFontSize,
        after: 2 * CSS_PX_TO_MM,
      });
      const secondary = [title === item.institution ? "" : item.institution, item.location, item.score]
        .filter(Boolean)
        .join(" | ");
      writeWrapped(secondary, {
        size: metrics.metaFontSize,
        style: "bold",
        color: accent,
        leading: lineHeight(metrics.metaFontSize, 1.2),
      });
      drawBulletList(item.highlights);
    });
  };

  const renderCertifications = () => {
    const entries = draft.certifications.filter(hasEntryContent);
    if (!entries.length) return;
    sectionHeading("Certifications");
    entries.forEach((item, index) => {
      beginEntry(index, 8);
      writeInlinePair(item.name || item.issuer, item.date, {
        size: metrics.entryTitleFontSize,
        rightSize: metrics.entryDateFontSize,
        after: 2 * CSS_PX_TO_MM,
      });
      const issuer = item.name ? item.issuer : "";
      if (issuer) {
        writeWrapped(issuer, {
          size: metrics.metaFontSize,
          color: MUTED,
          leading: lineHeight(metrics.metaFontSize, 1.2),
        });
      }
      if (item.credentialUrl) {
        writeWrapped(displayUrl(item.credentialUrl), {
          size: metrics.metaFontSize,
          color: MUTED,
          leading: lineHeight(metrics.metaFontSize, 1.2),
          link: safeUrl(item.credentialUrl),
        });
      }
    });
  };

  const renderAchievements = () => {
    const entries = draft.achievements.filter(hasEntryContent);
    if (!entries.length) return;
    sectionHeading("Achievements");
    entries.forEach((item, index) => {
      beginEntry(index, 8);
      writeWrapped(item.title, {
        size: metrics.entryTitleFontSize,
        style: "bold",
        leading: lineHeight(metrics.entryTitleFontSize, 1.25),
        after: 2 * CSS_PX_TO_MM,
      });
      writeWrapped(item.description, {
        size: metrics.bodyFontSize,
        leading: metrics.bodyLineHeight,
      });
    });
  };

  const renderLanguages = () => {
    const entries = draft.languages.filter(hasEntryContent);
    if (!entries.length) return;
    sectionHeading("Languages");
    writeWrapped(
      entries.map((item) => [item.name, item.proficiency].filter(Boolean).join(" - ")).join("  |  "),
      { size: metrics.metaFontSize, leading: lineHeight(metrics.metaFontSize, 1.2) }
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

  Object.defineProperty(pdf, "__resumeLayout", {
    value: Object.freeze({ contentBottom: y, pageCount: pageNumber, metrics }),
    enumerable: false,
  });

  return pdf;
}

export function exportResumePdf(draft, layout) {
  const pdf = createResumePdf(draft, layout);
  pdf.save(getResumePdfFilename(draft));
  return pdf;
}
