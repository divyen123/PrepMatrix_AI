import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * CustomCursor — supports three cursor modes:
 *   • "default"     → OS default cursor (component renders nothing)
 *   • "app-cursor"  → purple dot + lagging ring (original app cursor)
 *   • "blob-cursor" → soft morphing blob that follows with organic fluid lag
 *
 * Rendered via createPortal directly into document.body so it sits ABOVE
 * every modal, drawer, overlay and stacking context in the app.
 */
export default function CustomCursor({ mode = "app-cursor" }) {
  const layerRef = useRef(null);
  const dotRef  = useRef(null);
  const ringRef = useRef(null);

  useEffect(() => {
    const dot  = dotRef.current;
    const ring = ringRef.current;
    const layer = layerRef.current;

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
    let pointerReady = false;
    let activeTopLayerOwner = null;

    const raiseCursorLayer = () => {
      if (!layer || typeof layer.showPopover !== "function") return;
      try {
        if (layer.matches(":popover-open")) layer.hidePopover();
        layer.showPopover();
      } catch {
        // Older embedded browsers still use the fixed, maximum-z-index fallback.
      }
    };

    raiseCursorLayer();

    // Blob gets a slightly slower lerp for the organic lag feel,
    // but still very fast so it doesn't feel sluggish
    const LERP = mode === "blob-cursor" ? 0.30 : 0.55;

    /* ── Track real mouse position ── */
    const onPointerMove = (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (!pointerReady) {
        pointerReady = true;
        ringX = mouseX;
        ringY = mouseY;
        ring.style.transform = `translate(${ringX}px, ${ringY}px)`;
        if (layer) layer.dataset.pointerReady = "true";
      }
      // Dot (small center indicator) snaps instantly
      dot.style.transform = `translate(${mouseX}px, ${mouseY}px)`;

      // Native dialogs and popovers live in the browser's top layer, above any
      // ordinary z-index. Re-raise the pointer once when it enters one.
      const topLayerOwner = e.composedPath?.().find((node) => (
        node instanceof Element
        && (node.matches("dialog:modal") || node.matches("[popover]:popover-open"))
      ));
      if (topLayerOwner && topLayerOwner !== activeTopLayerOwner) {
        activeTopLayerOwner = topLayerOwner;
        raiseCursorLayer();
      } else if (!topLayerOwner) {
        activeTopLayerOwner = null;
      }
    };

    /* ── Detect interactive elements ── */
    const onMouseOver = (e) => {
      const target = e.target instanceof Element && e.target.closest(
        "a, button, input, textarea, select, label, [role='button'], [tabindex]"
      );
      if (target && !isHovering) {
        isHovering = true;
        ring.classList.add("cursor-ring--hover");
        dot.classList.add("cursor-dot--hover");
      }
    };

    const onMouseOut = (e) => {
      const target = e.target instanceof Element && e.target.closest(
        "a, button, input, textarea, select, label, [role='button'], [tabindex]"
      );
      if (target && isHovering) {
        isHovering = false;
        ring.classList.remove("cursor-ring--hover");
        dot.classList.remove("cursor-dot--hover");
      }
    };

    /* ── Click pulse ── */
    const onClick = (event) => {
      onPointerMove(event);
      dot.classList.add("cursor-dot--click");
      ring.classList.add("cursor-ring--click");
      setTimeout(() => {
        dot.classList.remove("cursor-dot--click");
        ring.classList.remove("cursor-ring--click");
      }, 350);
    };

    /* ── Animation loop ── */
    const animate = () => {
      ringX += (mouseX - ringX) * LERP;
      ringY += (mouseY - ringY) * LERP;
      ring.style.transform = `translate(${ringX}px, ${ringY}px)`;

      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    const observer = typeof MutationObserver === "function"
      ? new MutationObserver((records) => {
        if (records.some((record) => (
          (record.type === "attributes"
            && typeof HTMLDialogElement !== "undefined"
            && record.target instanceof HTMLDialogElement)
          || (record.type === "childList" && [...record.addedNodes].some((node) => (
            node instanceof Element
            && (node.matches("dialog, [popover]") || node.querySelector("dialog, [popover]"))
          )))
        ))) {
          window.requestAnimationFrame(raiseCursorLayer);
        }
      })
      : null;
    observer?.observe(document.body, {
      attributes: true,
      attributeFilter: ["open"],
      childList: true,
      subtree: true,
    });

    window.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
    window.addEventListener("pointerover", onMouseOver, { capture: true, passive: true });
    window.addEventListener("pointerout", onMouseOut, { capture: true, passive: true });
    window.addEventListener("pointerdown", onClick, { capture: true, passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      if (layer) delete layer.dataset.pointerReady;
      observer?.disconnect();
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerover", onMouseOver, true);
      window.removeEventListener("pointerout", onMouseOut, true);
      window.removeEventListener("pointerdown", onClick, true);
      try {
        if (layer?.matches?.(":popover-open")) layer.hidePopover();
      } catch {
        // The layer may already have been detached during teardown.
      }
      document.documentElement.removeAttribute("data-cursor-mode");
    };
  }, [mode]);

  // "default" mode — no cursor elements, OS takes over
  if (mode === "default") return null;

  const isBlob = mode === "blob-cursor";

  /* Portal into body — escapes every React stacking context */
  return createPortal(
    <div aria-hidden="true" className="custom-cursor-layer" popover="manual" ref={layerRef}>
      <div
        className={`custom-cursor-ring${isBlob ? " cursor-blob-body" : ""}`}
        ref={ringRef}
        aria-hidden="true"
      />
      <div
        className={`custom-cursor-dot${isBlob ? " cursor-blob-dot" : ""}`}
        ref={dotRef}
        aria-hidden="true"
      />
    </div>,
    document.body
  );
}
