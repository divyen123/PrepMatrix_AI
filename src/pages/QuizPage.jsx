import { useEffect, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { toast } from "react-toastify";
import { Download } from "lucide-react";
import api from "../utils/apiClient";

const QUIZ_HISTORY_PER_PAGE = 6;

function QuizPage({ academicLevel, academicTrack, userProfile, subjects }) {
  const [topic, setTopic] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [questionLimit, setQuestionLimit] = useState(5);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [saveError, setSaveError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [quizMeta, setQuizMeta] = useState(null);
  const [historyPage, setHistoryPage] = useState(1);

  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    setSearchQuery(subjectName);
  }, [subjectName]);

  const filteredSubjects = subjects.filter((subject) =>
    subject.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    let isMounted = true;

    api.getQuizzes()
      .then((payload) => {
        if (isMounted) setAttempts(payload.attempts || []);
      })
      .catch((error) => {
        setSaveError(error instanceof Error ? error.message : "Could not load quiz history.");
      });

    return () => {
      isMounted = false;
    };
  }, []);



  const selectedSubject = subjectName || subjects[0]?.name || "General study";
  const cleanTopic = topic.trim();

  const historyTotalPages = Math.max(1, Math.ceil(attempts.length / QUIZ_HISTORY_PER_PAGE));
  const historyStart = (historyPage - 1) * QUIZ_HISTORY_PER_PAGE;
  const paginatedAttempts = attempts.slice(historyStart, historyStart + QUIZ_HISTORY_PER_PAGE);

  useEffect(() => {
    setHistoryPage((current) => Math.min(current, historyTotalPages));
  }, [historyTotalPages]);

  const downloadQuizPDF = async () => {
    const element = document.getElementById("quiz-export-container");
    if (!element) return;

    try {
      const canvas = await html2canvas(element, {
        backgroundColor: "#0d151c",
        scale: 2
      });
      const imageData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const imageWidth = 190;
      const imageHeight = (canvas.height * imageWidth) / canvas.width;

      pdf.addImage(imageData, "PNG", 10, 10, imageWidth, imageHeight);
      pdf.save(`Quiz_${cleanTopic.replace(/\s+/g, "_")}.pdf`);
      toast.success("Quiz PDF exported.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to export PDF.");
    }
  };

  const startQuiz = async () => {
    if (!cleanTopic) {
      setSaveError("Enter the exact topic first, for example: Travelling salesman problem.");
      return;
    }

    try {
      setIsGenerating(true);
      setSaveError("");
      setQuestions([]);
      setAnswers({});
      setResult(null);
      setQuizMeta(null);

      const payload = await api.generateQuiz({
        academicLevel,
        academicTrack,
        department: userProfile?.department || "",
        subjectName: selectedSubject,
        topic: cleanTopic,
        limit: questionLimit,
      });

      setQuestions(payload.questions || []);
      setQuizMeta({ model: payload.model, limit: payload.limit, topic: payload.topic });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not generate quiz.");
    } finally {
      setIsGenerating(false);
    }
  };

  const submitQuiz = async () => {
    const score = questions.reduce(
      (total, question) => total + (answers[question.id] === question.answerIndex ? 1 : 0),
      0
    );

    try {
      setSaveError("");
      const payload = await api.saveQuizAttempt({
        academicLevel,
        academicTrack,
        department: userProfile?.department || "",
        subjectName: selectedSubject,
        topic: cleanTopic,
        total: questions.length,
        score,
      });

      setResult(payload.attempt);
      setAttempts((current) => [payload.attempt, ...current]);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save quiz attempt.");
    }
  };

  const clearHistory = async () => {
    if (attempts.length === 0) return;
    if (!window.confirm("Clear all quiz history for this account?")) return;

    try {
      setSaveError("");
      await api.clearQuizHistory();
      setAttempts([]);
      setHistoryPage(1);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not clear quiz history.");
    }
  };

  return (
    <section className="page-stack quiz-page">
      <div className="section-intro">
        <span className="section-tag">Quiz lab</span>
        <h2>Generate topic-only AI quizzes</h2>
      </div>

      <section className="card quiz-builder-card">
        <div>
          <span className="section-tag">Adaptive setup</span>
          <h3>Build a quiz from your exact topic</h3>
          <p className="card-subtext">
            Level: {academicLevel}. Stream: {academicTrack}
            {userProfile?.department ? `. Department: ${userProfile.department}` : ""}. Questions are generated from the topic, not from app features.
          </p>
        </div>

        <div className="quiz-builder-grid">
          <label className="field-stack">
            Subject
            <div className="autocomplete-container" style={{ position: "relative" }}>
              <input
                type="text"
                className="text-input"
                value={searchQuery}
                onChange={(event) => {
                  const val = event.target.value;
                  setSearchQuery(val);
                  setSubjectName(val);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => {
                  setTimeout(() => setShowDropdown(false), 200);
                }}
                placeholder="Type to search or select subject..."
                style={{ width: "100%", boxSizing: "border-box" }}
              />
              {showDropdown && searchQuery.trim() !== "" && (
                <div 
                  className="autocomplete-dropdown"
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    backgroundColor: "var(--surface-strong)",
                    border: "1px solid var(--border)",
                    borderRadius: "12px",
                    zIndex: 100,
                    maxHeight: "180px",
                    overflowY: "auto",
                    marginTop: "6px",
                    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.4)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)"
                  }}
                >
                  {filteredSubjects.length === 0 ? (
                    <div 
                      style={{ padding: "10px 14px", fontSize: "0.85rem", color: "var(--text-muted)", cursor: "pointer" }}
                      onMouseDown={() => {
                        setSubjectName(searchQuery);
                        setShowDropdown(false);
                      }}
                    >
                      Use "{searchQuery || "General study"}"
                    </div>
                  ) : (
                    filteredSubjects.map((subject) => (
                      <div
                        className="autocomplete-item"
                        key={subject.id}
                        style={{
                          padding: "10px 14px",
                          cursor: "pointer",
                          fontSize: "0.88rem",
                          color: "var(--text)",
                          borderBottom: "1px solid rgba(255, 255, 255, 0.03)",
                          transition: "background 0.2s"
                        }}
                        onMouseDown={() => {
                          setSubjectName(subject.name);
                          setSearchQuery(subject.name);
                          setShowDropdown(false);
                        }}
                      >
                        {subject.name}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </label>

          <label className="field-stack">
            Topic or doubt
            <input
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Example: Travelling salesman problem"
              value={topic}
            />
          </label>

          <label className="field-stack">
            Question limit
            <select
              onChange={(event) => setQuestionLimit(Number(event.target.value))}
              value={questionLimit}
            >
              <option value={5}>5 questions</option>
              <option value={10}>10 questions</option>
            </select>
          </label>
        </div>

        {saveError && <p className="auth-message">{saveError}</p>}

        <button className="action-btn" disabled={isGenerating} onClick={startQuiz} type="button">
          {isGenerating ? "Generating topic quiz..." : "Generate AI quiz"}
        </button>
      </section>

      {questions.length > 0 && (
        <section className="card quiz-runner-card">
          <div className="quiz-runner-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <span className="section-tag">Question set</span>
              <h3>{cleanTopic}</h3>
              {quizMeta?.model && <p className="card-subtext" style={{ margin: 0 }}>Generated by {quizMeta.model} with {questions.length} topic-focused questions.</p>}
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <button 
                className="secondary-btn" 
                onClick={downloadQuizPDF} 
                type="button" 
                title="Export PDF"
                style={{ width: "32px", height: "32px", minWidth: "32px", minHeight: "32px", padding: 0, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                <Download size={16} />
              </button>
              {result && (
                <strong 
                  className="quiz-score-chip" 
                  style={{ height: "32px", minHeight: "32px", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 14px", fontSize: "0.82rem", margin: 0, boxSizing: "border-box", borderRadius: "999px" }}
                >
                  Score {result.score}/{result.total}
                </strong>
              )}
            </div>
          </div>

          <div className="quiz-question-list" id="quiz-export-container" style={{ padding: "12px" }}>
            {questions.map((question, index) => (
              <article className="quiz-question-card" key={question.id}>
                <h4>{index + 1}. {question.question}</h4>
                <div className="quiz-option-grid">
                  {question.options.map((option, optionIndex) => {
                    const selected = answers[question.id] === optionIndex;
                    const isCorrect = result && question.answerIndex === optionIndex;
                    const isWrong = result && selected && !isCorrect;
                    const className = [
                      "quiz-option",
                      selected ? "selected" : "",
                      isCorrect ? "correct" : "",
                      isWrong ? "wrong" : "",
                    ].filter(Boolean).join(" ");

                    return (
                      <button
                        className={className}
                        disabled={Boolean(result)}
                        key={`${question.id}-${optionIndex}`}
                        onClick={() => setAnswers((current) => ({ ...current, [question.id]: optionIndex }))}
                        type="button"
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
                {result && (
                  <div style={{ marginTop: "12px" }}>
                    {answers[question.id] !== question.answerIndex ? (
                      <p style={{ color: "#ef4444", fontSize: "0.88rem", fontWeight: 700, margin: "0 0 6px" }}>
                        ✕ Incorrect. The correct answer is: {question.options[question.answerIndex]}
                      </p>
                    ) : (
                      <p style={{ color: "#22c55e", fontSize: "0.88rem", fontWeight: 700, margin: "0 0 6px" }}>
                        ✓ Correct!
                      </p>
                    )}
                    <p className="quiz-explanation"><strong>Explanation:</strong> {question.explanation}</p>
                  </div>
                )}
              </article>
            ))}
          </div>

          {!result && (
            <button
              disabled={Object.keys(answers).length !== questions.length}
              onClick={submitQuiz}
              type="button"
            >
              Submit quiz
            </button>
          )}
        </section>
      )}

      <section className="card quiz-history-card">
        <div className="quiz-history-header">
          <div>
            <span className="section-tag">Quiz history</span>
            <h3>Recent attempts</h3>
          </div>
          {attempts.length > 0 && (
            <button className="clear-history-btn" onClick={clearHistory} title="Clear quiz history" type="button">
              🗑 Clear history
            </button>
          )}
        </div>
        <div className="quiz-history-grid">
          {attempts.length === 0 ? (
            <p className="card-subtext">No quiz attempts yet. Generate your first topic quiz.</p>
          ) : (
            attempts.map((attempt) => (
              <article className="quiz-history-item" key={attempt.id}>
                <strong>{attempt.topic}</strong>
                <span>{attempt.subjectName}</span>
                <b>{attempt.score}/{attempt.total}</b>
              </article>
            ))
          )}
        </div>
      </section>
    </section>
  );
}

export default QuizPage;



