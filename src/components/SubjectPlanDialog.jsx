import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion as Motion, useReducedMotion } from "motion/react";
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  ListChecks,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import {
  applySubjectChapterNameDraft,
  normalizeSubjectChapterNames,
  normalizeSubjectTopics,
} from "../utils/subjectPlanning";
import { getAcademicProfileExamples } from "../utils/academicProfileExamples";
import SubjectContentImport from "./SubjectContentImport";
import "./SubjectPlanDialog.css";

function SubjectPlanDialog({
  academicProfile = {},
  hasActiveSchedule = false,
  onClose,
  onOpenPlanner,
  onSave,
  subject,
}) {
  const dialogRef = useRef(null);
  const chapterInputRef = useRef(null);
  const topicInputRef = useRef(null);
  const chapterTabRef = useRef(null);
  const topicTabRef = useRef(null);
  const bodyRef = useRef(null);
  const closeTimerRef = useRef(null);
  const closingRef = useRef(false);
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const chapterCount = Math.min(500, Math.max(0, Number.parseInt(subject?.chapters, 10) || 0));
  const reducedMotion = useReducedMotion();
  const [activeTab, setActiveTab] = useState("chapters");
  const [importMethod, setImportMethod] = useState(null);
  const [importNotice, setImportNotice] = useState("");
  const [chapterError, setChapterError] = useState("");
  const [chapterNameInput, setChapterNameInput] = useState("");
  const [chapterNumber, setChapterNumber] = useState(1);
  const [chapterNames, setChapterNames] = useState(() => normalizeSubjectChapterNames(subject?.chapterNames, chapterCount));
  const [isClosing, setIsClosing] = useState(false);
  const [topicInput, setTopicInput] = useState("");
  const [topicError, setTopicError] = useState("");
  const [topics, setTopics] = useState(() => normalizeSubjectTopics(subject?.topics));
  const curriculumExamples = useMemo(
    () => getAcademicProfileExamples(academicProfile),
    [academicProfile]
  );

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const originalConfiguration = useMemo(() => ({
    chapterNames: normalizeSubjectChapterNames(subject?.chapterNames, chapterCount),
    topics: normalizeSubjectTopics(subject?.topics),
  }), [chapterCount, subject]);

  const nextConfiguration = useMemo(() => ({
    chapterNames: normalizeSubjectChapterNames(chapterNames, chapterCount),
    topics: normalizeSubjectTopics(topics),
  }), [chapterCount, chapterNames, topics]);

  const hasPendingChapterName = Boolean(String(chapterNameInput || "").trim());
  const isDirty = hasPendingChapterName || Boolean(topicInput.trim())
    || JSON.stringify(originalConfiguration) !== JSON.stringify(nextConfiguration);
  const selectedTopicKeys = useMemo(
    () => new Set(topics.map((topic) => topic.toLocaleLowerCase())),
    [topics],
  );
  const namedChapters = useMemo(
    () => chapterNames
      .map((name, index) => ({ index, name: String(name || "") }))
      .filter((chapter) => chapter.name.trim()),
    [chapterNames],
  );

  const requestClose = useCallback((afterClose) => {
    if (closingRef.current) return;
    closingRef.current = true;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      onCloseRef.current();
      afterClose?.();
    }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180);
  }, []);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.classList.add("modal-open");
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      (chapterCount ? chapterInputRef : chapterTabRef).current?.focus({ preventScroll: true });
    });

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])'
      ) || []).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
      if (!focusable?.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
      document.body.classList.remove("modal-open");
      document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, [chapterCount, requestClose]);

  const resolveChapterNameDraft = () => {
    const chapterIndex = Math.min(Math.max(Number(chapterNumber) - 1, 0), Math.max(chapterCount - 1, 0));
    const chapterName = String(chapterNameInput || "").trim().slice(0, 120);
    if (!chapterName) {
      return {
        chapterName,
        chapterNames: normalizeSubjectChapterNames(chapterNames, chapterCount),
      };
    }
    if (!chapterCount) {
      return { error: "Add at least one chapter to this subject first." };
    }
    if (selectedTopicKeys.has(chapterName.toLocaleLowerCase())) {
      return { error: "That name is already used by a focus topic." };
    }
    const duplicateIndex = chapterNames.findIndex((name, index) => (
      index !== chapterIndex
      && String(name || "").trim().toLocaleLowerCase() === chapterName.toLocaleLowerCase()
    ));
    if (duplicateIndex >= 0) {
      return { error: `That name is already used for Chapter ${duplicateIndex + 1}.` };
    }

    return {
      chapterName,
      chapterNames: applySubjectChapterNameDraft(
        chapterNames,
        chapterCount,
        chapterNumber,
        chapterName,
      ),
    };
  };

  const addChapterName = () => {
    const result = resolveChapterNameDraft();
    if (result.error) {
      setChapterError(result.error);
      return;
    }
    if (!result.chapterName) {
      setChapterError("Type a chapter name before adding it.");
      return;
    }

    setChapterNames(result.chapterNames);
    setChapterNameInput("");
    setChapterError("");

    const nextBlankIndex = Array.from(
      { length: chapterCount },
      (_, index) => index,
    ).find((index) => !String(result.chapterNames[index] || "").trim());
    if (nextBlankIndex !== undefined) setChapterNumber(nextBlankIndex + 1);
  };

  const updateChapterName = (chapterIndex, nextValue) => {
    setChapterNames((current) => {
      const nextNames = [...current];
      while (nextNames.length <= chapterIndex) nextNames.push("");
      nextNames[chapterIndex] = String(nextValue ?? "").slice(0, 120);
      return nextNames;
    });
    setChapterError("");
  };

  const finishChapterNameEdit = () => {
    setChapterNames((current) => normalizeSubjectChapterNames(current, chapterCount));
  };

  const removeChapterName = (chapterIndex) => {
    setChapterNames((current) => {
      const nextNames = [...current];
      nextNames[chapterIndex] = "";
      return normalizeSubjectChapterNames(nextNames, chapterCount);
    });
    setChapterNumber(chapterIndex + 1);
    setChapterError("");
  };

  const addTopic = (rawTopic = topicInput) => {
    const topic = String(rawTopic || "").trim().slice(0, 120);
    if (!topic) {
      setTopicError("Type a topic before adding it.");
      return;
    }
    if (topics.length >= 60) {
      setTopicError("A subject can contain up to 60 focus topics.");
      return;
    }
    const topicMatchesChapter = chapterNames.some((name) => (
      String(name || "").trim().toLocaleLowerCase() === topic.toLocaleLowerCase()
    ));
    if (topicMatchesChapter) {
      setTopicError("That name is already used by a chapter.");
      return;
    }
    if (selectedTopicKeys.has(topic.toLocaleLowerCase())) {
      setTopicError("That topic is already in this plan.");
      return;
    }

    setTopics((current) => [...current, topic]);
    setTopicInput("");
    setTopicError("");
    window.requestAnimationFrame(() => topicInputRef.current?.focus());
  };

  const updateTopic = (topicIndex, nextValue) => {
    const nextTopic = String(nextValue ?? "").slice(0, 120);

    setTopics((current) =>
      current.map((topic, index) =>
        index === topicIndex ? nextTopic : topic,
      ),
    );
    setTopicError("");
  };

  const finishTopicEdit = (topicIndex) => {
    setTopics((current) => {
      const cleanedTopic = String(current[topicIndex] ?? "").trim();

      if (!cleanedTopic) {
        return current.filter((_, index) => index !== topicIndex);
      }

      return current.map((topic, index) =>
        index === topicIndex ? cleanedTopic : topic,
      );
    });
  };

  const removeTopic = (topicIndex) => {
    setTopics((current) => current.filter((_, index) => index !== topicIndex));
    setTopicError("");
  };

  const resetPlanOptions = () => {
    setChapterNames([]);
    setChapterNameInput("");
    setChapterNumber(1);
    setChapterError("");
    setTopics([]);
    setTopicInput("");
    setTopicError("");
    setImportNotice("");
  };

  const resolveConfigurationDrafts = () => {
    const result = resolveChapterNameDraft();
    if (result.error) return { error: result.error, field: "chapters" };

    const draftTopics = topics.map((topic) => String(topic || "").trim()).filter(Boolean);
    if (topicInput.trim()) draftTopics.push(topicInput.trim());
    if (draftTopics.length > 60) {
      return { error: "A subject can contain up to 60 focus topics.", field: "topics" };
    }
    const usedNames = new Map();
    for (const [index, name] of result.chapterNames.entries()) {
      if (!name) continue;
      const key = name.replace(/\s+/gu, " ").normalize("NFKC").toLocaleLowerCase();
      if (usedNames.has(key)) {
        return { error: `Chapter ${index + 1} has the same name as ${usedNames.get(key)}.`, field: "chapters" };
      }
      usedNames.set(key, `Chapter ${index + 1}`);
    }
    for (const [index, name] of draftTopics.entries()) {
      const key = name.replace(/\s+/gu, " ").normalize("NFKC").toLocaleLowerCase();
      if (usedNames.has(key)) {
        return { error: `Topic ${index + 1} has the same name as ${usedNames.get(key)}.`, field: "topics" };
      }
      usedNames.set(key, `Topic ${index + 1}`);
    }
    return { chapterNames: result.chapterNames, topics: normalizeSubjectTopics(draftTopics) };
  };

  const showConfigurationError = (result) => {
    setImportMethod(null);
    setActiveTab(result.field);
    if (result.field === "chapters") setChapterError(result.error);
    else setTopicError(result.error);
  };

  const persistConfiguration = () => {
    const result = resolveConfigurationDrafts();
    if (result.error) {
      showConfigurationError(result);
      return false;
    }
    const persistedConfiguration = { chapterNames: result.chapterNames, topics: result.topics };
    if (JSON.stringify(originalConfiguration) !== JSON.stringify(persistedConfiguration)) {
      onSave({
        ...subject,
        ...persistedConfiguration,
      });
    }
    return true;
  };

  const switchTab = (tab, focusTab = false) => {
    setActiveTab(tab);
    setImportMethod(null);
    setImportNotice("");
    bodyRef.current?.scrollTo({ top: 0 });
    if (focusTab) (tab === "chapters" ? chapterTabRef : topicTabRef).current?.focus();
  };

  const handleTabKeyDown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextTab = event.key === "Home" ? "chapters" : event.key === "End" ? "topics"
      : activeTab === "chapters" ? "topics" : "chapters";
    switchTab(nextTab, true);
  };

  const openImport = (method) => {
    const result = resolveConfigurationDrafts();
    if (result.error) {
      showConfigurationError(result);
      return;
    }
    setChapterNames(result.chapterNames);
    setTopics(result.topics);
    setChapterNameInput("");
    setTopicInput("");
    setChapterError("");
    setTopicError("");
    setImportNotice("");
    setImportMethod(method);
    bodyRef.current?.scrollTo({ top: 0 });
  };

  const applyImport = (configuration) => {
    setChapterNames(configuration.chapterNames);
    setTopics(configuration.topics);
    setImportMethod(null);
    setImportNotice(`${activeTab === "chapters" ? "Chapter names" : "Topics"} updated. Save changes to keep them.`);
    const blankIndex = Array.from({ length: chapterCount }, (_, index) => index)
      .find((index) => !String(configuration.chapterNames[index] || "").trim());
    if (blankIndex !== undefined) setChapterNumber(blankIndex + 1);
    bodyRef.current?.scrollTo({ top: 0 });
    window.requestAnimationFrame(() => (activeTab === "chapters" ? chapterTabRef : topicTabRef).current?.focus());
  };

  const handleSave = () => {
    if (closingRef.current) return;
    if (!persistConfiguration()) return;
    requestClose();
  };

  const handleSaveAndPlan = () => {
    if (closingRef.current) return;
    if (!persistConfiguration()) return;
    requestClose(onOpenPlanner);
  };

  return createPortal(
    <div
      className={`subject-plan-backdrop${isClosing ? " is-closing" : ""}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby="subject-plan-title"
        aria-modal="true"
        className="subject-plan-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header className="subject-plan-header">
          <span className="subject-plan-header-mark" aria-hidden="true">
            <BookOpen size={22} />
          </span>
          <div>
            <h2 id="subject-plan-title">Configure {subject?.name}</h2>
          </div>
          <button
            aria-label="Close subject planner"
            className="subject-plan-close"
            onClick={() => requestClose()}
            type="button"
          >
            <X size={15} />
          </button>
        </header>

        <div className="subject-plan-tabs" role="tablist" aria-label="Study content">
          <button
            aria-controls="subject-chapters-panel"
            aria-selected={activeTab === "chapters"}
            className={activeTab === "chapters" ? "is-active" : ""}
            id="subject-chapters-tab"
            onClick={() => switchTab("chapters")}
            onKeyDown={handleTabKeyDown}
            ref={chapterTabRef}
            role="tab"
            tabIndex={activeTab === "chapters" ? 0 : -1}
            type="button"
          >
            <BookOpen aria-hidden="true" size={16} />
            Chapters
            <span>{namedChapters.length} named</span>
          </button>
          <button
            aria-controls="subject-topics-panel"
            aria-selected={activeTab === "topics"}
            className={activeTab === "topics" ? "is-active" : ""}
            id="subject-topics-tab"
            onClick={() => switchTab("topics")}
            onKeyDown={handleTabKeyDown}
            ref={topicTabRef}
            role="tab"
            tabIndex={activeTab === "topics" ? 0 : -1}
            type="button"
          >
            <ListChecks aria-hidden="true" size={16} />
            Topics
            <span>{topics.length}/60</span>
          </button>
        </div>

        <div className="subject-plan-body" ref={bodyRef}>
          <div
            aria-labelledby={`subject-${activeTab}-tab`}
            id={`subject-${activeTab}-panel`}
            role="tabpanel"
          >
            <AnimatePresence initial={false} mode="wait">
              <Motion.div
                animate={{ opacity: 1, y: 0 }}
                className="subject-plan-panel subject-content-page"
                exit={{ opacity: 0, y: reducedMotion ? 0 : -4 }}
                initial={{ opacity: 0, y: reducedMotion ? 0 : 6 }}
                key={`${activeTab}-${importMethod || "edit"}`}
                transition={{ duration: reducedMotion ? 0 : 0.13, ease: "easeOut" }}
              >
                {importMethod ? (
                  <SubjectContentImport
                    chapterCount={chapterCount}
                    chapterNames={chapterNames}
                    method={importMethod}
                    onApply={applyImport}
                    onClose={() => {
                      setImportMethod(null);
                      (activeTab === "chapters" ? chapterTabRef : topicTabRef).current?.focus();
                    }}
                    subjectName={subject?.name || ""}
                    target={activeTab}
                    topics={topics}
                  />
                ) : (
                  <>
                    <div className="subject-content-page-heading">
                      <div>
                        <h3>{activeTab === "chapters" ? "Chapter names" : "Focus topics"}</h3>
                      </div>
                      <span className="subject-plan-count">
                        {activeTab === "chapters" ? `${namedChapters.length} / ${chapterCount}` : `${topics.length} / 60`}
                      </span>
                    </div>
                    <div className="subject-content-tools" aria-label={`Add ${activeTab} from a list or file`}>
                      <button disabled={activeTab === "chapters" && chapterCount === 0} onClick={() => openImport("bulk")} type="button">
                        <ClipboardList aria-hidden="true" size={14} />Bulk add
                      </button>
                      {activeTab === "chapters" && (
                        <button disabled={chapterCount === 0} onClick={() => openImport("syllabus")} type="button">
                          <FileText aria-hidden="true" size={14} />Syllabus
                        </button>
                      )}
                      <button disabled={activeTab === "chapters" && chapterCount === 0} onClick={() => openImport("csv")} type="button">
                        <FileSpreadsheet aria-hidden="true" size={14} />CSV
                      </button>
                    </div>
                    {importNotice && <p className="subject-import-notice" role="status"><CheckCircle2 aria-hidden="true" size={14} />{importNotice}</p>}
                    {activeTab === "chapters" ? (
                      <div className="subject-unit-group subject-chapter-group">
                        <div className="subject-chapter-composer">
                          <select
                            aria-label="Chapter number"
                            disabled={chapterCount === 0}
                            onChange={(event) => setChapterNumber(Number(event.target.value))}
                            value={chapterNumber}
                          >
                            {Array.from({ length: chapterCount }, (_, index) => (
                              <option key={index + 1} value={index + 1}>Chapter {index + 1}</option>
                            ))}
                          </select>
                          <input
                            aria-describedby={chapterError ? "subject-chapter-error" : undefined}
                            aria-invalid={Boolean(chapterError)}
                            aria-label="Chapter name"
                            disabled={chapterCount === 0}
                            maxLength="120"
                            onChange={(event) => {
                              setChapterNameInput(event.target.value);
                              if (chapterError) setChapterError("");
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                addChapterName();
                              }
                            }}
                            placeholder={curriculumExamples.subjectPlanChapterPlaceholder}
                            ref={chapterInputRef}
                            value={chapterNameInput}
                          />
                          <button aria-label="Add chapter name" disabled={chapterCount === 0 || !chapterNameInput.trim()} onClick={addChapterName} type="button">
                            <Plus aria-hidden="true" size={15} />Add
                          </button>
                        </div>
                        {chapterError && <p className="subject-topic-error" id="subject-chapter-error" role="alert">{chapterError}</p>}
                        <div className="subject-chapter-list">
                          {namedChapters.length === 0 ? (
                            <div className="subject-unit-empty">
                              {chapterCount === 0 ? "Set a chapter count for this subject to add names." : "Add a chapter name or import your full chapter list."}
                            </div>
                          ) : namedChapters.map(({ index, name }) => (
                            <div className="subject-topic-item subject-chapter-item" key={`chapter-${index}`}>
                              <span>CH {index + 1}</span>
                              <input
                                aria-label={`Rename Chapter ${index + 1}`}
                                className="subject-topic-name-input"
                                maxLength="120"
                                onBlur={finishChapterNameEdit}
                                onChange={(event) => updateChapterName(index, event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    event.currentTarget.blur();
                                  }
                                }}
                                spellCheck="false"
                                value={name}
                              />
                              <button aria-label={`Remove name from Chapter ${index + 1}`} onClick={() => removeChapterName(index)} title="Remove chapter name" type="button">
                                <Trash2 aria-hidden="true" size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="subject-unit-group subject-focus-group">
                        <div className="subject-topic-composer">
                          <input
                            aria-describedby={topicError ? "subject-topic-error" : undefined}
                            aria-invalid={Boolean(topicError)}
                            aria-label="Focus topic"
                            maxLength="120"
                            onChange={(event) => {
                              setTopicInput(event.target.value);
                              if (topicError) setTopicError("");
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                addTopic();
                              }
                            }}
                            placeholder={curriculumExamples.subjectPlanTopicsPlaceholder}
                            ref={topicInputRef}
                            value={topicInput}
                          />
                          <button aria-label="Add topic" disabled={topics.length >= 60 || !topicInput.trim()} onClick={() => addTopic()} type="button">
                            <Plus aria-hidden="true" size={15} />Add
                          </button>
                        </div>
                        {topicError && <p className="subject-topic-error" id="subject-topic-error" role="alert">{topicError}</p>}
                        <div className="subject-topic-list">
                          {topics.length === 0 ? (
                            <div className="subject-unit-empty">Add extra focus topics or import a topic list.</div>
                          ) : topics.map((topic, index) => (
                            <div className="subject-topic-item" key={`topic-${index}`}>
                              <span>{String(index + 1).padStart(2, "0")}</span>
                              <input
                                aria-label={`Rename topic ${index + 1}`}
                                className="subject-topic-name-input"
                                maxLength="120"
                                onBlur={() => finishTopicEdit(index)}
                                onChange={(event) => updateTopic(index, event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    event.currentTarget.blur();
                                  }
                                }}
                                spellCheck="false"
                                value={topic}
                              />
                              <button aria-label={`Remove ${topic || `topic ${index + 1}`}`} onClick={() => removeTopic(index)} title="Remove topic" type="button">
                                <Trash2 aria-hidden="true" size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </Motion.div>
            </AnimatePresence>
          </div>
        </div>
        <footer className="subject-plan-footer">
          {!hasActiveSchedule && (
            <div className="subject-plan-save-note">
              <CheckCircle2 aria-hidden="true" size={15} />
              <span>These settings will shape your first generated timetable.</span>
            </div>
          )}
          <div className="subject-plan-footer-actions">
            <button className="subject-plan-reset" disabled={!isDirty || Boolean(importMethod)} onClick={resetPlanOptions} type="button">
              <RotateCcw size={15} />
              Reset
            </button>
            <button className="subject-plan-cancel" onClick={() => requestClose()} type="button">
              Cancel
            </button>
            <button className="subject-plan-save" disabled={!isDirty || Boolean(importMethod)} onClick={handleSave} type="button">
              Save changes
            </button>
            <button className="subject-plan-primary" disabled={Boolean(importMethod)} onClick={handleSaveAndPlan} type="button">
              {isDirty ? "Save & open planner" : "Open planner"}
              <ChevronRight size={16} />
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

export default SubjectPlanDialog;
