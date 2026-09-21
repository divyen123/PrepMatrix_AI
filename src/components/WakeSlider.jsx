import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  frame,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useVelocity,
} from "motion/react";
import "./WakeSlider.css";

const SETTLE = 9.23;
const FULL_SPEED = 320;
const MIN_REACH = 1.5;
const FLAT = 0.002;
const KEYBOARD_KEYS = new Set([
  "ArrowRight", "ArrowUp", "ArrowLeft", "ArrowDown",
  "PageUp", "PageDown", "Home", "End",
]);

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const smoothstep = (value) => value * value * (3 - 2 * value);
const toPercent = (value, minimum, maximum) => (
  maximum > minimum ? ((value - minimum) / (maximum - minimum)) * 100 : 0
);

function snap(value, minimum, maximum, step) {
  if (!(maximum > minimum)) return minimum;
  if (!(step > 0)) return clamp(value, minimum, maximum);
  const lastWhole = minimum + Math.floor(+((maximum - minimum) / step).toFixed(6)) * step;
  const grid = clamp(Math.round((value - minimum) / step) * step + minimum, minimum, lastWhole);
  return +(lastWhole < maximum && Math.abs(value - maximum) <= Math.abs(value - grid)
    ? maximum
    : grid).toFixed(6);
}

export default function WakeSlider({
  value: controlledValue,
  defaultValue = 50,
  onChange,
  onInteractionEnd,
  min = 0,
  max = 100,
  step = 1,
  bars = 32,
  height = 56,
  restHeight = 12,
  gap = 4,
  fillColor = "#f5f5f5",
  trackColor = "#27272a",
  crestColor = "",
  sensitivity = 1,
  reach = 6,
  skew = 0.6,
  glide = 0.3,
  smoothing = 100,
  showValue = false,
  formatValue,
  disabled = false,
  ariaLabel = "Value",
  className = "",
}) {
  const [innerValue, setInnerValue] = useState(defaultValue);
  const value = clamp(controlledValue ?? innerValue, min, max);
  const percent = toPercent(value, min, max);
  const reduceMotion = useReducedMotion();
  const format = formatValue ?? String;
  const rest = Math.min(restHeight, height - 1) / height;

  const rootRef = useRef(null);
  const trackRef = useRef(null);
  const handleRef = useRef(null);
  const barElements = useRef([]);
  const crestElements = useRef([]);
  const pointerId = useRef(null);
  const lastAmplitude = useRef(0);
  const latestValue = useRef(value);
  const latestInteractionEnd = useRef(onInteractionEnd);

  const target = useMotionValue(percent);
  const settleFrequency = SETTLE / glide;
  const head = useSpring(target, {
    stiffness: settleFrequency * settleFrequency,
    damping: 2 * settleFrequency,
    mass: 1,
  });
  const rawSpeed = useVelocity(head);
  const velocityFrequency = 2000 / smoothing;
  const speed = useSpring(rawSpeed, {
    stiffness: velocityFrequency * velocityFrequency,
    damping: 2.5 * velocityFrequency,
    mass: 1,
  });

  useEffect(() => {
    target.set(percent);
  }, [percent, target]);

  const paint = (force = false) => {
    const position = ((reduceMotion ? target.get() : head.get()) / 100) * (bars - 1);
    const velocity = reduceMotion ? 0 : speed.get();
    const amplitude = smoothstep(clamp((Math.abs(velocity) * sensitivity) / FULL_SPEED, 0, 1));
    const direction = Math.sign(velocity) || 1;
    const radius = MIN_REACH + (reach - MIN_REACH) * amplitude;
    const behind = radius * (1 + skew);
    const ahead = radius * (1 - 0.5 * skew);
    const lit = Math.round(position);
    const flat = !force && amplitude < FLAT && lastAmplitude.current < FLAT;

    for (let index = 0; index < bars; index += 1) {
      const bar = barElements.current[index];
      if (!bar) continue;
      const on = index <= lit ? "true" : "false";
      if (bar.dataset.on !== on) bar.dataset.on = on;
      if (flat) continue;
      const distance = index - position;
      const wakeRadius = distance * direction < 0 ? behind : ahead;
      const lift = Math.abs(distance) < wakeRadius
        ? amplitude * Math.cos((Math.PI * distance) / (2 * wakeRadius)) ** 2
        : 0;
      bar.style.transform = `scaleY(${rest + lift * (1 - rest)})`;
      const crest = crestElements.current[index];
      if (crest) crest.style.opacity = String(lift);
    }
    lastAmplitude.current = amplitude;
  };

  const paintRef = useRef(paint);
  const run = useCallback(() => paintRef.current(), []);
  const schedule = useCallback(() => frame.render(run, false, true), [run]);
  useMotionValueEvent(head, "change", schedule);
  useMotionValueEvent(speed, "change", schedule);
  useLayoutEffect(() => {
    latestValue.current = value;
    latestInteractionEnd.current = onInteractionEnd;
    paintRef.current = paint;
    paintRef.current(true);
  });

  const commit = (next) => {
    const clean = snap(next, min, max, step);
    if (clean === latestValue.current) return;
    latestValue.current = clean;
    if (controlledValue === undefined) setInnerValue(clean);
    onChange?.(clean);
  };

  const commitFromX = (clientX) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    if (!rect.width) return;
    let ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    if (getComputedStyle(track).direction === "rtl") ratio = 1 - ratio;
    commit(min + ratio * (max - min));
  };

  const handlePointerDown = (event) => {
    if (disabled || pointerId.current !== null) return;
    pointerId.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is unavailable on some embedded surfaces.
    }
    rootRef.current?.removeAttribute("data-instant");
    handleRef.current?.focus({ preventScroll: true });
    commitFromX(event.clientX);
  };

  const handlePointerMove = (event) => {
    if (event.pointerId === pointerId.current) commitFromX(event.clientX);
  };

  const endDrag = (event) => {
    if (event.pointerId !== pointerId.current) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Capture may have already been released.
    }
    pointerId.current = null;
    latestInteractionEnd.current?.(latestValue.current);
  };

  const handleKeyDown = (event) => {
    if (disabled) return;
    const jumps = {
      ArrowRight: value + step,
      ArrowUp: value + step,
      ArrowLeft: value - step,
      ArrowDown: value - step,
      PageUp: value + step * 10,
      PageDown: value - step * 10,
      Home: min,
      End: max,
    };
    if (!Object.hasOwn(jumps, event.key)) return;
    event.preventDefault();
    const clean = snap(jumps[event.key], min, max, step);
    const nextPercent = toPercent(clean, min, max);
    rootRef.current?.setAttribute("data-instant", "true");
    head.jump(nextPercent);
    speed.jump(0);
    target.jump(nextPercent);
    commit(clean);
  };

  const barNodes = useMemo(() => {
    return Array.from({ length: bars }, (_, index) => (
      <span
        className="wake-slider__bar"
        key={index}
        ref={(element) => { barElements.current[index] = element; }}
      >
        {crestColor ? (
          <span
            className="wake-slider__crest"
            ref={(element) => { crestElements.current[index] = element; }}
          />
        ) : null}
      </span>
    ));
  }, [bars, crestColor]);

  return (
    <div
      aria-disabled={disabled || undefined}
      className={`wake-slider${className ? ` ${className}` : ""}`}
      ref={rootRef}
      style={{
        "--ws-fill": fillColor,
        "--ws-track": trackColor,
        "--ws-crest": crestColor || fillColor,
        "--ws-height": `${height}px`,
        "--ws-gap": `${gap}px`,
        "--ws-rest": rest,
      }}
    >
      <div
        className="wake-slider__track"
        onLostPointerCapture={endDrag}
        onPointerCancel={endDrag}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        ref={trackRef}
      >
        {barNodes}
        <button
          aria-disabled={disabled || undefined}
          aria-label={ariaLabel}
          aria-valuemax={max}
          aria-valuemin={min}
          aria-valuenow={value}
          aria-valuetext={format(value)}
          className="wake-slider__handle"
          onKeyDown={handleKeyDown}
          onKeyUp={(event) => {
            if (!disabled && KEYBOARD_KEYS.has(event.key)) {
              latestInteractionEnd.current?.(latestValue.current);
            }
          }}
          ref={handleRef}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          type="button"
        />
      </div>
      {showValue ? (
        <span aria-hidden="true" className="wake-slider__value">
          {format(value)}
        </span>
      ) : null}
    </div>
  );
}
