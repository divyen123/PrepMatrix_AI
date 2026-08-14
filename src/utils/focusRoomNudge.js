function cleanSpokenValue(value, fallback) {
  const normalized = String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || fallback;
}
export function buildFocusNudgeMessage(userName, subject) {
  const firstName = cleanSpokenValue(userName, "").split(" ")[0];
  const studySubject = cleanSpokenValue(subject, "this topic");
  return firstName
    ? `Hey ${firstName}, let's get back to studying ${studySubject}.`
    : `Hey, let's get back to studying ${studySubject}.`;
}

export function speakFocusNudge(message, {
  speechSynthesis = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
} = {}) {
  if (!speechSynthesis?.speak || typeof Utterance !== "function") return false;
  const utterance = new Utterance(cleanSpokenValue(message, "Let's get back to studying."));
  utterance.rate = 0.94;
  utterance.pitch = 1;
  utterance.volume = 0.72;
  speechSynthesis.speak(utterance);
  return true;
}
