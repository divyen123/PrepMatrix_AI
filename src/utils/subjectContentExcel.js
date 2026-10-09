import * as XLSX from "xlsx";
import { parseSubjectContentRows, SUBJECT_IMPORT_MAX_ITEMS } from "./subjectContentImport.js";

const clean = (value) => String(value ?? "").trim();

/** Read actual XLSX or legacy XLS workbooks without running formulas or macros. */
export function readSubjectContentWorkbook(buffer, { target = "chapters" } = {}) {
  const bytes = new Uint8Array(buffer);
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const legacy = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  if (!zip && !legacy) throw new Error("This file is not a valid Excel workbook. Export it as XLSX, XLS or CSV and try again.");
  let workbook;
  try {
    workbook = XLSX.read(bytes, {
      type: "array", sheetRows: SUBJECT_IMPORT_MAX_ITEMS + 2,
      cellFormula: false, cellHTML: false, cellStyles: false, bookVBA: false,
    });
  } catch {
    throw new Error("This Excel workbook could not be read. Check that it is not password protected, then save it as XLSX or CSV.");
  }
  const requestedTarget = target === "topics" ? "topics" : "chapters";
  const sheetNames = workbook.SheetNames || [];
  const namedSheets = sheetNames.filter((name) => requestedTarget === "topics"
    ? /topic/iu.test(name)
    : /chapter|unit|module/iu.test(name));
  const selectedNames = namedSheets.length ? namedSheets : sheetNames;
  const items = [];
  const warnings = [];
  const failures = [];
  let populatedSheets = 0;
  for (const name of selectedNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet?.["!ref"]) continue;
    const fullRange = XLSX.utils.decode_range(sheet["!fullref"] || sheet["!ref"]);
    if (fullRange.e.r - fullRange.s.r > SUBJECT_IMPORT_MAX_ITEMS) {
      throw new Error(`Sheet “${name}” has more than 1,000 rows. Split it into smaller imports.`);
    }
    if (fullRange.e.c - fullRange.s.c >= 50) {
      throw new Error(`Sheet “${name}” has more than 50 columns. Keep only the chapter or topic columns and try again.`);
    }
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "", blankrows: false });
    if (!rows.some((row) => row.some((cell) => clean(cell)))) continue;
    populatedSheets += 1;
    try {
      const result = parseSubjectContentRows(rows, { target: requestedTarget });
      items.push(...result.items);
      warnings.push(...result.warnings.map((warning) => `${name}: ${warning}`));
      if (items.length > SUBJECT_IMPORT_MAX_ITEMS) throw new Error("This workbook contains more than 1,000 names. Split it into smaller imports.");
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
    }
  }
  if (items.length > SUBJECT_IMPORT_MAX_ITEMS) throw new Error("This workbook contains more than 1,000 names. Split it into smaller imports.");
  if (!items.length && failures.length) throw new Error(failures.join(" "));
  if (failures.length) warnings.push(...failures.map((failure) => `Sheet not included — ${failure}`));
  if (namedSheets.length && selectedNames.length < sheetNames.length) {
    warnings.push(`Read ${requestedTarget} from ${selectedNames.map((name) => `“${name}”`).join(", ")}. Other sheets were not included.`);
  } else if (populatedSheets > 1) {
    warnings.push(`Combined ${populatedSheets} populated sheets. Check chapter numbers and duplicate names in the preview.`);
  }
  if (!items.length && !failures.length) warnings.push("This workbook has no chapter or topic names.");
  return { items, warnings };
}
