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

  assert.match(voiceHookSource, /let captured = false;[\s\S]*if \(captured\) return;/u);
  assert.match(voiceHookSource, /filter\(\(result\) => result\?\.isFinal !== false\)/u);
  assert.match(voiceHookSource, /onTranscript\?\.\(spokenText\)/u);
  assert.match(voiceHookSource, /callbackResult\.catch\(\(\) => undefined\)/u);
});

test("attachment speech is delivered once to chat instead of running twice", () => {
  assert.match(
    dashboardSource,
    /if \(!hasAttachments\) \{[\s\S]*setSearchInput\(""\);[\s\S]*return;[\s\S]*\}[\s\S]*sendDashboardChatMessage\(window\.sendToChatbot, spokenText\)/u,
  );
});