import { useEffect, useState } from "react";
import { ArrowRight, CalendarClock, Check, CheckCircle2, Flag, Pause, Play, Plus, RotateCcw } from "lucide-react";
import "./GoalTodoIntro.css";

const INTRO_STEPS = {
  goals: [
    { label: "Name it", caption: "Choose one outcome you want to reach." },
    { label: "Plan it", caption: "Give it a target date and a priority." },
    { label: "Finish it", caption: "Tick your goal when you reach it." },
  ],
  todos: [
    { label: "Add it", caption: "Capture a small next action. No date needed." },
    { label: "Do it", caption: "Click a task to mark it done." },
    { label: "Undo", caption: "Done too soon? Undo brings the task back." },
  ],
};

function GoalTodoIntro({ kind, active, onGetStarted, exampleTitle }) {
  const isGoal = kind === "goals";
  const steps = INTRO_STEPS[isGoal ? "goals" : "todos"];
  const [preview, setPreview] = useState(() => ({
    phase: 0,
    playing: typeof window === "undefined" || !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  }));
  const { phase, playing } = preview;
  const finished = phase === steps.length - 1;
  const title = exampleTitle || (isGoal ? "Finish a chapter" : "Review my study notes");

  useEffect(() => {
    if (!active || !playing || finished) return undefined;
    const timer = window.setTimeout(() => {
      setPreview((current) => {
        const nextPhase = Math.min(current.phase + 1, steps.length - 1);
        return { phase: nextPhase, playing: nextPhase < steps.length - 1 };
      });
    }, isGoal ? 2400 : 2200);
    return () => window.clearTimeout(timer);
  }, [active, finished, isGoal, phase, playing, steps.length]);

  const selectPhase = (nextPhase) => setPreview({ phase: nextPhase, playing: false });
  const togglePlayback = () => setPreview((current) => (
    current.phase === steps.length - 1
      ? { phase: 0, playing: true }
      : { ...current, playing: !current.playing }
  ));

  return (
    <div className={`goal-todo-intro${active ? " is-active" : ""}`}>
      <div className="goal-todo-intro-heading">
        <strong>{isGoal ? "Turn an aim into a goal" : "Make room for small wins"}</strong>
        <button
          aria-label={`${finished ? "Replay" : playing ? "Pause" : "Play"} ${isGoal ? "goals" : "to-do"} preview`}
          className="goal-todo-intro-play"
          onClick={togglePlayback}
          type="button"
        >
          {finished ? <RotateCcw aria-hidden="true" size={13} /> : playing ? <Pause aria-hidden="true" size={13} /> : <Play aria-hidden="true" size={13} />}
          <span>{finished ? "Replay" : playing ? "Pause" : "Play"}</span>
        </button>
      </div>

      <div className={`goal-todo-intro-preview is-phase-${phase}`}>
        <span className="goal-todo-intro-example">Example</span>
        {isGoal ? (
          <div className={`goal-todo-intro-goal${finished ? " is-complete" : ""}`}>
            <button
              aria-label={finished ? "Reopen example goal" : "Complete example goal"}
              aria-pressed={finished}
              className="goal-todo-intro-check"
              onClick={() => selectPhase(finished ? 1 : 2)}
              type="button"
            >
              {finished ? <Check aria-hidden="true" size={15} /> : <span aria-hidden="true" className="goal-todo-intro-checkbox" />}
            </button>
            <div className="goal-todo-intro-goal-copy">
              <strong>{title}</strong>
              <div className="goal-todo-intro-meta">
                {phase === 0 ? <span>A clear outcome</span> : (
                  <>
                    <span><CalendarClock aria-hidden="true" size={12} /> Tomorrow</span>
                    <span><Flag aria-hidden="true" size={12} /> High priority</span>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className={`goal-todo-intro-task${finished ? " is-complete" : ""}`}>
            <button
              aria-label={phase === 0 ? "Add example to-do" : finished ? "Reopen example to-do" : "Complete example to-do"}
              className="goal-todo-intro-task-action"
              onClick={() => selectPhase(phase === 0 ? 1 : finished ? 1 : 2)}
              type="button"
            >
              {finished ? <CheckCircle2 aria-hidden="true" size={18} /> : <span aria-hidden="true" className="goal-todo-intro-checkbox" />}
              <span>{title}</span>
              {phase === 0 && <Plus aria-hidden="true" size={16} />}
            </button>
            {finished && (
              <button className="goal-todo-intro-undo" onClick={() => selectPhase(1)} type="button">
                <RotateCcw aria-hidden="true" size={13} /> Undo
              </button>
            )}
          </div>
        )}
        <div aria-hidden="true" className="goal-todo-intro-track"><span style={{ width: `${((phase + 1) / steps.length) * 100}%` }} /></div>
        <span className="goal-todo-intro-result">{finished ? (isGoal ? "Goal completed" : "Task completed") : phase === 1 ? (isGoal ? "Ready for tomorrow" : "Ready to do") : "Start with one thing"}</span>
      </div>

      <div aria-label={`${isGoal ? "Goal" : "To-do"} preview steps`} className="goal-todo-intro-steps" role="group">
        {steps.map((step, index) => (
          <button
            aria-pressed={phase === index}
            className={phase === index ? "is-current" : ""}
            key={step.label}
            onClick={() => selectPhase(index)}
            type="button"
          ><span>{index + 1}</span>{step.label}</button>
        ))}
      </div>
      <p aria-live="polite" className="goal-todo-intro-caption">{steps[phase].caption}</p>
      <div className="goal-todo-intro-footer">
        <span>Try it here. Examples aren’t saved.</span>
        <button className="goal-todo-intro-start" onClick={onGetStarted} type="button">Get started <ArrowRight aria-hidden="true" size={14} /></button>
      </div>
    </div>
  );
}

export default GoalTodoIntro;
