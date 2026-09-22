import { useEffect, useRef } from "react";
import { getNoteCrumpleEdge } from "../utils/noteCrumpleGesture";
import "./PaperCrumple.css";

const CRUMPLE_DURATION_MS = 560;
const RETURN_DURATION_MS = 460;
const DRAG_TARGETS = ".note-details-footer";
const INTERACTIVE_TARGETS = "button, a, input, textarea, select, [contenteditable='true']";

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function canStartDrag(event) {
  if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return false;
  if (!(event.target instanceof Element) || event.target.closest(INTERACTIVE_TARGETS)) return false;
  // Keep note text selectable; dragging starts only from blank paper or the footer.
  return event.target === event.currentTarget || Boolean(event.target.closest(DRAG_TARGETS));
}

function setDragPosition(node, dx, dy, bounds) {
  const progress = clamp(Math.hypot(dx, dy) / Math.max(180, bounds.width * 0.45), 0, 1);
  const rotation = clamp((dx / Math.max(bounds.width, 1)) * 8, -8, 8);
  node.style.setProperty("--pc-x", `${dx}px`);
  node.style.setProperty("--pc-y", `${dy}px`);
  node.style.setProperty("--pc-rotation", `${rotation}deg`);
  node.style.setProperty("--pc-scale", String(1 - progress * 0.06));
  node.style.setProperty("--pc-crease-opacity", String(progress * 0.28));
}

// React Bits PaperCrumple uses a printed image. This adaptation keeps note text and
// controls live while applying its hold, fold, release, and crumple-away choreography.
export default function PaperCrumple({
  children,
  className = "",
  dialogRef,
  disabled = false,
  onDismiss,
  ...dialogProps
}) {
  const gestureRef = useRef(null);
  const returnTimerRef = useRef(null);
  const dismissTimerRef = useRef(null);

  useEffect(() => () => {
    window.clearTimeout(returnTimerRef.current);
    window.clearTimeout(dismissTimerRef.current);
  }, []);

  const restore = (node) => {
    node.classList.remove("is-dragging");
    node.classList.add("is-returning");
    setDragPosition(node, 0, 0, { width: 1 });
    window.clearTimeout(returnTimerRef.current);
    returnTimerRef.current = window.setTimeout(() => {
      node.classList.remove("is-returning");
    }, RETURN_DURATION_MS);
  };

  const releaseCapture = (node, pointerId) => {
    try {
      if (node.hasPointerCapture(pointerId)) node.releasePointerCapture(pointerId);
    } catch {
      // A pointer can be cancelled by the browser before capture is released.
    }
  };

  const handlePointerDown = (event) => {
    if (event.defaultPrevented || disabled || gestureRef.current || !canStartDrag(event)) return;

    const node = event.currentTarget;
    window.clearTimeout(returnTimerRef.current);
    node.classList.remove("is-returning");
    node.classList.add("is-dragging");
    const bounds = node.getBoundingClientRect();
    gestureRef.current = {
      bounds,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.preventDefault();
    try {
      node.setPointerCapture(event.pointerId);
    } catch {
      gestureRef.current = null;
      restore(node);
    }
  };

  const handlePointerMove = (event) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    setDragPosition(
      event.currentTarget,
      event.clientX - gesture.startX,
      event.clientY - gesture.startY,
      gesture.bounds,
    );
  };

  const handlePointerUp = (event) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;

    const node = event.currentTarget;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    setDragPosition(node, dx, dy, gesture.bounds);
    releaseCapture(node, event.pointerId);

    const edge = getNoteCrumpleEdge({
      bounds: gesture.bounds,
      dx,
      dy,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    if (!edge) {
      restore(node);
      return;
    }

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      onDismiss?.();
      return;
    }

    const exitX = dx + (edge === "left" ? -window.innerWidth : edge === "right" ? window.innerWidth : 0);
    const exitY = dy + (edge === "top" ? -window.innerHeight : edge === "bottom" ? window.innerHeight : 0);
    node.style.setProperty("--pc-fold-x", `${dx + (exitX - dx) * 0.22}px`);
    node.style.setProperty("--pc-fold-y", `${dy + (exitY - dy) * 0.22}px`);
    node.style.setProperty("--pc-wad-x", `${dx + (exitX - dx) * 0.58}px`);
    node.style.setProperty("--pc-wad-y", `${dy + (exitY - dy) * 0.58}px`);
    node.style.setProperty("--pc-exit-x", `${exitX}px`);
    node.style.setProperty("--pc-exit-y", `${exitY}px`);
    node.style.setProperty("--pc-exit-rotation", `${edge === "left" || edge === "top" ? -38 : 38}deg`);
    node.classList.remove("is-dragging");
    node.classList.add("is-crumpling");
    dismissTimerRef.current = window.setTimeout(() => onDismiss?.(), CRUMPLE_DURATION_MS);
  };

  const handlePointerCancel = (event) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    releaseCapture(event.currentTarget, event.pointerId);
    restore(event.currentTarget);
  };

  const handleLostPointerCapture = (event) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    restore(event.currentTarget);
  };

  return (
    <section
      {...dialogProps}
      className={`${className} paper-crumple-note`.trim()}
      onLostPointerCapture={handleLostPointerCapture}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      ref={dialogRef}
    >
      {children}
    </section>
  );
}
