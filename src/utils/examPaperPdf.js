import jsPDF from "jspdf";

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
    pdf.setFont("helvetica", style);
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
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
