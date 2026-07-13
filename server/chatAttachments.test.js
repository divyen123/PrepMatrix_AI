import test from "node:test";
import assert from "node:assert/strict";
import { jsPDF } from "jspdf";
import {
  buildChatAttachmentUserContent,
  ChatAttachmentError,
  decodeChatAttachments,
  extractPdfAttachment,
  prepareChatAttachmentContext,
  runPdfAttachmentProcess,
  sanitizeChatAttachmentName,
} from "./chatAttachments.js";
import { MAX_CHAT_IMAGE_BYTES } from "../src/utils/chatAttachments.js";

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const VALID_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAAXNSR0IArs4c6QAAAARzQklUCAgICHwIZIgAAAAUSURBVAiZY6yxevufgYGBgYkBCgAn5wKm8Nhy+QAAAABJRU5ErkJggg==", "base64");
const VALID_JPEG = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/Aaf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/Aaf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/Iaf/2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z", "base64");
const VALID_WEBP_SOURCE = Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoCAAIAPpE8mEwlpAADcAD+/gbQAA==", "base64");
const VALID_WEBP = VALID_WEBP_SOURCE.subarray(0, VALID_WEBP_SOURCE.readUInt32LE(4) + 8);

function rawAttachment(name, type, buffer) {
  return {
    name,
    type,
    size: buffer.length,
    dataUrl: `data:${type};base64,${buffer.toString("base64")}`,
  };
}

function minimalPdfBuffer(text = "Study notes") {
  return Buffer.from(`%PDF-1.7\n${text}\n%%EOF`, "utf8");
}

test("decodes supported file payloads and validates their signatures", () => {
  const pdf = minimalPdfBuffer();

  const decoded = decodeChatAttachments([
    rawAttachment("diagram.png", "image/png", VALID_PNG),
    rawAttachment("photo.jpg", "image/jpeg", VALID_JPEG),
    rawAttachment("notes.pdf", "application/pdf", pdf),
  ]);

  assert.deepEqual(decoded.map(({ name, kind }) => ({ name, kind })), [
    { name: "diagram.png", kind: "image" },
    { name: "photo.jpg", kind: "image" },
    { name: "notes.pdf", kind: "pdf" },
  ]);

  const [webp] = decodeChatAttachments([
    rawAttachment("figure.webp", "image/webp", VALID_WEBP),
  ]);
  assert.equal(webp.kind, "image");
  assert.equal(webp.width, 2);
  assert.equal(webp.height, 2);
});

test("rejects malformed base64, unsupported types, and spoofed signatures", () => {
  assert.throws(
    () => decodeChatAttachments([{
      name: "bad.png",
      type: "image/png",
      dataUrl: "data:image/png;base64,%%%",
    }]),
    (error) => error instanceof ChatAttachmentError && error.code === "CHAT_ATTACHMENT_DATA",
  );

  assert.throws(
    () => decodeChatAttachments([rawAttachment("vector.svg", "image/svg+xml", Buffer.from("<svg/>"))]),
    (error) => error instanceof ChatAttachmentError && error.code === "CHAT_ATTACHMENT_TYPE",
  );

  assert.throws(
    () => decodeChatAttachments([rawAttachment("fake.pdf", "application/pdf", PNG_HEADER)]),
    (error) => error instanceof ChatAttachmentError && error.code === "CHAT_ATTACHMENT_SIGNATURE",
  );

  assert.throws(
    () => decodeChatAttachments([
      rawAttachment("truncated.png", "image/png", Buffer.concat([PNG_HEADER, Buffer.from([1, 2, 3, 4])])),
    ]),
    (error) => error instanceof ChatAttachmentError && error.code === "CHAT_ATTACHMENT_SIGNATURE",
  );
});

test("rejects images with unsafe decoded dimensions", () => {
  const oversizedDimensions = Buffer.from(VALID_PNG);
  oversizedDimensions.writeUInt32BE(50000, 16);

  assert.throws(
    () => decodeChatAttachments([rawAttachment("huge.png", "image/png", oversizedDimensions)]),
    (error) => error instanceof ChatAttachmentError && error.code === "CHAT_IMAGE_DIMENSIONS",
  );
});

test("enforces the compressed image byte limit on the server", () => {
  const oversizedPng = Buffer.alloc(MAX_CHAT_IMAGE_BYTES + 1);
  PNG_HEADER.copy(oversizedPng, 0);

  assert.throws(
    // The encoded byte limit is checked before image structure, avoiding any
    // additional work for oversized direct API payloads.
    () => decodeChatAttachments([rawAttachment("large.png", "image/png", oversizedPng)]),
    (error) => error instanceof ChatAttachmentError && error.code === "CHAT_IMAGE_TOO_LARGE" && error.status === 413,
  );
});

