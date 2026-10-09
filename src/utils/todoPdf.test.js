import assert from "node:assert/strict";
import test from "node:test";
import { createTodoPdf } from "./todoPdf.js";

const EXPORT_DATE = new Date(2026, 9, 9, 12);

function commands(pdf) {
  return pdf.internal.pages.slice(1).flat().join("\n");
}

function textBlocks(pdf) {
  return [...commands(pdf).matchAll(/BT\n([\s\S]*?)\nET/gu)].map((match) => match[1]);
}

test("to-do PDF exports every task with actual status, stable open-first order, and no input mutation", () => {
  const todos = [
    { id: "done-1", title: "Finished first", completed: true },
    { id: "open-1", title: "Still open first", completed: false },
    { id: "done-2", title: "Finished second", completed: true },
    { id: "open-2", title: "Still open second", completed: false },
  ];
  const before = JSON.stringify(todos);
  const pdf = createTodoPdf({ todos, generatedAt: EXPORT_DATE, learnerName: "Divyen R M" });
  const text = commands(pdf);

  assert.match(pdf.output(), /^%PDF-/u);
  assert.equal(pdf.getNumberOfPages(), 1);
  assert.ok(Math.abs(pdf.internal.pageSize.getWidth() - 210) < 0.01);
  assert.ok(Math.abs(pdf.internal.pageSize.getHeight() - 297) < 0.01);
  assert.match(text, /Exported 09 Oct 2026/u);
  assert.match(text, /Prepared for Divyen R M/u);
  const positions = ["Still open first", "Still open second", "Finished first", "Finished second"].map((title) => text.indexOf(title));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  for (const todo of todos) assert.equal(text.split(todo.title).length - 1, 1);
  // Summary labels appear once and status labels appear once for each task.
  assert.equal((text.match(/\(Completed\) Tj/gu) || []).length, 3);
  assert.equal((text.match(/\(Not completed\) Tj/gu) || []).length, 3);
  assert.match(pdf.output(), /\/Subject \(2 of 4 tasks completed\)/u);
  assert.equal(JSON.stringify(todos), before);
});

test("completed task badges use green text and unfinished task badges use neutral grey", () => {
  const pdf = createTodoPdf({ todos: [
    { title: "Green status task", completed: true },
    { title: "Grey status task", completed: false },
  ], generatedAt: EXPORT_DATE });
  const blocks = textBlocks(pdf);
  const doneBlock = blocks.filter((block) => block.includes("(Completed) Tj")).at(-1);
  const openBlock = blocks.filter((block) => block.includes("(Not completed) Tj")).at(-1);
  const rgb = (block) => block.match(/([\d.]+) ([\d.]+) ([\d.]+) rg/u)?.slice(1).map(Number);
  const green = rgb(doneBlock);
  const grey = rgb(openBlock);

  assert.ok(green && grey, "both status labels have explicit colors");
  assert.ok(green[1] > green[0] * 2 && green[1] > green[2], "completed badge text is green");
  assert.ok(Math.max(...grey) - Math.min(...grey) < 0.12, "not completed badge text is grey");
});

