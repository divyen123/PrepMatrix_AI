import { useLayoutEffect, useRef, useState } from 'react';
import './SloshGauge.css';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const FRAME_STEP = 1 / 120;
const MAX_FRAME_STEP = 0.05;
const TILT_GAIN = 0.07;
const MAX_TILT = 30;
const REST_POSITION = 0.05;
const REST_VELOCITY = 2;

function snapToStep(value, step) {
  const increment = Number.isFinite(step) && step > 0 ? step : 1;
  if (value <= 0) return 0;
  if (value >= 100) return 100;
  return Number(clamp(Math.round(value / increment) * increment, 0, 100).toFixed(6));
}

function formatLevel(value, unit) {
  return `${Number(value.toFixed(2))}${unit}`;
}

/** A horizontal, interactive version of React Bits' Slosh Gauge. Values are percentages. */
export default function SloshGauge({
  value,
  defaultValue = 60,
  onChange,
  interactive = false,
  showValue = true,
  disabled = false,
  liquidColor,
  glassColor,
  width = '100%',
  height = 42,
  radius = 21,
  ticks = 4,
  viscosity = 0.15,
  tilt = 0.45,
  splash = 0.42,
  step = 1,
  unit = '%',
  ariaLabel = 'Level',
  ariaValueText,
  className = '',
}) {
  const root = useRef(null);
  const liquid = useRef(null);
  const marker = useRef(null);
  const readout = useRef(null);
  const liquidReadout = useRef(null);
  const initial = clamp(value ?? defaultValue, 0, 100);
  const simulation = useRef({ position: initial, velocity: 0, target: initial, frame: 0, last: 0 });
  const grip = useRef(null);
  const reduceMotion = useRef(false);
  const [held, setHeld] = useState(false);
  const live = useRef({ value, onChange, viscosity, tilt, splash, step, unit, ariaValueText });

  const paint = () => {
    const { position, velocity, target } = simulation.current;
    const { tilt: tiltAmount } = live.current;
    const angle = reduceMotion.current ? 0 : clamp(tiltAmount * velocity * TILT_GAIN, -MAX_TILT, MAX_TILT);
    const gaugeHeight = root.current?.clientHeight || 0;
    const lean = (Math.tan((angle * Math.PI) / 180) * gaugeHeight) / 2;
    if (liquid.current) {
      liquid.current.style.clipPath = `polygon(0 0, calc(${position}% + ${lean}px) 0, calc(${position}% - ${lean}px) 100%, 0 100%)`;
    }
    if (marker.current) marker.current.style.left = `${target}%`;
  };

  const say = () => {
    const { target } = simulation.current;
    const { unit: currentUnit, ariaValueText: currentValueText } = live.current;
    const text = formatLevel(target, currentUnit);
    const accessibleText = typeof currentValueText === 'function'
      ? currentValueText(target)
      : currentValueText ?? text;
    root.current?.setAttribute('aria-valuenow', String(target));
    root.current?.setAttribute('aria-valuetext', String(accessibleText));
    if (readout.current) readout.current.textContent = text;
    if (liquidReadout.current) liquidReadout.current.textContent = text;
  };

  const tick = (now) => {
    const current = simulation.current;
    const { viscosity: thickness, splash: bounce } = live.current;
    const delta = current.last ? Math.min((now - current.last) / 1000, MAX_FRAME_STEP) : FRAME_STEP;
    current.last = now;

    if (thickness <= 0 || reduceMotion.current) {
      current.position = current.target;
      current.velocity = 0;
    } else {
      const stiffness = 1224 - 1044 * thickness;
      const dampingRatio = 0.26 - 0.17 * thickness;
      const damping = 2 * dampingRatio * Math.sqrt(stiffness);
      const substeps = Math.ceil(delta / FRAME_STEP);
      const substep = delta / substeps;
      for (let count = substeps; count > 0; count -= 1) {
        current.velocity = current.velocity * Math.exp(-damping * substep)
          + stiffness * (current.target - current.position) * substep;
        current.position += current.velocity * substep;
        if (current.position > 100) {
          current.position = 100;
          current.velocity = -current.velocity * bounce;
        } else if (current.position < 0) {
          current.position = 0;
          current.velocity = -current.velocity * bounce;
        }
      }
      if (!grip.current
        && Math.abs(current.target - current.position) < REST_POSITION
        && Math.abs(current.velocity) < REST_VELOCITY) {
        current.position = current.target;
        current.velocity = 0;
      }
    }

    paint();
    if (!grip.current && current.position === current.target && current.velocity === 0) {
      current.frame = 0;
      current.last = 0;
    } else {
      current.frame = requestAnimationFrame(tick);
    }
  };

  const wake = () => {
    if (!simulation.current.frame) simulation.current.frame = requestAnimationFrame(tick);
  };

  const setLevel = (next, instant = false) => {
    const current = simulation.current;
    current.target = clamp(next, 0, 100);
    if (instant || reduceMotion.current) {
      current.position = current.target;
      current.velocity = 0;
      if (current.frame) cancelAnimationFrame(current.frame);
      current.frame = 0;
      current.last = 0;
      paint();
    } else {
      wake();
    }
    say();
  };

  useLayoutEffect(() => {
    live.current = { value, onChange, viscosity, tilt, splash, step, unit, ariaValueText };
    if (value !== undefined && !(grip.current && simulation.current.target === value)) {
      setLevel(value);
    } else {
      say();
      paint();
    }
    // The simulation uses refs so prop changes do not restart its animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, onChange, viscosity, tilt, splash, step, unit, ariaValueText, width, height]);

  useLayoutEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const syncMotion = () => {
      reduceMotion.current = Boolean(media?.matches);
      if (reduceMotion.current) setLevel(simulation.current.target, true);
    };
    syncMotion();
    media?.addEventListener?.('change', syncMotion);
    const observer = typeof ResizeObserver === 'undefined' || !root.current
      ? null
      : new ResizeObserver(() => paint());
    if (root.current) observer?.observe(root.current);
    say();
    paint();
    const current = simulation.current;
    return () => {
      media?.removeEventListener?.('change', syncMotion);
      observer?.disconnect();
      cancelAnimationFrame(current.frame);
    };
    // The stable simulation refs are intentionally initialized once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const levelAt = (clientX) => {
    const rectangle = root.current.getBoundingClientRect();
    const fraction = rectangle.width ? (clientX - rectangle.left) / rectangle.width : 0;
    return snapToStep(clamp(fraction * 100, 0, 100), live.current.step);
  };

  const report = () => {
    const currentGrip = grip.current;
    const next = simulation.current.target;
    if (currentGrip && next !== currentGrip.sent) {
      currentGrip.sent = next;
      live.current.onChange?.(next);
    }
  };

  const down = (event) => {
    if (!interactive || disabled || grip.current || event.button !== 0) return;
    grip.current = { id: event.pointerId, start: simulation.current.target, sent: NaN };
    try {
      root.current?.setPointerCapture(event.pointerId);
    } catch { /* Pointer capture is not supported by every embedded browser. */ }
    setHeld(true);
    setLevel(levelAt(event.clientX));
    report();
  };

  const move = (event) => {
    if (!grip.current || grip.current.id !== event.pointerId) return;
    setLevel(levelAt(event.clientX));
    report();
  };

  const up = (event, reason) => {
    const currentGrip = grip.current;
    if (!currentGrip || currentGrip.id !== event.pointerId) return;
    grip.current = null;
    try {
      root.current?.releasePointerCapture(event.pointerId);
    } catch { /* A canceled pointer may have already released capture. */ }
    setHeld(false);
    if (reason === 'escape') {
      setLevel(currentGrip.start);
      live.current.onChange?.(currentGrip.start);
    } else if (live.current.value !== undefined && simulation.current.target !== live.current.value) {
      setLevel(live.current.value);
    }
    wake();
  };

  const key = (event) => {
    if (!interactive || disabled) return;
    if (event.key === 'Escape') {
      if (grip.current) up({ pointerId: grip.current.id }, 'escape');
      return;
    }
    const current = simulation.current.target;
    const increment = Number.isFinite(step) && step > 0 ? step : 1;
    const bigIncrement = Math.max(10, increment * 5);
    const delta = event.shiftKey ? bigIncrement : increment;
    const next = {
      ArrowRight: current + delta,
      ArrowUp: current + delta,
      ArrowLeft: current - delta,
      ArrowDown: current - delta,
      PageUp: current + bigIncrement,
      PageDown: current - bigIncrement,
      Home: 0,
      End: 100,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const snapped = event.key === 'Home' || event.key === 'End'
      ? next
      : snapToStep(clamp(next, 0, 100), increment);
    setLevel(snapped, true);
    live.current.onChange?.(snapped);
  };

  const initialText = formatLevel(initial, unit);
  const initialAccessibleText = typeof ariaValueText === 'function'
    ? ariaValueText(initial)
    : ariaValueText ?? initialText;

  return (
    <div
      ref={root}
      className={`slosh-gauge${className ? ` ${className}` : ''}`}
      role={interactive ? 'slider' : 'meter'}
      tabIndex={interactive && !disabled ? 0 : undefined}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={initial}
      aria-valuetext={initialAccessibleText}
      aria-orientation={interactive ? 'horizontal' : undefined}
      aria-disabled={disabled || undefined}
      data-interactive={interactive ? 'true' : 'false'}
      data-held={held ? 'true' : 'false'}
      data-disabled={disabled ? 'true' : 'false'}
      style={{
        '--sg-w': typeof width === 'number' ? `${width}px` : width,
        '--sg-h': typeof height === 'number' ? `${height}px` : height,
        '--sg-r': typeof radius === 'number' ? `${radius}px` : radius,
        '--sg-glass': glassColor,
        '--sg-liquid': liquidColor,
        '--sg-ticks': ticks,
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={(event) => up(event, 'cancel')}
      onLostPointerCapture={(event) => up(event, 'cancel')}
      onKeyDown={key}
    >
      {showValue ? (
        <span ref={readout} className="slosh-gauge__value" aria-hidden="true">{initialText}</span>
      ) : null}
      <div ref={liquid} className="slosh-gauge__liquid" aria-hidden="true">
        {showValue ? <span ref={liquidReadout} className="slosh-gauge__value">{initialText}</span> : null}
      </div>
      {ticks > 0 ? <div className="slosh-gauge__ticks" aria-hidden="true" /> : null}
      {interactive && !disabled ? <div ref={marker} className="slosh-gauge__marker" aria-hidden="true" /> : null}
    </div>
  );
}