test("extracts bounded PDF text and builds a text-only attachment prompt", async () => {
  class FakePdfParser {
    async getText() {
      return {
        text: "Operating systems schedule processes, manage memory, and coordinate input and output devices.",
        total: 2,
      };
    }

    async destroy() {}
  }

  const [pdf] = decodeChatAttachments([
    rawAttachment("os-notes.pdf", "application/pdf", minimalPdfBuffer()),
  ]);
  const context = await prepareChatAttachmentContext([pdf], { PdfParser: FakePdfParser });
  const content = buildChatAttachmentUserContent("Summarize the key ideas.", context);

  assert.equal(context.visionImages.length, 0);
  assert.equal(context.pdfDocuments.length, 1);
  assert.equal(typeof content, "string");
  assert.match(content, /Summarize the key ideas/);
  assert.match(content, /Operating systems schedule processes/);
  assert.match(content, /untrusted reference content/i);
  assert.deepEqual(context.metadata, [{
    name: "os-notes.pdf",
    type: "application/pdf",
    size: pdf.size,
  }]);
  assert.equal("dataUrl" in context.metadata[0], false);
});

test("renders scanned PDF pages into a bounded vision payload", async () => {
  class ScannedPdfParser {
    async getText() {
      return { text: "", total: 5 };
    }

    async getInfo() {
      return {
        total: 5,
        pages: [1, 2, 3].map((pageNumber) => ({
          pageNumber,
          width: 700,
          height: 990,
          links: [],
        })),
      };
    }

    async getScreenshot() {
      return {
        total: 5,
        pages: [1, 2, 3].map((pageNumber) => ({
          pageNumber,
          width: 700,
          height: 990,
          data: Buffer.concat([PNG_HEADER, Buffer.from([pageNumber])]),
        })),
      };
    }

    async destroy() {}
  }

  const [pdf] = decodeChatAttachments([
    rawAttachment("scanned-handout.pdf", "application/pdf", minimalPdfBuffer()),
  ]);
  const context = await prepareChatAttachmentContext([pdf], { PdfParser: ScannedPdfParser });
  const content = buildChatAttachmentUserContent("Explain this handout.", context);

  assert.equal(context.pdfDocuments.length, 0);
  assert.equal(context.visionImages.length, 3);
  assert.equal(Array.isArray(content), true);
  assert.equal(content.filter((item) => item.type === "image_url").length, 3);
  assert.ok(content.every((item) => item.type !== "image_url" || item.image_url.url.startsWith("data:image/png;base64,")));
});

test("converts a real generated PDF into readable text", async () => {
  const document = new jsPDF();
  document.text("PrepMatrix attachment extraction works for study notes.", 12, 18);
  const pdfBuffer = Buffer.from(document.output("arraybuffer"));
  const [pdf] = decodeChatAttachments([
    rawAttachment("generated-notes.pdf", "application/pdf", pdfBuffer),
  ]);
  const originalPdf = Buffer.from(pdf.buffer);

  const extracted = await extractPdfAttachment(pdf);

  assert.equal(extracted.mode, "text");
  assert.match(extracted.text, /PrepMatrix attachment extraction works/);
  assert.deepEqual(pdf.buffer, originalPdf);
});

test("renders a real image-only PDF through the isolated process", async () => {
  const document = new jsPDF();
  document.addImage(new Uint8Array(VALID_PNG), "PNG", 20, 20, 80, 80);
  const pdfBuffer = Buffer.from(document.output("arraybuffer"));
  const [pdf] = decodeChatAttachments([
    rawAttachment("image-only.pdf", "application/pdf", pdfBuffer),
  ]);

  const extracted = await extractPdfAttachment(pdf);

  assert.equal(extracted.mode, "images");
  assert.equal(extracted.images.length, 1);
  assert.match(extracted.images[0].dataUrl, /^data:image\/png;base64,/);
  assert.ok(extracted.images[0].size > PNG_HEADER.length);
});

test("terminates PDF work that exceeds the processing timeout", async () => {
  const [pdf] = decodeChatAttachments([
    rawAttachment("slow.pdf", "application/pdf", minimalPdfBuffer()),
  ]);
  const startedAt = Date.now();

  await assert.rejects(
    () => runPdfAttachmentProcess(pdf, {
      processPath: new URL("./test-fixtures/hangingPdfProcess.js", import.meta.url),
      processTimeoutMs: 50,
    }),
    (error) => error instanceof ChatAttachmentError
      && error.code === "CHAT_PDF_TIMEOUT"
      && error.status === 422,
  );
  assert.ok(Date.now() - startedAt < 2000);
});

test("returns a clear error for encrypted, corrupt, or unreadable PDFs", async () => {
  class BrokenPdfParser {
    async getText() {
      throw new Error("Invalid cross-reference table");
    }

    async destroy() {}
  }

  const [pdf] = decodeChatAttachments([
    rawAttachment("broken.pdf", "application/pdf", minimalPdfBuffer()),
  ]);

  await assert.rejects(
    () => extractPdfAttachment(pdf, { PdfParser: BrokenPdfParser }),
    (error) => error instanceof ChatAttachmentError
      && error.code === "CHAT_PDF_READ_FAILED"
      && error.status === 422,
  );
});

test("sanitizes file names before using them in prompts or persistence", () => {
  assert.equal(sanitizeChatAttachmentName("../chapter<script>.pdf"), "..-chapterscript.pdf");
  assert.equal(sanitizeChatAttachmentName("\u0000\u0007"), "attachment");
});
