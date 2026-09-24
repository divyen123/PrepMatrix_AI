import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const componentSource = readFileSync(new URL("./Chatbot.jsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("../App.css", import.meta.url), "utf8");

test("places the history heading below search and hides the composer credit price", () => {
  const searchFieldIndex = componentSource.indexOf('className="chat-history-search-field"');
  const historyHeadingIndex = componentSource.indexOf("<h3>Chat History</h3>");
  const historyListIndex = componentSource.indexOf('className="history-sessions-list"');

  assert.ok(searchFieldIndex >= 0 && searchFieldIndex < historyHeadingIndex);
  assert.ok(historyHeadingIndex < historyListIndex);
  assert.doesNotMatch(componentSource, /<AiCreditCost\b/u);
  assert.match(componentSource, /\{hasInsufficientCredits\(AI_FEATURES\.CHAT\) && \(\s*<div className="chat-credit-row">/u);
});

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

test("renders the conversation-loading status without a message bubble", () => {
  assert.match(
    componentSource,
    /aria-live="polite"[\s\S]*?className="chat-message assistant thinking-message chat-loading-message"[\s\S]*?role="status"[\s\S]*?<Loader2 size=\{14\} className="spinner" \/>[\s\S]*?<span>Loading chat\.\.\.<\/span>/u,
  );
  assert.match(
    stylesheet,
    /\.sidebar-chatbot-portal \.chat-loading-message\s*\{[\s\S]*?background:\s*transparent !important;[\s\S]*?border:\s*0 !important;[\s\S]*?box-shadow:\s*none !important;/u,
  );
});

test("keeps the portal mounted through the genie-style close transition", () => {
  assert.match(componentSource, /const \[isClosing, setIsClosing\] = useState\(false\);/u);
  assert.match(
    componentSource,
    /const closeChat = useCallback\(\(\) => \{[\s\S]*?setOpen\(false\);[\s\S]*?setIsClosing\(true\);[\s\S]*?window\.setTimeout\([\s\S]*?CHAT_PORTAL_EXIT_DURATION_MS/u,
  );
  assert.match(componentSource, /\{\(open \|\| isClosing\) \? createPortal\(/u);
  assert.match(componentSource, /sidebar-chatbot-portal\$\{childMode \? " is-kids-chat" : ""\}\$\{isClosing \? " is-closing" : ""\}/u);
});

test("defines reversible genie motion and respects reduced-motion preferences", () => {
  assert.match(stylesheet, /@keyframes chat-genie-shell-enter/u);
  assert.match(stylesheet, /@keyframes chat-genie-shell-exit/u);
  assert.match(stylesheet, /@keyframes chat-genie-mask-enter/u);
  assert.match(stylesheet, /@keyframes chat-genie-mask-exit/u);
  assert.match(
    stylesheet,
    /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.sidebar-chatbot-portal\.is-closing[\s\S]*?animation-duration:\s*1ms !important;/u,
  );
});
