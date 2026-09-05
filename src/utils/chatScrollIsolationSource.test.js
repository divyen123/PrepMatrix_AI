import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chatbotSource = readFileSync(new URL("../components/Chatbot.jsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("../App.css", import.meta.url), "utf8");

test("opening Study Assistant acquires and releases the shared document lock", () => {
  const effectStart = chatbotSource.indexOf("const releaseScrollLock = acquireDocumentScrollLock()");
  const effectEnd = chatbotSource.indexOf("}, [open]);", effectStart);
  const effect = chatbotSource.slice(effectStart, effectEnd);

  assert.ok(effectStart >= 0 && effectEnd > effectStart);
  assert.match(chatbotSource, /import \{ acquireDocumentScrollLock \} from "\.\.\/utils\/documentScrollLock"/u);
  assert.match(effect, /document\.body\.classList\.add\("chat-open"\)/u);
  assert.match(effect, /releaseScrollLock\(\)/u);
  assert.doesNotMatch(effect, /\.style\.overflow/u);
  assert.doesNotMatch(effect, /\.style\.overscrollBehavior/u);
});

test("chat scroll regions contain wheel and touch momentum", () => {
  assert.match(
    stylesheet,
    /html\.prepmatrix-scroll-locked,\s*body\.prepmatrix-scroll-locked,[\s\S]*?body\.chat-open\s*\{[^}]*overflow:\s*hidden !important;[^}]*overscroll-behavior:\s*none;/u,
  );
  assert.match(
    stylesheet,
    /\.chat-modal-backdrop\s*\{[^}]*overscroll-behavior:\s*none;[^}]*touch-action:\s*none;/u,
  );
  assert.match(
    stylesheet,
    /\.sidebar-chatbot-portal \.chat-messages,[\s\S]*?\.sidebar-chatbot-portal \.history-sessions-list,[\s\S]*?overscroll-behavior:\s*contain;[\s\S]*?-webkit-overflow-scrolling:\s*touch;/u,
  );
});

test("Study Assistant contains keyboard focus and restores the prior focus target", () => {
  assert.match(
    chatbotSource,
    /previouslyFocusedChatRef\.current = document\.activeElement;[\s\S]*?chatDialogRef\.current\?\.focus\(\{ preventScroll: true \}\)/u,
  );
  assert.match(
    chatbotSource,
    /document\.addEventListener\("focusin", keepFocusInsideChat, true\);[\s\S]*?document\.removeEventListener\("focusin", keepFocusInsideChat, true\);/u,
  );
  assert.match(
    chatbotSource,
    /previousElement\?\.isConnected[\s\S]*?previousElement\.focus\?\.\(\{ preventScroll: true \}\)/u,
  );
  assert.match(
    chatbotSource,
    /const handleChatDialogKeyDown = useCallback[\s\S]*?event\.key !== "Tab"[\s\S]*?getChatFocusableElements\(dialog\)/u,
  );
  assert.match(
    chatbotSource,
    /className=\{`chatbot sidebar-chatbot-portal[\s\S]*?onKeyDown=\{handleChatDialogKeyDown\}[\s\S]*?ref=\{chatDialogRef\}[\s\S]*?tabIndex=\{-1\}/u,
  );
});
