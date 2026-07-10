import { useEffect, useRef } from "react";

/**
 * CustomCursor — replaces the OS cursor with:
 *   • a small solid dot that tracks exactly
 *   • a larger translucent ring that lerps behind it
 *   • hover state: ring expands + blends color on interactive elements
 */
export default function CustomCursor() {
  const dotRef  = useRef(null);
  const ringRef = useRef(null);

  useEffect(() => {
    const dot  = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    let mouseX = window.innerWidth  / 2;
    let mouseY = window.innerHeight / 2;
    let ringX  = mouseX;
    let ringY  = mouseY;
    let rafId  = null;
    let isHovering = false;

    const LERP = 0.13; // ring lag — lower = more lag

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
      // Dot snaps instantly
      dot.style.transform  = `translate(${mouseX}px, ${mouseY}px)`;

      // Ring lerps
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
    };
  }, []);

  return (
    <>
      {/* Outer ring */}
      <div className="custom-cursor-ring" ref={ringRef} aria-hidden="true" />
      {/* Center dot */}
      <div className="custom-cursor-dot"  ref={dotRef}  aria-hidden="true" />
    </>
  );
}
