import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_VOICE_PREFERENCES,
  VOICE_PREFERENCES_STORAGE_KEY,
  applyVoicePreferencesToUtterance,
  inferVoiceStyle,
  normalizeVoicePreferences,
  observeSpeechVoices,
  readStoredVoicePreferences,
  resolvePreferredVoice,
  storeVoicePreferences,
} from "./voicePreferences.js";

function createVoice(name, lang, options = {}) {
  return {
    name,
    lang,
    voiceURI: options.voiceURI || name,
    default: Boolean(options.default),
    localService: options.localService !== false,
  };
}

test("voice preferences normalize defaults and supported values", () => {
  assert.deepEqual(normalizeVoicePreferences(), DEFAULT_VOICE_PREFERENCES);
  assert.deepEqual(
    normalizeVoicePreferences({
      voiceStyle: " MALE ",
      rate: "1.1",
      pitch: "0.9",
      volume: "0.65",
    }),
    {
      voiceStyle: "male",
      rate: 1.1,
      pitch: 0.9,
      volume: 0.65,
    }
  );
});

test("voice preferences clamp unsafe numeric values and reject malformed ones", () => {
  assert.deepEqual(
    normalizeVoicePreferences({
      voiceStyle: "unknown",
      rate: 12,
      pitch: -4,
      volume: Number.NaN,
    }),
    {
      voiceStyle: "female",
      rate: 1.5,
      pitch: 0.6,
      volume: 1,
    }
  );
});

test("voice preferences persist safely and recover from bad storage", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };

  const stored = storeVoicePreferences({
    voiceStyle: "male",
    rate: 1.05,
    pitch: 0.95,
    volume: 0.8,
  }, storage);

  assert.deepEqual(readStoredVoicePreferences(storage), stored);
  assert.match(values.get(VOICE_PREFERENCES_STORAGE_KEY), /"voiceStyle":"male"/);

  values.set(VOICE_PREFERENCES_STORAGE_KEY, "{bad json");
  assert.deepEqual(readStoredVoicePreferences(storage), DEFAULT_VOICE_PREFERENCES);

  const blockedStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.deepEqual(readStoredVoicePreferences(blockedStorage), DEFAULT_VOICE_PREFERENCES);
  assert.doesNotThrow(() => storeVoicePreferences({}, blockedStorage));
});

test("voice style inference never mistakes female for male", () => {
  assert.equal(inferVoiceStyle(createVoice("Google UK English Female", "en-GB")), "female");
  assert.equal(inferVoiceStyle(createVoice("Google UK English Male", "en-GB")), "male");
  assert.equal(inferVoiceStyle(createVoice("Microsoft Neerja Online", "en-IN")), "female");
  assert.equal(inferVoiceStyle(createVoice("Microsoft Ravi Online", "en-IN")), "male");
});

test("preferred voice selection honors style and prioritizes Indian English", () => {
  const femaleGb = createVoice("Google UK English Female", "en-GB", { default: true });
  const femaleIndia = createVoice("Microsoft Neerja Online", "en-IN");
  const maleIndia = createVoice("Microsoft Ravi Online", "en-IN");

  assert.equal(
    resolvePreferredVoice([femaleGb, maleIndia, femaleIndia], { voiceStyle: "female" }),
    femaleIndia
  );
  assert.equal(
    resolvePreferredVoice([femaleGb, maleIndia, femaleIndia], { voiceStyle: "male" }),
    maleIndia
  );
});

test("preferred voice selection uses a deterministic English fallback", () => {
  const defaultNeutral = createVoice("Browser English One", "en-US", { default: true });
  const indianNeutral = createVoice("Browser English India", "en-IN");

  assert.equal(
    resolvePreferredVoice([defaultNeutral, indianNeutral], { voiceStyle: "male" }),
    indianNeutral
  );
  assert.equal(resolvePreferredVoice([], { voiceStyle: "female" }), null);
});

test("utterance configuration applies the selected voice and all modifiers", () => {
  const femaleVoice = createVoice("Microsoft Heera Desktop", "en-IN");
  const utterance = {};
  const result = applyVoicePreferencesToUtterance(
    utterance,
    [femaleVoice],
    {
      voiceStyle: "female",
      rate: 1.1,
      pitch: 1.2,
      volume: 0.7,
    }
  );

  assert.equal(result.voice, femaleVoice);
  assert.equal(utterance.voice, femaleVoice);
  assert.equal(utterance.lang, "en-IN");
  assert.equal(utterance.rate, 1.1);
  assert.equal(utterance.pitch, 1.2);
  assert.equal(utterance.volume, 0.7);
});

test("speech voice observation handles delayed voices and cleans up", () => {
  let voices = [];
  let listener = null;
  const snapshots = [];
  const speechSynthesis = {
    getVoices: () => voices,
    addEventListener: (eventName, callback) => {
      if (eventName === "voiceschanged") listener = callback;
    },
    removeEventListener: (eventName, callback) => {
      if (eventName === "voiceschanged" && listener === callback) listener = null;
    },
  };

  const unsubscribe = observeSpeechVoices(
    speechSynthesis,
    (nextVoices) => snapshots.push(nextVoices)
  );

  assert.deepEqual(snapshots, [[]]);
  const delayedVoice = createVoice("Microsoft Ravi Online", "en-IN");
  voices = [delayedVoice];
  listener();
  assert.deepEqual(snapshots, [[], [delayedVoice]]);

  unsubscribe();
  assert.equal(listener, null);
});
