import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  LoaderCircle,
  LockKeyhole,
  Rocket,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { AiCreditCost } from "../components/AiQuotaProvider";
import api from "../utils/apiClient";
import { getAcademicProfileExamples } from "../utils/academicProfileExamples";
import {
  AI_FEATURES,
  createAiIdempotencyKey,
  getAiRequestErrorMessage,
  useAiQuota,
} from "../utils/aiQuota";
import {
  acceptLearningPrivacyConsent,
  hasLearningPrivacyConsent,
  LEARNING_PRIVACY_CONSENT_VERSION,
} from "../utils/learningPrivacyConsent";
import { LEARNING_NOTEBOOK_REQUEST_TIMEOUT_MS } from "../utils/learningNotebookRequest";
import {
  buildKidsLessonRequest,
  KIDS_LESSON_GENERATION_SIZES,
  normalizeKidsLessonNotebook,
} from "../utils/kidsStartLearning";
import "./KidsStartLearningPage.css";

const DEFAULT_SUBJECTS = Object.freeze([
  "English",
  "Maths",
  "Science",
  "Environmental Studies",
  "General Knowledge",
  "Art",
]);

function cleanSubjectOptions(subjects) {
  const source = Array.isArray(subjects) ? subjects : [];
  const values = source.map((entry) => (
    typeof entry === "string"
      ? entry
      : entry?.name || entry?.subjectName || entry?.title || ""
  ));
  return [...new Set([...values, ...DEFAULT_SUBJECTS]
    .map((value) => String(value || "").trim())
    .filter(Boolean))].slice(0, 20);
}

function lessonIdeas(notebook) {
  return notebook.chapters.flatMap((chapter) => (
    chapter.topics.length
      ? chapter.topics.map((topic) => ({ ...topic, chapterTitle: chapter.title }))
      : [{
          id: chapter.id,
          title: chapter.title,
          explanation: chapter.summary,
          keyPoints: [],
          examples: [],
          chapterTitle: "",
        }]
  ));
}

