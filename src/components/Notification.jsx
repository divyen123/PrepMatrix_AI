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
    <div className="notification-popup">
      {message}
    </div>
  );
}

export default Notification;