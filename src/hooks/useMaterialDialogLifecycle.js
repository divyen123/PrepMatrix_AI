import { useEffect, useRef, useState } from "react";
import { acquireDocumentScrollLock } from "../utils/documentScrollLock";

export default function useMaterialDialogLifecycle(onClose) {
  const dialogRef = useRef(null);
  const closeTimerRef = useRef(null);
  const entryFramesRef = useRef([]);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const returnFocus = document.activeElement;
    closingRef.current = false;
    dialog.showModal();
    const releaseScrollLock = acquireDocumentScrollLock();
    const entryFrames = [];
    entryFramesRef.current = entryFrames;
    entryFrames[0] = window.requestAnimationFrame(() => {
      entryFrames[1] = window.requestAnimationFrame(() => setIsVisible(true));
    });

    return () => {
      entryFrames.forEach((frame) => window.cancelAnimationFrame(frame));
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
      dialog.close();
      releaseScrollLock();
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }, []);

  function requestClose() {
    if (closingRef.current) return;
    closingRef.current = true;
    entryFramesRef.current.forEach((frame) => window.cancelAnimationFrame(frame));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onCloseRef.current();
      return;
    }
    setIsVisible(false);
    closeTimerRef.current = window.setTimeout(() => onCloseRef.current(), 220);
  }

  return {
    dialogRef,
    isVisible,
    requestClose,
    onCancel(event) {
      event.preventDefault();
      requestClose();
    },
    onBackdropClick(event) {
      if (event.target === event.currentTarget) requestClose();
    },
  };
}
