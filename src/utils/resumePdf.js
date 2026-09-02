import html2canvas from "html2canvas";
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
const verticalPxToMm = (value) => value * CSS_PX_TO_MM;
const TYPOGRAPHY_SCALES = Object.freeze({ compact: 7.35 / 8, balanced: 1, large: 8.65 / 8 });
const DENSITY_LAYOUT = Object.freeze({
  compact: Object.freeze({
    bodyTop: verticalPxToMm(12),
    sectionGap: verticalPxToMm(10),
    entryGap: verticalPxToMm(6),
  }),
  balanced: Object.freeze({
    bodyTop: verticalPxToMm(17),
    sectionGap: verticalPxToMm(14),
    entryGap: verticalPxToMm(9),
  }),
  airy: Object.freeze({
    bodyTop: verticalPxToMm(23),
    sectionGap: verticalPxToMm(19),
    entryGap: verticalPxToMm(12),
  }),
});

const PDF_TEMPLATE_PROFILES = Object.freeze({
  modern: Object.freeze({ headerAlignment: "left", headerStyle: "inset", marginTop: 21, nameScale: 1, headingScale: 1 }),
  classic: Object.freeze({ headerAlignment: "center", headerStyle: "traditional", marginTop: 25, nameScale: 1, headingScale: 1 }),
  compact: Object.freeze({ headerAlignment: "left", headerStyle: "dense", marginTop: 23, nameScale: 1, headingScale: 1 }),
  executive: Object.freeze({ headerAlignment: "left", headerStyle: "executive", marginTop: 22, nameScale: 0.95, headingScale: 0.98 }),
  minimal: Object.freeze({ headerAlignment: "left", headerStyle: "minimal", marginTop: 27, nameScale: 0.92, headingScale: 0.9 }),
  editorial: Object.freeze({ headerAlignment: "left", headerStyle: "editorial", marginTop: 23, nameScale: 1.08, headingScale: 0.98 }),
  signature: Object.freeze({ headerAlignment: "center", headerStyle: "signature", marginTop: 27, nameScale: 1.06, headingScale: 0.92 }),
  horizon: Object.freeze({ headerAlignment: "left", headerStyle: "band", marginTop: 19, nameScale: 1, headingScale: 1 }),
});

// Minimum render scale — matches the live preview's lower bound so the PDF
// always tries to fit to a single page the same way the preview does.
const MIN_SINGLE_PAGE_SCALE = 0.55;
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

