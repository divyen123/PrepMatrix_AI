import { useEffect, useRef, useState } from "react";
import {
  animate,
  motion as Motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon";
import "./SwipeToast.css";

const EASE_OUT = [0.23, 1, 0.32, 1];
const FLICK_VELOCITY = 0.11;
const DEAD_ZONE = 3;
const RESISTANCE_PIXELS = 24;
const COLLAPSE_MILLISECONDS = 200;
const EXIT_DURATION_FACTOR = 0.7;
const FUSE_KEYFRAMES = [
  { transform: "scaleX(1)" },
  { transform: "scaleX(0)" },
];
const HAS_STARTING_STYLE = typeof window !== "undefined"
  && "CSSStartingStyleRule" in window;

function rubberband(over, dimension, constant = 0.55) {
  return (over * dimension * constant) / (dimension + constant * Math.abs(over));
}

function getVelocity(history) {
  if (history.length < 2) return 0;
  const [startTime, startY] = history[0];
  const [endTime, endY] = history[history.length - 1];
  return performance.now() - endTime > 100
    ? 0
    : (endY - startY) / Math.max(1, endTime - startTime);
}

function SwipeToast({
  title = "Notification",
  description = "",
  icon,
  actionLabel = "",
  onAction,
  open = true,
  onClose,
  background = "#27272a",
  color = "#f5f5f5",
  fuseColor = "#f5a524",
  width = 356,
  radius = 12,
  slideMs = 400,
  settleBounce = 0.2,
  swipeDistance = 40,
  duration = 4000,
  fuse = "bottom",
  pauseOnHover = true,
  closeButton = false,
  inline = false,
  dismissible = true,
  role = "status",
  className = "",
}) {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState("open");
  const [instant, setInstant] = useState(false);
  const [mounted, setMounted] = useState(HAS_STARTING_STYLE);
  const cardRef = useRef(null);
  const fuseRef = useRef(null);
  const fuseAnimationRef = useRef(null);
  const dragRef = useRef(null);
  const flagsRef = useRef({
    hover: false,
    interacting: false,
    focus: false,
    hidden: false,
  });
  const lastInputRef = useRef("pointer");
  const pendingCloseRef = useRef(null);
  const closeTimerRef = useRef(undefined);
  const leavingRef = useRef(false);
  const phaseRef = useRef(phase);
  const latestRef = useRef({ onClose, onAction, slideMs, inline });

  const y = useMotionValue(0);
  const fade = useMotionValue(1);
  const transform = useTransform(y, (value) => `translateY(${value}px)`);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    latestRef.current = { onClose, onAction, slideMs, inline };
  }, [inline, onAction, onClose, slideMs]);

  const syncFuse = () => {
    const animation = fuseAnimationRef.current;
    if (!animation) return;
    const flags = flagsRef.current;
    if (flags.hover || flags.interacting || flags.focus || flags.hidden) {
      animation.pause();
    } else if (animation.playState === "paused") {
      animation.play();
    }
  };

  const finish = (reason) => {
    setPhase("gone");
    leavingRef.current = false;
    if (latestRef.current.inline) {
      closeTimerRef.current = setTimeout(
        () => latestRef.current.onClose?.(reason),
        COLLAPSE_MILLISECONDS,
      );
    } else {
      latestRef.current.onClose?.(reason);
    }
  };

  const close = (reason) => {
    if (phaseRef.current !== "open" || leavingRef.current) return;
    if (dragRef.current) {
      pendingCloseRef.current = reason;
      return;
    }

    fuseAnimationRef.current?.pause();
    const closeInstantly = reason === "escape"
      || (["action", "close"].includes(reason) && lastInputRef.current === "keyboard");
    setInstant(closeInstantly);
    setPhase("closing");
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(
      () => finish(reason),
      closeInstantly ? 0 : latestRef.current.slideMs * EXIT_DURATION_FACTOR + 60,
    );
  };

  const rescue = () => {
    clearTimeout(closeTimerRef.current);
    setInstant(false);
    y.set(0);
    fade.set(1);
    setPhase("open");
  };

  useEffect(() => {
    if (!open) close("programmatic");
    else if (phaseRef.current !== "open") rescue();
    // `close` and `rescue` intentionally read the latest refs for animation continuity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!HAS_STARTING_STYLE) requestAnimationFrame(() => setMounted(true));
  }, []);

  useEffect(() => {
    if (phase !== "open" || duration <= 0 || !fuseRef.current) return undefined;

    fuseAnimationRef.current?.cancel();
    const animation = fuseRef.current.animate(FUSE_KEYFRAMES, {
      duration,
      easing: "linear",
      fill: "forwards",
    });
    animation.onfinish = () => close("timeout");
    fuseAnimationRef.current = animation;
    syncFuse();

    return () => {
      animation.onfinish = null;
      animation.pause();
    };
    // `close` and `syncFuse` intentionally operate on stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, phase]);

  useEffect(() => {
    if (!pauseOnHover) {
      flagsRef.current.hover = false;
      syncFuse();
    }
  }, [pauseOnHover]);

  useEffect(() => {
    const handleVisibility = () => {
      flagsRef.current.hidden = document.hidden;
      syncFuse();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      clearTimeout(closeTimerRef.current);
      fuseAnimationRef.current?.cancel();
    };
  }, []);

  const swipeOut = (distanceY, velocity) => {
    fuseAnimationRef.current?.pause();
    leavingRef.current = true;
    pendingCloseRef.current = null;
    if (!reduceMotion && cardRef.current) {
      animate(
        y,
        distanceY + cardRef.current.offsetHeight,
        { type: "spring", duration: 0.3, bounce: 0, velocity: velocity * 1000 },
      );
    }
    animate(fade, 0, { duration: 0.2, ease: EASE_OUT })
      .then(() => finish("swipe"));
  };

  const handlePointerDown = (event) => {
    lastInputRef.current = "pointer";
    if (
      event.button !== 0
      || !dismissible
      || dragRef.current
      || leavingRef.current
      || event.target.closest("button")
    ) return;
    if (phaseRef.current === "closing") rescue();
    try {
      cardRef.current?.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already belong to another surface.
    }
    y.stop();
    dragRef.current = {
      id: event.pointerId,
      startY: event.clientY,
      grab: null,
      moved: false,
      history: [[performance.now(), y.get()]],
    };
    flagsRef.current.interacting = true;
    syncFuse();
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    if (drag.grab === null) {
      if (Math.abs(event.clientY - drag.startY) < DEAD_ZONE) return;
      drag.grab = event.clientY - y.get();
      if (cardRef.current) cardRef.current.dataset.swiping = "";
    }

    const rawPosition = event.clientY - drag.grab;
    const nextPosition = rawPosition >= 0
      ? rawPosition
      : rubberband(rawPosition, RESISTANCE_PIXELS);
    y.set(nextPosition);
    drag.moved = true;
    drag.history.push([performance.now(), nextPosition]);
    if (drag.history.length > 4) drag.history.shift();
  };

  const handlePointerUp = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    dragRef.current = null;
    if (cardRef.current) delete cardRef.current.dataset.swiping;
    try {
      cardRef.current?.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may have been released by the browser.
    }
    flagsRef.current.interacting = false;

    const distanceY = y.get();
    const velocity = getVelocity(drag.history);
    if (
      distanceY > 0
      && (velocity > FLICK_VELOCITY || (distanceY >= swipeDistance && velocity >= 0))
    ) {
      swipeOut(distanceY, velocity);
      return;
    }

    if (drag.moved) {
      animate(
        y,
        0,
        reduceMotion
          ? { duration: 0.2, ease: EASE_OUT }
          : {
              type: "spring",
              duration: 0.5,
              bounce: settleBounce,
              velocity: velocity * 1000,
            },
      );
    }
    const queuedClose = pendingCloseRef.current;
    pendingCloseRef.current = null;
    if (queuedClose) close(queuedClose);
    else syncFuse();
  };

  return (
    <div
      className={`swipe-toast${className ? ` ${className}` : ""}`}
      data-dismissible={dismissible ? "true" : "false"}
      data-fuse={duration > 0 ? fuse : "none"}
      data-inline={inline ? "true" : "false"}
      data-instant={instant ? "" : undefined}
      data-mounted={mounted ? "true" : "false"}
      data-phase={phase}
      style={{
        "--st-bg": background,
        "--st-ink": color,
        "--st-fuse": fuseColor,
        "--st-w": `${width}px`,
        "--st-radius": `${radius}px`,
        "--st-slide": `${slideMs}ms`,
        "--st-gap": "10px",
      }}
    >
      <div className="swipe-toast__gate">
        <div className="swipe-toast__lift">
          <Motion.div
            aria-atomic="true"
            aria-live={role === "alert" ? "assertive" : "polite"}
            className="swipe-toast__card"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                flagsRef.current.focus = false;
                syncFuse();
              }
            }}
            onFocus={() => {
              flagsRef.current.focus = true;
              syncFuse();
            }}
            onKeyDown={(event) => {
              if (["Enter", " "].includes(event.key)) lastInputRef.current = "keyboard";
              if (event.key === "Escape" && dismissible) {
                event.stopPropagation();
                close("escape");
              }
            }}
            onPointerCancel={handlePointerUp}
            onPointerDown={handlePointerDown}
            onPointerEnter={(event) => {
              if (pauseOnHover && event.pointerType === "mouse") {
                flagsRef.current.hover = true;
                syncFuse();
              }
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === "mouse") {
                flagsRef.current.hover = false;
                syncFuse();
              }
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            ref={cardRef}
            role={role}
            style={{ transform, opacity: fade }}
            tabIndex={0}
          >
            {icon ? (
              <span aria-hidden="true" className="swipe-toast__icon">
                {icon}
              </span>
            ) : null}
            <div className="swipe-toast__body">
              <div className="swipe-toast__title">{title}</div>
              {description ? (
                <div className="swipe-toast__desc">{description}</div>
              ) : null}
            </div>
            {actionLabel ? (
              <button
                className="swipe-toast__action"
                onClick={() => {
                  latestRef.current.onAction?.();
                  close("action");
                }}
                type="button"
              >
                {actionLabel}
              </button>
            ) : null}
            {closeButton ? (
              <button
                aria-label="Close notification"
                className="swipe-toast__close"
                onClick={() => close("close")}
                type="button"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2.5} />
              </button>
            ) : null}
            <i aria-hidden="true" className="swipe-toast__fuse" ref={fuseRef} />
          </Motion.div>
        </div>
      </div>
    </div>
  );
}

export default SwipeToast;
