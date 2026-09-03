const REJECTION_MESSAGES = Object.freeze({
  busy: "The AI assistant is finishing another response. Your message is still here—try again in a moment.",
  empty: "Type a message or attach a file before sending.",
  error: "The AI assistant could not accept that message. Your text is still here so you can retry.",
  preparing: "Your files are still being prepared. Your message is still here—send it when preparation finishes.",
  unavailable: "The AI assistant is not ready yet. Your message is still here so you can retry.",
});

function rejected(reason) {
  return {
    accepted: false,
    reason,
    message: REJECTION_MESSAGES[reason] || REJECTION_MESSAGES.error,
  };
}

export function getChatMessageAcceptance({
  attachmentCount = 0,
  loading = false,
  message = "",
  preparingAttachments = false,
  sending = false,
} = {}) {
  const hasMessage = typeof message === "string" && Boolean(message.trim());
  if (!hasMessage && Number(attachmentCount) <= 0) return rejected("empty");
  if (preparingAttachments) return rejected("preparing");
  if (loading || sending) return rejected("busy");

  return {
    accepted: true,
    reason: "accepted",
    message: "",
  };
}

export function getChatAutoSendMessage(detail = {}) {
  const message = typeof detail?.message === "string" ? detail.message : "";
  return detail?.autoSend === true && message.trim() ? message : "";
}

export async function sendDashboardChatMessage(sendToChatbot, message) {
  if (typeof sendToChatbot !== "function") return rejected("unavailable");

  try {
    const result = await sendToChatbot(message);
    if (result?.accepted === true) return result;
    if (result?.accepted === false) {
      return {
        ...rejected(result.reason || "error"),
        ...result,
        accepted: false,
      };
    }
    return rejected("error");
  } catch {
    return rejected("error");
  }
}
