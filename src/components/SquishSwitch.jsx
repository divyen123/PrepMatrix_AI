import { useEffect, useId, useRef, useState } from "react";
import {
  animate,
  motion as Motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react";
import "./SquishSwitch.css";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const FLOW_SPRING = { stiffness: 320, damping: 40, mass: 0.6 };
const SWELL_SPRING = { stiffness: 520, damping: 34, mass: 0.6 };
const MAX_STRETCH = 0.4;
const STRETCH_SPEED = 600;
const TAP_SLOP = { fine: 4, coarse: 8 };

export default function SquishSwitch({
  checked,
  defaultChecked = false,
  onChange,
  label = "",
  disabled = false,
  trackColor = "color-mix(in srgb, var(--surface-strong) 86%, var(--text-muted) 14%)",
  trackOnColor = "rgba(var(--accent-rgb), 0.72)",
  thumbColor = "",
  thumbOnColor = "",
  width = 44,
  height = 24,
  radius = 12,
  speed = 50,
  stretch = 36,
  hoverScale = 1.035,
  colorDuration = 320,
  ariaLabel,
  className = "",
  id,
}) {
  const reduce = useReducedMotion();
  const inset = Math.max(3, Math.round(height * 0.11));
  const thumb = height - inset * 2;
  const min = inset;
  const max = width - inset - thumb;
  const mid = (min + max) / 2;
  const trackRadius = Math.min(radius, height / 2);
  const thumbRadius = Math.max(2, trackRadius - inset);

  const isControlled = checked !== undefined;
  const [inner, setInner] = useState(defaultChecked);
  const on = isControlled ? Boolean(checked) : inner;
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef(null);
  const grip = useRef(null);
  const onRef = useRef(on);
  const skipClick = useRef(false);
  const autoId = useId();
  const buttonId = id ?? autoId;

  useEffect(() => {
    onRef.current = on;
  }, [on]);

  const x = useMotionValue(on ? max : min);
  const flow = useSpring(useVelocity(x), FLOW_SPRING);
  const swell = useSpring(1, SWELL_SPRING);
  const gain = reduce ? 0 : clamp(stretch, 0, 100) / 100;
  const stretchOf = (velocity) =>
    1 + Math.min(MAX_STRETCH, Math.abs(velocity) / STRETCH_SPEED) * gain;
  const scaleX = useTransform([flow, swell], ([velocity, hover]) => stretchOf(velocity) * hover);
  const scaleY = useTransform([flow, swell], ([velocity, hover]) => hover / stretchOf(velocity));

  const commit = (next, { force = false } = {}) => {
    if (!force && next === onRef.current) return;
    onRef.current = next;
    if (!isControlled) setInner(next);
    onChange?.(next);
  };

  useEffect(() => {
    if (reduce) swell.jump(1);
  }, [reduce, swell]);

  useEffect(() => {
    if (dragging) return undefined;
    const target = on ? max : min;
    if (reduce) {
      x.jump(target);
      return undefined;
    }
    const controls = animate(x, target, {
      type: "spring",
      stiffness: 170 - (50 - clamp(speed, 0, 100)) * 1.1,
      damping: 21.5,
      mass: 0.9,
      restDelta: 0.001,
      restSpeed: 0.01,
    });
    return () => controls.stop();
  }, [dragging, max, min, on, reduce, speed, x]);

  const localX = (clientX) => {
    const element = trackRef.current;
    if (!element) return 0;
    const rect = element.getBoundingClientRect();
    const scale = rect.width / (element.offsetWidth || rect.width) || 1;
    return (clientX - rect.left) / scale;
  };

  const handlePointerDown = (event) => {
    if (disabled || grip.current || event.button !== 0) return;
    const onAtPress = isControlled ? on : onRef.current;
    onRef.current = onAtPress;
    const pointerX = localX(event.clientX);
    grip.current = {
      id: event.pointerId,
      grab: pointerX - x.get(),
      moved: false,
      startX: event.clientX,
      onAtPress,
      slop: event.pointerType === "touch" ? TAP_SLOP.coarse : TAP_SLOP.fine,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is optional in older embedded browser runtimes.
    }
    setDragging(true);
  };

  const handlePointerMove = (event) => {
    const currentGrip = grip.current;
    if (!currentGrip || currentGrip.id !== event.pointerId) return;
    const pointerX = localX(event.clientX);
    if (!currentGrip.moved && Math.abs(event.clientX - currentGrip.startX) > currentGrip.slop) {
      currentGrip.moved = true;
    }
    if (!currentGrip.moved) return;
    const nextX = clamp(pointerX - currentGrip.grab, min, max);
    x.set(nextX);
    commit(nextX > mid);
  };

  const finishPointer = (event, cancelled) => {
    const currentGrip = grip.current;
    if (!currentGrip || currentGrip.id !== event.pointerId) return;
    grip.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture is optional in older embedded browser runtimes.
    }
    if (cancelled) commit(currentGrip.onAtPress);
    else if (!currentGrip.moved) {
      commit(!currentGrip.onAtPress, { force: isControlled });
    }
    skipClick.current = true;
    window.setTimeout(() => {
      skipClick.current = false;
    }, 0);
    setDragging(false);
  };

  const handleClick = () => {
    if (skipClick.current) {
      skipClick.current = false;
      return;
    }
    if (!disabled) {
      const current = isControlled ? on : onRef.current;
      commit(!current, { force: isControlled });
    }
  };

  return (
    <span className={`squish-switch-root${className ? ` ${className}` : ""}`}>
      <button
        aria-checked={on}
        aria-label={ariaLabel}
        className="squish-switch"
        data-held={dragging ? "" : undefined}
        data-on={on ? "" : undefined}
        disabled={disabled}
        id={buttonId}
        onClick={handleClick}
        onKeyDown={(event) => {
          if (event.key === "Escape" && grip.current) {
            finishPointer(
              { pointerId: grip.current.id, currentTarget: event.currentTarget },
              true,
            );
          }
        }}
        onPointerCancel={(event) => finishPointer(event, true)}
        onPointerDown={handlePointerDown}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse" && !disabled && !reduce) swell.set(hoverScale);
        }}
        onPointerLeave={() => swell.set(1)}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishPointer(event, false)}
        role="switch"
        style={{
          "--ss-w": `${width}px`,
          "--ss-h": `${height}px`,
          "--ss-inset": `${inset}px`,
          "--ss-thumb": `${thumb}px`,
          "--ss-r": `${trackRadius}px`,
          "--ss-thumb-r": `${thumbRadius}px`,
          "--ss-track": trackColor,
          "--ss-track-on": trackOnColor,
          "--ss-thumb-color": thumbColor
            || `color-mix(in srgb, ${trackOnColor} 19%, ${trackColor})`,
          "--ss-thumb-on": thumbOnColor || "#ffffff",
          "--ss-fade": `${colorDuration}ms`,
        }}
        type="button"
      >
        <span className="squish-switch__track" ref={trackRef}>
          <Motion.span
            aria-hidden="true"
            className="squish-switch__thumb"
            style={{ x, scaleX, scaleY }}
          />
        </span>
      </button>
      {label ? (
        <label className="squish-switch__label" htmlFor={buttonId}>
          {label}
        </label>
      ) : null}
    </span>
  );
}
