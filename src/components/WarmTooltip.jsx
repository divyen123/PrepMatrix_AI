import {
  cloneElement,
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  AnimatePresence,
  animate,
  motion as Motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  useVelocity,
} from 'motion/react';
import './WarmTooltip.css';

const EASE_OUT = [0.23, 1, 0.32, 1];
const LEAN_SPRING = { stiffness: 260, damping: 22, mass: 0.4 };
const FULL_LEAN_SPEED = 1200;
const SIGN = { top: 1, bottom: -1, left: -1, right: 1 };
const ORIGIN = {
  top: 'center bottom',
  bottom: 'center top',
  left: 'right center',
  right: 'left center',
};
const SIZES = {
  sm: { font: 11.5, px: 8, py: 5 },
  md: { font: 12.5, px: 10, py: 6 },
  lg: { font: 13.5, px: 12, py: 7 },
};
const MARGIN = 8;
const HOLD_SLOP = 10;
const SWAP_DURATION = 0.14;
const SWAP_SHIFT = 10;
const RISE = 4;
const GRACE = 80;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const horizontal = (side) => side === 'top' || side === 'bottom';

function anchorOf(rect, side, gap) {
  if (side === 'top') return [rect.left + rect.width / 2, rect.top - gap];
  if (side === 'bottom') return [rect.left + rect.width / 2, rect.bottom + gap];
  if (side === 'left') return [rect.left - gap, rect.top + rect.height / 2];
  return [rect.right + gap, rect.top + rect.height / 2];
}

function layoutOf(x, y, width, height, side) {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : width + MARGIN * 2;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : height + MARGIN * 2;
  if (horizontal(side)) {
    const X = clamp(x - width / 2, MARGIN, Math.max(MARGIN, viewportWidth - MARGIN - width));
    return { X, Y: side === 'top' ? y - height : y };
  }
  const Y = clamp(y - height / 2, MARGIN, Math.max(MARGIN, viewportHeight - MARGIN - height));
  return { X: side === 'left' ? x - width : x, Y };
}

const LAYER = {
  enter: ({ dir, across }) => ({
    opacity: dir === 0 ? 1 : 0,
    x: across ? 0 : SWAP_SHIFT * dir,
    y: across ? SWAP_SHIFT * dir : 0,
    filter: dir === 0 ? 'blur(0px)' : 'blur(3px)',
  }),
  show: { opacity: 1, x: 0, y: 0, filter: 'blur(0px)' },
  exit: ({ dir, across }) => ({
    opacity: 0,
    x: across ? 0 : -SWAP_SHIFT * dir,
    y: across ? -SWAP_SHIFT * dir : 0,
    filter: 'blur(3px)',
  }),
};

const GroupContext = createContext(null);

