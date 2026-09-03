import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chatbotSource = readFileSync(new URL("../components/Chatbot.jsx", import.meta.url), "utf8");
const startLearningSource = readFileSync(new URL("../pages/StartLearningPage.jsx", import.meta.url), "utf8");

test("placement preparation Ask AI opens a fresh chat and opts into automatic submission", () => {
  const askStart = startLearningSource.indexOf("const askPlacementItemAI =");
  const askEnd = startLearningSource.indexOf("const medicalActionTarget =", askStart);
  const askSource = startLearningSource.slice(askStart, askEnd);

  assert.ok(askStart >= 0 && askEnd > askStart);
  assert.ok(askSource.includes("createNewChat: true"));
  assert.ok(askSource.includes("autoSend: true"));
  assert.ok(askSource.includes("message: buildPlacementChatPrompt({"));
  assert.equal(
    startLearningSource.match(/askPlacementItemAI\(target, topic\)/gu)?.length,
    2,
    "Interview checks and Practice next should share the automatic Ask AI launch",
  );
});

test("Chatbot commits fresh-chat state before consuming an external auto-send once", () => {
  const openHandlerStart = chatbotSource.indexOf("const handleOpenChat = (event) => {");
  const openHandlerEnd = chatbotSource.indexOf("window.addEventListener(\"openPrepMatrixAIChat\"", openHandlerStart);
  const openHandlerSource = chatbotSource.slice(openHandlerStart, openHandlerEnd);
  const sendMessageStart = chatbotSource.indexOf("const sendMessage = useCallback");
  const autoSendEffectStart = chatbotSource.indexOf("if (!pendingAutoSendMessage) return;", sendMessageStart);
  const autoSendEffectEnd = chatbotSource.indexOf("}, [pendingAutoSendMessage, sendMessage]);", autoSendEffectStart);
  const autoSendEffectSource = chatbotSource.slice(autoSendEffectStart, autoSendEffectEnd);

  assert.ok(openHandlerStart >= 0 && openHandlerEnd > openHandlerStart);
  assert.ok(openHandlerSource.includes("handleNewChat(nextContext)"));
  assert.ok(openHandlerSource.includes("setInput(requestedMessage)"));
  assert.ok(openHandlerSource.includes("setPendingAutoSendMessage(getChatAutoSendMessage(event.detail))"));
  assert.equal(openHandlerSource.includes("sendMessage("), false, "the event handler must not send with stale chat state");
  assert.ok(sendMessageStart >= 0);
  assert.ok(autoSendEffectStart > sendMessageStart, "auto-send must run after the send pipeline is defined");
  assert.ok(autoSendEffectEnd > autoSendEffectStart);
  assert.ok(autoSendEffectSource.includes('setPendingAutoSendMessage("")'));
  assert.ok(autoSendEffectSource.includes("void sendMessage(message)"));
});
