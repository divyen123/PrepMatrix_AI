import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import {
  parseSubjectContentCsv, parseSubjectContentFile, parseSubjectContentText,
  prepareSubjectContentImport, SUBJECT_IMPORT_MAX_FILE_BYTES,
} from "./subjectContentImport.js";

function workbookFile(sheets, bookType = "xlsx") {
  const workbook = XLSX.utils.book_new();
  sheets.forEach(([name, rows]) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name));
  return new File([XLSX.write(workbook, { bookType, type: "array" })], `content.${bookType}`);
}

test("bulk paste reads bullets, numeric lists, chapter headings and Roman units without changing names", () => {
  const input = "\uFEFF  1. Number basics\r\n• Arrays\r\nChapter 3: Memory management\nUnit IV — Scheduling\n5) தமிழ் பெயர்\n\n* 3.14 and derivatives";
  assert.deepEqual(parseSubjectContentText(input).items, [
    { number: 1, title: "Number basics" }, { number: null, title: "Arrays" },
    { number: 3, title: "Memory management" }, { number: 4, title: "Scheduling" },
    { number: 5, title: "தமிழ் பெயர்" }, { number: null, title: "3.14 and derivatives" },
  ]);
  const longTitle = "X".repeat(121);
  assert.equal(parseSubjectContentText(longTitle).items[0].title, longTitle);
  assert.match(parseSubjectContentText(" \n\n", { target: "topics" }).warnings[0], /No topics/u);
  assert.deepEqual(parseSubjectContentText("1.Intro\n2)Processes").items, [{ number: 1, title: "Intro" }, { number: 2, title: "Processes" }]);
  assert.deepEqual(parseSubjectContentText("Chapter 1").items, [{ number: 1, title: "" }]);
  assert.throws(() => parseSubjectContentText("X".repeat(1_000_001)), /too large/u);
  assert.throws(() => parseSubjectContentText(Array.from({ length: 1001 }, (_, n) => `Title ${n}`).join("\n")), /more than 1000 entries/u);
});

test("CSV reads the requested title column, UTF-8 BOM, escaped quotes and quoted multiline names", () => {
  const csv = '\uFEFFNumber,Chapter name,Topic name\r\n1,"Arrays, lists","Dynamic arrays"\r\n2,"Memory ""basics""\ncontinued","Pointers"\r\n3,,"Reference counting"';
  const chapters = parseSubjectContentCsv(csv);
  assert.deepEqual(chapters.items, [
    { number: 1, title: "Arrays, lists" }, { number: 2, title: 'Memory "basics" continued' },
  ]);
  assert.match(chapters.warnings[0], /1 row has no chapter name/u);
  assert.deepEqual(parseSubjectContentCsv(csv, { target: "topics" }).items, [
    { number: 1, title: "Dynamic arrays" }, { number: 2, title: "Pointers" }, { number: 3, title: "Reference counting" },
  ]);
});

test("CSV supports tab and semicolon delimiters and requires clear headers for ambiguous columns", () => {
  assert.deepEqual(parseSubjectContentCsv("Chapter no;Chapter title\n1;Scheduling\n2;Concurrency").items, [
    { number: 1, title: "Scheduling" }, { number: 2, title: "Concurrency" },
  ]);
  assert.deepEqual(parseSubjectContentCsv("Topic name\tDescription\nLocks\tA description", { target: "topics" }).items, [
    { number: null, title: "Locks" },
  ]);
  assert.deepEqual(parseSubjectContentCsv("1,Intro\n2,Processes").items, [
    { number: 1, title: "Intro" }, { number: 2, title: "Processes" },
  ]);
  assert.equal(parseSubjectContentCsv("Intro\nProcesses").items.length, 2);
  assert.throws(() => parseSubjectContentCsv("Intro,Details,Teacher\nProcesses,More,Other"), /recognizable headers/u);
  assert.throws(() => parseSubjectContentCsv("Topic name\nLocks", { target: "chapters" }), /No chapter name column/u);
  assert.throws(() => parseSubjectContentCsv("Number,Description\n1,Notes"), /Add a Chapter name/u);
  const mixedHeaders = "Topic number,Chapter,Topic name,Chapter name\n9,2,Locks,Concurrency";
  assert.deepEqual(parseSubjectContentCsv(mixedHeaders).items, [{ number: 2, title: "Concurrency" }]);
  assert.deepEqual(parseSubjectContentCsv(mixedHeaders, { target: "topics" }).items, [{ number: 9, title: "Locks" }]);
});

