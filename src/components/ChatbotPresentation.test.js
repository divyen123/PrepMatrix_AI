import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const componentSource = readFileSync(new URL("./Chatbot.jsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("../App.css", import.meta.url), "utf8");

test("reshuffles the one-subject prompt on chat entry and new-chat actions", () => {
  assert.match(componentSource, /const justOpened = open && !chatWasOpenRef\.current;/u);
  assert.match(componentSource, /setNewChatPrompt\(\(current\) => getNewChatPrompt\(subjects, Math\.random, current\)\)/u);
  assert.match(componentSource, /if \(justOpened && !childMode\) shuffleNewChatPrompt\(\)/u);
  assert.match(componentSource, /setActiveSessionTitle\("New Chat"\);\s*if \(!childMode\) shuffleNewChatPrompt\(\)/u);
});

test("renders sent user text without a bubble across app themes", () => {
  assert.match(
    stylesheet,
    /\.sidebar-chatbot-portal \.chat-message\.user\s*\{[\s\S]*?color:\s*var\(--text\) !important;[\s\S]*?background:\s*transparent !important;[\s\S]*?border:\s*0 !important;[\s\S]*?box-shadow:\s*none !important;/u,
  );
});
