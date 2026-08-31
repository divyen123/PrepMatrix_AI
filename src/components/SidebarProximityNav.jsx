import { useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";

const PROXIMITY_RADIUS = 92;
const SMOOTHING_MS = 100;
const FINE_POINTER_QUERY =
  "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";

function canAnimateSidebar() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(FINE_POINTER_QUERY).matches
  );
}

function smoothstep(value) {
  return value * value * (3 - 2 * value);
}

function activityLabel(item, activity) {
  if (!activity) return "";
  if (activity.status === "running") return `${item.label} is working in the background.`;
  if (activity.status === "completed") return `${item.label} has new work ready.`;
  if (activity.status === "failed") return `${item.label} background work needs attention.`;
  if (activity.status === "attention") return activity.label || `${item.label} needs attention.`;
  return "";
}

export default function SidebarProximityNav({ items, onNavigate, routeActivities = {} }) {
  const itemRefs = useRef([]);
  const targetEffects = useRef([]);
  const currentEffects = useRef([]);
  const animationFrame = useRef(null);
  const lastFrameTime = useRef(null);

  const animateEffects = (timestamp) => {
    const elapsed = lastFrameTime.current
      ? Math.min(timestamp - lastFrameTime.current, 48)
      : 16;
    const easing = 1 - Math.exp(-elapsed / SMOOTHING_MS);
    let hasMotion = false;

    itemRefs.current.forEach((item, index) => {
      if (!item) return;

      const current = currentEffects.current[index] ?? 0;
      const target = targetEffects.current[index] ?? 0;
      const next = current + (target - current) * easing;
      const settled = Math.abs(target - next) < 0.002;
      const value = settled ? target : next;

      currentEffects.current[index] = value;
      item.style.setProperty("--sidebar-proximity", value.toFixed(4));
      hasMotion ||= !settled;
    });

    lastFrameTime.current = timestamp;

    if (hasMotion) {
      animationFrame.current = requestAnimationFrame(animateEffects);
      return;
    }

    animationFrame.current = null;
    lastFrameTime.current = null;
  };

  const startAnimation = () => {
    if (animationFrame.current !== null) return;
    animationFrame.current = requestAnimationFrame(animateEffects);
  };

  const resetEffects = () => {
    if (!canAnimateSidebar()) return;

    targetEffects.current = itemRefs.current.map(() => 0);
    startAnimation();
  };

  const handlePointerMove = (event) => {
    if (event.pointerType !== "mouse" || !canAnimateSidebar()) return;

    targetEffects.current = itemRefs.current.map((item) => {
      if (!item) return 0;

      const itemBounds = item.getBoundingClientRect();
      const itemCenter = itemBounds.top + itemBounds.height / 2;
      const distance = Math.abs(event.clientY - itemCenter);
      const proximity = Math.max(0, 1 - distance / PROXIMITY_RADIUS);
      return smoothstep(proximity);
    });

    startAnimation();
  };

  useEffect(() => {
    return () => {
      if (animationFrame.current !== null) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, []);

  return (
    <nav
      className="sidebar-nav sidebar-nav--proximity"
      aria-label="Primary navigation"
      onPointerCancel={resetEffects}
      onPointerLeave={resetEffects}
      onPointerMove={handlePointerMove}
    >
      {items.map((item, index) => {
        const Icon = item.icon;
        const activity = routeActivities[item.to] || item.activity || null;
        const statusLabel = activityLabel(item, activity);

        return (
          <NavLink
            aria-label={statusLabel ? `${item.label}. ${statusLabel}` : item.label}
            className={({ isActive }) => [
              "sidebar-link sidebar-link--proximity",
              isActive ? "active" : "",
              activity?.status ? `has-route-activity route-activity--${activity.status}` : "",
            ].filter(Boolean).join(" ")}
            key={item.to}
            ref={(node) => {
              itemRefs.current[index] = node;
            }}
            title={item.helper}
            to={item.to}
            onClick={onNavigate}
          >
            <Icon
              aria-hidden="true"
              className="sidebar-link-icon"
              size={18}
              strokeWidth={2.2}
            />
            <span className="sidebar-link-label">{item.label}</span>
            {statusLabel && (
              <span
                aria-hidden="true"
                className="sidebar-route-activity"
                data-status={activity.status}
                title={statusLabel}
              />
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