export function getResumePdfMetrics(layoutValue = {}, renderScale = 1) {
  const layout = normalizeResumeLayout(layoutValue);
  const templateProfile = PDF_TEMPLATE_PROFILES[layout.template] || PDF_TEMPLATE_PROFILES.modern;
  const typographyScale = TYPOGRAPHY_SCALES[layout.typography];
  const density = DENSITY_LAYOUT[layout.density];
  const densityScale =
    (density.sectionGap / DENSITY_LAYOUT.balanced.sectionGap) * renderScale;
  const bodyFontSize = BASE_PREVIEW_FONT_PT * 1.02;
  return Object.freeze({
    template: layout.template,
    fontFamily: layout.fontFamily,
    headerAlignment: templateProfile.headerAlignment,
    headerStyle: templateProfile.headerStyle,
    marginX: 18,
    marginTop: templateProfile.marginTop * renderScale,
    bottomMargin: 16,
    typographyScale,
    renderScale,
    densityScale,
    bodyFontSize,
    effectiveBodyFontSize: bodyFontSize * typographyScale * renderScale,
    bodyLineHeight: bodyFontSize * typographyScale * renderScale * 0.3528 * 1.48,
    bodyTop: density.bodyTop * renderScale,
    sectionGap: density.sectionGap * renderScale,
    entryGap: density.entryGap * renderScale,
    headingContentGap: verticalPxToMm(7) * renderScale,
    metaTopGap: verticalPxToMm(2) * renderScale,
    bulletTopGap: verticalPxToMm(4) * renderScale,
    bulletItemGap: verticalPxToMm(2) * renderScale,
    nameFontSize: BASE_PREVIEW_FONT_PT * 3.15 * templateProfile.nameScale,
    headlineFontSize: BASE_PREVIEW_FONT_PT * 1.35,
    contactFontSize: BASE_PREVIEW_FONT_PT * 0.92,
    headingFontSize: BASE_PREVIEW_FONT_PT * 1.24 * templateProfile.headingScale,
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

function renderResumePdf(draftValue, layoutValue = {}, renderScale = 1) {
  const draft = normalizeResumeDraft(draftValue);
  const layout = normalizeResumeLayout(layoutValue);
  const metrics = getResumePdfMetrics(layout, renderScale);
  const accent = colorToRgb(layout.accent);
  const isClassic = layout.template === "classic";
  const isCompact = layout.template === "compact";
  const isExecutive = layout.template === "executive";
  const isMinimal = layout.template === "minimal";
  const isEditorial = layout.template === "editorial";
  const isSignature = layout.template === "signature";
  const isHorizon = layout.template === "horizon";
  const deepAccent = accent.map((channel) => Math.round(channel * 0.54));
  const softAccent = accent.map((channel) => Math.round(channel * 0.1 + 245 * 0.9));
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

  const fontSize = (value) =>
    Math.max(6.6, value * typographyScale * renderScale);
  const flowPx = (value) => verticalPxToMm(value) * renderScale;
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
    } else if (isExecutive) {
      pdf.setFillColor(...accent);
      pdf.rect(0, 0, PAGE.width, 4 * CSS_PX_TO_MM, "F");
    } else if (isEditorial) {
      pdf.setFillColor(...accent);
      pdf.rect(0, 0, PAGE.width, 10 * CSS_PX_TO_MM, "F");
    } else if (isSignature) {
      setDrawColor(accent);
      pdf.setLineWidth(0.55);
      pdf.line(marginX, 8.5, PAGE.width - marginX, 8.5);
    }
  };

  const addPage = () => {
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
    const label = title.toUpperCase();
    const sectionGap =
      renderedSectionCount === 0
        ? metrics.bodyTop + fontHeight(headingSize) * 0.8
        : metrics.sectionGap;
    const pageChanged = ensure(sectionGap + headingLineHeight + metrics.headingContentGap + 12);
    if (!pageChanged) y += sectionGap;
    renderedSectionCount += 1;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(fontSize(headingSize));
    const headingWidth = pdf.getTextWidth(label);
    if (isClassic) {
      setColor(INK);
      pdf.text(label, marginX, y);
      setDrawColor(INK);
      pdf.setLineWidth(0.35);
      pdf.line(marginX + headingWidth + 4, y - 0.8, PAGE.width - marginX, y - 0.8);
    } else if (isExecutive) {
      pdf.setFillColor(...accent);
      pdf.rect(marginX, y - fontHeight(headingSize) * 0.82, 1.5, fontHeight(headingSize), "F");
      setColor(INK);
      pdf.text(label, marginX + 4, y);
      setDrawColor(LIGHT);
      pdf.setLineWidth(0.32);
      pdf.line(marginX + headingWidth + 8, y - 0.8, PAGE.width - marginX, y - 0.8);
    } else if (isMinimal) {
      setColor(INK);
      pdf.text(label, marginX, y);
      setDrawColor(LIGHT);
      pdf.setLineWidth(0.2);
      pdf.line(marginX + headingWidth + 4, y - 0.8, PAGE.width - marginX, y - 0.8);
    } else if (isEditorial) {
      const labelHeight = fontHeight(headingSize) + 3.4;
      pdf.setFillColor(...softAccent);
      pdf.roundedRect(marginX, y - fontHeight(headingSize) * 0.88 - 1.5, headingWidth + 9, labelHeight, 0.8, 0.8, "F");
      pdf.setFillColor(...accent);
      pdf.rect(marginX, y - fontHeight(headingSize) * 0.88 - 1.5, 1.5, labelHeight, "F");
      setColor(INK);
      pdf.text(label, marginX + 4.5, y);
    } else if (isSignature) {
      const centerX = PAGE.width / 2;
      setColor(INK);
      pdf.text(label, centerX, y, { align: "center" });
      setDrawColor(accent);
      pdf.setLineWidth(0.25);
      pdf.line(marginX, y - 0.8, centerX - headingWidth / 2 - 4, y - 0.8);
      pdf.line(centerX + headingWidth / 2 + 4, y - 0.8, PAGE.width - marginX, y - 0.8);
    } else if (isHorizon) {
      setColor(INK);
      pdf.text(label, marginX, y);
      setDrawColor(accent);
      pdf.setLineWidth(0.4);
      pdf.line(marginX + headingWidth + 4, y - 0.8, PAGE.width - marginX, y - 0.8);
    } else {
      setColor(accent);
      pdf.text(label, marginX, y);
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

  const buildContactLines = (width, size) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(fontSize(size));
    const rows = [];
    let row = "";
    let itemCount = 0;
    contactItems.forEach((item) => {
      const label = String(item.label || "").trim();
      if (!label) return;
      const candidate = row ? `${row}  |  ${label}` : label;
      if (row && (itemCount >= 3 || pdf.getTextWidth(candidate) > width)) {
        rows.push(row);
        row = label;
        itemCount = 1;
        return;
      }
      row = candidate;
      itemCount += 1;
    });
    if (row) rows.push(row);
    return rows.flatMap((value) => pdf.splitTextToSize(value, width));
  };

  const renderHeader = () => {
    if (isHorizon) {
      const headerTop = 0;
      const innerX = marginX;
      const innerWidth = contentWidth;
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
      const contactLines = buildContactLines(innerWidth, contactSize);
      const nameLeading = lineHeight(nameSize, 1);
      const headlineLeading = lineHeight(headlineSize, 1.2);
      const contactLeading = lineHeight(contactSize, 1.2) + flowPx(5);
      const nameY = flowPx(22) + fontHeight(nameSize) * 0.8;
      const lastNameY = nameY + (nameLines.length - 1) * nameLeading;
      const headlineY = lastNameY + baselineTransition(nameSize, flowPx(7), headlineSize);
      const lastHeadlineY = headlineY + (headlineLines.length - 1) * headlineLeading;
      const contactY = lastHeadlineY + baselineTransition(headlineSize, flowPx(9), contactSize);
      const lastContentY = contactLines.length
        ? contactY + (contactLines.length - 1) * contactLeading
        : lastHeadlineY;
      const lastContentSize = contactLines.length ? contactSize : headlineSize;
      const headerHeight = lastContentY + fontHeight(lastContentSize) * 0.2 + flowPx(18);
      pdf.setFillColor(...deepAccent);
      pdf.rect(0, headerTop, PAGE.width, headerHeight, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(fontSize(nameSize));
      pdf.setTextColor(255, 255, 255);
      nameLines.forEach((line, index) => pdf.text(line, innerX, nameY + index * nameLeading));
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
      y = headerHeight + flowPx(17);
      return;
    }

    if (layout.template === "modern") {
      const headerTop = flowPx(15);
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
      const contactLines = buildContactLines(innerWidth, contactSize);
      const nameLeading = lineHeight(nameSize, 1);
      const headlineLeading = lineHeight(headlineSize, 1.2);
      const contactLeading = lineHeight(contactSize, 1.2) + flowPx(5);
      const nameY = headerTop + flowPx(20) + fontHeight(nameSize) * 0.8;
      const lastNameY = nameY + (nameLines.length - 1) * nameLeading;
      const headlineY =
        lastNameY + baselineTransition(nameSize, flowPx(7), headlineSize);
      const lastHeadlineY = headlineY + (headlineLines.length - 1) * headlineLeading;
      const contactY =
        lastHeadlineY + baselineTransition(headlineSize, flowPx(9), contactSize);
      const lastContentY = contactLines.length
        ? contactY + (contactLines.length - 1) * contactLeading
        : lastHeadlineY;
      const lastContentSize = contactLines.length ? contactSize : headlineSize;
      const headerHeight =
        lastContentY -
        headerTop +
        fontHeight(lastContentSize) * 0.2 +
        flowPx(16);
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
      y = headerTop + headerHeight + flowPx(15);
      return;
    }

    const alignment = metrics.headerAlignment;
    const headerX = alignment === "center" ? PAGE.width / 2 : marginX;
    const textOptions = alignment === "center" ? { align: "center" } : undefined;
    const nameSize = metrics.nameFontSize;
    const headlineSize = metrics.headlineFontSize;
    const contactSize = metrics.contactFontSize;
    const nameFont = isExecutive || isMinimal ? "helvetica" : "times";
    const nameStyle = isSignature ? "italic" : "bold";
    const displayName = isExecutive
      ? (draft.personal.fullName || "Your name").toUpperCase()
      : draft.personal.fullName || "Your name";
    pdf.setFont(nameFont, nameStyle);
    pdf.setFontSize(fontSize(nameSize));
    setColor(INK);
    const nameLines = pdf.splitTextToSize(displayName, contentWidth);
    const nameLeading = lineHeight(nameSize, 1);
    nameLines.forEach((line, index) => pdf.text(line, headerX, y + index * nameLeading, textOptions));
    const lastNameY = y + (nameLines.length - 1) * nameLeading;
    const headlineY =
      lastNameY + baselineTransition(nameSize, flowPx(7), headlineSize);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(fontSize(headlineSize));
    setColor(isMinimal ? MUTED : accent);
    const headline = isExecutive || isEditorial
      ? (draft.personal.headline || "Professional headline").toUpperCase()
      : draft.personal.headline || "Professional headline";
    const headlineLines = pdf.splitTextToSize(
      headline,
      contentWidth
    );
    const headlineLeading = lineHeight(headlineSize, 1.2);
    headlineLines.forEach((line, index) =>
      pdf.text(line, headerX, headlineY + index * headlineLeading, textOptions)
    );
    const lastHeadlineY = headlineY + (headlineLines.length - 1) * headlineLeading;
    const contactY =
      lastHeadlineY + baselineTransition(headlineSize, flowPx(9), contactSize);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(fontSize(contactSize));
    setColor(MUTED);
    const contactLines = buildContactLines(contentWidth, contactSize);
    const contactLeading = lineHeight(contactSize, 1.2) + flowPx(5);
    contactLines.forEach((line, index) => {
      pdf.text(line, headerX, contactY + index * contactLeading, textOptions);
    });
    const lastContentY = contactLines.length
      ? contactY + (contactLines.length - 1) * contactLeading
      : lastHeadlineY;
    const lastContentSize = contactLines.length ? contactSize : headlineSize;
    const headerBottomGap = isExecutive || isEditorial
      ? 16
      : isMinimal
        ? 23
        : isSignature
          ? 21
          : isCompact
            ? 15
            : 19;
    y =
      lastContentY +
      fontHeight(lastContentSize) * 0.2 +
      flowPx(headerBottomGap);
    if (isSignature) {
      setDrawColor(accent);
      pdf.setLineWidth(0.45);
      pdf.line(PAGE.width / 2 - 28, y, PAGE.width / 2 + 28, y);
    } else if (isEditorial) {
      setDrawColor(INK);
      pdf.setLineWidth(0.65);
      pdf.line(marginX, y, PAGE.width - marginX, y);
      setDrawColor(accent);
      pdf.setLineWidth(0.25);
      pdf.line(marginX, y + 1.8, PAGE.width - marginX, y + 1.8);
    } else if (isExecutive) {
      setDrawColor(accent);
      pdf.setLineWidth(1.1);
      pdf.line(marginX, y, PAGE.width - marginX, y);
    } else if (isMinimal) {
      setDrawColor(LIGHT);
      pdf.setLineWidth(0.2);
      pdf.line(marginX, y, PAGE.width - marginX, y);
    } else {
      setDrawColor(isClassic ? INK : accent);
      pdf.setLineWidth(0.5);
      pdf.line(marginX, y, PAGE.width - marginX, y);
    }
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

  const renderSkillChips = (items) => {
    const skillSize = metrics.metaFontSize;
    const horizontalPadding = 6 * CSS_PX_TO_MM;
    const verticalPadding = flowPx(3);
    const chipHeight = lineHeight(skillSize, 1.2) + verticalPadding * 2;
    const rowGap = flowPx(4);
    const soft = colorToRgb(SOFT);
    const tint = accent.map((channel, index) => Math.round(channel * 0.1 + soft[index] * 0.9));
    let x = marginX;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(fontSize(skillSize));
    items.forEach((item) => {
      const chipWidth = Math.min(contentWidth, pdf.getTextWidth(item) + horizontalPadding * 2);
      if (x > marginX && x + chipWidth > PAGE.width - marginX) {
        x = marginX;
        y += chipHeight + rowGap;
      }
      ensure(chipHeight);
      const radius = isExecutive ? 0.2 : isSignature || isHorizon ? 2.4 : 0.9;
      if (isMinimal || isSignature) {
        pdf.setFillColor(255, 255, 255);
        setDrawColor(isSignature ? accent : LIGHT);
        pdf.setLineWidth(0.25);
        pdf.roundedRect(x, y, chipWidth, chipHeight, radius, radius, "FD");
      } else {
        pdf.setFillColor(...tint);
        pdf.roundedRect(x, y, chipWidth, chipHeight, radius, radius, "F");
      }
      setColor(INK);
      pdf.text(item, x + horizontalPadding, y + verticalPadding + fontHeight(skillSize) * 0.8);
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
    renderSkillChips(draft.skills);
  };

  const renderTools = () => {
    if (!draft.tools.length) return;
    sectionHeading("Tools");
    if (isClassic) {
      writeWrapped(draft.tools.join("  |  "), {
        size: metrics.metaFontSize,
        color: INK,
        leading: lineHeight(metrics.metaFontSize, 1.2),
      });
      return;
    }
    renderSkillChips(draft.tools);
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
        after: metrics.metaTopGap,
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
        after: metrics.metaTopGap,
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
        after: metrics.metaTopGap,
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
        after: metrics.metaTopGap,
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
        after: metrics.metaTopGap,
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
    tools: renderTools,
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
  Object.defineProperty(pdf, "__resumeLayout", {
    value: Object.freeze({
      contentBottom: y,
      pageCount: pageNumber,
      sectionCount: renderedSectionCount,
      renderScale,
      metrics,
    }),
    enumerable: false,
  });

  return pdf;
}

export function createResumePdf(draftValue, layoutValue = {}) {
  const naturalPdf = renderResumePdf(draftValue, layoutValue, 1);
  const naturalLayout = naturalPdf.__resumeLayout;

  // If the content already fits on one page at scale 1, return as-is.
  if (naturalLayout.pageCount === 1) return naturalPdf;

  // Content overflows — try to shrink-to-fit onto a single page,
  // mirroring the live preview's binary-search scale approach.
  let low = MIN_SINGLE_PAGE_SCALE;
  let high = 1;

  // Verify the minimum scale actually fits; if not the resume is genuinely
  // multi-page and we return the natural render.
  const minScalePdf = renderResumePdf(draftValue, layoutValue, low);
  if (minScalePdf.__resumeLayout.pageCount !== 1) return naturalPdf;

  let bestPdf = minScalePdf;

  for (let index = 0; index < 12; index += 1) {
    const candidateScale = (low + high) / 2;
    const candidatePdf = renderResumePdf(draftValue, layoutValue, candidateScale);
    const candidateLayout = candidatePdf.__resumeLayout;
    if (candidateLayout.pageCount === 1) {
      low = candidateScale;
      bestPdf = candidatePdf;
    } else {
      high = candidateScale;
    }
  }

  return bestPdf;
}

const SEARCHABLE_SECTION_LABELS = Object.freeze({
  summary: "Professional summary",
  skills: "Skills",
  tools: "Tools",
  experience: "Experience",
  projects: "Projects",
  education: "Education",
  certifications: "Certifications",
  achievements: "Achievements",
  languages: "Languages",
});

function searchableResumeLines(draft, layout) {
  const lines = [
    draft.personal.fullName,
    draft.personal.headline,
    draft.personal.location,
    draft.personal.email,
    draft.personal.phone,
    draft.personal.linkedin,
    draft.personal.github,
    draft.personal.portfolio,
  ].filter(textExists);

  const addEntries = (section, entries, fields) => {
    const populated = entries.filter(hasEntryContent);
    if (!populated.length) return;
    lines.push(SEARCHABLE_SECTION_LABELS[section]);
    populated.forEach((item) => {
      fields.forEach((field) => {
        const value = typeof field === "function" ? field(item) : item[field];
        if (Array.isArray(value)) lines.push(...value.filter(textExists));
        else if (textExists(value)) lines.push(String(value));
      });
    });
  };

  layout.sectionOrder.forEach((section) => {
    if (layout.hiddenSections.includes(section)) return;
    if (section === "summary" && textExists(draft.summary)) {
      lines.push(SEARCHABLE_SECTION_LABELS.summary, draft.summary);
    } else if (section === "skills" && draft.skills.some(textExists)) {
      lines.push(SEARCHABLE_SECTION_LABELS.skills, draft.skills.filter(textExists).join(", "));
    } else if (section === "tools" && draft.tools.some(textExists)) {
      lines.push(SEARCHABLE_SECTION_LABELS.tools, draft.tools.filter(textExists).join(", "));
    } else if (section === "experience") {
      addEntries(section, draft.experience, ["role", "organization", "location", "startDate", "endDate", "highlights"]);
    } else if (section === "projects") {
      addEntries(section, draft.projects, ["name", "role", "technologies", "link", "startDate", "endDate", "highlights"]);
    } else if (section === "education") {
      addEntries(section, draft.education, ["degree", "field", "institution", "location", "score", "startDate", "endDate", "highlights"]);
    } else if (section === "certifications") {
      addEntries(section, draft.certifications, ["name", "issuer", "date", "credentialUrl"]);
    } else if (section === "achievements") {
      addEntries(section, draft.achievements, ["title", "description"]);
    } else if (section === "languages") {
      addEntries(section, draft.languages, ["name", "proficiency"]);
    }
  });

  return lines;
}

function toPdfSearchableLatin(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[\u2018\u2019]/gu, "'")
    .replace(/[\u201c\u201d]/gu, '"')
    .replace(/[\u2013\u2014]/gu, "-")
    .replace(/[^\u0020-\u00ff]/gu, " ");
}

async function waitForResumePreview(element) {
  if (!element || typeof element.getBoundingClientRect !== "function") {
    throw new Error("The resume preview is not ready yet. Please try again.");
  }

  const fonts = typeof document === "undefined" ? null : document.fonts;
  const selectedFontFamily = typeof getComputedStyle === "function"
    ? getComputedStyle(element).fontFamily
    : element.style?.getPropertyValue?.("--resume-font-family");
  if (fonts?.load && selectedFontFamily) {
    await Promise.all([
      fonts.load(`400 16px ${selectedFontFamily}`),
      fonts.load(`600 16px ${selectedFontFamily}`),
      fonts.load(`700 16px ${selectedFontFamily}`),
    ]).catch(() => {});
  }
  if (fonts?.ready) await fonts.ready.catch(() => {});

  const nextFrame = () => new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
  await nextFrame();
  await nextFrame();
}

function collectResumeLinks(element, paperBounds) {
  if (typeof element?.querySelectorAll !== "function") return [];

  const paperWidth = paperBounds.width || element.scrollWidth || PREVIEW_WIDTH_PX;
  const paperHeight = paperBounds.height || element.scrollHeight || (paperWidth * PAGE.height / PAGE.width);
  if (paperWidth <= 0 || paperHeight <= 0) return [];

  const scaleX = PAGE.width / paperWidth;
  const scaleY = PAGE.height / paperHeight;
  return Array.from(element.querySelectorAll("a[href]")).flatMap((anchor) => {
    const url = String(anchor.href || anchor.getAttribute?.("href") || "").trim();
    if (!/^(https?:|mailto:|tel:)/i.test(url)) return [];

    const clientRects = typeof anchor.getClientRects === "function"
      ? Array.from(anchor.getClientRects())
      : [anchor.getBoundingClientRect?.()].filter(Boolean);

    return clientRects.flatMap((rect) => {
      const left = Math.max(0, (rect.left - paperBounds.left) * scaleX);
      const top = Math.max(0, (rect.top - paperBounds.top) * scaleY);
      const right = Math.min(PAGE.width, (rect.right - paperBounds.left) * scaleX);
      const bottom = Math.min(PAGE.height, (rect.bottom - paperBounds.top) * scaleY);
      if (right <= left || bottom <= top) return [];
      return [{ x: left, y: top, width: right - left, height: bottom - top, url }];
    });
  });
}

export async function createResumePdfFromElement(element, draftValue, layoutValue = {}, options = {}) {
  await waitForResumePreview(element);

  const draft = normalizeResumeDraft(draftValue);
  const layout = normalizeResumeLayout(layoutValue);
  const bounds = element.getBoundingClientRect();
  const sourceWidth = Math.round(element.scrollWidth || bounds.width || PREVIEW_WIDTH_PX);
  const sourceHeight = Math.round(element.scrollHeight || bounds.height || sourceWidth * PAGE.height / PAGE.width);
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("The resume preview is still sizing. Please try again.");
  }
  const links = collectResumeLinks(element, bounds);

  const captureScale = Number.isFinite(Number(options.scale))
    ? Math.min(5, Math.max(1, Number(options.scale)))
    : Math.min(4, Math.max(2, 2000 / sourceWidth));
  const renderElement = options.renderElement || html2canvas;
  const captureId = `resume-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const previousCaptureId = element.getAttribute("data-resume-pdf-capture");
  element.setAttribute("data-resume-pdf-capture", captureId);

  let canvas;
  try {
    canvas = await renderElement(element, {
      backgroundColor: "#ffffff",
      scale: captureScale,
      useCORS: true,
      allowTaint: false,
      logging: false,
      imageTimeout: 15000,
      removeContainer: true,
      windowWidth: Math.max(typeof document === "undefined" ? sourceWidth : document.documentElement.clientWidth, sourceWidth + 32),
      windowHeight: Math.max(typeof document === "undefined" ? sourceHeight : document.documentElement.clientHeight, sourceHeight + 32),
      onclone: (clonedDocument) => {
        const clonedPaper = clonedDocument.querySelector(`[data-resume-pdf-capture="${captureId}"]`);
        const exportSurface = clonedPaper?.closest(".resume-pdf-export-surface");
        if (exportSurface) {
          exportSurface.style.position = "absolute";
          exportSurface.style.left = "0";
          exportSurface.style.top = "0";
        }
        if (clonedPaper) {
          clonedPaper.style.width = `${sourceWidth}px`;
          clonedPaper.style.boxShadow = "none";
        }
      },
    });
  } finally {
    if (previousCaptureId == null) element.removeAttribute("data-resume-pdf-capture");
    else element.setAttribute("data-resume-pdf-capture", previousCaptureId);
  }

  if (!canvas || typeof canvas.toDataURL !== "function") {
    throw new Error("The resume preview could not be captured. Please try again.");
  }

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true, precision: 12 });
  pdf.setProperties({
    title: `${draft.personal.fullName || "Professional"} Resume`,
    subject: draft.personal.headline || "Professional resume",
    author: draft.personal.fullName || "PrepMatrix user",
    creator: "PrepMatrix Resume Builder",
    keywords: "resume, curriculum vitae, professional profile",
  });
  pdf.addImage(canvas.toDataURL("image/png", 1), "PNG", 0, 0, PAGE.width, PAGE.height, undefined, "FAST");
  links.forEach(({ x, y, width, height, url }) => {
    pdf.link(x, y, width, height, { url });
  });

  // Keep the pixel-perfect browser rendering while preserving a searchable
  // Latin text layer. Other scripts remain intact in the visible capture and
  // are omitted here because jsPDF's built-in Helvetica is not Unicode-safe.
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(4.5);
  pdf.setTextColor(0, 0, 0);
  const searchableText = searchableResumeLines(draft, layout)
    .map(toPdfSearchableLatin)
    .join("\n");
  const searchableLines = pdf.splitTextToSize(searchableText, PAGE.width - 6);
  if (searchableLines.length) {
    pdf.text(searchableLines, 3, 3, {
      baseline: "top",
      lineHeightFactor: 1.05,
      renderingMode: "invisible",
    });
  }

  const visibleSectionCount = layout.sectionOrder.filter((section) => {
    if (layout.hiddenSections.includes(section)) return false;
    if (section === "summary") return textExists(draft.summary);
    if (section === "skills") return draft.skills.some(textExists);
    if (section === "tools") return draft.tools.some(textExists);
    return Array.isArray(draft[section]) && draft[section].some(hasEntryContent);
  }).length;

  Object.defineProperty(pdf, "__resumeLayout", {
    value: Object.freeze({
      contentBottom: PAGE.height,
      pageCount: 1,
      sectionCount: visibleSectionCount,
      renderScale: 1,
      renderMode: "preview-capture",
      captureScale,
      sourceWidth,
      sourceHeight,
      metrics: getResumePdfMetrics(layout),
    }),
    enumerable: false,
  });

  return pdf;
}

export function exportResumePdf(draft, layout) {
  const pdf = createResumePdf(draft, layout);
  pdf.save(getResumePdfFilename(draft));
  return pdf;
}
