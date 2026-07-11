import { useEffect, useState } from "react";

const LEGACY_PET_VISIBILITY_KEY = "prepmatrix_sidebar_pet_visible";
const PET_STATUS_EVENT = "prepmatrixPetStatusChange";

export function PetSprite({ state = "idle", size = "chat" }) {
  return (
    <span
      aria-hidden="true"
      className={`study-pet-sprite state-${state} size-${size}`}
    />
  );
}

export function ChatStudyPet({ message, state = "idle" }) {
  return (
    <div className="chat-study-pet">
      <div aria-live="polite" className={`study-pet-speech state-${state}`} role="status">
        {message}
      </div>
      <div
        aria-label="PrepMatrix study companion"
        className="study-pet-button"
        role="img"
        title="PrepMatrix study companion"
      >
        <PetSprite state={state} />
      </div>
    </div>
  );
}

export function SidebarStudyPet() {
  const [statusState, setStatusState] = useState("idle");

  useEffect(() => {
    window.localStorage.removeItem(LEGACY_PET_VISIBILITY_KEY);

    const handleStatus = (event) => {
      setStatusState(event.detail?.state || "idle");
    };
    window.addEventListener(PET_STATUS_EVENT, handleStatus);
    return () => window.removeEventListener(PET_STATUS_EVENT, handleStatus);
  }, []);

  return (
    <div className="sidebar-study-pet">
      <button
        aria-label="Open AI Chat with companion"
        className="sidebar-pet-button"
        onClick={() => window.dispatchEvent(new CustomEvent("openPrepMatrixAIChat"))}
        title="Open AI Chat"
        type="button"
      >
        <PetSprite size="sidebar" state={statusState} />
      </button>
    </div>
  );
}
