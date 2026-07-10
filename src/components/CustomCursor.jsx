import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * CustomCursor — supports three cursor modes:
 *   • "default"    → OS default cursor (component renders nothing)
 *   • "app-cursor" → purple dot + lagging ring (original app cursor)
 *   • "neon-cursor"→ animated neon glow trail cursor
 *
 * Rendered via createPortal directly into document.body so it sits ABOVE
 * every modal, drawer, overlay and stacking context in the app.
 */
export default function CustomCursor({ mode = "app-cursor" }) {
  const dotRef  = useRef(null);
  const ringRef = useRef(null);

  useEffect(() => {
    const dot  = dotRef.current;
    const ring = ringRef.current;

    // "default" mode: restore OS cursor and stop
    if (mode === "default") {
      document.documentElement.setAttribute("data-cursor-mode", "default");
      return () => {
        document.documentElement.removeAttribute("data-cursor-mode");
      };
    }

    // custom cursor modes
    document.documentElement.setAttribute("data-cursor-mode", mode);
    if (!dot || !ring) return;

    let mouseX = window.innerWidth  / 2;
    let mouseY = window.innerHeight / 2;
    let ringX  = mouseX;
    let ringY  = mouseY;
    let rafId  = null;
    let isHovering = false;

    const LERP = mode === "neon-cursor" ? 0.45 : 0.55;

    /* ── Track real mouse position ── */
    const onMouseMove = (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    /* ── Detect interactive elements ── */
    const onMouseOver = (e) => {
      const target = e.target.closest(
        "a, button, input, textarea, select, label, [role='button'], [tabindex]"
      );
      if (target && !isHovering) {
        isHovering = true;
        ring.classList.add("cursor-ring--hover");
        dot.classList.add("cursor-dot--hover");
      }
    };

    const onMouseOut = (e) => {
      const target = e.target.closest(
        "a, button, input, textarea, select, label, [role='button'], [tabindex]"
      );
      if (target && isHovering) {
        isHovering = false;
        ring.classList.remove("cursor-ring--hover");
        dot.classList.remove("cursor-dot--hover");
      }
    };

    /* ── Click pulse ── */
    const onClick = () => {
      dot.classList.add("cursor-dot--click");
      ring.classList.add("cursor-ring--click");
      setTimeout(() => {
        dot.classList.remove("cursor-dot--click");
        ring.classList.remove("cursor-ring--click");
      }, 350);
    };

    /* ── Animation loop ── */
    const animate = () => {
      dot.style.transform  = `translate(${mouseX}px, ${mouseY}px)`;

      ringX += (mouseX - ringX) * LERP;
      ringY += (mouseY - ringY) * LERP;
      ring.style.transform = `translate(${ringX}px, ${ringY}px)`;

      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    document.addEventListener("mousemove",  onMouseMove, { passive: true });
    document.addEventListener("mouseover",  onMouseOver, { passive: true });
    document.addEventListener("mouseout",   onMouseOut,  { passive: true });
    document.addEventListener("mousedown",  onClick);

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("mousemove",  onMouseMove);
      document.removeEventListener("mouseover",  onMouseOver);
      document.removeEventListener("mouseout",   onMouseOut);
      document.removeEventListener("mousedown",  onClick);
      document.documentElement.removeAttribute("data-cursor-mode");
    };
  }, [mode]);

  // "default" mode — no cursor elements, OS takes over
  if (mode === "default") return null;

  const isNeon = mode === "neon-cursor";

  /* Portal into body — escapes every React stacking context */
  return createPortal(
    <>
      <div
        className={`custom-cursor-ring${isNeon ? " cursor-neon-ring" : ""}`}
        ref={ringRef}
        aria-hidden="true"
      />
      <div
        className={`custom-cursor-dot${isNeon ? " cursor-neon-dot" : ""}`}
        ref={dotRef}
        aria-hidden="true"
      />
    </>,
    document.body
  );
}
