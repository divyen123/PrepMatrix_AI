import { useEffect, useRef, useState } from "react";
import { EyeOff, Pin, X } from "lucide-react";

const PET_VISIBILITY_KEY = "prepmatrix_sidebar_pet_visible";
const PET_VISIBILITY_EVENT = "prepmatrixPetVisibilityChange";
const PET_STATUS_EVENT = "prepmatrixPetStatusChange";

function getStoredVisibility() {
  return window.localStorage.getItem(PET_VISIBILITY_KEY) === "true";
}

function updateStoredVisibility(visible) {
  window.localStorage.setItem(PET_VISIBILITY_KEY, String(visible));
  window.dispatchEvent(new CustomEvent(PET_VISIBILITY_EVENT, { detail: { visible } }));
}

function usePetVisibility() {
  const [visible, setVisible] = useState(getStoredVisibility);

  useEffect(() => {
    const handleVisibility = (event) => setVisible(Boolean(event.detail?.visible));
    window.addEventListener(PET_VISIBILITY_EVENT, handleVisibility);
    return () => window.removeEventListener(PET_VISIBILITY_EVENT, handleVisibility);
  }, []);

  const setPetVisible = (nextVisible) => {
    setVisible(nextVisible);
    updateStoredVisibility(nextVisible);
  };

  return [visible, setPetVisible];
}

function useOutsideClose(ref, onClose) {
  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!ref.current?.contains(event.target)) onClose();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onClose, ref]);
}

export function PetSprite({ state = "idle", size = "chat" }) {
  return (
    <span
      aria-hidden="true"
      className={`study-pet-sprite state-${state} size-${size}`}
    />
  );
}

export function ChatStudyPet({ message, state = "idle" }) {
  const rootRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navbarVisible, setNavbarVisible] = usePetVisibility();
  useOutsideClose(rootRef, () => setMenuOpen(false));

  const toggleNavbarPet = () => {
    setNavbarVisible(!navbarVisible);
    setMenuOpen(false);
  };

  return (
    <div className="chat-study-pet" ref={rootRef}>
      <div aria-live="polite" className={`study-pet-speech state-${state}`} role="status">
        {message}
      </div>
      <button
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label="Open companion options"
        className="study-pet-button"
        onClick={() => setMenuOpen((open) => !open)}
        title="Companion options"
        type="button"
      >
        <PetSprite state={state} />
      </button>

      {menuOpen && (
        <div className="study-pet-menu" role="menu">
          <div className="study-pet-menu-heading">
            <span>Monochrome Companion</span>
            <button aria-label="Close companion menu" onClick={() => setMenuOpen(false)} type="button">
              <X size={12} />
            </button>
          </div>
          <button onClick={toggleNavbarPet} role="menuitem" type="button">
            {navbarVisible ? <EyeOff size={14} /> : <Pin size={14} />}
            <span>{navbarVisible ? "Hide pet" : "Keep pet in navbar"}</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function SidebarStudyPet() {
  const [visible] = usePetVisibility();
  const [statusState, setStatusState] = useState("idle");

  useEffect(() => {
    const handleStatus = (event) => {
      setStatusState(event.detail?.state || "idle");
    };
    window.addEventListener(PET_STATUS_EVENT, handleStatus);
    return () => window.removeEventListener(PET_STATUS_EVENT, handleStatus);
  }, []);

  if (!visible) return null;

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