export const WarmTooltipGroup = forwardRef(function WarmTooltipGroup(
  { delay = 400, warmWindow = 300, travel = 320, lean = 0, onWarmChange, children },
  ref,
) {
  const reduce = useReducedMotion();
  const id = useId();
  const [current, setCurrent] = useState(null);
  const [state, setState] = useState('closed');
  const status = useRef({
    state: 'closed',
    current: null,
    mode: 'cold',
    instant: false,
    warmUntil: -Infinity,
    warm: false,
    swap: { dir: 0, across: false },
    closeTimer: undefined,
    leaveTimer: undefined,
    warmTimer: undefined,
  });
  const textRef = useRef(null);
  const api = useRef({ show: () => {}, hide: () => {}, reset: () => {} });

  const ax = useMotionValue(0);
  const ay = useMotionValue(0);
  const width = useMotionValue(0);
  const height = useMotionValue(0);
  const presence = useMotionValue(0);
  const vx = useVelocity(ax);
  const vy = useVelocity(ay);
  const speed = useTransform([vx, vy], ([x, y]) =>
    status.current.current && !horizontal(status.current.current.side) ? y : x,
  );
  const leanUnit = useSpring(
    useTransform(speed, [-FULL_LEAN_SPEED, 0, FULL_LEAN_SPEED], [1, 0, -1], { clamp: true }),
    LEAN_SPRING,
  );
  const leanDeg = reduce ? 0 : lean;

  const place = useTransform([ax, ay, width, height], ([x, y, w, h]) => {
    const side = status.current.current?.side || 'top';
    const { X, Y } = layoutOf(x, y, w, h, side);
    return `translate(${X}px, ${Y}px)`;
  });
  const arrowAt = useTransform([ax, ay, width, height], ([x, y, w, h]) => {
    const side = status.current.current?.side || 'top';
    const { X, Y } = layoutOf(x, y, w, h, side);
    return horizontal(side) ? clamp(x - X, 10, w - 10) : clamp(y - Y, 10, h - 10);
  });
  const pop = useTransform([presence, leanUnit], ([progress, motionLean]) => {
    const c = status.current.current;
    if (reduce || !c) return 'none';
    const scale = c.popScale + (1 - c.popScale) * progress;
    const rise = (1 - progress) * RISE * SIGN[c.side] * (c.side === 'left' ? -1 : 1);
    const rotate = motionLean * leanDeg * SIGN[c.side];
    const tx = horizontal(c.side) ? 0 : rise;
    const ty = horizontal(c.side) ? rise : 0;
    return `translate(${tx}px, ${ty}px) scale(${scale}) rotate(${rotate}deg)`;
  });
  const blur = useTransform(presence, (progress) => {
    const c = status.current.current;
    return reduce || !c ? 'none' : `blur(${c.popBlur * (1 - progress)}px)`;
  });

  const isWarm = () => status.current.state !== 'closed' || now() < status.current.warmUntil;
  const notify = () => {
    const next = isWarm();
    if (next === status.current.warm) return;
    status.current.warm = next;
    onWarmChange?.(next);
  };

  const finishClose = () => {
    status.current.state = 'closed';
    status.current.current = null;
    setState('closed');
    setCurrent(null);
    notify();
  };

  api.current.show = (payload, mode) => {
    clearTimeout(status.current.closeTimer);
    clearTimeout(status.current.leaveTimer);
    const previous = status.current.current;
    const fresh = status.current.state === 'closed';
    if (previous && previous.id !== payload.id) {
      const [px, py] = anchorOf(previous.trigger.getBoundingClientRect(), previous.side, previous.gap);
      const [nx, ny] = anchorOf(payload.trigger.getBoundingClientRect(), payload.side, payload.gap);
      const across = !horizontal(payload.side);
      status.current.swap = { dir: Math.sign(across ? ny - py : nx - px) || 1, across };
    } else {
      status.current.swap = { dir: 0, across: !horizontal(payload.side) };
    }
    status.current.mode = fresh ? mode : mode === 'instant' ? 'instant' : 'move';
    status.current.instant = mode === 'instant';
    status.current.current = payload;
    status.current.state = 'open';
    setCurrent(payload);
    setState('open');
    notify();
  };

  const beginClose = (instant) => {
    const c = status.current.current;
    if (!c || status.current.state !== 'open') return;
    status.current.state = 'closing';
    setState('closing');
    status.current.warmUntil = now() + c.warmWindow;
    clearTimeout(status.current.warmTimer);
    status.current.warmTimer = setTimeout(notify, c.warmWindow + 1);
    if (instant || reduce) {
      presence.jump(0);
      finishClose();
      return;
    }
    const closeMs = Math.round(c.popDuration * 0.8);
    animate(presence, 0, { duration: closeMs / 1000, ease: EASE_OUT });
    status.current.closeTimer = setTimeout(finishClose, closeMs);
  };

  api.current.hide = (tooltipId, instant) => {
    const c = status.current.current;
    if (!c || c.id !== tooltipId || status.current.state !== 'open') return;
    clearTimeout(status.current.leaveTimer);
    if (instant || status.current.instant) {
      beginClose(true);
      return;
    }
    status.current.leaveTimer = setTimeout(() => beginClose(false), GRACE);
  };

  api.current.reset = () => {
    clearTimeout(status.current.closeTimer);
    clearTimeout(status.current.leaveTimer);
    if (status.current.current) {
      presence.jump(0);
      finishClose();
    }
    status.current.warmUntil = -Infinity;
    clearTimeout(status.current.warmTimer);
    notify();
  };

  // Re-create context when the active trigger changes so aria-describedby updates.
  const group = useMemo(() => ({
    id,
    delay,
    warmWindow,
    activeId: current?.id || null,
    isWarm,
    show: (payload, mode) => api.current.show(payload, mode),
    hide: (tooltipId, instant) => api.current.hide(tooltipId, instant),
  }), [id, delay, warmWindow, current]);
  useImperativeHandle(ref, () => ({ reset: () => api.current.reset() }), []);

  useLayoutEffect(() => {
    const c = status.current.current;
    const text = textRef.current;
    if (!c || !text || state !== 'open') return;
    const [tx, ty] = anchorOf(c.trigger.getBoundingClientRect(), c.side, c.gap);
    const tw = text.offsetWidth + c.px * 2;
    const th = text.offsetHeight + c.py * 2;
    const mode = status.current.mode;
    if (mode === 'move' && !reduce && travel > 0) {
      const spring = { type: 'spring', duration: travel / 1000, bounce: 0.1 };
      animate(ax, tx, spring);
      animate(ay, ty, spring);
      animate(width, tw, spring);
      animate(height, th, spring);
      animate(presence, 1, { duration: 0.12, ease: EASE_OUT });
      return;
    }
    ax.jump(tx);
    ay.jump(ty);
    width.jump(tw);
    height.jump(th);
    if (mode === 'cold' && !reduce) {
      presence.jump(0);
      animate(presence, 1, { duration: c.popDuration / 1000, ease: EASE_OUT });
    } else {
      presence.jump(1);
    }
  // Motion values are stable; rerun placement when the active tooltip changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, state]);

  useEffect(() => {
    if (state === 'closed') return undefined;
    let frame = 0;
    const follow = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const c = status.current.current;
        if (!c) return;
        const [tx, ty] = anchorOf(c.trigger.getBoundingClientRect(), c.side, c.gap);
        ax.jump(tx);
        ay.jump(ty);
      });
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden' && status.current.current) {
        api.current.hide(status.current.current.id, true);
      }
    };
    const onEscape = (event) => {
      if (event.key === 'Escape' && status.current.current) {
        api.current.hide(status.current.current.id, true);
      }
    };
    window.addEventListener('scroll', follow, { capture: true, passive: true });
    window.addEventListener('resize', follow);
    document.addEventListener('visibilitychange', onHidden);
    document.addEventListener('keydown', onEscape);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', follow, { capture: true });
      window.removeEventListener('resize', follow);
      document.removeEventListener('visibilitychange', onHidden);
      document.removeEventListener('keydown', onEscape);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => () => {
    clearTimeout(status.current.closeTimer);
    clearTimeout(status.current.leaveTimer);
    clearTimeout(status.current.warmTimer);
  }, []);

  const side = current?.side || 'top';
  const arrowStyle = horizontal(side) ? { left: arrowAt } : { top: arrowAt };

  return (
    <GroupContext.Provider value={group}>
      {children}
      {state !== 'closed' && current && typeof document !== 'undefined'
        ? createPortal(
          <Motion.span
            id={id}
            role="tooltip"
            className="warm-tooltip"
            data-side={side}
            style={{
              transform: place,
              width,
              height,
              '--wt-surface': current.surfaceColor,
              '--wt-ink': current.inkColor,
              '--wt-radius': `${current.radius}px`,
              '--wt-font': `${current.font}px`,
              '--wt-origin': ORIGIN[side],
            }}
          >
            <Motion.span
              className="warm-tooltip__surface"
              style={{ transform: pop, opacity: presence, filter: blur }}
            >
              <AnimatePresence initial={false} custom={status.current.swap}>
                <Motion.span
                  key={current.id}
                  className="warm-tooltip__layer"
                  custom={status.current.swap}
                  variants={LAYER}
                  initial="enter"
                  animate="show"
                  exit="exit"
                  transition={{ duration: reduce ? 0 : SWAP_DURATION, ease: EASE_OUT }}
                >
                  <span
                    ref={(element) => {
                      if (element) textRef.current = element;
                    }}
                    className="warm-tooltip__text"
                  >
                    {current.content}
                    {current.shortcut ? (
                      <kbd className="warm-tooltip__shortcut">{current.shortcut}</kbd>
                    ) : null}
                  </span>
                </Motion.span>
              </AnimatePresence>
              {current.arrow ? (
                <Motion.span
                  className="warm-tooltip__arrow"
                  data-side={side}
                  style={arrowStyle}
                  aria-hidden="true"
                />
              ) : null}
            </Motion.span>
          </Motion.span>,
          document.body,
        )
        : null}
    </GroupContext.Provider>
  );
});

