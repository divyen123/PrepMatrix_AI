import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  Upload,
} from "lucide-react";
import api from "../utils/apiClient.js";
import {
  parseSubjectContentFile,
  parseSubjectContentText,
  prepareSubjectContentImport,
  SUBJECT_IMPORT_MAX_FILE_BYTES,
  SUBJECT_IMPORT_MAX_ITEMS,
} from "../utils/subjectContentImport.js";
import "./SubjectContentImport.css";

const METHODS = {
  bulk: { title: "Bulk add" },
  syllabus: { title: "Import syllabus" },
  csv: { title: "Import CSV" },
};

const FILE_TYPES = {
  syllabus: ".pdf,.png,.jpg,.jpeg,.webp,.txt,.docx",
  csv: ".csv,text/csv",
};

function SubjectContentImport({
  target,
  method,
  chapterCount = 0,
  chapterNames = [],
  topics = [],
  subjectName,
  onApply,
  onClose,
}) {
  const isChapters = target === "chapters";
  const noun = isChapters ? "chapters" : "topics";
  const singular = isChapters ? "chapter" : "topic";
  const methodDetails = METHODS[method] || METHODS.bulk;
  const inputId = useId();
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const chooseFileRef = useRef(null);
  const requestRef = useRef(null);
  const readSequenceRef = useRef(0);
  const selectAllRef = useRef(null);
  const [bulkText, setBulkText] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [draftRows, setDraftRows] = useState([]);
  const [sourceWarnings, setSourceWarnings] = useState([]);
  const [error, setError] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [startChapter, setStartChapter] = useState(() => {
    const emptyIndex = Array.from({ length: chapterCount }, (_, index) => index)
      .find((index) => !String(chapterNames[index] || "").trim());
    return emptyIndex === undefined ? 1 : emptyIndex + 1;
  });

  const preview = useMemo(() => prepareSubjectContentImport(draftRows, {
    target,
    chapterCount,
    chapterNames,
    topics,
    overwriteExisting,
    startChapter,
  }), [draftRows, target, chapterCount, chapterNames, topics, overwriteExisting, startChapter]);

  const checkedCount = preview.rows.filter((row) => row.selected).length;
  const allChecked = preview.rows.length > 0 && checkedCount === preview.rows.length;
  const changedCount = preview.addedCount + preview.replacedCount;
  const warningMessages = [...new Set([
    ...sourceWarnings,
    ...(draftRows.length ? preview.warnings : []),
  ])];
  const globalErrors = preview.errors.filter((message) => !/^Row \d+:/u.test(message));
  const fileSizeLimit = method === "syllabus" ? 10 * 1024 * 1024 : SUBJECT_IMPORT_MAX_FILE_BYTES;

  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => {
      if (method === "bulk") textareaRef.current?.focus({ preventScroll: true });
      else chooseFileRef.current?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      readSequenceRef.current += 1;
      requestRef.current?.abort();
    };
  }, [method, target]);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = checkedCount > 0 && !allChecked;
    }
  }, [checkedCount, allChecked]);

  const cancelRead = () => {
    readSequenceRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    setIsReading(false);
  };

  const closeImport = () => {
    cancelRead();
    onClose();
  };

  const acceptParsedContent = (result) => {
    const items = Array.isArray(result?.items) ? result.items : [];
    if (items.length > SUBJECT_IMPORT_MAX_ITEMS) {
      throw new Error(`This list has more than ${SUBJECT_IMPORT_MAX_ITEMS} names. Split it into smaller imports.`);
    }
    setDraftRows(items.map((item) => ({ ...item, selected: true })));
    setSourceWarnings(Array.isArray(result?.warnings) ? result.warnings.filter((message) => typeof message === "string") : []);
    if (!items.length) {
      setError(`No ${noun} were found. Try another file or paste the names with Bulk add.`);
    } else {
      setError("");
    }
  };

  const previewPastedContent = () => {
    cancelRead();
    try {
      const result = parseSubjectContentText(bulkText, { target });
      acceptParsedContent(result);
      setSourceName("");
    } catch (parseError) {
      setError(parseError?.message || `Could not read that list. Use one ${singular} per line.`);
      setDraftRows([]);
    }
  };

  const importFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    cancelRead();
    setDraftRows([]);
    setSourceWarnings([]);
    setError("");
    setSourceName(file.name);
    if (file.size > fileSizeLimit) {
      setError(`Choose a file smaller than ${fileSizeLimit / 1024 / 1024} MB.`);
      return;
    }
    const sequence = ++readSequenceRef.current;
    const controller = new AbortController();
    requestRef.current = controller;
    setIsReading(true);
    try {
      const result = method === "syllabus"
        ? await api.importSubjectSyllabus(file, { target, subjectName, chapterCount }, { signal: controller.signal })
        : await parseSubjectContentFile(file, { target, method });
      if (sequence !== readSequenceRef.current || controller.signal.aborted) return;
      acceptParsedContent(result);
    } catch (readError) {
      if (sequence !== readSequenceRef.current || controller.signal.aborted) return;
      setError(readError?.message || "Could not read this file. Please try another file.");
    } finally {
      if (sequence === readSequenceRef.current) {
        requestRef.current = null;
        setIsReading(false);
      }
    }
  };

  const editRow = (index, changes) => {
    setDraftRows((current) => current.map((row, rowIndex) => (
      rowIndex === index ? { ...row, ...changes } : row
    )));
  };

  const applyImport = () => {
    if (isReading || !preview.canApply) return;
    cancelRead();
    onApply({ chapterNames: preview.nextChapterNames, topics: preview.nextTopics });
  };

  return (
    <section className="subject-content-import" aria-label={`${methodDetails.title} ${noun}`}>
      <div className="subject-import-heading">
        <button className="subject-import-button subject-import-back" onClick={closeImport} type="button">
          <ArrowLeft aria-hidden="true" size={15} /> Back
        </button>
        <div>
          <h4>{methodDetails.title}</h4>
        </div>
      </div>

      {method === "bulk" ? (
        <div className="subject-import-source">
          <label className="subject-import-label" htmlFor={`${inputId}-paste`}>{isChapters ? "Chapter names" : "Topic names"}</label>
          <textarea
            id={`${inputId}-paste`}
            ref={textareaRef}
            value={bulkText}
            onChange={(event) => {
              setBulkText(event.target.value);
              setDraftRows([]);
              setSourceWarnings([]);
              setError("");
            }}
            placeholder={isChapters ? "1. Number systems\n2. Factors and multiples\n3. Prime numbers" : "Divisibility rules\nFinding the greatest common divisor\nPrime factorization"}
            spellCheck={false}
            rows={5}
          />
          <div className="subject-import-source-actions">
            <span>One {singular} per line, or paste a column from a spreadsheet.</span>
            <button className="subject-import-button" disabled={!bulkText.trim()} onClick={previewPastedContent} type="button">
              <Check aria-hidden="true" size={14} /> Preview list
            </button>
          </div>
        </div>
      ) : (
        <div className="subject-import-file-source">
          <input
            accept={FILE_TYPES[method]}
            aria-label={`Choose ${method === "syllabus" ? "syllabus" : method.toUpperCase()} file`}
            className="subject-import-file-input"
            id={`${inputId}-file`}
            onChange={importFile}
            ref={fileInputRef}
            tabIndex={-1}
            type="file"
          />
          <div className="subject-import-file-summary">
            {method === "syllabus" ? <FileText aria-hidden="true" size={22} /> : <FileSpreadsheet aria-hidden="true" size={22} />}
            <div>
              <strong title={sourceName}>{sourceName || "Choose a file to import"}</strong>
              <span>{method === "syllabus" ? "PDF, image, Word or text · Up to 10 MB" : `CSV · Up to ${fileSizeLimit / 1024 / 1024} MB`}</span>
            </div>
          </div>
          <button className="subject-import-button" onClick={() => fileInputRef.current?.click()} ref={chooseFileRef} type="button">
            <Upload aria-hidden="true" size={14} /> {sourceName ? "Change file" : "Choose file"}
          </button>
        </div>
      )}

      {method === "syllabus" && <p className="subject-import-hint">Scanned or unstructured syllabuses may use AI credits.</p>}

      {isReading && (
        <div className="subject-import-loading" role="status">
          <LoaderCircle aria-hidden="true" className="subject-import-spinner" size={17} />
          <span>{method === "syllabus" ? `Reading your syllabus for ${noun}…` : "Reading your file…"}</span>
          <button className="subject-import-button" onClick={cancelRead} type="button">Cancel</button>
        </div>
      )}

      {error && <p className="subject-import-message is-error" role="alert"><AlertCircle aria-hidden="true" size={15} />{error}</p>}

      {warningMessages.length > 0 && !isReading && (
        <div className="subject-import-note-group">
          <ul className="subject-import-warnings" aria-label="Import notes">
            {warningMessages.slice(0, 4).map((message) => <li key={message}>{message}</li>)}
          </ul>
          {warningMessages.length > 4 && (
            <details className="subject-import-more-notes">
              <summary>View {warningMessages.length - 4} more notes</summary>
              <ul>{warningMessages.slice(4).map((message) => <li key={message}>{message}</li>)}</ul>
            </details>
          )}
        </div>
      )}

      {draftRows.length > 0 && !isReading && (
        <div className="subject-import-preview">
          <div className="subject-import-preview-heading">
            <div>
              <h4>Review {noun} <span>{draftRows.length} found</span></h4>
              <p>Edit names and select the ones to add.</p>
            </div>
            <label className="subject-import-checkbox">
              <input
                checked={allChecked}
                onChange={(event) => setDraftRows((current) => current.map((row) => ({ ...row, selected: event.target.checked })))}
                ref={selectAllRef}
                type="checkbox"
              />
              Select all
            </label>
          </div>

          {isChapters && (
            <div className="subject-import-options">
              <label className="subject-import-start">
                <span>Start unnumbered names at</span>
                <input
                  aria-label="Starting chapter number"
                  inputMode="numeric"
                  min="1"
                  max={chapterCount || undefined}
                  onChange={(event) => setStartChapter(event.target.value)}
                  type="number"
                  value={startChapter}
                />
              </label>
              <label className="subject-import-checkbox">
                <input checked={overwriteExisting} onChange={(event) => setOverwriteExisting(event.target.checked)} type="checkbox" />
                Replace existing chapter names
              </label>
            </div>
          )}

          <div className={`subject-import-rows ${isChapters ? "has-chapter-numbers" : "has-topic-numbers"}`}>
            <div className="subject-import-row-labels" aria-hidden="true">
              <span /> <span>{isChapters ? "Chapter" : "No."}</span> <span>Name</span> <span>Status</span>
            </div>
            {preview.rows.map((row) => (
              <div className={`subject-import-row ${row.selected ? "is-selected" : "is-unselected"} ${row.selected && !row.valid ? "has-error" : ""}`} key={row.index}>
                <input
                  aria-label={`Include ${singular} ${row.index + 1}`}
                  checked={row.selected}
                  className="subject-import-row-check"
                  onChange={(event) => editRow(row.index, { selected: event.target.checked })}
                  type="checkbox"
                />
                {isChapters ? (
                  <input
                    aria-label={`Chapter number for row ${row.index + 1}`}
                    aria-invalid={row.selected && row.errors.length > 0}
                    className="subject-import-number"
                    inputMode="numeric"
                    min="1"
                    max={chapterCount || undefined}
                    onChange={(event) => editRow(row.index, { number: event.target.value })}
                    type="number"
                    value={Number.isFinite(row.number) ? row.number : ""}
                  />
                ) : <span className="subject-import-topic-number">{row.index + 1}</span>}
                <div className="subject-import-name-field">
                  <input
                    aria-describedby={row.selected && row.errors.length ? `${inputId}-error-${row.index}` : undefined}
                    aria-invalid={row.selected && !row.valid}
                    aria-label={`${isChapters ? "Chapter" : "Topic"} name for row ${row.index + 1}`}
                    onChange={(event) => editRow(row.index, { title: event.target.value })}
                    type="text"
                    value={draftRows[row.index]?.title ?? row.title}
                  />
                  {row.selected && row.errors.length > 0 && <span className="subject-import-row-error" id={`${inputId}-error-${row.index}`}>{row.errors.join(" ")}</span>}
                </div>
                <span className={`subject-import-row-status is-${!row.selected ? "skip" : !row.valid ? "review" : row.action}`}>
                  {!row.selected ? "Excluded" : !row.valid ? "Review" : row.action === "replace" ? "Replace" : row.action === "skip" ? "Unchanged" : "Add"}
                </span>
              </div>
            ))}
          </div>

          {globalErrors.length > 0 && <p className="subject-import-message is-error" role="alert"><AlertCircle aria-hidden="true" size={15} />{globalErrors.join(" ")}</p>}

          <div className="subject-import-apply-row">
            <p aria-live="polite">
              {preview.canApply
                ? `${preview.addedCount} to add${preview.replacedCount ? ` · ${preview.replacedCount} to replace` : ""}`
                : checkedCount === 0 ? `Select ${noun} to continue.`
                  : preview.rows.some((row) => row.selected && !row.valid)
                    ? "Fix the highlighted rows or exclude them to continue."
                    : `No new ${noun} selected.`}
            </p>
            <button className="subject-import-button subject-import-apply" disabled={!preview.canApply} onClick={applyImport} type="button">
              <Check aria-hidden="true" size={15} /> Apply {changedCount || "selected"} {changedCount === 1 ? singular : noun}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default SubjectContentImport;
