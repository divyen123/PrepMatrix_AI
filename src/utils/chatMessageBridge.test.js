import assert from "node:assert/strict";
import test from "node:test";
import {
  getChatAutoSendMessage,
  getChatMessageAcceptance,
  sendDashboardChatMessage,
} from "./chatMessageBridge.js";

test("accepts text and attachment-only messages only while Chatbot is ready", () => {
  assert.equal(getChatMessageAcceptance({ message: "Explain queues" }).accepted, true);
  assert.equal(getChatMessageAcceptance({ attachmentCount: 1 }).accepted, true);

  const busy = getChatMessageAcceptance({
    loading: true,
    message: "Explain queues",
  });
  assert.equal(busy.accepted, false);
  assert.equal(busy.reason, "busy");
  assert.match(busy.message, /still here/u);

  const preparing = getChatMessageAcceptance({
    attachmentCount: 1,
    preparingAttachments: true,
  });
  assert.equal(preparing.accepted, false);
  assert.equal(preparing.reason, "preparing");
  assert.match(preparing.message, /still being prepared/u);

  const sending = getChatMessageAcceptance({
    message: "Explain queues",
    sending: true,
  });
  assert.equal(sending.accepted, false);
  assert.equal(sending.reason, "busy");
});

test("queues only explicit non-empty external auto-send messages", () => {
  assert.equal(getChatAutoSendMessage({ message: "Explain queues" }), "");
  assert.equal(getChatAutoSendMessage({ autoSend: false, message: "Explain queues" }), "");
  assert.equal(getChatAutoSendMessage({ autoSend: true, message: "   " }), "");
  assert.equal(getChatAutoSendMessage({ autoSend: true, message: 42 }), "");
  assert.equal(
    getChatAutoSendMessage({ autoSend: true, message: "  Explain queues  " }),
    "  Explain queues  ",
  );
});

test("dashboard delivery clears only an explicitly accepted bridge result", async () => {
  const accepted = await sendDashboardChatMessage(
    async () => ({ accepted: true, reason: "accepted" }),
    "Go over my plan",
  );
  assert.equal(accepted.accepted, true);

  const busy = await sendDashboardChatMessage(
    async () => ({ accepted: false, reason: "busy" }),
    "Go over my plan",
  );
  assert.equal(busy.accepted, false);
  assert.match(busy.message, /still here/u);

  const legacySilentReturn = await sendDashboardChatMessage(async () => undefined, "Keep me");
  assert.equal(legacySilentReturn.accepted, false);

  const failed = await sendDashboardChatMessage(async () => {
    throw new Error("Bridge failed");
  }, "Keep me too");
  assert.equal(failed.accepted, false);
  assert.match(failed.message, /still here/u);
});