function Trigger({
  content,
  shortcut,
  children,
  side,
  delay,
  warmWindow,
  surfaceColor,
  inkColor,
  size,
  radius,
  gap,
  arrow,
  popDuration,
  popScale,
  popBlur,
  showFuse,
  longPress,
  disabled,
  className,
}) {
  const group = useContext(GroupContext);
  const id = useId();
  const triggerRef = useRef(null);
  const [fuse, setFuse] = useState('idle');
  const [pressing, setPressing] = useState(false);
  const timers = useRef({ open: undefined, press: undefined, press0: null, suppressClick: false });
  const preset = SIZES[size] || SIZES.md;
  const coldDelay = delay ?? group.delay;
  const active = group.activeId === id;

  const payload = () => ({
    id,
    trigger: triggerRef.current,
    content,
    shortcut,
    side,
    gap,
    arrow,
    surfaceColor,
    inkColor,
    radius,
    font: preset.font,
    px: preset.px,
    py: preset.py,
    popDuration,
    popScale,
    popBlur,
    warmWindow: warmWindow ?? group.warmWindow,
  });

  const hide = (instant) => {
    clearTimeout(timers.current.open);
    setFuse('idle');
    group.hide(id, instant);
  };

  const arm = () => {
    clearTimeout(timers.current.open);
    if (group.isWarm()) {
      group.show(payload(), 'warm');
      return;
    }
    setFuse('arming');
    timers.current.open = setTimeout(() => {
      setFuse('idle');
      group.show(payload(), 'cold');
    }, coldDelay);
  };

  const cancelPress = () => {
    clearTimeout(timers.current.press);
    if (!timers.current.press0) return;
    timers.current.press0 = null;
    setPressing(false);
    setFuse('idle');
  };

  useEffect(() => {
    if (disabled) {
      cancelPress();
      hide(true);
    }
  // Only react to the disabled transition.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  useEffect(() => {
    if (!active) return undefined;
    const onOutside = (event) => {
      if (triggerRef.current && !triggerRef.current.contains(event.target)) hide(false);
    };
    document.addEventListener('pointerdown', onOutside, true);
    return () => document.removeEventListener('pointerdown', onOutside, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => () => {
    clearTimeout(timers.current.open);
    clearTimeout(timers.current.press);
  }, []);

  const handlers = disabled ? {} : {
    onPointerEnter: (event) => {
      if (event.pointerType !== 'touch' && event.buttons === 0) arm();
    },
    onPointerLeave: (event) => {
      if (event.pointerType !== 'touch') hide(false);
    },
    onPointerDown: (event) => {
      if (event.pointerType === 'mouse') {
        hide(false);
        return;
      }
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is optional in embedded browsers.
      }
      timers.current.press0 = { x: event.clientX, y: event.clientY, id: event.pointerId };
      setPressing(true);
      setFuse('arming');
      timers.current.press = setTimeout(() => {
        timers.current.suppressClick = true;
        timers.current.press0 = null;
        setPressing(false);
        setFuse('idle');
        group.show(payload(), 'cold');
      }, longPress);
    },
    onPointerMove: (event) => {
      const press = timers.current.press0;
      if (press && press.id === event.pointerId
        && Math.hypot(event.clientX - press.x, event.clientY - press.y) > HOLD_SLOP) {
        cancelPress();
      }
    },
    onPointerUp: cancelPress,
    onPointerCancel: cancelPress,
    onContextMenu: (event) => {
      if (timers.current.press0) event.preventDefault();
    },
    onClickCapture: (event) => {
      if (!timers.current.suppressClick) return;
      timers.current.suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    },
    onFocus: (event) => {
      if (event.target.matches?.(':focus-visible')) group.show(payload(), 'instant');
    },
    onBlur: () => hide(true),
    onKeyDown: (event) => {
      if (event.key === 'Escape') hide(true);
    },
  };

  const described = children.props['aria-describedby'];
  const describedBy = active ? [described, group.id].filter(Boolean).join(' ') : described;

  return (
    <span
      ref={triggerRef}
      className={`warm-tooltip-trigger${className ? ` ${className}` : ''}`}
      data-pressing={pressing ? '' : undefined}
      style={{
        '--wt-surface': surfaceColor,
        '--wt-fuse-ms': `${timers.current.press0 ? longPress : coldDelay}ms`,
      }}
      {...handlers}
    >
      {cloneElement(children, { 'aria-describedby': describedBy })}
      {showFuse ? (
        <span
          className="warm-tooltip-trigger__fuse"
          data-side={side}
          data-fuse={fuse}
          aria-hidden="true"
        />
      ) : null}
    </span>
  );
}

export default function WarmTooltip({
  content,
  shortcut,
  children,
  side = 'top',
  delay,
  warmWindow,
  surfaceColor = '#f5f5f5',
  inkColor = '#18181b',
  size = 'md',
  radius = 8,
  gap = 8,
  arrow = true,
  popDuration = 160,
  popScale = 0.94,
  popBlur = 4,
  showFuse = false,
  longPress = 500,
  disabled = false,
  className = '',
}) {
  const group = useContext(GroupContext);
  const props = {
    content,
    shortcut,
    children,
    side,
    delay,
    warmWindow,
    surfaceColor,
    inkColor,
    size,
    radius,
    gap,
    arrow,
    popDuration,
    popScale,
    popBlur,
    showFuse,
    longPress,
    disabled,
    className,
  };
  if (group) return <Trigger {...props} />;
  return (
    <WarmTooltipGroup delay={delay} warmWindow={warmWindow}>
      <Trigger {...props} />
    </WarmTooltipGroup>
  );
}
