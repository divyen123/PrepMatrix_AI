import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, X } from "lucide-react";
import { acquireDocumentScrollLock } from "../utils/documentScrollLock.js";
import "./CodeMatrixWindow.css";

const WINDOW_MARGIN = 12;
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function clampPosition(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export default function CodeMatrixWindow({ children, onClose }) {
  const windowRef = useRef(null);
  const closeTimerRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const positionRef = useRef(null);
  const [position, setPosition] = useState(null);
  const [maximized, setMaximized] = useState(false);
  const [closing, setClosing] = useState(false);

  const placeWindow = useCallback(() => {
    const element = windowRef.current;
    if (!element || maximized) return;
    const bounds = element.getBoundingClientRect();
    const current = positionRef.current;
    const next = current ? {
      x: clampPosition(current.x, WINDOW_MARGIN, window.innerWidth - bounds.width - WINDOW_MARGIN),
      y: clampPosition(current.y, WINDOW_MARGIN, window.innerHeight - 42),
    } : {
      x: Math.max(WINDOW_MARGIN, (window.innerWidth - bounds.width) / 2),
      y: Math.max(WINDOW_MARGIN, (window.innerHeight - bounds.height) / 2),
    };
    positionRef.current = next;
    setPosition(next);
  }, [maximized]);

  useLayoutEffect(() => {
    placeWindow();
  }, [placeWindow]);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement;
    const releaseScrollLock = acquireDocumentScrollLock();
    const frame = window.requestAnimationFrame(() => {
      windowRef.current?.querySelector(".code-matrix-window-close")?.focus();
    });
    const keepFocusInside = (event) => {
      const element = windowRef.current;
      if (!element || element.contains(event.target)) return;
      element.querySelector(FOCUSABLE_SELECTOR)?.focus({ preventScroll: true });
    };
    document.addEventListener("focusin", keepFocusInside, true);
    return () => {
      releaseScrollLock();
      window.cancelAnimationFrame(frame);
      document.removeEventListener("focusin", keepFocusInside, true);
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
      previouslyFocusedRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onResize = () => placeWindow();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [placeWindow]);

  const finishClose = useCallback(() => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
    onClose?.();
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(finishClose, 430);
  }, [closing, finishClose]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        if (windowRef.current?.querySelector(".cmx-reset-dialog")) return;
        if (event.target instanceof Element && event.target.closest(".cm-editor")) return;
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(windowRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || [])
        .filter((element) => !element.closest('[aria-hidden="true"]') && !element.hasAttribute("hidden"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!windowRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  const startDrag = useCallback((event) => {
    if (maximized || closing || event.button !== 0 || event.target.closest("button")) return;
    event.preventDefault();
    const element = windowRef.current;
    const bounds = element?.getBoundingClientRect();
    if (!element || !bounds) return;
    const offsetX = event.clientX - bounds.left;
    const offsetY = event.clientY - bounds.top;
    document.body.classList.add("code-matrix-window-is-dragging");

    const onMove = (moveEvent) => {
      const next = {
        x: clampPosition(moveEvent.clientX - offsetX, WINDOW_MARGIN, window.innerWidth - bounds.width - WINDOW_MARGIN),
        y: clampPosition(moveEvent.clientY - offsetY, WINDOW_MARGIN, window.innerHeight - 42),
      };
      positionRef.current = next;
      setPosition(next);
    };
    const finishDrag = () => {
      document.body.classList.remove("code-matrix-window-is-dragging");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
  }, [closing, maximized]);

  const toggleMaximized = () => {
    if (closing) return;
    setMaximized((current) => !current);
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className={`code-matrix-window-layer${closing ? " is-closing" : ""}`}>
      <section
        aria-labelledby="code-matrix-window-title"
        aria-modal="true"
        className={`code-matrix-window${maximized ? " is-maximized" : ""}${closing ? " is-closing" : ""}`}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget && closing) finishClose();
        }}
        ref={windowRef}
        role="dialog"
        style={!maximized && position ? { left: position.x, top: position.y } : undefined}
      >
        <header
          className="code-matrix-window-header"
          onDoubleClick={(event) => { if (!event.target.closest("button")) toggleMaximized(); }}
          onPointerDown={startDrag}
        >
          <h2 id="code-matrix-window-title">CodeMatrix</h2>
          <div className="code-matrix-window-controls">
            <button
              aria-label="Close CodeMatrix"
              className="code-matrix-window-control code-matrix-window-close"
              onClick={requestClose}
              title="Close"
              type="button"
            >
              <X aria-hidden="true" size={9} strokeWidth={3} />
            </button>
            <button
              aria-label={maximized ? "Restore CodeMatrix window" : "Maximize CodeMatrix"}
              className="code-matrix-window-control code-matrix-window-maximize"
              onClick={toggleMaximized}
              title={maximized ? "Restore" : "Maximize"}
              type="button"
            >
              {maximized
                ? <Minimize2 aria-hidden="true" size={8} strokeWidth={3} />
                : <Maximize2 aria-hidden="true" size={8} strokeWidth={3} />}
            </button>
          </div>
        </header>
        <div className="code-matrix-window-body">{children}</div>
      </section>
    </div>,
    document.body,
  );
}
