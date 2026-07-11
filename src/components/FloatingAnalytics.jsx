import { useRef, useState } from "react";
import MiniProgressChart from "./MiniProgressChart";
import ProgressModal from "./ProgressModal";

function FloatingAnalytics({ schedule, completed }) {
  const [isHovered, setIsHovered] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isModalActive, setIsModalActive] = useState(false);
  const containerRef = useRef(null);

  const handleOpenModal = () => {
    setIsModalOpen(true);
    // Request animation frames to ensure element is rendered in DOM before starting animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsModalActive(true);
      });
    });
  };

  const handleCloseModal = () => {
    setIsModalActive(false);
    // Wait for transition duration (300ms) before unmounting
    setTimeout(() => {
      setIsModalOpen(false);
    }, 300);
  };

  // Hover popup only shown if modal is not open
  const showHoverPopup = isHovered && !isModalOpen;

  return (
    <div
      className="floating-analytics-container"
      ref={containerRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        aria-expanded={isModalOpen}
        aria-haspopup="dialog"
        className="floating-analytics-btn"
        onClick={handleOpenModal}
        type="button"
      >
        Trend 📊
      </button>

      {showHoverPopup ? (
        <div className="floating-analytics-popup" role="dialog">
          <MiniProgressChart completed={completed} schedule={schedule} />
        </div>
      ) : null}

      <ProgressModal
        isOpen={isModalOpen}
        isActive={isModalActive}
        onClose={handleCloseModal}
        schedule={schedule}
        completed={completed}
      />
    </div>
  );
}

export default FloatingAnalytics;

