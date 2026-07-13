import {
  ChatAttachmentError,
  extractPdfAttachmentInProcess,
} from "./chatAttachments.js";

function sendResult(message) {
  if (typeof process.send !== "function") {
    process.exitCode = 1;
    return;
  }
  process.send(message, (error) => {
    process.exit(error ? 1 : 0);
  });
}

process.once("message", async (payload) => {
  try {
    const bytes = payload?.attachment?.bytes;
    if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
      throw new Error("Missing PDF bytes.");
    }

    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const result = await extractPdfAttachmentInProcess({
      name: String(payload.attachment.name || "attachment.pdf"),
      type: "application/pdf",
      size: buffer.length,
      kind: "pdf",
      buffer,
    }, payload.limits || {});

    sendResult({ ok: true, result });
  } catch (error) {
    if (error instanceof ChatAttachmentError) {
      sendResult({
        ok: false,
        error: {
          code: error.code,
          status: error.status,
          message: error.message,
        },
      });
      return;
    }
    sendResult({
      ok: false,
      error: {
        code: "CHAT_PDF_PROCESS_FAILED",
        status: 500,
        message: "PDF analysis is temporarily unavailable. Please try again.",
      },
    });
  }
});
