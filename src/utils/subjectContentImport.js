export const SUBJECT_IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const SUBJECT_IMPORT_MAX_TEXT_CHARS = 1_000_000;
export const SUBJECT_IMPORT_MAX_ITEMS = 1000;
export const SUBJECT_IMPORT_MAX_NAME_CHARS = 120;

const MAX_CHAPTERS = 500;
const MAX_TOPICS = 60;
const targetOf = (target) => target === "topics" ? "topics" : "chapters";
const cleanTitle = (value) => String(value ?? "").replace(/\s+/gu, " ").trim();
const titleKey = (value) => cleanTitle(value).normalize("NFKC").toLowerCase();
const fail = (message) => { throw new Error(message); };

function assertTextSize(text) {
  if (text.length > SUBJECT_IMPORT_MAX_TEXT_CHARS) {
    fail("This list is too large. Import up to 1,000,000 characters at a time.");
  }
}

function assertItemCount(items) {
  if (items.length > SUBJECT_IMPORT_MAX_ITEMS) {
    fail(`This list contains more than ${SUBJECT_IMPORT_MAX_ITEMS} entries. Split it into smaller imports.`);
  }
}

function romanNumber(value) {
  if (!/^(?=[IVXLCDM]+$)M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/u.test(value)) return null;
  const digits = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  return [...value].reduce((total, digit, index) => (
    total + (digits[digit] < (digits[value[index + 1]] || 0) ? -digits[digit] : digits[digit])
  ), 0);
}

function parseListLine(line) {
  const stripped = line.trim().replace(/^(?:[-*•‣▪–—]\s+)+/u, "");
  const named = stripped.match(/^(?:chapter|unit|module|topic)\s+(\d+|[IVXLCDM]+)(?:(?:\s*[.:)\-–—]\s*|\s+)(.*)|$)$/iu);
  if (named) {
    return {
      number: /^\d+$/u.test(named[1]) ? Number(named[1]) : romanNumber(named[1].toUpperCase()) ?? Number.NaN,
      title: cleanTitle(named[2]),
    };
  }
  const numbered = stripped.match(/^(\d+)(?:\.\s*(?=\D|$)|[)\]:]\s*|\s*[-–—]\s+|\t+)(.*)$/u);
  if (numbered) return { number: Number(numbered[1]), title: cleanTitle(numbered[2]) };
  return { number: null, title: cleanTitle(stripped) };
}

/** Parse a pasted list without truncating titles or silently filtering duplicates. */
export function parseSubjectContentText(value, { target = "chapters" } = {}) {
  const text = String(value ?? "").replace(/^\uFEFF/u, "");
  assertTextSize(text);
  const lines = text.split(/\r\n|[\r\n]/u).filter((line) => line.trim());
  const items = lines.map(parseListLine);
  assertItemCount(items);
  const warnings = [];
  if (!items.length) warnings.push(`No ${targetOf(target)} were found. Paste one name per line.`);
  return { items, warnings };
}

function detectDelimiter(text) {
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted) {
      if (char === "\n" || char === "\r") break;
      if (Object.hasOwn(counts, char)) counts[char] += 1;
    }
  }
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
}

function parseDelimitedRows(value) {
  const text = String(value ?? "").replace(/^\uFEFF/u, "");
  assertTextSize(text);
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  let closedQuote = false;
  const pushCell = () => { row.push(cell); cell = ""; closedQuote = false; };
  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
    if (rows.length > SUBJECT_IMPORT_MAX_ITEMS + 1) fail("This file has more than 1,000 rows. Split it into smaller imports.");
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') { cell += '"'; index += 1; }
        else { inQuotes = false; closedQuote = true; }
      } else cell += char;
      continue;
    }
    if (char === '"') {
      if (cell.trim() || closedQuote) fail(`Invalid CSV near row ${rows.length + 1}: a quote occurs inside an unquoted value.`);
      cell = "";
      inQuotes = true;
    } else if (char === delimiter) pushCell();
    else if (char === "\r" || char === "\n") {
      pushRow();
      if (char === "\r" && text[index + 1] === "\n") index += 1;
    } else if (closedQuote) {
      if (!/\s/u.test(char)) fail(`Invalid CSV near row ${rows.length + 1}: text follows a closing quote.`);
    } else cell += char;
  }
  if (inQuotes) fail("This CSV has an unclosed quoted value. Check the file and try again.");
  if (cell || row.length || closedQuote) pushRow();
  return rows;
}

