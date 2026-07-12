import { jsPDF } from "jspdf";
import {
  formatExamPercentage,
  getExamCertificate,
  getExamCertificateId,
} from "./examCertificate.js";

const PAGE = { width: 210, height: 297, left: 18, right: 18, top: 18, bottom: 18 };

function cleanFilename(value, fallback) {
  const cleaned = String(value || fallback)
    .trim()
    .replace(/[^a-z0-9-_]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

function asText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function questionText(question) {
  return asText(question?.question || question?.text || question?.prompt, "Untitled question");
}

function questionMarks(question) {
  return Number(question?.marks || question?.mark || question?.points || 0);
}

function paperQuestions(paper) {
  if (Array.isArray(paper?.questions)) return paper.questions;
  if (!Array.isArray(paper?.sections)) return [];
  return paper.sections.flatMap((section) =>
    (section?.questions || []).map((question) => ({
      ...question,
      sectionTitle: question.sectionTitle || section.title || section.name,
      marks: question.marks || section.marksPerQuestion || section.marks,
    })),
  );
}

function createWriter(pdf) {
  let y = PAGE.top;
  let pageNumber = 1;
  const usableWidth = PAGE.width - PAGE.left - PAGE.right;

  const footer = () => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(110, 120, 135);
    pdf.text(`PrepMatrix AI  |  Page ${pageNumber}`, PAGE.width / 2, PAGE.height - 9, { align: "center" });
  };

  const newPage = () => {
    footer();
    pdf.addPage();
    pageNumber += 1;
    y = PAGE.top;
  };

  const ensure = (height) => {
    if (y + height > PAGE.height - PAGE.bottom) newPage();
  };

  const text = (value, options = {}) => {
    const {
      size = 10,
      style = "normal",
      color = [31, 41, 55],
      indent = 0,
      gap = 2.5,
      lineHeight = 1.25,
    } = options;
    const applyTextStyle = () => {
      pdf.setFont("helvetica", style);
      pdf.setFontSize(size);
      pdf.setTextColor(...color);
    };
    applyTextStyle();
    const lines = [...pdf.splitTextToSize(asText(value), usableWidth - indent)];
    const lineHeightMm = Math.max(size * 0.3528 * lineHeight, 3.2);
    while (lines.length) {
      let available = PAGE.height - PAGE.bottom - y - gap;
      let maxLines = Math.floor(available / lineHeightMm);
      if (maxLines < 1) {
        newPage();
        available = PAGE.height - PAGE.bottom - y - gap;
        maxLines = Math.max(1, Math.floor(available / lineHeightMm));
      }
      const pageLines = lines.splice(0, maxLines);
      applyTextStyle();
      pdf.text(pageLines, PAGE.left + indent, y);
      y += pageLines.length * lineHeightMm + gap;
      if (lines.length) newPage();
    }
  };

  const rule = () => {
    ensure(6);
    pdf.setDrawColor(210, 215, 224);
    pdf.line(PAGE.left, y, PAGE.width - PAGE.right, y);
    y += 6;
  };

  const space = (amount = 4) => {
    ensure(amount);
    y += amount;
  };

  const finish = () => footer();

  return { text, rule, space, finish };
}

function addPaperHeading(writer, paper, answerKey) {
  const title = paper?.paperTitle || paper?.title || "Generated Question Paper";
  const institution = paper?.institutionName || paper?.institution || "PrepMatrix AI";
  const subjects = paper?.subjects || paper?.subjectNames || paper?.subjectName || [];
  const subjectLine = Array.isArray(subjects) ? subjects.join(", ") : subjects;
  const totalMarks = paper?.totalMarks || paper?.marks || "-";
  const duration = paper?.recommendedTimeMinutes || paper?.durationMinutes || paper?.recommendedDuration || paper?.maxTimeMinutes || "-";

  writer.text(institution, { size: 10, style: "bold", color: [11, 143, 116], gap: 3 });
  writer.text(answerKey ? `${title} - Answer Key & Marking Scheme` : title, { size: 17, style: "bold", gap: 4 });
  writer.text(`Subject: ${subjectLine || "General"}    Total marks: ${totalMarks}    Time: ${duration} minutes`, {
    size: 9,
    color: [83, 96, 116],
    gap: 4,
  });
  if (!answerKey && paper?.instructions) {
    writer.text(`Instructions: ${paper.instructions}`, { size: 9, color: [83, 96, 116] });
  }
  writer.rule();
}

export function exportQuestionPaperPdf(paper, { answerKey = false } = {}) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const writer = createWriter(pdf);
  const questions = paperQuestions(paper);
  let lastSection = "";

  addPaperHeading(writer, paper, answerKey);

  questions.forEach((question, index) => {
    const section = question.sectionTitle || `${questionMarks(question) || "-"} mark questions`;
    if (section !== lastSection) {
      if (lastSection) writer.space(3);
      writer.text(section, { size: 11, style: "bold", color: [11, 123, 100], gap: 3 });
      lastSection = section;
    }

    writer.text(`${index + 1}. ${questionText(question)}  [${questionMarks(question) || "-"}]`, {
      size: 10,
      style: "bold",
      gap: 2,
    });

    const options = question?.options || question?.choices;
    if (Array.isArray(options) && !answerKey) {
      options.forEach((option, optionIndex) => {
        const label = String.fromCharCode(65 + optionIndex);
        writer.text(`${label}. ${asText(option?.text ?? option)}`, { size: 9, indent: 5, gap: 1.5 });
      });
    }

    if (answerKey) {
      const answer = question?.modelAnswer ?? question?.answer ?? question?.correctAnswer ?? question?.correctOption;
      const explanation = question?.explanation || question?.markingScheme;
      writer.text(`Answer: ${asText(answer, "Model answer not supplied.")}`, {
        size: 9,
        color: [23, 110, 86],
        indent: 5,
        gap: 1.5,
      });
      if (explanation) {
        writer.text(`Marking guidance: ${asText(explanation)}`, { size: 8.5, color: [83, 96, 116], indent: 5 });
      }
    }
    writer.space(2.5);
  });

  if (questions.length === 0) {
    writer.text("No questions were included in this paper.", { color: [83, 96, 116] });
  }

  writer.finish();
  const suffix = answerKey ? "Answer_Key" : "Question_Paper";
  pdf.save(`${cleanFilename(paper?.paperTitle || paper?.title, "PrepMatrix")}_${suffix}.pdf`);
}

