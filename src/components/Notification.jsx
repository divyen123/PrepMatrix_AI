import { useEffect, useRef, useState } from "react";
import useFloatingOverlayStackSlot from "../hooks/useFloatingOverlayStackSlot";
import { FLOATING_OVERLAY_STACK_PROPERTIES } from "../utils/floatingOverlayStack";

function Notification({ message }) {

  const [show, setShow] = useState(false);
  const notificationRef = useRef(null);

  useEffect(() => {

    if (message) {
      setShow(true);

      const timeout = window.setTimeout(() => {
        setShow(false);
      }, 3000);

      return () => window.clearTimeout(timeout);
    }

    return undefined;

  }, [message]);

  useFloatingOverlayStackSlot(notificationRef, FLOATING_OVERLAY_STACK_PROPERTIES.notification, show);

  if (!show) return null;

  return (
    <div aria-live="polite" className="notification-popup" ref={notificationRef} role="status">
      {message}
    </div>
  );
}

export default Notification;
