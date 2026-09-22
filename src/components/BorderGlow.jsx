import { useCallback, useEffect, useRef } from "react";
import "./BorderGlow.css";

const GRADIENT_POSITIONS = ["80% 55%", "69% 34%", "8% 6%", "41% 38%", "86% 85%", "82% 18%", "51% 4%"];
const GRADIENT_KEYS = ["--gradient-one", "--gradient-two", "--gradient-three", "--gradient-four", "--gradient-five", "--gradient-six", "--gradient-seven"];
const COLOR_MAP = [0, 1, 2, 0, 1, 2, 1];

function parseHsl(value) {
  const match = String(value || "").match(/([\d.]+)\s*([\d.]+)%?\s*([\d.]+)%?/u);
  if (!match) return null;
  return { h: Number.parseFloat(match[1]), s: Number.parseFloat(match[2]), l: Number.parseFloat(match[3]) };
}

function transparentMix(color, opacity) {
  return `color-mix(in srgb, ${color} ${opacity}%, transparent)`;
}

function buildGlowVars(glowColor, intensity) {
  const parsed = parseHsl(glowColor);
  const opacities = [100, 60, 50, 40, 30, 20, 10];
  const keys = ["", "-60", "-50", "-40", "-30", "-20", "-10"];

  return Object.fromEntries(opacities.map((opacity, index) => {
    const adjustedOpacity = Math.min(opacity * intensity, 100);
    const color = parsed
      ? `hsl(${parsed.h}deg ${parsed.s}% ${parsed.l}% / ${adjustedOpacity}%)`
      : transparentMix(glowColor, adjustedOpacity);
    return [`--glow-color${keys[index]}`, color];
  }));
}

function buildGradientVars(colors) {
  const palette = Array.isArray(colors) && colors.length
    ? colors
    : ["#c084fc", "#f472b6", "#38bdf8"];
  const variables = {};
  for (let index = 0; index < GRADIENT_KEYS.length; index += 1) {
    const color = palette[Math.min(COLOR_MAP[index], palette.length - 1)];
    variables[GRADIENT_KEYS[index]] = `radial-gradient(at ${GRADIENT_POSITIONS[index]}, ${color} 0px, transparent 50%)`;
  }
  variables["--gradient-base"] = `linear-gradient(${palette[0]} 0 100%)`;
  return variables;
}

function elementCenter(element) {
  const { width, height } = element.getBoundingClientRect();
  return [width / 2, height / 2];
}

function edgeProximity(element, x, y) {
  const [centerX, centerY] = elementCenter(element);
  const dx = x - centerX;
  const dy = y - centerY;
  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : centerX / Math.abs(dx);
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : centerY / Math.abs(dy);
  return Math.min(Math.max(1 / Math.min(scaleX, scaleY), 0), 1);
}

function cursorAngle(element, x, y) {
  const [centerX, centerY] = elementCenter(element);
  const dx = x - centerX;
  const dy = y - centerY;
  if (dx === 0 && dy === 0) return 0;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
  return angle < 0 ? angle + 360 : angle;
}

function easeOutCubic(value) {
  return 1 - ((1 - value) ** 3);
}

function easeInCubic(value) {
  return value ** 3;
}

export default function BorderGlow({
  animated = false,
  backgroundColor = "#120f17",
  borderRadius = 28,
  children,
  className = "",
  colors = ["#c084fc", "#f472b6", "#38bdf8"],
  coneSpread = 25,
  edgeSensitivity = 30,
  fillOpacity = 0.5,
  glowColor = "40 80 80",
  glowIntensity = 1,
  glowRadius = 40,
  onPointerMove,
  style,
  ...restProps
}) {
  const cardRef = useRef(null);

  const handlePointerMove = useCallback((event) => {
    const card = cardRef.current;
    if (card) {
      const bounds = card.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      card.style.setProperty("--edge-proximity", (edgeProximity(card, x, y) * 100).toFixed(3));
      card.style.setProperty("--cursor-angle", `${cursorAngle(card, x, y).toFixed(3)}deg`);
    }
    onPointerMove?.(event);
  }, [onPointerMove]);

  useEffect(() => {
    const card = cardRef.current;
    if (!animated || !card || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;

    const timers = new Set();
    const frames = new Set();
    let cancelled = false;
    const angleStart = 110;
    const angleEnd = 465;

    const animateValue = ({ start = 0, end = 100, duration, delay = 0, ease = easeOutCubic, onUpdate, onEnd }) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        const startedAt = performance.now();
        const tick = (now) => {
          if (cancelled) return;
          const progress = Math.min((now - startedAt) / duration, 1);
          onUpdate(start + (end - start) * ease(progress));
          if (progress < 1) {
            const frame = window.requestAnimationFrame(tick);
            frames.add(frame);
          } else {
            onEnd?.();
          }
        };
        const frame = window.requestAnimationFrame(tick);
        frames.add(frame);
      }, delay);
      timers.add(timer);
    };

    card.classList.add("sweep-active");
    card.style.setProperty("--cursor-angle", `${angleStart}deg`);
    animateValue({ duration: 500, onUpdate: (value) => card.style.setProperty("--edge-proximity", value) });
    animateValue({
      duration: 1500,
      ease: easeInCubic,
      end: 50,
      onUpdate: (value) => card.style.setProperty("--cursor-angle", `${(angleEnd - angleStart) * (value / 100) + angleStart}deg`),
    });
    animateValue({
      delay: 1500,
      duration: 2250,
      start: 50,
      onUpdate: (value) => card.style.setProperty("--cursor-angle", `${(angleEnd - angleStart) * (value / 100) + angleStart}deg`),
    });
    animateValue({
      delay: 2500,
      duration: 1500,
      ease: easeInCubic,
      start: 100,
      end: 0,
      onUpdate: (value) => card.style.setProperty("--edge-proximity", value),
      onEnd: () => card.classList.remove("sweep-active"),
    });

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      frames.forEach((frame) => window.cancelAnimationFrame(frame));
      card.classList.remove("sweep-active");
      card.style.setProperty("--edge-proximity", "0");
    };
  }, [animated]);

  return (
    <div
      {...restProps}
      className={`border-glow-card ${className}`.trim()}
      onPointerMove={handlePointerMove}
      ref={cardRef}
      style={{
        "--card-bg": backgroundColor,
        "--edge-sensitivity": edgeSensitivity,
        "--border-radius": `${borderRadius}px`,
        "--glow-padding": `${glowRadius}px`,
        "--cone-spread": coneSpread,
        "--fill-opacity": fillOpacity,
        ...buildGlowVars(glowColor, glowIntensity),
        ...buildGradientVars(colors),
        ...style,
      }}
    >
      <span aria-hidden="true" className="border-glow-edge-light" />
      <div className="border-glow-inner">{children}</div>
    </div>
  );
}
