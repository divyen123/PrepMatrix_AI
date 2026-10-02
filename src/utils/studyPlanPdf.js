import { jsPDF } from "jspdf";
import { formatScheduleDayHeading } from "./scheduleDates.js";
import {
  getPlannerSessionLabel,
  isPlannerTaskCompleted,
  isPlannerTaskRecheckPending,
} from "./plannerScheduleProgress.js";

const PAGE = { width: 210, height: 297, margin: 18, bottom: 277 };
const COLORS = {
  accent: [11, 123, 100],
  ink: [20, 31, 49],
  muted: [91, 106, 132],
  border: [218, 225, 232],
};
const TEXT_REPLACEMENTS = new Map([
  ["\u2010", "-"], ["\u2011", "-"], ["\u2012", "-"], ["\u2013", "-"], ["\u2014", "-"], ["\u2212", "-"],
  ["\u2018", "'"], ["\u2019", "'"], ["\u201c", '"'], ["\u201d", '"'], ["\u2026", "..."],
  ["\u2022", "-"], ["\u2190", "<-"], ["\u2192", "->"],
  ["\u2264", "<="], ["\u2265", ">="], ["\u2260", "!="], ["\u2248", "~"],
  ["\u221e", "infinity"], ["\u221a", "sqrt"],
  ["\u03b1", "alpha"], ["\u03b2", "beta"], ["\u03b3", "gamma"], ["\u03b4", "delta"],
  ["\u03b8", "theta"], ["\u03bb", "lambda"], ["\u03bc", "mu"], ["\u03c0", "pi"],
  ["\u03c3", "sigma"], ["\u0394", "Delta"], ["\u03a3", "Sigma"], ["\u03a9", "Omega"],
]);

// Match the other text PDFs: built-in Helvetica supports Latin-1, so normalize
// smart punctuation instead of allowing jsPDF to emit broken two-byte text.
function pdfSafeText(value) {
  return Array.from(String(value ?? "").replace(/\r\n?/gu, "\n"), (character) => {
    if (character === "\n") return character;
    if (/\s/u.test(character)) return " ";
    if (TEXT_REPLACEMENTS.has(character)) return TEXT_REPLACEMENTS.get(character);
    if (character.codePointAt(0) <= 255) return character;
    const decomposed = character.normalize("NFKD").replace(/\p{M}/gu, "");
    return [...decomposed].every((part) => part.codePointAt(0) <= 255) ? decomposed : "?";
  }).join("");
}

function studyTasks(day) {
  return Array.isArray(day?.tasks)
    ? day.tasks.filter((task) => typeof task?.task === "string" && task.task.trim())
    : [];
}

function isDone(task, completed) {
  return isPlannerTaskCompleted(task, completed) && !isPlannerTaskRecheckPending(task);
}

export function createStudyPlanPdf({
  schedule = [],
  completed = [],
  scheduleStartDate = "",
  historical = false,
} = {}) {
  const days = Array.isArray(schedule) ? schedule : [];
  const completion = Array.isArray(completed) ? completed : [];
  const tasks = days.flatMap(studyTasks);
  const doneCount = tasks.filter((task) => isDone(task, completion)).length;
  const title = historical ? "Previous study schedule" : "Study schedule";
  const summary = `${doneCount} of ${tasks.length} tasks ${historical ? "previously completed" : "complete"}`;
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const width = PAGE.width - PAGE.margin * 2;
  let y = PAGE.margin;
  let currentDayHeading = "";
  pdf.setProperties({ title, subject: summary, creator: "PrepMatrix AI" });

  function style(size, weight, color) {
    pdf.setFont("helvetica", weight);
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
  }

  function nextPage() {
    pdf.addPage();
    style(8, "normal", COLORS.muted);
    pdf.text(title, PAGE.margin, PAGE.margin);
    if (currentDayHeading) {
      pdf.text(`${currentDayHeading} (continued)`, PAGE.margin, PAGE.margin + 5);
    }
    y = PAGE.margin + (currentDayHeading ? 14 : 9);
  }

  function ensureSpace(height) {
    if (y + height > PAGE.bottom) nextPage();
  }

  function text(value, {
    size = 10,
    weight = "normal",
    color = COLORS.ink,
    indent = 0,
    gap = 2,
  } = {}) {
    style(size, weight, color);
    const lines = pdf.splitTextToSize(pdfSafeText(value), width - indent);
    const lineHeight = Math.max(3.5, size * 0.3528 * 1.3);
    for (const line of lines) {
      ensureSpace(lineHeight);
      // Continuation headers use a different font; restore the body style.
      style(size, weight, color);
      pdf.text(line, PAGE.margin + indent, y);
      y += lineHeight;
    }
    y += gap;
  }

  text("PrepMatrix AI", { size: 10, weight: "bold", color: COLORS.accent, gap: 3 });
  text(title, { size: 18, weight: "bold", gap: 3 });
  text(summary, { size: 10, color: COLORS.muted, gap: 7 });

  days.forEach((day, dayIndex) => {
    const dayTasks = studyTasks(day);
    currentDayHeading = "";
    // Keep each heading with at least its first task line or revision label.
    ensureSpace(21);
    currentDayHeading = formatScheduleDayHeading(day, dayIndex, scheduleStartDate);
    pdf.setDrawColor(...COLORS.border);
    pdf.line(PAGE.margin, y - 2, PAGE.width - PAGE.margin, y - 2);
    y += 4;
    text(currentDayHeading, { size: 12, weight: "bold", color: COLORS.accent, gap: 3 });

    if (!dayTasks.length) {
      text("Revision block", { color: COLORS.muted, gap: 5 });
      return;
    }

    dayTasks.forEach((task, taskIndex) => {
      // A normal row remains together; exceptionally long labels are continued
      // across pages with the day repeated instead of truncating any content.
      style(10, "normal", COLORS.ink);
      const label = `${taskIndex + 1}. ${task.task}`;
      const labelLines = pdf.splitTextToSize(pdfSafeText(label), width - 3);
      ensureSpace(Math.min(21, labelLines.length * 4.5864 + 8));
      text(label, { indent: 3, gap: 1 });
      const status = isDone(task, completion)
        ? historical ? "Previously completed" : "Completed"
        : historical ? "Not completed" : "Pending";
      const session = getPlannerSessionLabel(task.time);
      text(session ? `Session: ${session}  |  ${status}` : status, {
        size: 8.5,
        color: isDone(task, completion) ? COLORS.accent : COLORS.muted,
        indent: 3,
        gap: 5,
      });
    });
    y += 2;
  });

  if (!days.length) text("No study schedule to export.", { color: COLORS.muted });

  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    style(8, "normal", COLORS.muted);
    pdf.text(`PrepMatrix AI  |  Page ${page} of ${pageCount}`, PAGE.width / 2, PAGE.height - 10, { align: "center" });
  }
  return pdf;
}
