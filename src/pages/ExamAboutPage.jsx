import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  Code2,
  Download,
  FileCheck2,
  FilePlus2,
  Flag,
  GraduationCap,
  ListChecks,
  Maximize2,
  Pause,
  Play,
  ShieldAlert,
  Sparkles,
  Target,
  TimerReset,
  Trophy,
} from "lucide-react";
import "./ExamAboutPage.css";

function ExamAboutPage() {
  const navigate = useNavigate();

  return (
    <section className="page-stack exam-guide-page">
      <header className="card exam-guide-hero">
        <div className="exam-guide-hero__topline">
          <button className="exam-guide-back" onClick={() => navigate("/exam")} type="button">
            <ArrowLeft size={16} /> Back to Exam
          </button>
          <span className="exam-guide-kicker"><GraduationCap size={15} /> Exam workspace guide</span>
        </div>
        <div className="exam-guide-hero__content">
          <div>
            <h2>Know the rules before you start.</h2>
            <p>Take a secure online exam, build printable AI papers, review delayed results, earn certificates, and practice with an offline timer.</p>
            <button className="exam-guide-primary" onClick={() => navigate("/exam")} type="button">
              Open Exam workspace <ArrowRight size={16} />
            </button>
          </div>
          <div className="exam-guide-stats" aria-label="Exam workspace key rules">
            <div><strong>80%</strong><span>Planner completion to unlock</span></div>
            <div><strong>2 / 24h</strong><span>Rolling start limit</span></div>
            <div><strong>40 / 60m</strong><span>Questions and duration</span></div>
            <div><strong>72h</strong><span>Results unlock</span></div>
          </div>
        </div>
      </header>

      <nav className="card exam-guide-nav" aria-label="Exam guide sections">
        <a href="#exam-guide-limits"><ShieldAlert size={15} /> Limits</a>
        <a href="#exam-guide-workflow"><Target size={15} /> Workflow</a>
        <a href="#exam-guide-attend"><ListChecks size={15} /> Attend Exam</a>
        <a href="#exam-guide-paper"><FilePlus2 size={15} /> Generate Paper</a>
        <a href="#exam-guide-results"><Trophy size={15} /> Results</a>
        <a href="#exam-guide-timer"><TimerReset size={15} /> Offline Timer</a>
      </nav>

      <section className="card exam-guide-limits" id="exam-guide-limits">
        <div className="exam-guide-section-heading">
          <span className="exam-guide-kicker"><ShieldAlert size={15} /> Online exam limits</span>
          <h2>Everything enforced during an attempt</h2>
          <p>These limits apply to Attend Exam. Printable question-paper limits are listed separately below.</p>
        </div>
        <div className="exam-guide-limit-grid">
          <article><strong>80%</strong><span>Planner unlock</span><p>Complete at least 80% of scheduled planner tasks.</p></article>
          <article><strong>2</strong><span>Starts per 24 hours</span><p>Start up to two new exams in any rolling 24-hour window.</p></article>
          <article><strong>15m</strong><span>Submit lock</span><p>Manual submission unlocks 15 minutes after the server starts the attempt.</p></article>
          <article><strong>40 / 60m</strong><span>Fixed attempt</span><p>Answer exactly 40 MCQs within the fixed 60-minute timer.</p></article>
          <article><strong>3 + 1</strong><span>Integrity warnings</span><p>The first three violations warn you; the fourth auto-submits.</p></article>
          <article><strong>72h</strong><span>Result delay</span><p>Scores, review, PDF, and certificates remain locked until release.</p></article>
        </div>
        <p className="exam-guide-limit-note"><Clock3 size={16} /> The start limit does not reset at midnight. A slot returns 24 hours after the older counted start. Refreshing or reconnecting resumes an active attempt; a submitted exam cannot be restarted.</p>
      </section>

      <section className="card exam-guide-workflow" id="exam-guide-workflow">
        <div className="exam-guide-section-heading">
          <span className="exam-guide-kicker"><Target size={15} /> Recommended workflow</span>
          <h2>Set up, attempt, and review</h2>
          <p>Use this order for accurate exams and question papers.</p>
        </div>
        <div className="exam-guide-steps">
          <article><b>1</b><div><strong>Add subjects</strong><p>Save subjects with useful chapter or syllabus details.</p></div></article>
          <article><b>2</b><div><strong>Choose a mode</strong><p>Take an online exam or design a printable paper.</p></div></article>
          <article><b>3</b><div><strong>Attempt or export</strong><p>Finish in fullscreen or download the paper and key.</p></div></article>
          <article><b>4</b><div><strong>Review</strong><p>Open released results or reuse saved papers offline.</p></div></article>
        </div>
      </section>

      <div className="exam-guide-component-grid">
        <article className="card exam-guide-component is-wide" id="exam-guide-attend">
          <div className="exam-guide-component__heading">
            <span className="exam-guide-icon"><ListChecks size={21} /></span>
            <div><span className="exam-guide-kicker">Component 01</span><h2>Attend Exam</h2></div>
          </div>
          <p className="exam-guide-lead">A fullscreen, server-timed assessment with autosave, flags, and secure grading.</p>
          <div className="exam-guide-detail-columns">
            <div className="exam-guide-detail-list">
              <div><BookOpenCheck size={17} /><span><strong>Prepare</strong>Select a saved subject, optional topics, and easy, medium, or hard difficulty.</span></div>
              <div><Sparkles size={17} /><span><strong>Generate</strong>PrepMatrix builds four validated batches of ten unique questions.</span></div>
              <div><Maximize2 size={17} /><span><strong>Attempt</strong>Fullscreen keeps the timer, palette, flags, and answers in one secure frame.</span></div>
              <div><CheckCircle2 size={17} /><span><strong>Save and submit</strong>Answers autosave in order. Time expiry submits the latest saved state automatically.</span></div>
            </div>
            <aside className="exam-guide-rule-panel">
              <ShieldAlert size={22} />
              <h3>Integrity rules</h3>
              <ol>
                <li>Changing tabs or hiding the page records a violation.</li>
                <li>Exiting fullscreen also records a violation.</li>
                <li>Violations one, two, and three display warnings.</li>
                <li>The fourth violation submits the exam automatically.</li>
              </ol>
            </aside>
          </div>
        </article>

        <article className="card exam-guide-component" id="exam-guide-paper">
          <div className="exam-guide-component__heading">
            <span className="exam-guide-icon"><FilePlus2 size={21} /></span>
            <div><span className="exam-guide-kicker">Component 02</span><h2>Generate Question Paper</h2></div>
          </div>
          <p className="exam-guide-lead">Build a printable paper with an exact mark allocation and optional answer key.</p>
          <ul className="exam-guide-checklist">
            <li><CheckCircle2 size={15} /> Choose 30 to 100 marks in steps of 10.</li>
            <li><CheckCircle2 size={15} /> Allocate only 1, 3, 4, 5, 10, or 15-mark questions and match the total exactly.</li>
            <li><CheckCircle2 size={15} /> Keep the final paper to 100 questions or fewer.</li>
            <li><CheckCircle2 size={15} /> Select multiple saved subjects, topics, difficulty, and question style.</li>
            <li><Code2 size={15} /> Coding subjects automatically receive stronger code, debugging, algorithm, and output-prediction coverage.</li>
            <li><FileCheck2 size={15} /> Include internal choices, shuffling, institution details, instructions, and an answer key.</li>
          </ul>
        </article>

        <article className="card exam-guide-component" id="exam-guide-results">
          <div className="exam-guide-component__heading">
            <span className="exam-guide-icon"><Trophy size={21} /></span>
            <div><span className="exam-guide-kicker">Component 03</span><h2>View Results</h2></div>
          </div>
          <p className="exam-guide-lead">Results unlock 72 hours after submission or automatic time expiry.</p>
          <ul className="exam-guide-checklist">
            <li><Clock3 size={15} /> A live countdown shows the precise release time.</li>
            <li><CheckCircle2 size={15} /> Released results show score, percentage, correct, incorrect, and unanswered counts.</li>
            <li><Flag size={15} /> Review each selected answer, correct answer, and explanation.</li>
            <li><Download size={15} /> Export the complete released result as a PDF.</li>
            <li><Trophy size={15} /> Scores of 60%+ earn an exportable certificate: Bronze 60–&lt;75%, Silver 75–&lt;88%, Gold 88–96%, and Elite &gt;96%.</li>
          </ul>
        </article>

        <article className="card exam-guide-component" id="exam-guide-timer">
          <div className="exam-guide-component__heading">
            <span className="exam-guide-icon"><TimerReset size={21} /></span>
            <div><span className="exam-guide-kicker">Component 04</span><h2>Offline Exam Timer</h2></div>
          </div>
          <p className="exam-guide-lead">Use the timer while solving downloaded papers or studying without starting the secure online exam.</p>
          <div className="exam-guide-timer-modes">
            <span><Play size={15} /><strong>25 / 5</strong> Pomodoro focus</span>
            <span><Pause size={15} /><strong>50 / 10</strong> Extended focus</span>
            <span><Clock3 size={15} /><strong>Paper time</strong> Generated-paper duration</span>
          </div>
          <p className="exam-guide-note">The timer persists locally, supports pause, reset, and skip, and can notify you when a focus or break session finishes.</p>
        </article>

        <article className="card exam-guide-component">
          <div className="exam-guide-component__heading">
            <span className="exam-guide-icon"><Download size={21} /></span>
            <div><span className="exam-guide-kicker">Component 05</span><h2>Saved Papers & Exports</h2></div>
          </div>
          <p className="exam-guide-lead">Every generated question paper is saved to your account for quick reuse.</p>
          <ul className="exam-guide-checklist">
            <li><FileCheck2 size={15} /> Export the formatted question paper PDF.</li>
            <li><FileCheck2 size={15} /> Export the answer key and marking scheme when enabled.</li>
            <li><BookOpenCheck size={15} /> Search saved papers by title or subject.</li>
            <li><Download size={15} /> Reopen and download a paper without generating it again.</li>
          </ul>
        </article>
      </div>

      <section className="card exam-guide-footer-cta">
        <div><span className="exam-guide-kicker">Ready to begin?</span><h2>Return to the Exam workspace and choose your mode.</h2></div>
        <button className="exam-guide-primary" onClick={() => navigate("/exam")} type="button">Open Exam workspace <ArrowRight size={16} /></button>
      </section>
    </section>
  );
}

export default ExamAboutPage;
