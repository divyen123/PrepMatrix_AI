import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  CalendarCheck2,
  Check,
  CheckCircle2,
  Clock3,
  Flame,
  Lightbulb,
  LockKeyhole,
  Medal,
  RefreshCcw,
  Sparkles,
  Star,
  Trophy,
  X,
} from "lucide-react";
import {
  applySchoolKnowledgeResult,
  buildSchoolKnowledgeDailyChallenge,
  getSchoolKnowledgeDateKey,
  getSchoolKnowledgeStorageKey,
  getSchoolKnowledgeUserKey,
  loadSchoolKnowledgeProgress,
  millisecondsUntilNextSchoolKnowledgeDay,
  saveSchoolKnowledgeProgress,
  scoreSchoolKnowledgeChallenge,
} from "../utils/schoolKnowledge";
import { legacyAcademicProfileOwnerStorageKey } from "../utils/academicProfileScope";
import "./SchoolKnowledgePage.css";

function getDefaultStorage(providedStorage) {
  if (providedStorage !== undefined) return providedStorage;
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function resolveGrade(value, profile) {
  const source = String(
    value
      || profile?.grade
      || profile?.classLevel
      || profile?.standard
      || profile?.academicLevel
      || "4",
  );
  const match = source.match(/(?:class|grade|standard|std\.?)[\s:-]*([4-8])\b/iu);
  const number = match ? Number(match[1]) : Number.parseInt(source, 10);
  return number >= 4 && number <= 8 ? number : 4;
}

function formatCountdown(milliseconds) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours + "h " + String(minutes).padStart(2, "0") + "m";
}

function resultMessage(percentage) {
  if (percentage === 100) return "Knowledge champion!";
  if (percentage >= 75) return "Brilliant exploring!";
  if (percentage >= 50) return "Great curiosity!";
  return "Every answer grows your knowledge!";
}

