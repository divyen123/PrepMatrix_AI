import confetti from 'canvas-confetti';
import successSound from '../assets/success.mp3';

export function celebrateCompletion({ zIndex } = {}) {
  try {
    confetti({
      particleCount: 150,
      spread: 100,
      ...(zIndex === undefined ? {} : { zIndex }),
    });
  } catch {
    // Completion stays successful when the animation is unavailable.
  }

  try {
    const audio = new Audio(successSound);
    audio.play()?.catch(() => {});
  } catch {
    // Audio support and playback permissions can vary between devices.
  }
}
