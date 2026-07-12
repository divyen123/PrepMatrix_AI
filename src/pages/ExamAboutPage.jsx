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
            <h2>Understand every part of the Exam workspace.</h2>
            <p>Learn how PrepMatrix prepares secure online exams, builds exact question papers, protects assessment integrity, releases results, and supports offline practice.</p>
            <button className="exam-guide-primary" onClick={() => navigate("/exam")} type="button">
              Open Exam workspace <ArrowRight size={16} />
            </button>
          </div>
          <div className="exam-guide-stats" aria-label="Exam workspace key rules">
            <div><strong>40</strong><span>MCQs per online exam</span></div>
            <div><strong>60m</strong><span>Fixed online duration</span></div>
            <div><strong>72h</strong><span>Result release delay</span></div>
            <div><strong>4th</strong><span>Violation auto-submits</span></div>
          </div>
        </div>
      </header>

      <nav className="card exam-guide-nav" aria-label="Exam guide sections">
        <a href="#exam-guide-workflow"><Target size={15} /> Workflow</a>
        <a href="#exam-guide-attend"><ListChecks size={15} /> Attend Exam</a>
        <a href="#exam-guide-paper"><FilePlus2 size={15} /> Generate Paper</a>
        <a href="#exam-guide-results"><Trophy size={15} /> Results</a>
        <a href="#exam-guide-timer"><TimerReset size={15} /> Offline Timer</a>
      </nav>

      <section className="card exam-guide-workflow" id="exam-guide-workflow">
        <div className="exam-guide-section-heading">
          <span className="exam-guide-kicker"><Target size={15} /> Recommended workflow</span>
          <h2>From subject setup to final review</h2>
          <p>Complete these steps in order for the most accurate exam and question-paper output.</p>
        </div>
        <div className="exam-guide-steps">
          <article><b>1</b><div><strong>Add subjects</strong><p>Create subjects and include useful chapter or syllabus details.</p></div></article>
          <article><b>2</b><div><strong>Choose a mode</strong><p>Attend a secure online exam or design a printable question paper.</p></div></article>
          <article><b>3</b><div><strong>Complete or export</strong><p>Answer the MCQs in fullscreen or download the generated paper and key.</p></div></article>
          <article><b>4</b><div><strong>Review progress</strong><p>Return after the result countdown or use saved papers for offline practice.</p></div></article>
        </div>
      </section>

      <div className="exam-guide-component-grid">
        <article className="card exam-guide-component is-wide" id="exam-guide-attend">
          <div className="exam-guide-component__heading">
            <span className="exam-guide-icon"><ListChecks size={21} /></span>
            <div><span className="exam-guide-kicker">Component 01</span><h2>Attend Exam</h2></div>
          </div>
          <p className="exam-guide-lead">A focused, server-timed assessment with exactly 40 multiple-choice questions and a fixed 60-minute duration.</p>
          <div className="exam-guide-detail-columns">
            <div className="exam-guide-detail-list">
              <div><BookOpenCheck size={17} /><span><strong>Prepare the exam</strong>Select one of your saved subjects, optionally enter chapters or topics, and choose easy, medium, or hard difficulty.</span></div>
              <div><Sparkles size={17} /><span><strong>AI question creation</strong>PrepMatrix builds four secure batches of ten questions and removes invalid or repeated items before the exam begins.</span></div>
              <div><Maximize2 size={17} /><span><strong>Fullscreen start</strong>The server timer starts with the attempt. Fullscreen keeps the question palette, timer, flags, and answers inside one secure frame.</span></div>
              <div><CheckCircle2 size={17} /><span><strong>Autosave and submission</strong>Every answer is queued and saved in order. Manual submission includes the latest answers, and time expiry submits automatically.</span></div>
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
          <p className="exam-guide-lead">Design a paper that matches your exact marks, subject, difficulty, and study scope.</p>
          <ul className="exam-guide-checklist">
            <li><CheckCircle2 size={15} /> Choose totals from 30 to 100 marks.</li>
            <li><CheckCircle2 size={15} /> Use the preloaded exact mark split or edit 1, 3, 4, 5, 10, and 15-mark counts.</li>
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
          <p className="exam-guide-lead">Results remain private for exactly 72 hours after submission or automatic time expiry.</p>
          <ul className="exam-guide-checklist">
            <li><Clock3 size={15} /> A live countdown shows the precise release time.</li>
            <li><CheckCircle2 size={15} /> Released results show score, percentage, correct, incorrect, and unanswered counts.</li>
            <li><Flag size={15} /> Review each selected answer, correct answer, and explanation.</li>
            <li><Download size={15} /> Export the complete released result as a PDF.</li>
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