const headerKey = (value) => cleanTitle(value).toLowerCase().replace(/[^a-z0-9]/gu, "");
const CHAPTER_TITLE_HEADERS = ["chaptername", "chapternames", "chaptertitle", "chaptertitles", "unitname", "unittitle", "modulename", "moduletitle", "chapter", "unit", "module", "chapters"];
const TOPIC_TITLE_HEADERS = ["topicname", "topicnames", "topictitle", "topictitles", "focustopic", "focustopics", "topic", "topics"];
const GENERIC_TITLE_HEADERS = ["name", "title", "content", "label"];
const CHAPTER_NUMBER_HEADERS = ["chapternumber", "chapterno", "unitnumber", "unitno", "modulenumber", "moduleno"];
const TOPIC_NUMBER_HEADERS = ["topicnumber", "topicno"];
const GENERIC_NUMBER_HEADERS = ["number", "no", "index", "sno", "srno", "serialnumber", "id"];
const findHeader = (keys, candidates) => candidates.map((candidate) => keys.indexOf(candidate)).find((index) => index >= 0) ?? -1;

function parseNumberCell(value) {
  const text = cleanTitle(value);
  if (!text) return null;
  if (/^\d+$/u.test(text)) return Number(text);
  const prefixed = text.match(/^(?:chapter|unit|module|topic)\s+(\d+|[IVXLCDM]+)$/iu);
  if (prefixed) return /^\d+$/u.test(prefixed[1]) ? Number(prefixed[1]) : romanNumber(prefixed[1].toUpperCase()) ?? Number.NaN;
  const roman = romanNumber(text.toUpperCase());
  return roman ?? Number.NaN;
}

/** Shared by CSV and Excel; headers choose the requested chapter/topic column. */
export function parseSubjectContentRows(value, { target = "chapters" } = {}) {
  const rows = Array.isArray(value) ? value.filter((row) => Array.isArray(row) && row.some((cell) => cleanTitle(cell))) : [];
  if (rows.length > SUBJECT_IMPORT_MAX_ITEMS + 1) fail("This file has more than 1,000 rows. Split it into smaller imports.");
  if (!rows.length) return { items: [], warnings: ["This file has no populated rows."] };
  if (rows.some((row) => row.length > 50)) fail("This file has more than 50 columns. Keep only the chapter or topic columns and try again.");
  const requestedTarget = targetOf(target);
  const requestedHeaders = requestedTarget === "topics" ? TOPIC_TITLE_HEADERS : CHAPTER_TITLE_HEADERS;
  const otherHeaders = requestedTarget === "topics" ? CHAPTER_TITLE_HEADERS : TOPIC_TITLE_HEADERS;
  const keys = rows[0].map(headerKey);
  const targetIndex = findHeader(keys, requestedHeaders);
  const genericIndex = findHeader(keys, GENERIC_TITLE_HEADERS);
  const hasOtherHeader = keys.some((key) => otherHeaders.includes(key));
  const numberedHeaders = requestedTarget === "topics" ? TOPIC_NUMBER_HEADERS : CHAPTER_NUMBER_HEADERS;
  let numberIndex = findHeader(keys, [...numberedHeaders, ...GENERIC_NUMBER_HEADERS]);
  if (numberIndex < 0 && targetIndex >= 0) {
    // Files often label the number column simply "Chapter" and its title "Chapter name".
    const shortNumberIndex = findHeader(keys, requestedTarget === "topics" ? ["topic"] : ["chapter", "unit", "module"]);
    if (shortNumberIndex !== targetIndex) numberIndex = shortNumberIndex;
  }
  const hasHeader = targetIndex >= 0 || genericIndex >= 0 || hasOtherHeader || numberIndex >= 0;
  if (hasHeader && targetIndex < 0 && genericIndex < 0 && hasOtherHeader) {
    fail(`No ${requestedTarget === "topics" ? "topic" : "chapter"} name column was found. Choose the matching tab or add a ${requestedTarget === "topics" ? "Topic name" : "Chapter name"} column.`);
  }
  let titleIndex = targetIndex >= 0 ? targetIndex : genericIndex;
  if (titleIndex < 0) {
    if (hasHeader) {
      fail(`Add a ${requestedTarget === "topics" ? "Topic name" : "Chapter name"} or Name column to this file.`);
    }
    const firstRow = rows[0];
    if (firstRow.length === 1) titleIndex = 0;
    else if (firstRow.length === 2 && Number.isFinite(parseNumberCell(firstRow[0]))) titleIndex = 1;
    else fail("This file has several columns without recognizable headers. Add Chapter name or Topic name and an optional Number header.");
  }
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const items = [];
  const warnings = [];
  let emptyCount = 0;
  for (const row of dataRows) {
    const title = cleanTitle(row[titleIndex]);
    if (!title) { emptyCount += 1; continue; }
    const fallbackNumberIndex = !hasHeader && titleIndex === 1 ? 0 : -1;
    const itemNumberIndex = numberIndex >= 0 ? numberIndex : fallbackNumberIndex;
    const parsedTitle = parseListLine(title);
    const cellNumber = itemNumberIndex >= 0 ? parseNumberCell(row[itemNumberIndex]) : null;
    items.push({ number: cellNumber !== null ? cellNumber : parsedTitle.number, title: parsedTitle.title });
  }
  assertItemCount(items);
  if (emptyCount) warnings.push(`${emptyCount} ${emptyCount === 1 ? "row has" : "rows have"} no ${requestedTarget === "topics" ? "topic" : "chapter"} name and ${emptyCount === 1 ? "was" : "were"} not included.`);
  if (!items.length) warnings.push(`No ${requestedTarget} were found in this file.`);
  if (!hasHeader && rows[0].length > 1) warnings.push("No headers were found; the first column was read as the number and the second as the name.");
  return { items, warnings };
}

