import { useEffect, useState } from "react";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  Flag,
  ListTodo,
  Navigation,
  Pause,
  Play,
  RotateCcw,
  Target,
} from "lucide-react";
import "./GoalTodoIntro.css";

const INTRO_STEPS = [
  {
    label: "Choose",
    caption: "Start with one outcome and one small next action.",
  },
  {
    label: "Plan",
    caption: "Give the goal a date and keep the next action visible.",
  },
  {
    label: "Progress",
    caption: "Check them off as you move forward.",
  },
];

function shouldPlayInitially() {
  if (typeof window === "undefined") return true;
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function GoalTodoIntro({ active, goalTitle, onGetStarted, todoTitle }) {
  const [preview, setPreview] = useState(() => ({ phase: 0, playing: shouldPlayInitially() }));
  const { phase, playing } = preview;
  const finished = phase === INTRO_STEPS.length - 1;

  useEffect(() => {
    if (!active || !playing || finished) return undefined;
    const timer = window.setTimeout(() => {
      setPreview((current) => {
        const nextPhase = Math.min(current.phase + 1, INTRO_STEPS.length - 1);
        return { phase: nextPhase, playing: nextPhase < INTRO_STEPS.length - 1 };
      });
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [active, finished, phase, playing]);

  const selectPhase = (nextPhase) => setPreview({ phase: nextPhase, playing: false });
  const togglePlayback = () => setPreview((current) => (
    current.phase === INTRO_STEPS.length - 1
      ? { phase: 0, playing: true }
      : { ...current, playing: !current.playing }
  ));

  const goalMeta = phase === 0
    ? "Choose an outcome"
    : phase === 1
      ? "Tomorrow · Normal priority"
      : "Ready to complete";
  const todoMeta = phase === 0
    ? "Add a small next action"
    : phase === 1
      ? "Keep it in today’s view"
      : "Ready to check off";

  return (
    <div className={`goal-todo-intro${active ? " is-active" : ""}`}>
      <header className="goal-todo-intro-heading">
        <div>
          <span>Quick start</span>
          <h3 id="planner-onboarding-heading">One simple plan for goals and to-dos</h3>
        </div>
        <button
          aria-label={`${finished ? "Replay" : playing ? "Pause" : "Play"} quick start animation`}
          className="goal-todo-intro-play"
          onClick={togglePlayback}
          type="button"
        >
          {finished ? <RotateCcw aria-hidden="true" size={14} /> : playing ? <Pause aria-hidden="true" size={14} /> : <Play aria-hidden="true" size={14} />}
          <span>{finished ? "Replay" : playing ? "Pause" : "Play"}</span>
        </button>
      </header>

      <div className={`goal-todo-intro-story is-phase-${phase}`}>
        <section className={`goal-todo-intro-card is-goal${finished ? " is-complete" : ""}`}>
          <div className="goal-todo-intro-card-label"><Target aria-hidden="true" size={15} /><span>Goal</span></div>
          <button
            aria-label={finished ? "Replay goal example" : "Advance goal example"}
            className="goal-todo-intro-item"
            onClick={() => selectPhase(finished ? 0 : Math.min(phase + 1, INTRO_STEPS.length - 1))}
            type="button"
          >
            <span aria-hidden="true" className="goal-todo-intro-check">
              {finished && <Check size={13} strokeWidth={3} />}
            </span>
            <span className="goal-todo-intro-item-copy">
              <strong>{goalTitle}</strong>
              <small>{goalMeta}</small>
            </span>
          </button>
          <div className="goal-todo-intro-card-meta">
            {phase > 0 && <span><CalendarClock aria-hidden="true" size={12} /> Tomorrow</span>}
            {phase > 0 && <span><Flag aria-hidden="true" size={12} /> Priority</span>}
          </div>
        </section>

        <span aria-hidden="true" className="goal-todo-intro-path"><Navigation size={15} /></span>

        <section className={`goal-todo-intro-card is-todo${finished ? " is-complete" : ""}`}>
          <div className="goal-todo-intro-card-label"><ListTodo aria-hidden="true" size={15} /><span>Quick to-do</span></div>
          <button
            aria-label={finished ? "Replay to-do example" : "Advance to-do example"}
            className="goal-todo-intro-item"
            onClick={() => selectPhase(finished ? 0 : Math.min(phase + 1, INTRO_STEPS.length - 1))}
            type="button"
          >
            <span aria-hidden="true" className="goal-todo-intro-check">
              {finished && <CheckCircle2 size={15} />}
            </span>
            <span className="goal-todo-intro-item-copy">
              <strong>{todoTitle}</strong>
              <small>{todoMeta}</small>
            </span>
          </button>
          <span className="goal-todo-intro-card-status">{finished ? "Done" : "Next"}</span>
        </section>
      </div>

      <div aria-label="Quick start animation steps" className="goal-todo-intro-steps" role="group">
        {INTRO_STEPS.map((step, index) => (
          <button
            aria-pressed={phase === index}
            className={phase === index ? "is-current" : ""}
            key={step.label}
            onClick={() => selectPhase(index)}
            type="button"
          >
            <span>{index + 1}</span>{step.label}
          </button>
        ))}
      </div>
      <p aria-live="polite" className="goal-todo-intro-caption">{INTRO_STEPS[phase].caption}</p>
      <button className="goal-todo-intro-start" onClick={onGetStarted} type="button">
        Get started <Navigation aria-hidden="true" size={15} />
      </button>
    </div>
  );
}

export default GoalTodoIntro;
