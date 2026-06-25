import { useEffect } from "react";

function Reminder({ schedule, completed }) {
  useEffect(() => {
    if (!schedule.length) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      if (!("speechSynthesis" in window)) {
        return;
      }

      const message =
        completed.length === 0
          ? "Your planner is ready. Start the first study task when you can."
          : "Stay focused. Completing the next task will keep your momentum strong.";

      const speech = new SpeechSynthesisUtterance(message);
      speech.rate = 1;
      window.speechSynthesis.speak(speech);
    }, 60000 * 2);

    return () => window.clearInterval(intervalId);
  }, [schedule, completed]);

  return null;
}

export default Reminder;