export function parseSubjectContentCsv(text, options = {}) {
  return parseSubjectContentRows(parseDelimitedRows(text), options);
}

/** Browser File/Blob input; Excel stays in a lazy chunk until requested. */
export async function parseSubjectContentFile(file, options = {}) {
  if (!file || typeof file.arrayBuffer !== "function") fail("Choose a CSV or Excel file to import.");
  if (file.size > SUBJECT_IMPORT_MAX_FILE_BYTES) fail("This file is too large. Choose a file smaller than 5 MB.");
  const extension = String(file.name || "").toLowerCase().split(".").at(-1);
  if (extension === "csv" || extension === "tsv") {
    const text = typeof file.text === "function" ? await file.text() : new TextDecoder().decode(await file.arrayBuffer());
    return parseSubjectContentCsv(text, options);
  }
  if (extension === "xlsx" || extension === "xls") {
    const { readSubjectContentWorkbook } = await import("./subjectContentExcel.js");
    return readSubjectContentWorkbook(await file.arrayBuffer(), options);
  }
  fail("Unsupported file type. Choose CSV, XLSX or XLS.");
}

function integerNumber(value) {
  if (value === null || value === undefined) return null;
  if (value === "" || (typeof value === "string" && !value.trim())) return Number.NaN;
  const number = Number(value);
  return Number.isInteger(number) ? number : Number.NaN;
}

