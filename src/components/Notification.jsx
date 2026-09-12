import { useState, useEffect } from "react";

function Notification({ message }) {

  const [show, setShow] = useState(false);

  useEffect(() => {

    if (message) {
      setShow(true);

      setTimeout(() => {
        setShow(false);
      }, 3000);
    }

  }, [message]);

  if (!show) return null;

  return (
    <div aria-live="polite" className="notification-popup" role="status">
      {message}
    </div>
  );
}

export default Notification;