export function exportExamResultPdf(result) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const writer = createWriter(pdf);
  const questions = result?.questions || result?.review || [];
  const score = result?.score ?? result?.correctCount ?? 0;
  const total = result?.totalQuestions ?? result?.total ?? questions.length ?? 40;
  const subject = result?.subjectName || result?.subject || result?.exam?.subjectName || "Exam";

  writer.text("PrepMatrix AI", { size: 10, style: "bold", color: [11, 143, 116], gap: 3 });
  writer.text(`${subject} - Exam Result`, { size: 17, style: "bold", gap: 3 });
  writer.text(`Score: ${score}/${total}    Percentage: ${Math.round((Number(score) / Math.max(Number(total), 1)) * 100)}%`, {
    size: 10,
    color: [83, 96, 116],
  });
  writer.rule();

  questions.forEach((question, index) => {
    writer.text(`${index + 1}. ${questionText(question)}`, { size: 10, style: "bold", gap: 2 });
    writer.text(`Your answer: ${asText(question?.selectedAnswer ?? question?.userAnswer, "Not answered")}`, {
      size: 9,
      indent: 5,
      color: question?.isCorrect ? [23, 110, 86] : [184, 50, 75],
      gap: 1.5,
    });
    writer.text(`Correct answer: ${asText(question?.correctAnswer ?? question?.answer, "Not supplied")}`, {
      size: 9,
      indent: 5,
      color: [23, 110, 86],
      gap: 1.5,
    });
    if (question?.explanation) writer.text(question.explanation, { size: 8.5, indent: 5, color: [83, 96, 116] });
    writer.space(2.5);
  });

  writer.finish();
  pdf.save(`${cleanFilename(subject, "Exam")}_Result.pdf`);
}

function formatCertificateDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Date not available";
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function drawCertificateBadge(pdf, certificate, centerX, centerY) {
  const { primary, dark, light } = certificate.colors;

  pdf.setFillColor(...dark);
  pdf.triangle(centerX - 19, centerY + 17, centerX - 5, centerY + 13, centerX - 13, centerY + 44, "F");
  pdf.triangle(centerX + 19, centerY + 17, centerX + 5, centerY + 13, centerX + 13, centerY + 44, "F");

  pdf.setFillColor(...light);
  pdf.setDrawColor(...primary);
  pdf.setLineWidth(2.2);
  pdf.circle(centerX, centerY, 27, "FD");
  pdf.setFillColor(...primary);
  pdf.setDrawColor(...dark);
  pdf.setLineWidth(0.8);
  pdf.circle(centerX, centerY, 21, "FD");
  pdf.setDrawColor(255, 255, 255);
  pdf.setLineWidth(0.45);
  pdf.circle(centerX, centerY, 17, "S");

  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(certificate.label.length > 6 ? 12 : 14);
  pdf.text(certificate.label.toUpperCase(), centerX, centerY - 1.5, { align: "center" });
  pdf.setFontSize(6.5);
  pdf.text("ACHIEVEMENT", centerX, centerY + 7, { align: "center" });
}

