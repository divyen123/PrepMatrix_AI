import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import "./GoalTodoIntro.css";

const INTRO_POINTS = [
  "Choose one clear goal.",
  "Add one small next action.",
  "Give it a date and priority.",
  "Check progress as you go.",
];

const CHARACTER_DELAY_MS = 30;
const LINE_DELAY_MS = 260;

function getPrefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(getPrefersReducedMotion);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mediaQuery) return undefined;

    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener?.("change", updatePreference);
    return () => mediaQuery.removeEventListener?.("change", updatePreference);
  }, []);

  return prefersReducedMotion;
}

function GoalTodoIntro({ active, onGetStarted }) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [typingLine, setTypingLine] = useState(0);
  const [typedCharacters, setTypedCharacters] = useState(0);
  const [typingComplete, setTypingComplete] = useState(false);

  useEffect(() => {
    if (!active) {
      setTypingLine(0);
      setTypedCharacters(0);
      setTypingComplete(false);
      return;
    }

    if (prefersReducedMotion) {
      setTypingLine(INTRO_POINTS.length);
      setTypedCharacters(0);
      setTypingComplete(true);
      return;
    }

    setTypingLine(0);
    setTypedCharacters(0);
    setTypingComplete(false);
  }, [active, prefersReducedMotion]);

  useEffect(() => {
    if (!active || prefersReducedMotion || typingLine >= INTRO_POINTS.length) return undefined;

    const currentPoint = INTRO_POINTS[typingLine];
    const hasFinishedCurrentPoint = typedCharacters >= currentPoint.length;
    const timer = window.setTimeout(() => {
      if (hasFinishedCurrentPoint) {
        setTypingLine((line) => line + 1);
        setTypedCharacters(0);
        return;
      }

      setTypedCharacters((characters) => characters + 1);
    }, hasFinishedCurrentPoint ? LINE_DELAY_MS : CHARACTER_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [active, prefersReducedMotion, typedCharacters, typingLine]);

  useEffect(() => {
    if (typingLine === INTRO_POINTS.length) setTypingComplete(true);
  }, [typingLine]);

  return (
    <div className={`goal-todo-intro${active ? " is-active" : ""}`}>
      <header className="goal-todo-intro-heading">
        <span>Quick start</span>
        <h3 id="planner-onboarding-heading">Build momentum, one step at a time</h3>
      </header>

      <ul aria-hidden="true" className="goal-todo-intro-points">
        {INTRO_POINTS.map((point, index) => {
          const isComplete = index < typingLine;
          const isCurrent = index === typingLine && !typingComplete;
          const isRevealed = isComplete || isCurrent || typingComplete;
          const visiblePoint = isComplete || typingComplete
            ? point
            : isCurrent
              ? point.slice(0, typedCharacters)
              : "";

          return (
            <li
              className={`goal-todo-intro-point${isRevealed ? " is-revealed" : ""}${isCurrent ? " is-typing" : ""}`}
              key={point}
            >
              <span className="goal-todo-intro-typed-line">{visiblePoint}</span>
            </li>
          );
        })}
      </ul>

      <p className="goal-todo-intro-screen-reader-copy">
        {INTRO_POINTS.join(" ")}
      </p>

      <button
        className={`goal-todo-intro-start${typingComplete ? " is-ready" : ""}`}
        onClick={onGetStarted}
        type="button"
      >
        Get started <ArrowRight aria-hidden="true" size={16} />
      </button>
    </div>
  );
}

export default GoalTodoIntro;
