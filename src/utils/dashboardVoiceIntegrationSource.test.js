import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("../pages/DashboardPage.jsx", import.meta.url), "utf8");
const voiceHookSource = readFileSync(new URL("../hooks/useVoiceAssistant.js", import.meta.url), "utf8");

test("dashboard microphone uses the shared final-transcript command executor", () => {
  assert.match(appSource, /<DashboardPage[\s\S]*voiceAssistant=\{voiceAssistant\}/u);
  assert.match(dashboardSource, /voiceAssistant\.askWithVoice\(\{[\s\S]*onTranscript:/u);
  assert.match(dashboardSource, /processTranscript:\s*!hasAttachments/u);
  assert.doesNotMatch(dashboardSource, /window\.(?:SpeechRecognition|webkitSpeechRecognition)/u);

  assert.match(voiceHookSource, /if \(disabled \|\| manualCaptureRef\.current\) return;/u);
  assert.match(
    voiceHookSource,
    /manualCaptureRef\.current = session;[\s\S]*setIsCommandListening\(true\);[\s\S]*const runCapture = async \(\) =>/u,
  );
  assert.match(
    voiceHookSource,
    /await Promise\.all\(\[[\s\S]*releaseRecognition\(previousWakeRecognition, \{ abort: true \}\)[\s\S]*releaseRecognition\(previousCommandRecognition, \{ abort: true \}\)[\s\S]*\]\);[\s\S]*const recognition = createRecognition/u,
  );
  assert.match(voiceHookSource, /if \(captured \|\| session\.cancelled \|\| manualCaptureRef\.current !== session\) return;/u);
  assert.match(voiceHookSource, /filter\(\(result\) => result\?\.isFinal !== false\)/u);
  assert.match(voiceHookSource, /processingPromise = \(async \(\) => \{[\s\S]*await onTranscript\?\.\(spokenText\);[\s\S]*await processSpokenText\(spokenText, \{ speakReply: true \}\)/u);
});

test("dashboard microphone owns recognition until transcript processing finishes", () => {
  assert.match(
    voiceHookSource,
    /const finishCapture = \(\) => \{[\s\S]*await processingPromise;[\s\S]*commandRecognitionRef\.current === recognition[\s\S]*manualCaptureRef\.current === session[\s\S]*scheduleWakeRestart\(\);/u,
  );
  assert.match(
    voiceHookSource,
    /const hasTransientMicOwner = useCallback\(\(\) => Boolean\([\s\S]*manualCaptureRef\.current[\s\S]*previewSpeechRef\.current[\s\S]*commandRecognitionRef\.current[\s\S]*processingRef\.current[\s\S]*activeSpeechRef\.current/u,
  );
  assert.match(
    voiceHookSource,
    /const startWakeListening = useCallback\(\(\) => \{[\s\S]*manualCaptureRef\.current[\s\S]*commandRecognitionRef\.current[\s\S]*processingRef\.current[\s\S]*activeSpeechRef\.current/u,
  );
  assert.match(voiceHookSource, /const isUserCommandRecording = isCommandListening[\s\S]*voiceStatus === "listening"/u);
});

test("dashboard microphone handles recognition release and permission failures safely", () => {
  assert.match(
    voiceHookSource,
    /const primaryMethod = abort \? "abort" : "stop";[\s\S]*const fallbackMethod = abort \? "stop" : "abort";[\s\S]*if \(!requestRelease\(primaryMethod\)\) requestRelease\(fallbackMethod\);/u,
  );
  assert.match(
    voiceHookSource,
    /commandTimeoutRef\.current = window\.setTimeout\(\(\) => \{[\s\S]*releaseRecognition\(recognition, \{ abort: true \}\)\.finally\(\(\) => \{[\s\S]*finishCapture\(\);/u,
  );
  assert.match(
    voiceHookSource,
    /event\.error === "not-allowed" \|\| event\.error === "service-not-allowed"[\s\S]*resumeWakeAfterCapture = false;[\s\S]*setVoiceStatus\("error"\)/u,
  );
  assert.match(voiceHookSource, /if \(resumeWakeAfterCapture\) scheduleWakeRestart\(\);/u);
});

test("attachment speech is delivered once to chat instead of running twice", () => {
  assert.match(
    dashboardSource,
    /if \(!hasAttachments\) \{[\s\S]*setSearchInput\(""\);[\s\S]*return;[\s\S]*\}[\s\S]*sendDashboardChatMessage\(window\.sendToChatbot, spokenText\)/u,
  );
});