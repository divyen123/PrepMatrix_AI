import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(new URL("./VoicePill.css", import.meta.url), "utf8");
const chatSource = readFileSync(new URL("./Chatbot.jsx", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("../pages/DashboardPage.jsx", import.meta.url), "utf8");

test("keeps chat and dashboard microphone hover states free of an outside glow", () => {
  assert.match(chatSource, /className="chat-voice-pill"/u);
  assert.match(dashboardSource, /className="db-search-action-btn db-mic-btn"/u);
  assert.match(
    styles,
    /\.voice-pill\.chat-voice-pill:hover,\s*\.voice-pill\.db-mic-btn:hover\s*\{\s*box-shadow: none !important;\s*\}/u,
  );
});
