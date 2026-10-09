import { jsPDF } from "jspdf";

const PAGE = { width: 210, height: 297, margin: 18, bottom: 276 };
const TABLE = { numberX: 22, taskX: 34, taskWidth: 110, badgeX: 153, badgeWidth: 35 };
const COLORS = {
  ink: [28, 40, 53],
  muted: [103, 115, 128],
  accent: [15, 116, 92],
  rule: [225, 232, 236],
  header: [243, 247, 248],
  complete: { text: [26, 109, 66], fill: [225, 245, 232], border: [179, 221, 193] },
  incomplete: { text: [91, 102, 114], fill: [239, 242, 245], border: [215, 222, 228] },
};
const BODY_SIZE = 10.2;
const LINE_HEIGHT = 4.7;
const ROW_PADDING = 4;
const PIXELS_PER_POINT = 2;
const PIXELS_PER_MM = 72 / 25.4 * PIXELS_PER_POINT;
const TEXT_REPLACEMENTS = new Map([
  ["\u2010", "-"], ["\u2011", "-"], ["\u2012", "-"], ["\u2013", "-"], ["\u2014", "-"], ["\u2212", "-"],
  ["\u2018", "'"], ["\u2019", "'"], ["\u201c", '"'], ["\u201d", '"'], ["\u2026", "..."],
  ["\u2022", "-"], ["\u2190", "<-"], ["\u2192", "->"],
  ["\u2264", "<="], ["\u2265", ">="], ["\u2260", "!="],
]);

function normalizeText(value) {
  return Array.from(String(value ?? "").replace(/\r\n?/gu, "\n"), (character) => {
    if (character === "\n") return character;
    if (/\s/u.test(character)) return " ";
    if (character.codePointAt(0) < 32 || character.codePointAt(0) === 127) return "";
    if (TEXT_REPLACEMENTS.has(character)) return TEXT_REPLACEMENTS.get(character);
    return character;
  }).join("").trim();
}

function normalizedTasks(todos) {
  if (!Array.isArray(todos)) return [];
  const tasks = todos.filter((todo) => todo && typeof todo === "object" && !Array.isArray(todo)).map((todo) => ({
    title: normalizeText(typeof todo.title === "string" ? todo.title : "") || "Untitled task",
    completed: todo.completed === true,
  }));
  return [...tasks.filter((task) => !task.completed), ...tasks.filter((task) => task.completed)];
}

