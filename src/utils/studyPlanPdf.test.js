import assert from "node:assert/strict";
import test from "node:test";
import { createStudyPlanPdf } from "./studyPlanPdf.js";

function pdfText(pdf) {
  return pdf.internal.pages.flat().join("\n");
}

test("current plan PDF exports the displayed schedule, dates, sessions, and reopened task status", () => {
  const schedule = [{ day: 1, tasks: [
    { id: "done-id", task: "Databases - Index design", time: "Morning · 45 min" },
    { task: "Databases - Recovery", time: "Evening", recheckPending: true },
    { task: "Networks - Routing" },
  ] }];
  const before = JSON.stringify(schedule);
  const pdf = createStudyPlanPdf({
    schedule,
    completed: [{ taskId: "done-id" }, "Databases - Recovery", "Unrelated previous task"],
    scheduleStartDate: "2026-10-02",
  });
  const text = pdfText(pdf);

  assert.match(pdf.output(), /^%PDF-/u);
  assert.match(text, /\(Study schedule\) Tj/u);
  assert.match(text, /1 of 3 tasks complete/u);
  assert.match(text, /Day 1 - 02\/10\/2026/u);
  assert.match(text, /Databases - Index design/u);
  assert.match(text, /Session: Morning {2}\| {2}Completed/u);
  assert.doesNotMatch(text, /45 min/u);
  assert.match(text, /Session: Evening {2}\| {2}Pending/u);
  assert.match(text, /\(Pending\) Tj/u);
  assert.doesNotMatch(text, /Unrelated previous task|previously completed/u);
  assert.equal(JSON.stringify(schedule), before);
});

test("previous plan PDF uses only supplied archive facts and past completion labels", () => {
  const pdf = createStudyPlanPdf({
    historical: true,
    schedule: [{ day: 7, date: "2026-09-19", tasks: [
      { task: "Archived subject - Finished", time: "Afternoon" },
      { task: "Archived subject - Reopened", recheckPending: true },
      { task: "Archived subject - Unfinished" },
    ] }],
    completed: ["Archived subject - Finished", "Archived subject - Reopened", "Live subject - Finished"],
    scheduleStartDate: "2026-10-02",
  });
  const text = pdfText(pdf);

  assert.match(text, /Previous study schedule/u);
  assert.match(text, /1 of 3 tasks previously completed/u);
  assert.match(text, /Day 7 - 19\/09\/2026/u);
  assert.match(text, /Session: Afternoon {2}\| {2}Previously completed/u);
  assert.equal((text.match(/\(Not completed\) Tj/gu) || []).length, 2);
  assert.doesNotMatch(text, /Live subject|Pending|02\/10\/2026/u);
});

test("all days, tasks, and revision blocks survive multipage PDF export", () => {
  const schedule = Array.from({ length: 38 }, (_, index) => ({
    day: index + 1,
    tasks: index === 13 ? [] : Array.from({ length: 6 }, (_, taskIndex) => ({
      task: `SUBJECT-${index + 1} - TASK-${taskIndex + 1}-END`,
      time: "Morning",
    })),
  }));
  const pdf = createStudyPlanPdf({ schedule, scheduleStartDate: "2026-09-01" });
  const text = pdfText(pdf);
  assert.ok(pdf.getNumberOfPages() > 5);
  assert.ok(Math.abs(pdf.internal.pageSize.getWidth() - 210) < 0.01);
  assert.ok(Math.abs(pdf.internal.pageSize.getHeight() - 297) < 0.01);
  assert.match(text, /Revision block/u);
  assert.match(text, /Day 14 - 14\/09\/2026/u);
  assert.match(text, /Day 38 - 08\/10\/2026/u);
  for (const day of schedule) {
    for (const task of day.tasks) {
      assert.equal(text.split(task.task).length - 1, 1, `${task.task} must appear once`);
    }
  }
  for (let page = 1; page <= pdf.getNumberOfPages(); page += 1) {
    const pageText = pdf.internal.pages[page].join("\n");
    assert.match(pageText, new RegExp(`Page ${page} of ${pdf.getNumberOfPages()}`, "u"));
  }
});

test("an exceptionally long task spans pages without losing wrapped text or its status", () => {
  const words = Array.from({ length: 1300 }, (_, index) => `token${String(index).padStart(4, "0")}`);
  const pdf = createStudyPlanPdf({
    historical: true,
    schedule: [{ day: 1, tasks: [{ task: words.join(" "), time: "Night" }] }],
    completed: [words.join(" ")],
  });
  const text = pdfText(pdf);
  assert.ok(pdf.getNumberOfPages() > 2);
  for (const word of words) assert.equal(text.split(word).length - 1, 1, `${word} must appear once`);
  assert.match(text, /Day 1 \\\(continued\\\)/u);
  assert.match(text, /Session: Night {2}\| {2}Previously completed/u);

  // Every body text origin stays inside the page margins; text is selectable
  // PDF commands rather than an image of the scrolled popup.
  for (const page of pdf.internal.pages.slice(1)) {
    const commands = page.join("\n");
    assert.doesNotMatch(commands, /\/I\d+ Do/u);
    for (const match of commands.matchAll(/([\d.]+) ([\d.]+) Td/gu)) {
      const yMm = 297 - Number(match[2]) / pdf.internal.scaleFactor;
      assert.ok(yMm >= 17.9 && yMm <= 287.1, `text baseline ${yMm} stays on A4`);
    }
  }
});

test("PDF normalizes smart punctuation before wrapping and tolerates absent schedule data", () => {
  const pdf = createStudyPlanPdf({ schedule: [{ tasks: [{ task: "Data – 1\u202fmillion records and 2\u2011TB of storage…" }] }] });
  const text = pdfText(pdf);
  assert.match(text, /Data - 1 million records and 2-TB of storage\.\.\./u);
  assert.equal(text.includes(String.fromCharCode(0)), false);
  assert.match(pdfText(createStudyPlanPdf({ schedule: null, completed: null })), /0 of 0 tasks complete/u);
  assert.match(pdfText(createStudyPlanPdf()), /No study schedule to export\./u);
});
