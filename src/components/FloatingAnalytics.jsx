import { useEffect, useRef, useState } from "react";
import MiniProgressChart from "./MiniProgressChart";

function FloatingAnalytics({ schedule, completed }) {
  const [isClicked, setIsClicked] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isClicked) return undefined;

    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsClicked(false);
      }
    };

    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, [isClicked]);

  const show = isClicked || isHovered;

  return (
    <div
      className="floating-analytics-container"
      ref={containerRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        aria-expanded={show}
        aria-haspopup="dialog"
        className="floating-analytics-btn"
        onClick={() => setIsClicked((value) => !value)}
        type="button"
      >
        Trend 📊
      </button>

      {show ? (
        <div className="floating-analytics-popup" role="dialog">
          <MiniProgressChart completed={completed} schedule={schedule} />
        </div>
      ) : null}
    </div>
  );
}

export default FloatingAnalytics;
