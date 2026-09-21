import { useRef } from "react";
import "./SpotlightCard.css";

export default function SpotlightCard({
  as = "div",
  children,
  className = "",
  spotlightColor = "rgba(255, 255, 255, 0.25)",
  ...props
}) {
  const cardRef = useRef(null);

  const handleMouseMove = (event) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--mouse-x", `${event.clientX - rect.left}px`);
    card.style.setProperty("--mouse-y", `${event.clientY - rect.top}px`);
    props.onMouseMove?.(event);
  };

  const cardProps = {
    ...props,
    className: `card-spotlight ${className}`.trim(),
    onMouseMove: handleMouseMove,
    style: { ...props.style, "--spotlight-color": spotlightColor },
  };

  if (as === "article") return <article {...cardProps} ref={cardRef}>{children}</article>;
  if (as === "section") return <section {...cardProps} ref={cardRef}>{children}</section>;
  return <div {...cardProps} ref={cardRef}>{children}</div>;
}
