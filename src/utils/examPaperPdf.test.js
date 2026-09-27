import assert from "node:assert/strict";
import test from "node:test";
import { createExamCertificatePdf, createQuestionPaperPdf } from "./examPaperPdf.js";

const GOLD_RESULT = {
  attemptId: "certificate-layout-test",
  percentage: 95,
  score: 38,
  subjectName: "Operating Systems",
  submittedAt: "2026-07-13T00:00:00.000Z",
  title: "Operating Systems - 40 Question Exam",
  total: 40,
};

test("certificate PDF brands PrepMatrix AI and places the institution below the student", () => {
  const pdf = createExamCertificatePdf(GOLD_RESULT, {
    institutionName: "R.M.K Engineering College",
    studentName: "Divyen R M",
  });
  const pageCommands = pdf.internal.pages[1].join("\n");

  assert.match(pageCommands, /\(PrepMatrix AI\) Tj/);
  assert.match(pageCommands, /\(INSTITUTION:\) Tj/);
  assert.match(pageCommands, /\(R\.M\.K Engineering College\) Tj/);
  assert.doesNotMatch(pageCommands, /POWERED BY PREPMATRIX AI/);
  assert.ok(pageCommands.indexOf("(INSTITUTION:) Tj") > pageCommands.indexOf("(Divyen R M) Tj"));
});

test("question paper wraps text containing narrow spaces and nonbreaking hyphens", () => {
  const paper = {
    paperTitle: "Practice paper",
    questions: [{
      question: "Given a dataset of 1\u202fmillion records and 2\u2011TB of storage, which approach would you use to identify groups of similar records and why?",
      marks: 1,
      modelAnswer: "Use a method that scales to 1\u202fmillion records.",
    }],
  };
  const pdf = createQuestionPaperPdf(paper);
  const commands = pdf.internal.pages[1].join("\n");

  assert.equal(commands.includes(String.fromCharCode(0)), false);
  assert.match(commands, /1 million records and 2-TB of storage/u);
  const firstQuestionLine = commands.split("\n").find((line) => line.startsWith("(1. Given"));
  assert.ok(firstQuestionLine);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  assert.ok(pdf.getTextWidth(firstQuestionLine.slice(1, -4)) <= 174);

  const answerKeyCommands = createQuestionPaperPdf(paper, { answerKey: true }).internal.pages[1].join("\n");
  assert.equal(answerKeyCommands.includes(String.fromCharCode(0)), false);
  assert.match(answerKeyCommands, /scales to 1 million records/u);
});
