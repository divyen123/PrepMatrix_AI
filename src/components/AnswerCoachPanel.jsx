import { useEffect, useMemo, useState } from "react";
import { Check, FileImage, FileText, LoaderCircle, Plus, RotateCcw, UploadCloud, X } from "lucide-react";
import api from "../utils/apiClient";
import { AI_FEATURES, createAiIdempotencyKey, getAiRequestErrorMessage, useAiQuota } from "../utils/aiQuota";
import {
  LEARNING_ATTACHMENT_ACCEPT,
  prepareChatAttachment,
  validateChatAttachmentSelection,
} from "../utils/chatAttachments";
import {
  ANSWER_COACH_FOCUS,
  getAnswerCoachDiagnosticQuestions,
  getAnswerCoachFocus,
  getAnswerCoachPracticeQuestion,
  getAnswerCoachRecheckQuestion,
  normalizeAnswerCoachAnalysis,
} from "../utils/answerCoach";
import { toast } from "../utils/toast";
import "./AnswerCoachPanel.css";

function idOf(value) {
  return String(value?.id || value?._id || "");
}

function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Saved review" : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function questionSource(paper, number) {
  return paper?.questions?.[number - 1] || null;
}

function reviewDraft(diagnostic, question) {
  return {
    cause: diagnostic?.cause || getAnswerCoachFocus("", question.errorType),
    responses: Array.isArray(diagnostic?.responses) ? [...diagnostic.responses] : ["", ""],
    practiceResponse: diagnostic?.practiceResponse || "",
    recheckResponse: diagnostic?.recheckResponse || "",
  };
}