function SchoolKnowledgePage({
  academicProfileDataId = "",
  userProfile = {},
  grade,
  questionCount = 8,
  storage,
  onChallengeComplete,
}) {
  const [now, setNow] = useState(() => new Date());
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [result, setResult] = useState(null);
  const [saveWarning, setSaveWarning] = useState("");

  const resolvedStorage = useMemo(() => getDefaultStorage(storage), [storage]);
  const profileIdentifier = userProfile?.id || userProfile?._id || userProfile?.email || "local-learner";
  const persistenceProfile = useMemo(() => ({
    dataId: academicProfileDataId,
    id: profileIdentifier,
  }), [academicProfileDataId, profileIdentifier]);
  const classNumber = resolveGrade(grade, userProfile);
  const userKey = getSchoolKnowledgeUserKey(persistenceProfile);
  const dateKey = getSchoolKnowledgeDateKey(now);
  const challenge = useMemo(() => buildSchoolKnowledgeDailyChallenge({
    date: new Date(dateKey + "T12:00:00"),
    grade: classNumber,
    questionCount,
    userKey,
  }), [classNumber, dateKey, questionCount, userKey]);
  const [progress, setProgress] = useState(() => {
    const scopedKey = getSchoolKnowledgeStorageKey(persistenceProfile);
    const legacyProfile = { id: profileIdentifier };
    const legacyKey = getSchoolKnowledgeStorageKey(legacyProfile);
    if (
      academicProfileDataId
      && resolvedStorage?.getItem(legacyAcademicProfileOwnerStorageKey(userProfile))
        === academicProfileDataId
      && scopedKey !== legacyKey
      && !resolvedStorage?.getItem(scopedKey)
      && resolvedStorage?.getItem(legacyKey)
    ) {
      const legacyProgress = loadSchoolKnowledgeProgress(resolvedStorage, legacyProfile);
      saveSchoolKnowledgeProgress(resolvedStorage, persistenceProfile, legacyProgress);
      resolvedStorage.removeItem(legacyKey);
      return legacyProgress;
    }
    return loadSchoolKnowledgeProgress(resolvedStorage, persistenceProfile);
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setProgress(loadSchoolKnowledgeProgress(resolvedStorage, persistenceProfile));
    setAnswers({});
    setCurrentIndex(0);
    setResult(null);
    setSaveWarning("");
  }, [challenge.id, persistenceProfile, resolvedStorage, userKey]);

  const currentQuestion = challenge.questions[currentIndex];
  const selectedAnswer = currentQuestion ? answers[currentQuestion.id] || "" : "";
  const bestPercentage = progress.bestTotal
    ? Math.round(progress.bestScore / progress.bestTotal * 100)
    : 0;
  const overallAccuracy = progress.totalQuestions
    ? Math.round(progress.totalCorrect / progress.totalQuestions * 100)
    : 0;
  const completedToday = progress.completedDateKeys.includes(challenge.dateKey);
  const countdown = formatCountdown(millisecondsUntilNextSchoolKnowledgeDay(now));

  const selectAnswer = (answerId) => {
    if (!currentQuestion || result) return;
    setAnswers((current) => ({ ...current, [currentQuestion.id]: answerId }));
  };

  const finishChallenge = () => {
    const scored = scoreSchoolKnowledgeChallenge(challenge, answers);
    const nextProgress = applySchoolKnowledgeResult(progress, scored);
    const saved = saveSchoolKnowledgeProgress(resolvedStorage, persistenceProfile, nextProgress);
    setProgress(nextProgress);
    setResult(scored);
    setSaveWarning(saved ? "" : "This result is shown now, but this browser could not save it.");
    onChallengeComplete?.(scored, nextProgress);
  };

  const moveForward = () => {
    if (!selectedAnswer) return;
    if (currentIndex >= challenge.questions.length - 1) {
      finishChallenge();
      return;
    }
    setCurrentIndex((index) => index + 1);
  };

  const playAgain = () => {
    setAnswers({});
    setCurrentIndex(0);
    setResult(null);
    setSaveWarning("");
  };

  return (
    <main className="school-knowledge-page">
      <section className="school-knowledge-shell" aria-labelledby="school-knowledge-title">
        <header className="school-knowledge-hero">
          <div className="school-knowledge-heading">
            <span className="school-knowledge-logo" aria-hidden="true">
              <Sparkles size={28} />
            </span>
            <div>
              <p className="school-knowledge-eyebrow">Class {classNumber} daily challenge</p>
              <h1 id="school-knowledge-title">General Knowledge Club</h1>
              <p>One colorful quest each day. Learn about India, science, our world, and more.</p>
            </div>
          </div>
          <div className="school-knowledge-private">
            <LockKeyhole aria-hidden="true" size={18} />
            <span><strong>Private score board</strong>Only this learner&apos;s progress is saved here.</span>
          </div>
        </header>

        <section aria-label="Your score board" className="school-knowledge-scoreboard">
          <article>
            <span className="is-flame" aria-hidden="true"><Flame size={21} /></span>
            <div><strong>{progress.streak}</strong><small>Day streak</small></div>
          </article>
          <article>
            <span className="is-trophy" aria-hidden="true"><Trophy size={21} /></span>
            <div><strong>{progress.bestTotal ? bestPercentage + "%" : "—"}</strong><small>Personal best</small></div>
          </article>
          <article>
            <span className="is-medal" aria-hidden="true"><Medal size={21} /></span>
            <div><strong>{progress.completedDateKeys.length}</strong><small>Days completed</small></div>
          </article>
          <article>
            <span className="is-star" aria-hidden="true"><Star size={21} /></span>
            <div><strong>{progress.totalQuestions ? overallAccuracy + "%" : "—"}</strong><small>All-time accuracy</small></div>
          </article>
        </section>

        <div className="school-knowledge-daily-banner">
          <div>
            <CalendarCheck2 aria-hidden="true" size={20} />
            <span>
              <strong>{completedToday ? "Today's challenge completed" : "Today's challenge is ready"}</strong>
              <small>A fresh question set arrives after local midnight.</small>
            </span>
          </div>
          <span className="school-knowledge-countdown">
            <Clock3 aria-hidden="true" size={17} /> New quest in {countdown}
          </span>
        </div>

        {!result && currentQuestion && (
          <section className="school-knowledge-play" aria-labelledby="school-knowledge-question">
            <div className="school-knowledge-progress-row">
              <span>Question {currentIndex + 1} of {challenge.questions.length}</span>
              <span>{currentQuestion.category}</span>
            </div>
            <div
              aria-label={(currentIndex + 1) + " of " + challenge.questions.length + " questions"}
              aria-valuemax={challenge.questions.length}
              aria-valuemin="1"
              aria-valuenow={currentIndex + 1}
              className="school-knowledge-progress"
              role="progressbar"
            >
              <span style={{ width: ((currentIndex + 1) / challenge.questions.length * 100) + "%" }} />
            </div>

            <div className="school-knowledge-question-card">
              <div className="school-knowledge-question-icon" aria-hidden="true">
                <Lightbulb size={30} />
              </div>
              <p className="school-knowledge-eyebrow">Knowledge clue</p>
              <h2 id="school-knowledge-question">{currentQuestion.prompt}</h2>

              <div aria-label="Answer choices" className="school-knowledge-options" role="group">
                {currentQuestion.options.map((option, index) => {
                  const selected = selectedAnswer === option.id;
                  return (
                    <button
                      aria-pressed={selected}
                      className={selected ? "is-selected" : ""}
                      key={option.id}
                      onClick={() => selectAnswer(option.id)}
                      type="button"
                    >
                      <span aria-hidden="true">{String.fromCharCode(65 + index)}</span>
                      <strong>{option.label}</strong>
                      {selected && <Check aria-hidden="true" size={21} />}
                    </button>
                  );
                })}
              </div>

              <p aria-live="polite" className="school-knowledge-selection">
                {selectedAnswer
                  ? "Selected: " + currentQuestion.options.find((option) => option.id === selectedAnswer)?.label
                    + ". You can change it before continuing."
                  : "Choose one answer to continue."}
              </p>

              <div className="school-knowledge-actions">
                <button
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
                  type="button"
                >
                  <ArrowLeft aria-hidden="true" size={18} /> Back
                </button>
                <button
                  className="is-primary"
                  disabled={!selectedAnswer}
                  onClick={moveForward}
                  type="button"
                >
                  {currentIndex === challenge.questions.length - 1 ? "Finish quest" : "Next question"}
                  {currentIndex === challenge.questions.length - 1
                    ? <Award aria-hidden="true" size={18} />
                    : <ArrowRight aria-hidden="true" size={18} />}
                </button>
              </div>
            </div>
          </section>
        )}

        {result && (
          <section className="school-knowledge-results" aria-live="polite">
            <header>
              <span aria-hidden="true"><Award size={34} /></span>
              <div>
                <p className="school-knowledge-eyebrow">Quest complete</p>
                <h2>{resultMessage(result.percentage)}</h2>
                <p>You got <strong>{result.correct} of {result.total}</strong> correct.</p>
              </div>
              <div className="school-knowledge-result-score">
                <strong>{result.percentage}%</strong>
                <small>Your score</small>
              </div>
            </header>

            {saveWarning && <p className="school-knowledge-warning" role="alert">{saveWarning}</p>}

            <div className="school-knowledge-review">
              <h3>Mission review</h3>
              {result.review.map((item, index) => (
                <article className={item.correct ? "is-correct" : "is-incorrect"} key={item.id}>
                  <span aria-hidden="true">
                    {item.correct ? <CheckCircle2 size={21} /> : <X size={21} />}
                  </span>
                  <div>
                    <p className="school-knowledge-review-number">Question {index + 1} · {item.category}</p>
                    <h4>{item.prompt}</h4>
                    <p>
                      Your answer: <strong>{item.selectedLabel}</strong>
                      {!item.correct && <> · Correct answer: <strong>{item.correctLabel}</strong></>}
                    </p>
                    <small>{item.explanation}</small>
                  </div>
                </article>
              ))}
            </div>

            <button className="school-knowledge-replay" onClick={playAgain} type="button">
              <RefreshCcw aria-hidden="true" size={18} /> Practise today&apos;s quest again
            </button>
          </section>
        )}
      </section>
    </main>
  );
}

export default SchoolKnowledgePage;