test("malformed CSV rejects rather than discarding or merging malformed entries", () => {
  assert.throws(() => parseSubjectContentCsv('Name\n"Unclosed'), /unclosed/u);
  assert.throws(() => parseSubjectContentCsv('Name\n"A"unexpected'), /closing quote/u);
  assert.throws(() => parseSubjectContentCsv('Name\nA"B'), /inside an unquoted/u);
  const invalid = parseSubjectContentCsv("Chapter number,Chapter name\nnot-a-number,Intro");
  assert.ok(Number.isNaN(invalid.items[0].number));
  assert.equal(prepareSubjectContentImport(invalid.items, { chapterCount: 3 }).canApply, false);
});

test("real XLSX and legacy XLS files import with target-aware sheet selection", async () => {
  const sheets = [
    ["Chapters", [["Chapter number", "Chapter name"], [1, "Arrays"], [2, "தமிழ் பெயர்"]]],
    ["Topics", [["Topic name"], ["Pointers"], ["Locks"]]],
  ];
  for (const type of ["xlsx", "xls"]) {
    const file = workbookFile(sheets, type);
    const chapters = await parseSubjectContentFile(file);
    assert.deepEqual(chapters.items, [{ number: 1, title: "Arrays" }, { number: 2, title: "தமிழ் பெயர்" }]);
    assert.match(chapters.warnings.join(" "), /Other sheets were not included/u);
    assert.deepEqual((await parseSubjectContentFile(file, { target: "topics" })).items, [
      { number: null, title: "Pointers" }, { number: null, title: "Locks" },
    ]);
  }
});

test("Excel combines meaningful sheets and reports unrelated or missing target columns", async () => {
  const combined = workbookFile([
    ["Semester 1", [["Number", "Name"], [1, "Basics"]]],
    ["Semester 2", [["Number", "Name"], [2, "Advanced"]]],
    ["Empty", []],
    ["Other", [["Topic name"], ["Pointers"]]],
  ]);
  const result = await parseSubjectContentFile(combined);
  assert.deepEqual(result.items, [{ number: 1, title: "Basics" }, { number: 2, title: "Advanced" }]);
  assert.match(result.warnings.join(" "), /Sheet not included/u);
  assert.match(result.warnings.join(" "), /Combined 3 populated sheets/u);
  await assert.rejects(() => parseSubjectContentFile(workbookFile([["Sheet1", [["Topic name"], ["Pointers"]]]])), /No chapter name column/u);
  assert.equal((await parseSubjectContentFile(workbookFile([["Sheet1", []]]))).items.length, 0);
});

test("file import rejects invalid, oversized, unsupported and excessive workbook data", async () => {
  assert.deepEqual((await parseSubjectContentFile(new File(["Name\nIntro"], "names.csv"))).items, [{ number: null, title: "Intro" }]);
  await assert.rejects(() => parseSubjectContentFile(new File(["wrong data"], "names.xlsx")), /not a valid Excel/u);
  await assert.rejects(() => parseSubjectContentFile(new File([new Uint8Array(SUBJECT_IMPORT_MAX_FILE_BYTES + 1)], "names.csv")), /too large/u);
  await assert.rejects(() => parseSubjectContentFile(new File(["Intro"], "names.txt")), /Unsupported/u);
  await assert.rejects(() => parseSubjectContentFile(null), /Choose a CSV/u);
  const oversizedWorkbook = workbookFile([["Sheet1", [["Name"], ...Array.from({ length: 1001 }, (_, index) => [`Task ${index}`])]]]);
  await assert.rejects(() => parseSubjectContentFile(oversizedWorkbook), /more than 1,000/u);
});

test("preview maps unnumbered names consistently and preserves untouched chapter names", () => {
  const items = [{ number: null, title: "A" }, { number: 3, title: "C" }, { number: null, title: "B" }];
  const preview = prepareSubjectContentImport(items, { chapterCount: 5, chapterNames: ["", "", "", "Existing"] });
  assert.deepEqual(preview.rows.map((row) => row.number), [1, 3, 2]);
  assert.deepEqual(preview.nextChapterNames, ["A", "B", "C", "Existing"]);
  assert.equal(preview.canApply, true);
  assert.equal(preview.addedCount, 3);
  assert.deepEqual(items, [{ number: null, title: "A" }, { number: 3, title: "C" }, { number: null, title: "B" }]);
  assert.deepEqual(prepareSubjectContentImport([{ title: "E" }, { title: "F" }], { chapterCount: 10, startChapter: 5 }).rows.map((row) => row.number), [5, 6]);
});