function PrivacyConsentDialog({ onCancel, onAgree }) {
  const dialogRef = useRef(null);
  const agreeRef = useRef(null);

  useEffect(() => {
    agreeRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = [...(dialogRef.current?.querySelectorAll("button:not([disabled])") || [])];
      if (!buttons.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div className="kids-start-privacy-backdrop" role="presentation">
      <section
        aria-describedby="kids-start-privacy-description"
        aria-labelledby="kids-start-privacy-title"
        aria-modal="true"
        className="kids-start-privacy-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <button
          aria-label="Close privacy notice"
          className="kids-start-privacy-close"
          onClick={onCancel}
          type="button"
        >
          <X aria-hidden="true" size={19} />
        </button>
        <span className="kids-start-privacy-icon" aria-hidden="true">
          <ShieldCheck size={28} />
        </span>
        <p className="kids-start-eyebrow">Grown-up privacy check</p>
        <h2 id="kids-start-privacy-title">May AI create this lesson?</h2>
        <div id="kids-start-privacy-description">
          <p>
            PrepMatrix sends the subject, topic, and registered learning level to its AI
            service to make and save this notebook.
          </p>
          <p>
            Do not type a child&apos;s full name, address, phone number, or other private
            information in the topic box.
          </p>
        </div>
        <div className="kids-start-privacy-actions">
          <button onClick={onCancel} type="button">Not now</button>
          <button className="is-primary" onClick={onAgree} ref={agreeRef} type="button">
            <ShieldCheck aria-hidden="true" size={17} /> Agree and create
          </button>
        </div>
      </section>
    </div>
  );
}

function KidsStartLearningPage({
  academicLevel = "",
  academicTrack = "School",
  userProfile = {},
  subjects = [],
  onNotebookCreated,
  setNotification,
}) {
  const { hasInsufficientCredits } = useAiQuota();
  const mountedRef = useRef(true);
  const pendingRequestRef = useRef(null);
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [generationSize, setGenerationSize] = useState("low");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [notebook, setNotebook] = useState(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const subjectOptions = useMemo(() => cleanSubjectOptions(subjects), [subjects]);
  const curriculumExamples = useMemo(
    () => getAcademicProfileExamples({ ...userProfile, academicLevel, academicTrack }),
    [academicLevel, academicTrack, userProfile]
  );
  const accountId = userProfile?.id || userProfile?._id || userProfile?.email || "";
  const ideas = useMemo(() => notebook ? lessonIdeas(notebook) : [], [notebook]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const runGeneration = async (request) => {
    if (hasInsufficientCredits(AI_FEATURES.LEARNING_NOTEBOOK)) {
      setError(getAiRequestErrorMessage({ code: "AI_USER_QUOTA_EXHAUSTED" }));
      return;
    }

    setGenerating(true);
    setError("");
    try {
      const payload = await api.post("/api/learning-notebooks/analyze", {
        ...request,
        privacyConsent: {
          accepted: true,
          version: LEARNING_PRIVACY_CONSENT_VERSION,
        },
      }, {
        timeoutMs: LEARNING_NOTEBOOK_REQUEST_TIMEOUT_MS,
        headers: { "Idempotency-Key": createAiIdempotencyKey() },
      });
      if (!mountedRef.current) return;
      const created = normalizeKidsLessonNotebook(payload?.notebook);
      setNotebook(created);
      onNotebookCreated?.(created, payload);
      setNotification?.("Your new lesson is ready and saved.");
    } catch (requestError) {
      if (!mountedRef.current) return;
      setError(getAiRequestErrorMessage(
        requestError,
        "The lesson could not be created. Your choices are still here, so you can try again.",
      ));
    } finally {
      if (mountedRef.current) setGenerating(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setError("");
    let request;
    try {
      request = buildKidsLessonRequest({
        subject,
        topic,
        generationSize,
        academicLevel,
        academicTrack,
        userProfile,
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Add a subject and topic.");
      return;
    }

    if (!hasLearningPrivacyConsent(accountId)) {
      pendingRequestRef.current = request;
      setPrivacyOpen(true);
      return;
    }
    runGeneration(request);
  };

  const acceptPrivacy = () => {
    acceptLearningPrivacyConsent(accountId);
    const request = pendingRequestRef.current;
    pendingRequestRef.current = null;
    setPrivacyOpen(false);
    if (request) runGeneration(request);
  };

  const closePrivacy = () => {
    pendingRequestRef.current = null;
    setPrivacyOpen(false);
  };

  const resetLesson = () => {
    setNotebook(null);
    setError("");
    setTopic("");
  };

  return (
    <main className="kids-start-page">
      <section className="kids-start-shell" aria-labelledby="kids-start-title">
        <header className="kids-start-hero">
          <div>
            <span className="kids-start-hero-icon" aria-hidden="true">
              <Rocket size={25} />
            </span>
            <p className="kids-start-eyebrow">Little learner studio</p>
            <h1 id="kids-start-title">What shall we learn today?</h1>
            <p>Pick one subject, one topic, and the lesson size. We will do the rest.</p>
          </div>
          <div className="kids-start-safe-note">
            <LockKeyhole aria-hidden="true" size={18} />
            <span><strong>Made for young learners</strong>Lessons stay at the registered class level.</span>
          </div>
        </header>

        {!notebook ? (
          <form className="kids-start-form" onSubmit={handleSubmit}>
            <div className="kids-start-fields">
              <label className="kids-start-field">
                <span><BookOpenCheck aria-hidden="true" size={18} /> Subject</span>
                <input
                  autoComplete="off"
                  disabled={generating}
                  list="kids-start-subjects"
                  maxLength={120}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder={curriculumExamples.subjectPlaceholder}
                  required
                  value={subject}
                />
                <datalist id="kids-start-subjects">
                  {subjectOptions.map((option) => <option key={option} value={option} />)}
                </datalist>
              </label>

              <label className="kids-start-field">
                <span><Sparkles aria-hidden="true" size={18} /> Topic</span>
                <input
                  autoComplete="off"
                  disabled={generating}
                  maxLength={160}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder={curriculumExamples.topicPlaceholder}
                  required
                  value={topic}
                />
              </label>
            </div>

            <fieldset className="kids-start-size">
              <legend>Generation size</legend>
              <div className="kids-start-size-options">
                {KIDS_LESSON_GENERATION_SIZES.map((option) => {
                  const selected = generationSize === option.id;
                  return (
                    <button
                      aria-pressed={selected}
                      className={selected ? "is-selected" : ""}
                      disabled={generating}
                      key={option.id}
                      onClick={() => setGenerationSize(option.id)}
                      type="button"
                    >
                      <span>{option.label}</span>
                      <small>{option.description}</small>
                      {selected && <CheckCircle2 aria-hidden="true" size={20} />}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {error && <p className="kids-start-error" role="alert">{error}</p>}

            <button className="kids-start-generate" disabled={generating} type="submit">
              {generating
                ? <LoaderCircle aria-hidden="true" className="kids-start-spinner" size={21} />
                : <WandSparkles aria-hidden="true" size={21} />}
              <span>{generating ? "Building your lesson..." : "Create my lesson"}</span>
              {!generating && <AiCreditCost feature={AI_FEATURES.LEARNING_NOTEBOOK} />}
            </button>
            <p className="kids-start-save-hint">
              <ShieldCheck aria-hidden="true" size={15} />
              The finished lesson is saved automatically as a notebook.
            </p>
            <div aria-live="polite" className="kids-start-sr-status">
              {generating ? "Creating and saving your lesson. This can take a little while." : ""}
            </div>
          </form>
        ) : (
          <section className="kids-start-result" aria-live="polite">
            <div className="kids-start-result-head">
              <span aria-hidden="true"><WandSparkles size={26} /></span>
              <div>
                <p className="kids-start-eyebrow">Lesson ready and saved</p>
                <h2>{notebook.title}</h2>
                {notebook.summary && <p>{notebook.summary}</p>}
              </div>
              <CheckCircle2 aria-label="Saved" className="kids-start-saved-check" size={29} />
            </div>

            <div className="kids-start-idea-list">
              {ideas.map((idea, index) => (
                <article className="kids-start-idea" key={idea.id + "-" + index}>
                  <span className="kids-start-idea-number" aria-hidden="true">{index + 1}</span>
                  <div>
                    {idea.chapterTitle && <p>{idea.chapterTitle}</p>}
                    <h3>{idea.title}</h3>
                    {idea.explanation && <div className="kids-start-explanation">{idea.explanation}</div>}
                    {!!idea.keyPoints.length && (
                      <ul>
                        {idea.keyPoints.map((point) => <li key={point}>{point}</li>)}
                      </ul>
                    )}
                    {!!idea.examples.length && (
                      <div className="kids-start-examples">
                        <strong>Try this example</strong>
                        {idea.examples.map((example) => <span key={example}>{example}</span>)}
                      </div>
                    )}
                  </div>
                </article>
              ))}
              {!ideas.length && (
                <article className="kids-start-idea">
                  <span className="kids-start-idea-number" aria-hidden="true">1</span>
                  <div>
                    <h3>Your lesson is in the saved notebook</h3>
                    <p>Open the notebook to explore all of its ideas and activities.</p>
                  </div>
                </article>
              )}
            </div>

            {!!notebook.importantQuestions.length && (
              <section className="kids-start-quick-check">
                <p className="kids-start-eyebrow">Quick check</p>
                <h3>Can you answer these?</h3>
                <ol>
                  {notebook.importantQuestions.slice(0, 5).map((question) => (
                    <li key={question.id}>{question.question}</li>
                  ))}
                </ol>
              </section>
            )}

            <button className="kids-start-another" onClick={resetLesson} type="button">
              Make another lesson <ChevronRight aria-hidden="true" size={18} />
            </button>
          </section>
        )}
      </section>

      {privacyOpen && <PrivacyConsentDialog onAgree={acceptPrivacy} onCancel={closePrivacy} />}
    </main>
  );
}

export default KidsStartLearningPage;