test("many wrapped tasks paginate with repeat table headings, complete data, and numbered footers", () => {
  const todos = Array.from({ length: 86 }, (_, index) => ({
    title: `TASK-${String(index).padStart(3, "0")} Review chapter concepts, solve practice questions, and write a concise explanation for the next study session.`,
    completed: index % 3 === 0,
  }));
  const pdf = createTodoPdf({ todos, generatedAt: EXPORT_DATE });
  const text = commands(pdf);
  const pageCount = pdf.getNumberOfPages();

  assert.ok(pageCount >= 5);
  for (let index = 0; index < todos.length; index += 1) {
    const marker = `TASK-${String(index).padStart(3, "0")}`;
    assert.equal(text.split(marker).length - 1, 1, `${marker} survives pagination exactly once`);
  }
  for (let page = 1; page <= pageCount; page += 1) {
    const pageText = pdf.internal.pages[page].join("\n");
    assert.match(pageText, /\(TASK\) Tj/u);
    assert.match(pageText, /\(STATUS\) Tj/u);
    assert.match(pageText, new RegExp(`Page ${page} of ${pageCount}`, "u"));
    if (page > 1) assert.match(pageText, /To-do list \\\(continued\\\)/u);
    for (const match of pageText.matchAll(/([\d.]+) ([\d.]+) Td/gu)) {
      const xMm = Number(match[1]) / pdf.internal.scaleFactor;
      const yMm = 297 - Number(match[2]) / pdf.internal.scaleFactor;
      assert.ok(xMm >= 17.9 && xMm <= 192.1, `text x ${xMm} remains inside the report margins`);
      assert.ok(yMm >= 17.9 && yMm <= 288.1, `text baseline ${yMm} remains inside the page`);
    }
  }
});

test("an exceptionally long task keeps every word and its status across pages without clipping", () => {
  const words = Array.from({ length: 1150 }, (_, index) => `word${String(index).padStart(4, "0")}`);
  const pdf = createTodoPdf({ todos: [
    { title: words.join(" "), completed: true },
  ], generatedAt: EXPORT_DATE });
  const text = commands(pdf);

  assert.ok(pdf.getNumberOfPages() > 3);
  for (const word of words) assert.equal(text.split(word).length - 1, 1, `${word} is preserved`);
  // The first page should hold a task fragment instead of wasting the entire
  // task area when the full title cannot fit on a single page.
  assert.match(pdf.internal.pages[1].join("\n"), /word0000/u);
  const titleLines = textBlocks(pdf).filter((block) => /\(word\d/gu.test(block));
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10.2);
  for (const block of titleLines) {
    const content = block.match(/\(([^)]*)\) Tj/u)[1];
    assert.ok(pdf.getTextWidth(content) <= 110.1, "wrapped title fits the task column");
    const position = block.match(/([\d.]+) ([\d.]+) Td/u);
    const yMm = 297 - Number(position[2]) / pdf.internal.scaleFactor;
    assert.ok(yMm >= 60 && yMm <= 272.1, "task text keeps clear of repeated headers and footer");
  }
  for (const page of pdf.internal.pages.slice(1)) {
    assert.match(page.join("\n"), /\(Completed\) Tj/u);
  }
});

test("empty and invalid task data generate a usable empty report, with safe date handling", () => {
  for (const input of [undefined, null, {}, { todos: null }, { todos: "not a list" }, { todos: [null, false, 2, "task", []] }]) {
    const pdf = createTodoPdf(input);
    assert.equal(pdf.getNumberOfPages(), 1);
    assert.match(commands(pdf), /No tasks to export\./u);
    assert.match(pdf.output(), /\/Subject \(0 of 0 tasks completed\)/u);
  }
  const pdf = createTodoPdf({ todos: [{ title: "", completed: "false" }], generatedAt: Symbol("invalid") });
  assert.match(commands(pdf), /Untitled task/u);
  assert.match(commands(pdf), /Date unavailable/u);
  assert.match(pdf.output(), /\/Subject \(0 of 1 tasks completed\)/u);
});

test("smart punctuation and control characters cannot introduce broken PDF text encoding", () => {
  const pdf = createTodoPdf({ todos: [
    { title: "Review – 2\u2011TB records… and \u2018indexes\u2019\u0000", completed: false },
  ], generatedAt: EXPORT_DATE });
  const text = commands(pdf);
  assert.match(text, /Review - 2-TB records\.\.\. and 'indexes'/u);
  assert.equal(text.includes(String.fromCharCode(0)), false);
});

test("unsupported scripts without browser fonts fail clearly rather than erase task titles", () => {
  assert.throws(() => createTodoPdf({ todos: [{ title: "தமிழ் பாடம்", completed: false }] }), /browser fonts/u);
});