/** Recompute after every preview edit. No draft is applied unless canApply is true. */
export function prepareSubjectContentImport(items, {
  target = "chapters", chapterCount = 0, chapterNames = [], topics = [], overwriteExisting = false, startChapter = 1,
} = {}) {
  const selectedTarget = targetOf(target);
  const source = Array.isArray(items) ? items : [];
  assertItemCount(source);
  const count = Number(chapterCount);
  const errors = [];
  const warnings = [];
  if (selectedTarget === "chapters" && (!Number.isInteger(count) || count < 1 || count > MAX_CHAPTERS)) {
    errors.push("Set the subject's chapter count between 1 and 500 before importing chapter names.");
  }
  const chapterLimit = Number.isInteger(count) && count > 0 && count <= MAX_CHAPTERS ? count : 0;
  const existingChapterNames = Array.isArray(chapterNames) ? chapterNames.map(cleanTitle).slice(0, chapterLimit) : [];
  const existingTopics = Array.isArray(topics) ? topics.map(cleanTitle).filter(Boolean) : [];
  const reserved = new Set(source.map((item) => integerNumber(item?.number)).filter((number) => Number.isInteger(number)));
  let automaticNumber = integerNumber(startChapter);
  if (selectedTarget === "chapters" && (!Number.isInteger(automaticNumber) || automaticNumber < 1 || automaticNumber > chapterLimit)) {
    errors.push(`Choose a starting chapter between 1 and ${chapterLimit || MAX_CHAPTERS}.`);
    automaticNumber = 1;
  }
  const rows = source.map((item, index) => {
    let number = integerNumber(item?.number);
    if (selectedTarget === "chapters" && number === null) {
      while (reserved.has(automaticNumber)) automaticNumber += 1;
      number = automaticNumber;
      reserved.add(number);
      automaticNumber += 1;
    }
    const title = cleanTitle(item?.title);
    const rowErrors = [];
    if (!title) rowErrors.push("Enter a name.");
    if (title.length > SUBJECT_IMPORT_MAX_NAME_CHARS) rowErrors.push("Names must be 120 characters or fewer.");
    if (selectedTarget === "chapters" && (!Number.isInteger(number) || number < 1 || number > chapterLimit)) {
      rowErrors.push(`Chapter number must be between 1 and ${chapterLimit || MAX_CHAPTERS}.`);
    }
    let selected = item?.selected !== false;
    let action = selectedTarget === "chapters" && existingChapterNames[number - 1] ? "replace" : "add";
    if (selected && selectedTarget === "chapters" && existingChapterNames[number - 1] && !overwriteExisting) {
      selected = false;
      action = "skip";
      warnings.push(`Chapter ${number} already has a name and is protected. Enable Replace existing names to update it.`);
    } else if (selected && selectedTarget === "topics" && existingTopics.some((topic) => titleKey(topic) === titleKey(title))) {
      selected = false;
      action = "skip";
      warnings.push(`“${title}” is already a focus topic and will be skipped.`);
    }
    return { index, number, title, selected, valid: !rowErrors.length, errors: rowErrors, action };
  });
  const selectedNumbers = new Set();
  const selectedTitles = new Set();
  const replacingNumbers = new Set(rows.filter((row) => row.selected && row.valid && row.action === "replace").map((row) => row.number));
  const retainedChapterTitles = new Map();
  existingChapterNames.forEach((title, index) => {
    if (title && !replacingNumbers.has(index + 1)) retainedChapterTitles.set(titleKey(title), index + 1);
  });
  const topicKeys = new Set(existingTopics.map(titleKey));
  let topicAdditions = 0;
  rows.forEach((row) => {
    if (!row.selected) return;
    const key = titleKey(row.title);
    if (key && selectedTitles.has(key)) row.errors.push("This name is repeated in the import. Edit it or deselect this row.");
    if (selectedTarget === "chapters") {
      if (selectedNumbers.has(row.number)) row.errors.push("This chapter number is repeated in the import.");
      if (key && retainedChapterTitles.has(key)) row.errors.push(`This name is already used by Chapter ${retainedChapterTitles.get(key)}.`);
      if (key && topicKeys.has(key)) row.errors.push("This name is already used by a focus topic.");
      selectedNumbers.add(row.number);
    } else {
      if (key && retainedChapterTitles.has(key)) row.errors.push(`This name is already used by Chapter ${retainedChapterTitles.get(key)}.`);
      topicAdditions += 1;
      if (existingTopics.length + topicAdditions > MAX_TOPICS) row.errors.push("A subject can have up to 60 focus topics. Deselect extra rows or remove existing topics.");
    }
    if (key) selectedTitles.add(key);
    row.valid = !row.errors.length;
    row.errors.forEach((message) => errors.push(`Row ${row.index + 1}: ${message}`));
  });
  const nextChapterNames = [...existingChapterNames];
  const nextTopics = [...existingTopics];
  let addedCount = 0;
  let replacedCount = 0;
  rows.filter((row) => row.selected && row.valid).forEach((row) => {
    if (selectedTarget === "chapters") {
      while (nextChapterNames.length < row.number) nextChapterNames.push("");
      nextChapterNames[row.number - 1] = row.title;
      if (row.action === "replace") replacedCount += 1;
      else addedCount += 1;
    } else { nextTopics.push(row.title); addedCount += 1; }
  });
  while (nextChapterNames.at(-1) === "") nextChapterNames.pop();
  if (!source.length) warnings.push("There are no names to import yet.");
  return {
    rows, errors, warnings: [...new Set(warnings)],
    canApply: errors.length === 0 && addedCount + replacedCount > 0,
    nextChapterNames, nextTopics, addedCount, replacedCount,
  };
}
