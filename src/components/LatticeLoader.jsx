import { useEffect, useLayoutEffect, useRef, useState } from "react";

import "./LatticeLoader.css";

const PATTERNS = {
  arrow: { 3: { cells: [1, 2, 3, 0, 1, 2, 1, 2, 3], loop: 7.2, scale: 1 } },
  dots: { 3: { cells: [0, 1, 2, 0, 1, 2, 0, 1, 2], loop: 3, scale: 2.4 } },
  ripple: { 3: { cells: [2, 1, 2, 1, 0, 1, 2, 1, 2], loop: 4.8, scale: 1.5 } },
  spiral: { 3: { cells: [0, 1, 2, 7, 8, 3, 6, 5, 4], loop: 9, scale: 1.2, lit: 0.35 } },
  orbit: {
    3: { cells: [0, 1, 2, 7, null, 3, 6, 5, 4], loop: 8, scale: 1.2 },
    4: { cells: [0, 1, 2, 3, 11, null, null, 4, 10, null, null, 5, 9, 8, 7, 6], loop: 6, scale: 1.2, lit: 0.45 },
  },
  snake: {
    3: { cells: [0, 1, 2, 5, 4, 3, 6, 7, 8], loop: 9, scale: 1, lit: 0.35 },
    4: { cells: [0, 1, 2, 3, 7, 6, 5, 4, 8, 9, 10, 11, 15, 14, 13, 12], loop: 16, scale: 1, lit: 0.25 },
  },
  sweep: { 4: { cells: [0, 1, 2, 3, 1, 2, 3, 4, 2, 3, 4, 5, 3, 4, 5, 6], loop: 5, scale: 1, lit: 0.45 } },
  spin: { 4: { cells: [0, 0, 1, 1, 0, 0, 1, 1, 3, 3, 2, 2, 3, 3, 2, 2], loop: 4, scale: 1.6, lit: 0.35 } },
  rain: { 4: { cells: [0, 2, 1, 3, 1, 3, 2, 4, 2, 4, 3, 5, 3, 5, 4, 6], loop: 4, scale: 1.2, lit: 0.35 } },
  pulse: { 4: { cells: [2, 1, 1, 2, 1, 0, 0, 1, 1, 0, 0, 1, 2, 1, 1, 2], loop: 2.4, scale: 2.5, lit: 0.45 } },
};

const DEFAULT_PATTERN = { 3: "orbit", 4: "sweep" };
const MARKS = {
  3: { done: [2, 3, 5, 7], error: [0, 2, 4, 6, 8] },
  4: { done: [7, 8, 10, 13], error: [0, 3, 5, 6, 9, 10, 12, 15] },
};

function resolvePattern(pattern, grid) {
  if (typeof pattern === "string") {
    const named = PATTERNS[pattern];
    return (named && named[grid]) || PATTERNS[DEFAULT_PATTERN[grid]][grid];
  }

  const cells = Array.from({ length: grid * grid }, (_, index) => pattern.cells[index] ?? null);
  const max = Math.max(0, ...cells.filter((value) => value != null));
  return {
    cells,
    loop: pattern.loop ?? max + 4.2,
    scale: pattern.scale ?? 1,
    lit: pattern.lit ?? 0.62,
  };
}

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

export default function LatticeLoader({
  label = "Thinking",
  doneLabel = "Done in",
  errorLabel = "Failed after",
  status = "working",
  pattern = "orbit",
  grid = 3,
  shape = "round",
  color = "currentColor",
  doneColor = "#22c55e",
  errorColor = "#ef4444",
  cellSize = 6,
  gap = 2,
  fontSize = 14,
  step = 90,
  idleOpacity = 0.15,
  glow = false,
  glowColor = "",
  showTimer = true,
  elapsed,
  className = "",
  style,
}) {
  const size = grid === 4 ? 4 : 3;
  const resolvedPattern = resolvePattern(pattern, size);
  const marks = MARKS[size];
  const delay = step * resolvedPattern.scale;
  const cycle = Math.round(resolvedPattern.loop * delay);

  const timerRef = useRef(null);
  const elapsedRef = useRef(0);
  const mark = status === "error" ? "error" : "done";
  const [announcement, setAnnouncement] = useState(`${label}, in progress`);

  const paint = (deciseconds) => {
    elapsedRef.current = deciseconds;
    if (timerRef.current) timerRef.current.textContent = formatElapsed(deciseconds);
  };

  useLayoutEffect(() => {
    if (elapsed != null) {
      paint(Math.round(elapsed * 10));
      return undefined;
    }
    if (status !== "working") return undefined;

    const startedAt = performance.now();
    paint(0);
    const intervalId = setInterval(
      () => paint(Math.floor((performance.now() - startedAt) / 100)),
      100,
    );
    return () => clearInterval(intervalId);
  }, [elapsed, status]);

  useEffect(() => {
    if (status === "working") {
      setAnnouncement(`${label}, in progress`);
      return;
    }

    const stateLabel = status === "done" ? doneLabel : errorLabel;
    setAnnouncement(`${stateLabel}${showTimer ? ` ${formatSpokenElapsed(elapsedRef.current)}` : ""}`);
  }, [doneLabel, errorLabel, label, showTimer, status]);

  return (
    <span
      aria-busy={status === "working"}
      className={`lattice-loader${className ? ` ${className}` : ""}`}
      data-glow={glow ? "" : undefined}
      data-shape={shape}
      data-status={status}
      role="status"
      style={{
        "--ll-n": size,
        "--ll-cell": `${cellSize}px`,
        "--ll-gap": `${gap}px`,
        "--ll-font": `${fontSize}px`,
        "--ll-color": color,
        "--ll-mark": status === "error" ? errorColor : doneColor,
        "--ll-idle": idleOpacity,
        "--ll-glow": glowColor || color,
        "--ll-mark-glow": glowColor || (status === "error" ? errorColor : doneColor),
        "--ll-cycle": `${cycle}ms`,
        ...style,
      }}
    >
      <span aria-hidden="true" className="lattice-loader__grid">
        <span className="lattice-loader__layer lattice-loader__run">
          {resolvedPattern.cells.map((unit, index) => (
            <span
              className="lattice-loader__cell"
              data-hole={unit == null ? "" : undefined}
              data-lit={resolvedPattern.lit && resolvedPattern.lit !== 0.62
                ? Math.round(resolvedPattern.lit * 100)
                : undefined}
              key={index}
              style={unit == null ? undefined : { animationDelay: `${Math.round(unit * delay)}ms` }}
            />
          ))}
        </span>
        <span className="lattice-loader__layer lattice-loader__mark">
          {resolvedPattern.cells.map((_, index) => (
            <span
              className="lattice-loader__cell"
              data-on={marks[mark].includes(index) ? "" : undefined}
              key={index}
            />
          ))}
        </span>
      </span>
      <span aria-hidden="true" className="lattice-loader__label">
        <span className="lattice-loader__text" data-active={status === "working" ? "" : undefined}>
          {label}
        </span>
        <span className="lattice-loader__text" data-active={status === "done" ? "" : undefined}>
          {doneLabel}
        </span>
        <span className="lattice-loader__text" data-active={status === "error" ? "" : undefined}>
          {errorLabel}
        </span>
      </span>
      {showTimer ? (
        <span aria-hidden="true" className="lattice-loader__timer" ref={timerRef}>
          0.0s
        </span>
      ) : null}
      <span className="lattice-loader__sr">{announcement}</span>
    </span>
  );
}
