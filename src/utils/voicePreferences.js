export const VOICE_PREFERENCES_STORAGE_KEY = "prepmatrix_voice_preferences_v1";

export const VOICE_RATE_MIN = 0.75;
export const VOICE_RATE_MAX = 1.25;
export const VOICE_PITCH_MIN = 0.75;
export const VOICE_PITCH_MAX = 1.25;
export const VOICE_VOLUME_MIN = 0;
export const VOICE_VOLUME_MAX = 1;

export const DEFAULT_VOICE_PREFERENCES = Object.freeze({
  voiceStyle: "female",
  rate: 0.96,
  pitch: 1,
  volume: 1,
});

const FEMALE_VOICE_HINTS = [
  "female",
  "woman",
  "aria",
  "ava",
  "emma",
  "hazel",
  "heera",
  "jenny",
  "karen",
  "lekha",
  "libby",
  "michelle",
  "moira",
  "natasha",
  "neerja",
  "samantha",
  "sonia",
  "susan",
  "tessa",
  "veena",
  "victoria",
  "zira",
];

const MALE_VOICE_HINTS = [
  "male",
  "man",
  "alex",
  "christopher",
  "daniel",
  "david",
  "eric",
  "fred",
  "george",
  "guy",
  "mark",
  "prabhat",
  "ravi",
  "rishi",
  "ryan",
  "thomas",
];

function getDefaultStorage() {
  try {
    return typeof globalThis !== "undefined" ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

function clampNumber(value, fallback, min, max) {
  const numeric = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function normalizeVoiceStyle(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "male" ? "male" : "female";
}

function normalizeVoiceDescriptor(voice) {
  return `${voice?.name || ""} ${voice?.voiceURI || ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasVoiceHint(descriptor, hint) {
  return ` ${descriptor} `.includes(` ${hint} `);
}

function getLanguageScore(voice) {
  const language = String(voice?.lang || "").trim().toLowerCase();
  if (language === "en-in") return 40;
  if (language.startsWith("en-in")) return 38;
  if (language === "en-gb") return 32;
  if (language === "en-us") return 30;
  if (language.startsWith("en")) return 26;
  return 0;
}

function sortVoices(voices) {
  return [...voices].sort((left, right) => {
    const scoreDifference = (
      getLanguageScore(right) - getLanguageScore(left)
      || Number(Boolean(right?.default)) - Number(Boolean(left?.default))
      || Number(Boolean(right?.localService)) - Number(Boolean(left?.localService))
    );
    if (scoreDifference !== 0) return scoreDifference;
    return String(left?.name || "").localeCompare(String(right?.name || ""));
  });
}

export function normalizeVoicePreferences(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    voiceStyle: normalizeVoiceStyle(source.voiceStyle),
    rate: clampNumber(
      source.rate,
      DEFAULT_VOICE_PREFERENCES.rate,
      VOICE_RATE_MIN,
      VOICE_RATE_MAX
    ),
    pitch: clampNumber(
      source.pitch,
      DEFAULT_VOICE_PREFERENCES.pitch,
      VOICE_PITCH_MIN,
      VOICE_PITCH_MAX
    ),
    volume: clampNumber(
      source.volume,
      DEFAULT_VOICE_PREFERENCES.volume,
      VOICE_VOLUME_MIN,
      VOICE_VOLUME_MAX
    ),
  };
}

export function readStoredVoicePreferences(storage) {
  const targetStorage = storage === undefined ? getDefaultStorage() : storage;
  if (!targetStorage?.getItem) return { ...DEFAULT_VOICE_PREFERENCES };

  try {
    const storedValue = targetStorage.getItem(VOICE_PREFERENCES_STORAGE_KEY);
    if (!storedValue) return { ...DEFAULT_VOICE_PREFERENCES };
    return normalizeVoicePreferences(JSON.parse(storedValue));
  } catch {
    return { ...DEFAULT_VOICE_PREFERENCES };
  }
}

export function storeVoicePreferences(value, storage) {
  const normalized = normalizeVoicePreferences(value);
  const targetStorage = storage === undefined ? getDefaultStorage() : storage;

  try {
    targetStorage?.setItem?.(
      VOICE_PREFERENCES_STORAGE_KEY,
      JSON.stringify(normalized)
    );
  } catch {
    // Browser privacy settings can block device-local preference storage.
  }

  return normalized;
}

export function inferVoiceStyle(voice) {
  const descriptor = normalizeVoiceDescriptor(voice);
  if (!descriptor) return null;

  const femaleMatches = FEMALE_VOICE_HINTS.filter((hint) => hasVoiceHint(descriptor, hint)).length;
  const maleMatches = MALE_VOICE_HINTS.filter((hint) => hasVoiceHint(descriptor, hint)).length;

  if (femaleMatches === maleMatches) return null;
  return femaleMatches > maleMatches ? "female" : "male";
}

export function resolvePreferredVoice(voices = [], preferences = {}) {
  const safeVoices = Array.isArray(voices)
    ? voices.filter((voice) => voice && typeof voice === "object")
    : [];
  if (safeVoices.length === 0) return null;

  const { voiceStyle } = normalizeVoicePreferences(preferences);
  const englishVoices = safeVoices.filter((voice) => getLanguageScore(voice) > 0);
  const matchingEnglishVoices = englishVoices.filter(
    (voice) => inferVoiceStyle(voice) === voiceStyle
  );
  const neutralEnglishVoices = englishVoices.filter(
    (voice) => inferVoiceStyle(voice) === null
  );
  const matchingVoices = safeVoices.filter(
    (voice) => inferVoiceStyle(voice) === voiceStyle
  );

  const candidates = matchingEnglishVoices.length > 0
    ? matchingEnglishVoices
    : neutralEnglishVoices.length > 0
      ? neutralEnglishVoices
      : englishVoices.length > 0
        ? englishVoices
        : matchingVoices.length > 0
          ? matchingVoices
          : safeVoices;

  return sortVoices(candidates)[0] || null;
}

export function applyVoicePreferencesToUtterance(
  utterance,
  voices = [],
  preferences = {}
) {
  const normalized = normalizeVoicePreferences(preferences);
  const selectedVoice = resolvePreferredVoice(voices, normalized);

  if (!utterance || typeof utterance !== "object") {
    return { preferences: normalized, voice: selectedVoice };
  }

  utterance.rate = normalized.rate;
  utterance.pitch = normalized.pitch;
  utterance.volume = normalized.volume;
  utterance.lang = selectedVoice?.lang || "en-IN";
  if (selectedVoice) utterance.voice = selectedVoice;

  return { preferences: normalized, voice: selectedVoice };
}

export function observeSpeechVoices(speechSynthesis, onVoicesChange) {
  if (
    !speechSynthesis
    || typeof speechSynthesis.getVoices !== "function"
    || typeof onVoicesChange !== "function"
  ) {
    return () => {};
  }

  const emitVoices = () => {
    const voices = speechSynthesis.getVoices();
    onVoicesChange(Array.isArray(voices) ? voices : []);
  };

  emitVoices();
  speechSynthesis.addEventListener?.("voiceschanged", emitVoices);

  return () => {
    speechSynthesis.removeEventListener?.("voiceschanged", emitVoices);
  };
}
