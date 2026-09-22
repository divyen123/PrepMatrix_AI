import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("../pages/DashboardPage.jsx", import.meta.url), "utf8");

test("dashboard voice input opens AI Chat and waits for its answer before restoring wake mode", () => {
  assert.match(appSource, /<DashboardPage[\s\S]*voiceAssistant=\{voiceAssistant\}/u);
  assert.match(dashboardSource, /createDashboardChatVoiceCapture\(\{/u);
  assert.match(dashboardSource, /voiceAssistant\.pauseWakeMode\?\.\(\)/u);
  assert.match(dashboardSource, /await sendDashboardChatMessage\(window\.sendToChatbotAndWait, spokenText\)/u);
  assert.match(dashboardSource, /finally \{[\s\S]*restoreWakeAfterDashboardChat\(\)/u);
  assert.doesNotMatch(dashboardSource, /voiceAssistant\.askWithVoice\(/u);
});

test("global voice shortcut still opens the assistant's foreground capture", () => {
  const branchStart = appSource.indexOf('if (shortcut.action === "open-voice-assistant")');
  const branchEnd = appSource.indexOf('if (shortcut.action === "toggle-assistant")', branchStart);
  const shortcutBranch = appSource.slice(branchStart, branchEnd);

  assert.ok(branchStart >= 0 && branchEnd > branchStart);
  assert.match(shortcutBranch, /if \(!voiceAssistant\.isProcessing\) \{\s*voiceAssistant\.askWithVoice\?\.\(\);/u);
  assert.doesNotMatch(shortcutBranch, /isListening|isCommandListening|stopListening|pauseWakeMode|setWakeMode/u);
});