test("existing chapter names stay protected until explicit replacement is enabled", () => {
  const items = [{ number: 1, title: "New" }, { number: 2, title: "Other" }];
  const options = { chapterCount: 3, chapterNames: ["Old"], topics: ["Pointers"] };
  const protectedPreview = prepareSubjectContentImport(items, options);
  assert.equal(protectedPreview.rows[0].selected, false);
  assert.equal(protectedPreview.rows[0].action, "skip");
  assert.match(protectedPreview.warnings[0], /protected/u);
  assert.deepEqual(protectedPreview.nextChapterNames, ["Old", "Other"]);
  assert.equal(protectedPreview.canApply, true);
  const replaced = prepareSubjectContentImport(items, { ...options, overwriteExisting: true });
  assert.equal(replaced.replacedCount, 1);
  assert.equal(replaced.addedCount, 1);
  assert.deepEqual(replaced.nextChapterNames, ["New", "Other"]);
});

test("preview blocks duplicate chapter numbers and names, invalid edits and cross-target collisions", () => {
  const duplicateNumbers = prepareSubjectContentImport([{ number: 1, title: "A" }, { number: 1, title: "B" }], { chapterCount: 3 });
  assert.equal(duplicateNumbers.canApply, false);
  assert.match(duplicateNumbers.errors.join(" "), /number is repeated/u);
  const duplicateNames = prepareSubjectContentImport([{ number: 1, title: " Intro " }, { number: 2, title: "INTRO" }], { chapterCount: 3 });
  assert.equal(duplicateNames.canApply, false);
  assert.match(duplicateNames.errors.join(" "), /name is repeated/u);
  for (const number of ["", "0", "1.5", "abc", 4]) {
    assert.equal(prepareSubjectContentImport([{ number, title: "Name" }], { chapterCount: 3 }).canApply, false);
  }
  assert.match(prepareSubjectContentImport([{ title: "Pointers" }], { chapterCount: 2, topics: ["pointers"] }).errors.join(" "), /focus topic/u);
  assert.match(prepareSubjectContentImport([{ title: "Intro" }], { target: "topics", chapterCount: 2, chapterNames: ["INTRO"] }).errors.join(" "), /Chapter 1/u);
  assert.equal(prepareSubjectContentImport([{ title: "X".repeat(121) }], { chapterCount: 3 }).canApply, false);
  assert.equal(prepareSubjectContentImport([{ title: "Valid" }], { chapterCount: 501 }).canApply, false);
});

test("deselected invalid rows neither block valid imports nor consume topic capacity", () => {
  const preview = prepareSubjectContentImport([
    { number: "", title: "", selected: false }, { number: 2, title: "Good" },
    { number: 2, title: "Also invalid", selected: false },
  ], { chapterCount: 3 });
  assert.equal(preview.canApply, true);
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.rows[0].valid, false);
  assert.deepEqual(preview.nextChapterNames, ["", "Good"]);
  const topics = Array.from({ length: 59 }, (_, index) => `Existing ${index}`);
  const topicPreview = prepareSubjectContentImport([{ title: "Extra" }, { title: "Too long".repeat(30), selected: false }], { target: "topics", topics });
  assert.equal(topicPreview.canApply, true);
  assert.equal(topicPreview.nextTopics.length, 60);
});

test("topics skip existing duplicates, reject additions beyond 60 and retain current topics", () => {
  const options = { target: "topics", topics: ["One"] };
  const preview = prepareSubjectContentImport([{ title: "one" }, { title: "Two" }], options);
  assert.equal(preview.canApply, true);
  assert.equal(preview.rows[0].selected, false);
  assert.equal(preview.rows[0].action, "skip");
  assert.deepEqual(preview.nextTopics, ["One", "Two"]);
  const maximum = Array.from({ length: 60 }, (_, index) => `Topic ${index}`);
  const overflow = prepareSubjectContentImport([{ title: "One more" }], { target: "topics", topics: maximum });
  assert.equal(overflow.canApply, false);
  assert.match(overflow.errors.join(" "), /up to 60 focus topics/u);
  assert.equal(prepareSubjectContentImport([], { target: "topics" }).canApply, false);
});

test("replacing chapter names supports swaps while still detecting retained names", () => {
  const options = { chapterCount: 3, chapterNames: ["First", "Second", "Third"], overwriteExisting: true };
  const swapped = prepareSubjectContentImport([{ number: 1, title: "Second" }, { number: 2, title: "First" }], options);
  assert.equal(swapped.canApply, true);
  assert.deepEqual(swapped.nextChapterNames, ["Second", "First", "Third"]);
  const retainedDuplicate = prepareSubjectContentImport([{ number: 1, title: "Third" }], options);
  assert.equal(retainedDuplicate.canApply, false);
  assert.match(retainedDuplicate.errors.join(" "), /already used by Chapter 3/u);
});