export function createExamCertificatePdf(result, options = {}) {
  const certificate = getExamCertificate(result);
  if (!certificate) return null;

  const studentName = asText(options.studentName, "PrepMatrix Student").trim() || "PrepMatrix Student";
  const institutionName = asText(options.institutionName, "PrepMatrix AI").trim() || "PrepMatrix AI";
  const subject = result?.subjectName || result?.subject || result?.exam?.subjectName || "Online Exam";
  const examTitle = result?.title || result?.examTitle || `${subject} Online Exam`;
  const score = Number(result?.score ?? result?.correctCount ?? 0);
  const total = Number(result?.total ?? result?.totalQuestions ?? 40);
  const percentage = formatExamPercentage(result);
  const certificateId = getExamCertificateId(result);
  const issuedDate = formatCertificateDate(result?.submittedAt);
  const { primary, dark, light } = certificate.colors;

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentLeft = 28;
  const contentWidth = 185;
  const badgeX = 249;

  pdf.setProperties({
    title: `${certificate.label} Certificate - ${studentName}`,
    subject: `${examTitle} achievement certificate`,
    author: "PrepMatrix AI",
    creator: "PrepMatrix AI",
  });

  pdf.setFillColor(253, 252, 247);
  pdf.rect(0, 0, pageWidth, pageHeight, "F");
  pdf.setFillColor(...light);
  pdf.rect(0, 0, 9, pageHeight, "F");
  pdf.setFillColor(...primary);
  pdf.rect(9, 0, 2.2, pageHeight, "F");

  pdf.setDrawColor(...primary);
  pdf.setLineWidth(1.5);
  pdf.roundedRect(15, 13, pageWidth - 30, pageHeight - 26, 3, 3, "S");
  pdf.setDrawColor(...dark);
  pdf.setLineWidth(0.35);
  pdf.roundedRect(19, 17, pageWidth - 38, pageHeight - 34, 2, 2, "S");

  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...dark);
  pdf.setFontSize(10);
  pdf.text(institutionName.toUpperCase(), contentLeft, 32);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(91, 101, 117);
  pdf.setFontSize(7.5);
  pdf.text("POWERED BY PREPMATRIX AI", contentLeft, 39);

  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...dark);
  pdf.setFontSize(28);
  pdf.text("CERTIFICATE", contentLeft, 65);
  pdf.setFontSize(14);
  pdf.setTextColor(...primary);
  pdf.text("OF ACHIEVEMENT", contentLeft, 76);

  pdf.setDrawColor(...primary);
  pdf.setLineWidth(0.8);
  pdf.line(contentLeft, 83, contentLeft + 64, 83);

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(91, 101, 117);
  pdf.setFontSize(9);
  pdf.text("This certificate is proudly presented to", contentLeft, 96);

  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(26, 34, 48);
  pdf.setFontSize(studentName.length > 32 ? 21 : 25);
  const studentLines = pdf.splitTextToSize(studentName, contentWidth);
  pdf.text(studentLines.slice(0, 2), contentLeft, 110);
  const nameBottom = 110 + Math.max(0, studentLines.slice(0, 2).length - 1) * 9;

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(91, 101, 117);
  pdf.setFontSize(9);
  pdf.text("for successfully completing the assessment", contentLeft, nameBottom + 13);

  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...dark);
  pdf.setFontSize(13);
  const titleLines = pdf.splitTextToSize(examTitle, contentWidth);
  pdf.text(titleLines.slice(0, 2), contentLeft, nameBottom + 27);
  const titleBottom = nameBottom + 27 + Math.max(0, titleLines.slice(0, 2).length - 1) * 5.5;

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(76, 86, 102);
  pdf.setFontSize(9);
  pdf.text(
    `with a score of ${score}/${total} (${percentage}%), earning the ${certificate.label} achievement badge.`,
    contentLeft,
    titleBottom + 12,
  );

  drawCertificateBadge(pdf, certificate, badgeX, 82);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...dark);
  pdf.setFontSize(12);
  pdf.text(`${certificate.label} Certificate`, badgeX, 132, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(91, 101, 117);
  pdf.setFontSize(8);
  pdf.text(`${percentage}% achievement`, badgeX, 141, { align: "center" });

  pdf.setDrawColor(208, 213, 221);
  pdf.setLineWidth(0.35);
  pdf.line(contentLeft, 171, pageWidth - 28, 171);

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(91, 101, 117);
  pdf.setFontSize(7.5);
  pdf.text("AWARDED FOR", contentLeft, 180);
  pdf.text("COMPLETION DATE", 111, 180);
  pdf.text("CERTIFICATE ID", 198, 180);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(36, 46, 62);
  pdf.setFontSize(8.5);
  pdf.text(subject, contentLeft, 189, { maxWidth: 72 });
  pdf.text(issuedDate, 111, 189);
  pdf.text(certificateId, 198, 189);

  return pdf;
}

export function exportExamCertificatePdf(result, options = {}) {
  const certificate = getExamCertificate(result);
  const pdf = createExamCertificatePdf(result, options);
  if (!certificate || !pdf) return false;

  const studentName = options.studentName || "PrepMatrix Student";
  const subject = result?.subjectName || result?.subject || "Exam";
  pdf.save(`${cleanFilename(studentName, "Student")}_${cleanFilename(subject, "Exam")}_${certificate.label}_Certificate.pdf`);
  return true;
}
