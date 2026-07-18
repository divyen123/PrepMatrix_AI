import assert from "node:assert/strict";
import test from "node:test";
import { createExamCertificatePdf } from "./examPaperPdf.js";

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