function exportDate(value) {
  if (value === null || value === "") return "Date unavailable";
  let date;
  try {
    date = value instanceof Date ? value : new Date(value);
  } catch {
    return "Date unavailable";
  }
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

// Browser font fallback preserves Indic/CJK text and emoji. Ordinary text stays
// selectable vector text; Helvetica must never receive unsupported characters.
function createTextWriter(pdf) {
  let measurementContext;

  function style(size, weight = "normal", color = COLORS.ink) {
    pdf.setFont("helvetica", weight);
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
  }

  function canvasContext() {
    if (measurementContext) return measurementContext;
    const canvas = globalThis.document?.createElement?.("canvas");
    measurementContext = canvas?.getContext?.("2d");
    if (!measurementContext) {
      throw new Error("This task contains characters that need browser fonts. Please export your to-do list from the app in a browser.");
    }
    return measurementContext;
  }

  function setCanvasFont(context, size, weight) {
    context.font = `${weight === "bold" ? "700" : "400"} ${size * PIXELS_PER_POINT}px Arial, "Nirmala UI", "Segoe UI", sans-serif`;
  }

  function unicodeLines(value, width, size, weight) {
    const context = canvasContext();
    setCanvasFont(context, size, weight);
    const maxWidth = width * PIXELS_PER_MM;
    const lines = [];
    const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

    value.split("\n").forEach((paragraph) => {
      let line = "";
      paragraph.trim().split(/\s+/u).forEach((word) => {
        const candidate = line ? `${line} ${word}` : word;
        if (context.measureText(candidate).width <= maxWidth) {
          line = candidate;
          return;
        }
        if (line) lines.push(line);
        line = "";
        const characters = segmenter ? Array.from(segmenter.segment(word), (entry) => entry.segment) : Array.from(word);
        characters.forEach((character) => {
          if (line && context.measureText(line + character).width > maxWidth) {
            lines.push(line);
            line = "";
          }
          line += character;
        });
      });
      lines.push(line);
    });
    return lines;
  }

  function prepare(value, width, size = BODY_SIZE, weight = "normal") {
    const text = normalizeText(value);
    const raster = Array.from(text).some((character) => character.codePointAt(0) > 255);
    style(size, weight);
    const lines = raster ? unicodeLines(text, width, size, weight) : pdf.splitTextToSize(text, width);
    return { lines: lines.length ? lines : [""], raster, width, size, weight };
  }

  function draw(prepared, lines, x, firstBaseline, color = COLORS.ink, lineHeight = LINE_HEIGHT) {
    if (!prepared.raster) {
      style(prepared.size, prepared.weight, color);
      lines.forEach((line, index) => pdf.text(line, x, firstBaseline + index * lineHeight));
      return;
    }

    const canvas = globalThis.document.createElement("canvas");
    const fontPixels = prepared.size * PIXELS_PER_POINT;
    const padding = 2;
    canvas.width = Math.ceil(prepared.width * PIXELS_PER_MM + padding * 2);
    canvas.height = Math.ceil(fontPixels * 1.35 + (lines.length - 1) * lineHeight * PIXELS_PER_MM);
    const context = canvas.getContext("2d");
    setCanvasFont(context, prepared.size, prepared.weight);
    context.fillStyle = `rgb(${color.join(",")})`;
    context.textBaseline = "alphabetic";
    lines.forEach((line, index) => context.fillText(line, padding, fontPixels + index * lineHeight * PIXELS_PER_MM));
    pdf.addImage(
      canvas.toDataURL("image/png"), "PNG", x - padding / PIXELS_PER_MM,
      firstBaseline - fontPixels / PIXELS_PER_MM,
      canvas.width / PIXELS_PER_MM, canvas.height / PIXELS_PER_MM, undefined, "FAST",
    );
  }

  return { style, prepare, draw };
}

/** Create a complete task report, independent of the UI's completed-task filter. */
export function createTodoPdf(options = {}) {
  const { todos = [], generatedAt = new Date(), learnerName = "" } = options && typeof options === "object" ? options : {};
  const tasks = normalizedTasks(todos);
  const completed = tasks.filter((task) => task.completed).length;
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const writer = createTextWriter(pdf);
  const width = PAGE.width - PAGE.margin * 2;
  const date = exportDate(generatedAt);
  // Prepare before drawing so unsupported browser fonts fail clearly and don't
  // produce a partial report containing question marks in place of task names.
  const rows = tasks.map((task) => ({ ...task, prepared: writer.prepare(task.title, TABLE.taskWidth) }));
  const learner = normalizeText(typeof learnerName === "string" ? learnerName : "");
  const learnerText = learner ? writer.prepare(`Prepared for ${learner}`, width, 9) : null;
  pdf.setProperties({
    title: "To-do list",
    subject: `${completed} of ${tasks.length} tasks completed`,
    author: "PrepMatrix AI",
    creator: "PrepMatrix AI",
  });

  function brand(continued = false) {
    pdf.setDrawColor(...COLORS.accent);
    pdf.setLineWidth(1);
    pdf.line(PAGE.margin, 15, PAGE.width - PAGE.margin, 15);
    writer.style(10, "bold", COLORS.accent);
    pdf.text("PrepMatrix AI", PAGE.margin, 24);
    writer.style(8, "normal", COLORS.muted);
    pdf.text("TO-DO REPORT", PAGE.width - PAGE.margin, 24, { align: "right" });
    writer.style(continued ? 16 : 24, "bold");
    pdf.text(continued ? "To-do list (continued)" : "To-do list", PAGE.margin, continued ? 36 : 40);
    writer.style(8.5, "normal", COLORS.muted);
    pdf.text(`Exported ${date}`, PAGE.margin, continued ? 44 : 49);
  }

  function summaryCard(x, y, value, label, tone) {
    const cardWidth = (width - 8) / 3;
    const fill = tone === "complete" ? [239, 250, 244] : [247, 249, 250];
    pdf.setFillColor(...fill);
    pdf.setDrawColor(...(tone === "complete" ? [204, 232, 216] : COLORS.rule));
    pdf.setLineWidth(0.25);
    pdf.roundedRect(x, y, cardWidth, 23, 2.5, 2.5, "FD");
    writer.style(17, "bold", tone === "complete" ? COLORS.complete.text : COLORS.ink);
    pdf.text(String(value), x + 5, y + 10);
    writer.style(8, "normal", COLORS.muted);
    pdf.text(label, x + 5, y + 18);
  }

  function tableHeader(y) {
    pdf.setFillColor(...COLORS.header);
    pdf.roundedRect(PAGE.margin, y, width, 10, 1.5, 1.5, "F");
    writer.style(8, "bold", COLORS.muted);
    pdf.text("NO.", TABLE.numberX, y + 6.4);
    pdf.text("TASK", TABLE.taskX, y + 6.4);
    pdf.text("STATUS", TABLE.badgeX + TABLE.badgeWidth / 2, y + 6.4, { align: "center" });
    return y + 10;
  }

  function badge(done, centerY) {
    const tone = done ? COLORS.complete : COLORS.incomplete;
    const top = centerY - 3.5;
    pdf.setFillColor(...tone.fill);
    pdf.setDrawColor(...tone.border);
    pdf.setLineWidth(0.25);
    pdf.roundedRect(TABLE.badgeX, top, TABLE.badgeWidth, 7, 3.5, 3.5, "FD");
    writer.style(8.1, "bold", tone.text);
    pdf.text(done ? "Completed" : "Not completed", TABLE.badgeX + TABLE.badgeWidth / 2, centerY + 1, { align: "center" });
  }

  brand();
  let summaryY = 57;
  if (learnerText) {
    // The report's tasks remain complete; unusually long display names use at
    // most three lines so the first page retains room for the task table.
    const lines = learnerText.lines.slice(0, 3);
    if (learnerText.lines.length > 3) {
      const finalLine = writer.prepare(`${lines[2]}...`, width, 9);
      lines[2] = finalLine.lines[0];
    }
    writer.draw(learnerText, lines, PAGE.margin, 56, COLORS.muted, 4.5);
    summaryY = 62 + (lines.length - 1) * 4.5;
  }
  const cardWidth = (width - 8) / 3;
  summaryCard(PAGE.margin, summaryY, tasks.length, "Total tasks", "total");
  summaryCard(PAGE.margin + cardWidth + 4, summaryY, completed, "Completed", "complete");
  summaryCard(PAGE.margin + (cardWidth + 4) * 2, summaryY, tasks.length - completed, "Not completed", "incomplete");
  writer.style(10, "bold");
  pdf.text("Your tasks", PAGE.margin, summaryY + 34);
  writer.style(8, "normal", COLORS.muted);
  pdf.text("Not completed tasks first", PAGE.width - PAGE.margin, summaryY + 34, { align: "right" });
  let y = tableHeader(summaryY + 39);

  function nextPage() {
    pdf.addPage();
    brand(true);
    y = tableHeader(51);
  }

  rows.forEach((row, index) => {
    const allLines = row.prepared.lines;
    let offset = 0;
    const fullHeight = Math.max(16, allLines.length * LINE_HEIGHT + ROW_PADDING * 2);
    // Keep normal tasks together. Oversized tasks continue over as many pages
    // as needed, repeating their row number and status to retain context.
    if (fullHeight <= PAGE.bottom - 61 && y + fullHeight > PAGE.bottom) nextPage();
    while (offset < allLines.length) {
      if (PAGE.bottom - y < 16) nextPage();
      const maxLines = Math.max(1, Math.floor((PAGE.bottom - y - ROW_PADDING * 2) / LINE_HEIGHT));
      const lines = allLines.slice(offset, offset + maxLines);
      const height = Math.max(16, lines.length * LINE_HEIGHT + ROW_PADDING * 2);
      pdf.setFillColor(...(row.completed ? [249, 253, 250] : index % 2 ? [250, 251, 252] : [255, 255, 255]));
      pdf.rect(PAGE.margin, y, width, height, "F");
      pdf.setDrawColor(...COLORS.rule);
      pdf.setLineWidth(0.2);
      pdf.line(PAGE.margin, y + height, PAGE.width - PAGE.margin, y + height);
      writer.style(8.5, "normal", COLORS.muted);
      pdf.text(String(index + 1), TABLE.numberX, y + 7.2);
      writer.draw(row.prepared, lines, TABLE.taskX, y + 7.2);
      badge(row.completed, y + Math.min(height / 2, 10));
      y += height;
      offset += lines.length;
      if (offset < allLines.length) nextPage();
    }
  });

  if (!rows.length) {
    writer.style(10, "normal", COLORS.muted);
    pdf.text("No tasks to export.", PAGE.margin + 5, y + 14);
  }

  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(...COLORS.rule);
    pdf.setLineWidth(0.25);
    pdf.line(PAGE.margin, 282, PAGE.width - PAGE.margin, 282);
    writer.style(8, "normal", COLORS.muted);
    pdf.text("PrepMatrix AI  |  To-do list", PAGE.margin, 288);
    pdf.text(`Page ${page} of ${pageCount}`, PAGE.width - PAGE.margin, 288, { align: "right" });
  }
  return pdf;
}
