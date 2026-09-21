import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  SparklesIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import "./ThoughtLine.css";

const EASE_OUT = [0.23, 1, 0.32, 1];
const EASE_IN_OUT = [0.77, 0, 0.175, 1];
const GLYPH_DONE = 0.55;
const EMPTY_STEPS = [];

const formatElapsed = (deciseconds) => (
  deciseconds < 600
    ? `${(deciseconds / 10).toFixed(1)}s`
    : `${Math.floor(deciseconds / 600)}m ${((deciseconds % 600) / 10).toFixed(1)}s`
);

const formatSpokenElapsed = (deciseconds) => (
  deciseconds < 600
    ? `${(deciseconds / 10).toFixed(1)} seconds`
    : `${Math.floor(deciseconds / 600)} minutes ${((deciseconds % 600) / 10).toFixed(1)} seconds`
);

function ThoughtLine({
  label = "Thinking…",
  doneLabel = "",
  renderLabel,
  glyph = "sparkle",
  steps = EMPTY_STEPS,
  collapsible = true,
  collapseOnSettle = true,
  color = "currentColor",
  glyphColor = "",
  fontSize = 16,
  breathPeriod = 1.6,
  breathDepth = 0.45,
  shimmer = true,
  shimmerDuration = 1.8,
  settleDuration = 350,
  settleBlur = 2,
  working = true,
  settleAfter = 0,
  elapsed,
  showTimer = true,
  onSettle,
  className = "",
  style,
}) {
  const reduceMotion = useReducedMotion();
  const [autoSettled, setAutoSettled] = useState(false);
  const [open, setOpen] = useState(true);
  const isWorking = working && !autoSettled;
  const doneText = doneLabel || (showTimer ? "Thought for" : "Done thinking");
  const hasTrace = steps.length > 0;
  const depth = reduceMotion ? Math.min(breathDepth, 0.2) : breathDepth;
  const period = reduceMotion ? breathPeriod * 1.5 : breathPeriod;
  const trough = 1 - depth;
  const sheen = shimmer && !reduceMotion;

  const glyphRef = useRef(null);
  const breathRef = useRef(null);
  const timerRef = useRef(null);
  const stackRef = useRef(null);
  const workRef = useRef(null);
  const doneRef = useRef(null);
  const elapsedRef = useRef(0);
  const previousWorkingRef = useRef(isWorking);
  const onSettleRef = useRef(onSettle);
  const [announcement, setAnnouncement] = useState(label);

  useEffect(() => {
    onSettleRef.current = onSettle;
  }, [onSettle]);

  useEffect(() => {
    if (working) setAutoSettled(false);
  }, [working]);

  useEffect(() => {
    if (isWorking) setOpen(true);
    else if (collapseOnSettle) setOpen(false);
  }, [collapseOnSettle, isWorking]);

  useEffect(() => {
    const glyphElement = glyphRef.current;
    const breathElement = breathRef.current;
    if (!breathElement) return undefined;

    const settleSeconds = settleDuration / 1000;
    const loop = (element, delay) => animate(
      element,
      { opacity: [trough, 1, trough] },
      { duration: period, ease: EASE_IN_OUT, repeat: Infinity, delay },
    );
    let cancelled = false;
    const runningAnimations = [];

    if (isWorking) {
      if (depth > 0) {
        if (sheen) {
          runningAnimations.push(animate(
            breathElement,
            { opacity: 1 },
            { duration: 0.2, ease: EASE_OUT },
          ));
        }
        if (glyphElement) {
          const lead = animate(
            glyphElement,
            { opacity: trough },
            { duration: 0.2, ease: EASE_OUT },
          );
          runningAnimations.push(lead);
          lead.then(() => {
            if (cancelled) return;
            runningAnimations.push(loop(glyphElement, 0));
            if (!sheen) runningAnimations.push(loop(breathElement, 0.14));
          });
        } else if (!sheen) {
          runningAnimations.push(loop(breathElement, 0.14));
        }
      } else {
        if (glyphElement) {
          runningAnimations.push(animate(
            glyphElement,
            { opacity: 1 },
            { duration: 0.2, ease: EASE_OUT },
          ));
        }
        runningAnimations.push(animate(
          breathElement,
          { opacity: 1 },
          { duration: 0.2, ease: EASE_OUT },
        ));
      }
    } else {
      if (glyphElement) {
        runningAnimations.push(animate(
          glyphElement,
          { opacity: GLYPH_DONE },
          { duration: settleSeconds, ease: EASE_OUT },
        ));
      }
      runningAnimations.push(animate(
        breathElement,
        { opacity: 1 },
        { duration: settleSeconds, ease: EASE_OUT },
      ));
    }

    return () => {
      cancelled = true;
      runningAnimations.forEach((animation) => animation.stop());
    };
  }, [depth, isWorking, period, settleDuration, sheen, trough]);

  const paintElapsed = useCallback((deciseconds) => {
    elapsedRef.current = deciseconds;
    if (timerRef.current) {
      timerRef.current.textContent = formatElapsed(deciseconds);
    }
  }, []);

  useLayoutEffect(() => {
    if (elapsed != null) {
      paintElapsed(Math.round(elapsed * 10));
      return undefined;
    }
    if (!isWorking) return undefined;

    const startedAt = performance.now();
    paintElapsed(0);
    const timerId = setInterval(() => {
      const deciseconds = Math.floor((performance.now() - startedAt) / 100);
      paintElapsed(deciseconds);
      if (settleAfter > 0 && deciseconds >= Math.round(settleAfter * 10)) {
        setAutoSettled(true);
      }
    }, 100);
    return () => clearInterval(timerId);
  }, [elapsed, isWorking, paintElapsed, settleAfter]);

  useLayoutEffect(() => {
    const timerElement = timerRef.current;
    const stackElement = stackRef.current;
    if (!timerElement || !stackElement) return undefined;

    const placeTimer = (glide) => {
      const activeLabel = isWorking ? workRef.current : doneRef.current;
      if (!activeLabel) return;
      const shift = activeLabel.offsetWidth - stackElement.offsetWidth;
      if (!glide) timerElement.style.transition = "none";
      timerElement.style.transform = `translateX(${shift}px)`;
      if (!glide) {
        void timerElement.offsetWidth;
        timerElement.style.transition = "";
      }
    };

    placeTimer(previousWorkingRef.current !== isWorking);
    previousWorkingRef.current = isWorking;
    const resizeObserver = new ResizeObserver(() => placeTimer(false));
    if (workRef.current) resizeObserver.observe(workRef.current);
    if (doneRef.current) resizeObserver.observe(doneRef.current);
    return () => resizeObserver.disconnect();
  }, [doneText, fontSize, isWorking, label, showTimer]);

  useEffect(() => {
    if (isWorking) {
      setAnnouncement(label);
      return;
    }
    setAnnouncement(showTimer
      ? `${doneText} ${formatSpokenElapsed(elapsedRef.current)}`
      : doneText);
    onSettleRef.current?.(elapsedRef.current / 10);
  }, [doneText, isWorking, label, showTimer]);

  const canToggle = hasTrace && collapsible;
  const heading = (
    <>
      {glyph !== "none" ? (
        <span aria-hidden="true" className="thought-line__glyph" ref={glyphRef}>
          {glyph === "sparkle" ? (
            <HugeiconsIcon icon={SparklesIcon} size="100%" strokeWidth={2} />
          ) : glyph === "dot" ? (
            <span className="thought-line__dot" />
          ) : (
            glyph
          )}
        </span>
      ) : null}
      <span aria-hidden="true" className="thought-line__label" ref={stackRef}>
        <span
          className="thought-line__text"
          data-active={isWorking ? "" : undefined}
          ref={workRef}
        >
          <span
            className="thought-line__breath"
            data-shimmer={sheen ? "" : undefined}
            ref={breathRef}
          >
            {renderLabel ? renderLabel(label, true) : label}
          </span>
        </span>
        <span
          className="thought-line__text thought-line__text--done"
          data-active={isWorking ? undefined : ""}
          ref={doneRef}
        >
          {renderLabel ? renderLabel(doneText, false) : doneText}
        </span>
      </span>
      {showTimer ? (
        <span
          aria-hidden="true"
          className="thought-line__timer"
          data-done={isWorking ? undefined : ""}
          ref={timerRef}
        >
          0.0s
        </span>
      ) : null}
      {collapsible ? (
        <span
          aria-hidden="true"
          className="thought-line__chevron"
          data-on={hasTrace ? "" : undefined}
        >
          <HugeiconsIcon icon={ArrowDown01Icon} size="1em" strokeWidth={2.2} />
        </span>
      ) : null}
      <span className="thought-line__sr" role="status">
        {announcement}
      </span>
    </>
  );

  return (
    <div
      className={`thought-line${className ? ` ${className}` : ""}`}
      data-open={open && hasTrace ? "" : undefined}
      data-working={isWorking ? "" : undefined}
      style={{
        "--tl-font": `${fontSize}px`,
        "--tl-color": color,
        "--tl-glyph": glyphColor || color,
        "--tl-settle": `${settleDuration}ms`,
        "--tl-blur": `${settleBlur}px`,
        "--tl-shimmer": `${shimmerDuration}s`,
        ...style,
      }}
    >
      {collapsible ? (
        <button
          aria-expanded={canToggle ? open : undefined}
          className="thought-line__head"
          data-toggle={canToggle ? "" : undefined}
          onClick={() => {
            if (canToggle) setOpen((current) => !current);
          }}
          tabIndex={canToggle ? 0 : -1}
          type="button"
        >
          {heading}
        </button>
      ) : (
        <div className="thought-line__head">{heading}</div>
      )}
      {hasTrace ? (
        <div aria-hidden={!open} className="thought-line__trace" data-open={open ? "" : undefined}>
          <div className="thought-line__fold">
            <div className="thought-line__steps">
              {steps.map((text, index) => {
                const done = !isWorking || index < steps.length - 1;
                return (
                  <div
                    className="thought-line__step"
                    data-done={done ? "" : undefined}
                    key={`${index}-${text}`}
                  >
                    <span aria-hidden="true" className="thought-line__mark">
                      {done ? (
                        <HugeiconsIcon icon={Tick02Icon} size="1em" strokeWidth={2.5} />
                      ) : (
                        <i className="thought-line__pulse" />
                      )}
                    </span>
                    <span className="thought-line__step-text">{text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ThoughtLine;