function AnswerCoachQuestion({ question, paper, reportId, diagnostic, onDiagnosticSaved, onAddRevisionTask, analysis }) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(() => reviewDraft(diagnostic, question));
  const [saving, setSaving] = useState(false);
  const [diagnosed, setDiagnosed] = useState(Boolean(diagnostic));
  const source = questionSource(paper, question.questionNumber);
  const prompts = getAnswerCoachDiagnosticQuestions(question);
  const focus = getAnswerCoachFocus(draft.cause, question.errorType);
  const practiceQuestion = getAnswerCoachPracticeQuestion(
    focus === getAnswerCoachFocus("", question.errorType)
      ? question
      : { ...question, practiceQuestion: "" },
    source,
    focus,
  );
  const recheckQuestion = getAnswerCoachRecheckQuestion(question, source);

  useEffect(() => {
    setDraft(reviewDraft(diagnostic, question));
    setDiagnosed(Boolean(diagnostic));
  }, [diagnostic, question]);

  const save = async (next = draft) => {
    if (!reportId) return false;
    setSaving(true);
    try {
      const payload = await api.patch(`/api/answer-coach/reports/${reportId}/diagnostics/${question.questionNumber}`, next);
      onDiagnosticSaved?.(question.questionNumber, payload.diagnostic);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this review.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const setResponse = (index, value) => setDraft((current) => {
    const responses = [...current.responses];
    responses[index] = value;
    return { ...current, responses };
  });

  return (
    <article className="answer-coach-question">
      <div className="answer-coach-question__head">
        <div>
          <h3>Question {question.questionNumber}</h3>
          <p>{question.topic || "General"}</p>
        </div>
        <strong>{question.awardedMarks} / {question.marks} provisional marks</strong>
      </div>
      <p className="answer-coach-question__prompt">{question.question}</p>
      {question.observedAnswer && <details className="answer-coach-observed"><summary>What the coach read</summary><p>{question.observedAnswer}</p></details>}
      {question.steps.length > 0 && (
        <div className="answer-coach-steps">
          <h4>Step feedback</h4>
          <ol>{question.steps.map((step, index) => (
            <li key={`${index}-${step.observation}`}>
              <span>{step.observation}</span>
              <strong>{step.marksAwarded} / {step.marksPossible}</strong>
            </li>
          ))}</ol>
        </div>
      )}
      {question.firstError && <p className="answer-coach-first-error"><strong>First point to fix:</strong> {question.firstError}</p>}
      {question.feedback && <p className="answer-coach-feedback">{question.feedback}</p>}

      {question.needsReview && (
        <>
          <div className="answer-coach-question__actions">
            <button onClick={() => setExpanded((value) => !value)} type="button">{expanded ? "Hide review" : "Why was I wrong?"}</button>
            <button onClick={() => {
              onAddRevisionTask?.({
                paperId: analysis.paperId,
                paperTitle: analysis.paperTitle,
                questionId: question.questionId,
                questionNumber: question.questionNumber,
                subjectName: analysis.subjectNames?.[0] || paper?.subjectNames?.[0] || "",
                topic: question.topic,
              });
              toast.success("Revision task is in your plan.");
            }} type="button"><Plus size={15} /> Add to plan</button>
          </div>
          {expanded && (
            <div className="answer-coach-diagnosis">
              <h4>Find the cause</h4>
              <p>Answer these briefly, then choose what best explains the mistake.</p>
              {prompts.map((prompt, index) => (
                <label key={prompt}>
                  <span>{prompt}</span>
                  <textarea onChange={(event) => setResponse(index, event.target.value)} rows={2} value={draft.responses[index] || ""} />
                </label>
              ))}
              <label>
                <span>What caused it?</span>
                <select onChange={(event) => setDraft((current) => ({ ...current, cause: event.target.value }))} value={draft.cause}>
                  {Object.entries(ANSWER_COACH_FOCUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  <option value="unsure">Not sure yet</option>
                </select>
              </label>
              <button disabled={saving || !draft.responses.some((response) => response?.trim())} onClick={async () => {
                if (await save()) setDiagnosed(true);
              }} type="button">{saving ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} {diagnosed ? "Save diagnosis" : "Show targeted practice"}</button>

              {diagnosed && (
                <div className="answer-coach-practice">
                  <h4>Targeted practice</h4>
                  <p>{practiceQuestion}</p>
                  <label>
                    <span>Your new attempt</span>
                    <textarea onChange={(event) => setDraft((current) => ({ ...current, practiceResponse: event.target.value }))} rows={4} value={draft.practiceResponse} />
                  </label>
                  <button disabled={saving || !draft.practiceResponse.trim()} onClick={async () => {
                    if (await save()) toast.success("Practice saved. Recheck this answer later from your saved review.");
                  }} type="button">Save practice</button>
                  {Boolean(diagnostic?.practiceResponse) && (
                    <div className="answer-coach-recheck">
                      <h4>Recheck without notes</h4>
                      <p>{recheckQuestion}</p>
                      <label>
                        <span>Your recheck answer</span>
                        <textarea onChange={(event) => setDraft((current) => ({ ...current, recheckResponse: event.target.value }))} rows={4} value={draft.recheckResponse} />
                      </label>
                      <button disabled={saving || !draft.recheckResponse.trim()} onClick={async () => {
                        if (await save()) toast.success("Recheck saved.");
                      }} type="button"><RotateCcw size={15} /> Save recheck</button>
                      {Boolean(diagnostic?.recheckResponse) && source?.modelAnswer && (
                        <details className="answer-coach-model-answer"><summary>Compare with the paper answer</summary><p>{source.modelAnswer}</p><p>{source.markingScheme}</p></details>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </article>
  );
}

export default function AnswerCoachPanel({ papers = [], onAddRevisionTask }) {
  const { getCost, hasInsufficientCredits } = useAiQuota();
  const [paperId, setPaperId] = useState(() => idOf(papers[0]));
  const [paper, setPaper] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [preparingFiles, setPreparingFiles] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [reportId, setReportId] = useState("");
  const [diagnostics, setDiagnostics] = useState({});
  const [reports, setReports] = useState([]);
  const [loadingReportId, setLoadingReportId] = useState("");
  const paperOptions = useMemo(() => papers.filter((item) => idOf(item)), [papers]);

  useEffect(() => {
    if (!paperId && paperOptions.length) setPaperId(idOf(paperOptions[0]));
  }, [paperId, paperOptions]);

  useEffect(() => {
    if (!paperId) { setPaper(null); return undefined; }
    let active = true;
    api.get(`/api/question-papers/${paperId}`).then((payload) => {
      if (active) setPaper(payload.paper || null);
    }).catch((error) => {
      if (active) { setPaper(null); toast.error(error instanceof Error ? error.message : "Could not load this paper."); }
    });
    return () => { active = false; };
  }, [paperId]);

  const refreshReports = async () => {
    try {
      const payload = await api.get("/api/answer-coach/reports");
      setReports(Array.isArray(payload.reports) ? payload.reports : []);
    } catch {
      setReports([]);
    }
  };
  useEffect(() => { refreshReports(); }, []);

  const addFiles = async (files) => {
    const error = validateChatAttachmentSelection(files, attachments, { allowPresentations: false });
    if (error) { toast.error(error); return; }
    setPreparingFiles(true);
    try {
      const next = await Promise.all(Array.from(files).map(prepareChatAttachment));
      setAttachments((current) => [...current, ...next]);
    } catch (prepareError) {
      toast.error(prepareError instanceof Error ? prepareError.message : "Could not prepare these files.");
    } finally {
      setPreparingFiles(false);
    }
  };

  const analyze = async () => {
    if (!paperId || !attachments.length || analyzing || preparingFiles) return;
    if (hasInsufficientCredits(AI_FEATURES.ANSWER_COACH)) {
      toast.info(getAiRequestErrorMessage({ code: "AI_USER_QUOTA_EXHAUSTED" }));
      return;
    }
    setAnalyzing(true);
    try {
      const payload = await api.post("/api/answer-coach/analyze", {
        paperId,
        attachments: attachments.map(({ name, type, dataUrl }) => ({ name, type, dataUrl })),
      }, {
        timeoutMs: 240000,
        headers: { "Idempotency-Key": createAiIdempotencyKey() },
      });
      setAnalysis(normalizeAnswerCoachAnalysis(payload));
      setReportId(idOf(payload.report));
      setDiagnostics(payload.report?.diagnostics || {});
      setAttachments([]);
      await refreshReports();
      toast.success("Answer review saved.");
    } catch (error) {
      toast.error(getAiRequestErrorMessage(error, "Could not review these answers."));
    } finally {
      setAnalyzing(false);
    }
  };

  const loadReport = async (id) => {
    if (!id) return;
    setLoadingReportId(id);
    try {
      const payload = await api.get(`/api/answer-coach/reports/${id}`);
      const report = payload.report;
      setAnalysis(normalizeAnswerCoachAnalysis(report.analysis));
      setReportId(idOf(report));
      setDiagnostics(report?.diagnostics || {});
      if (report.paperId !== paperId) {
        setPaper(null);
        setPaperId(report.paperId);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load this answer review.");
    } finally {
      setLoadingReportId("");
    }
  };

  return (
    <div className="answer-coach-layout">
      <section className="card answer-coach-intro">
        <div>
          <h2>Review written answers</h2>
          <p>Choose one of your generated papers, upload clearly numbered answers, and get provisional step feedback. Only readable answers are scored.</p>
        </div>
      </section>
      <div className="answer-coach-columns">
        <section className="card answer-coach-input">
          <h3>Review a solved paper</h3>
          {paperOptions.length ? (
            <>
              <label className="answer-coach-field">
                <span>Generated question paper</span>
                <select onChange={(event) => { setPaperId(event.target.value); setAnalysis(null); setReportId(""); }} value={paperId}>
                  {paperOptions.map((item) => <option key={idOf(item)} value={idOf(item)}>{item.paperTitle || item.title}</option>)}
                </select>
              </label>
              <label className="answer-coach-upload">
                <UploadCloud aria-hidden="true" size={27} />
                <strong>Choose answer photos or a PDF</strong>
                <span>Up to 3 files. Keep question numbers and working clearly visible.</span>
                <input accept={LEARNING_ATTACHMENT_ACCEPT} disabled={preparingFiles || analyzing} multiple onChange={(event) => {
                  addFiles(event.target.files);
                  event.target.value = "";
                }} type="file" />
              </label>
              {attachments.length > 0 && <ul className="answer-coach-files">{attachments.map((item) => (
                <li key={item.id}>
                  {item.type === "application/pdf" ? <FileText aria-hidden="true" size={16} /> : <FileImage aria-hidden="true" size={16} />}
                  <span>{item.name}</span>
                  <button aria-label={`Remove ${item.name}`} disabled={analyzing} onClick={() => setAttachments((current) => current.filter((file) => file.id !== item.id))} type="button"><X size={15} /></button>
                </li>
              ))}</ul>}
              <button className="answer-coach-primary" disabled={!paperId || !attachments.length || preparingFiles || analyzing || hasInsufficientCredits(AI_FEATURES.ANSWER_COACH)} onClick={analyze} type="button">
                {analyzing ? <><LoaderCircle className="spin" size={17} /> Reviewing answers...</> : `Review answers · ${getCost(AI_FEATURES.ANSWER_COACH)} credits`}
              </button>
              <p className="answer-coach-input__note">Your answer pages are sent to the configured AI provider for review. Photos and PDFs are not saved; the text review is saved to your academic profile. Marks are provisional study guidance.</p>
            </>
          ) : <p>Generate a question paper first, then return here with your solved answers.</p>}
        </section>
        <section className="card answer-coach-history">
          <h3>Saved reviews</h3>
          {reports.length ? <ul>{reports.map((item) => (
            <li key={idOf(item)}>
              <button disabled={loadingReportId === idOf(item)} onClick={() => loadReport(idOf(item))} type="button">
                <strong>{item.paperTitle || "Question paper"}</strong>
                <span>{dateLabel(item.createdAt)}</span>
              </button>
            </li>
          ))}</ul> : <p>Your answer reviews will appear here.</p>}
        </section>
      </div>

      {analysis && (
        <section className="answer-coach-results" aria-live="polite">
          <div className="card answer-coach-results__summary">
            <div><h2>{analysis.paperTitle || "Answer review"}</h2><p>{analysis.questions.length} readable answer{analysis.questions.length === 1 ? "" : "s"} reviewed</p></div>
            <strong>{analysis.totalAwarded} / {analysis.totalPossible} provisional marks</strong>
          </div>
          {analysis.unreadableQuestionNumbers.length > 0 && <p className="answer-coach-unreadable">Question {analysis.unreadableQuestionNumbers.join(", ")} could not be scored reliably and received no mark. Try a clearer photo.</p>}
          {analysis.ungradedQuestionNumbers.length > 0 && <p className="answer-coach-unreadable">Question {analysis.ungradedQuestionNumbers.join(", ")} exceeded this review's 20-answer limit and received no mark. Upload those answers in another review.</p>}
          {analysis.questions.map((question) => (
            <AnswerCoachQuestion
              key={`${reportId}-${question.questionNumber}`}
              analysis={analysis}
              diagnostic={diagnostics[question.questionNumber]}
              onAddRevisionTask={onAddRevisionTask}
              onDiagnosticSaved={(number, value) => setDiagnostics((current) => ({ ...current, [number]: value }))}
              paper={idOf(paper) === analysis.paperId ? paper : null}
              question={question}
              reportId={reportId}
            />
          ))}
        </section>
      )}
    </div>
  );
}
