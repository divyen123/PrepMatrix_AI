import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_ATTACHMENT_FILE_BYTES,
  MAX_CHAT_ATTACHMENT_TOTAL_BYTES,
  chatAttachmentMetadata,
  formatChatFileSize,
  validateChatAttachmentSelection,
} from "./chatAttachments.js";

function file(name, type, size) {
  return { name, type, size };
}

test("accepts supported images and PDFs within the selection limits", () => {
  const error = validateChatAttachmentSelection([
    file("diagram.png", "image/png", 240_000),
    file("notes.pdf", "application/pdf", 1_200_000),
  ]);

  assert.equal(error, "");
});

test("rejects unsupported, empty, and oversized files with useful messages", () => {
  assert.match(
    validateChatAttachmentSelection([file("notes.txt", "text/plain", 20)]),
    /not supported/i,
  );
  assert.match(
    validateChatAttachmentSelection([file("empty.pdf", "application/pdf", 0)]),
    /empty/i,
  );
  assert.match(
    validateChatAttachmentSelection([
      file("large.pdf", "application/pdf", MAX_CHAT_ATTACHMENT_FILE_BYTES + 1),
    ]),
    /larger than/i,
  );
});

test("enforces attachment count and aggregate upload size", () => {
  const tooMany = Array.from({ length: MAX_CHAT_ATTACHMENTS + 1 }, (_, index) => (
    file(`page-${index}.jpg`, "image/jpeg", 100)
  ));
  assert.match(validateChatAttachmentSelection(tooMany), /up to 3 files/i);

  const firstSize = Math.floor(MAX_CHAT_ATTACHMENT_TOTAL_BYTES / 2) + 1;
  const aggregateError = validateChatAttachmentSelection([
    file("one.pdf", "application/pdf", firstSize),
    file("two.pdf", "application/pdf", firstSize),
  ]);
  assert.match(aggregateError, /total up to/i);
});

test("includes existing attachments when validating a new selection", () => {
  const existing = [file("existing.pdf", "application/pdf", 1_000)];
  const selected = Array.from({ length: MAX_CHAT_ATTACHMENTS }, (_, index) => (
    file(`new-${index}.webp`, "image/webp", 1_000)
  ));

  assert.match(validateChatAttachmentSelection(selected, existing), /up to 3 files/i);
});

test("creates persistence-safe metadata and readable file sizes", () => {
  const metadata = chatAttachmentMetadata({
    name: "chapter.pdf",
    type: "application/pdf",
    size: 1536,
    dataUrl: "data:application/pdf;base64,secret",
    originalSize: 2048,
  });

  assert.deepEqual(metadata, {
    name: "chapter.pdf",
    type: "application/pdf",
    size: 1536,
  });
  assert.equal(formatChatFileSize(1536), "2 KB");
  assert.equal(formatChatFileSize(2.5 * 1024 * 1024), "2.5 MB");
});
