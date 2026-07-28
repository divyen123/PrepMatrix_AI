import test from "node:test";
import assert from "node:assert/strict";
import { jsPDF } from "jspdf";
import {
  buildChatAttachmentUserContent,
  ChatAttachmentError,
  decodeChatAttachments,
  extractPdfAttachment,
  extractPresentationAttachment,
  prepareChatAttachmentContext,
  runPdfAttachmentProcess,
  sanitizeChatAttachmentName,
} from "./chatAttachments.js";
import {
  CHAT_PRESENTATION_TYPE,
  MAX_CHAT_IMAGE_BYTES,
} from "../src/utils/chatAttachments.js";

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const VALID_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAAXNSR0IArs4c6QAAAARzQklUCAgICHwIZIgAAAAUSURBVAiZY6yxevufgYGBgYkBCgAn5wKm8Nhy+QAAAABJRU5ErkJggg==", "base64");
const VALID_JPEG = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/Aaf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/Aaf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/Iaf/2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z", "base64");
const VALID_WEBP_SOURCE = Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoCAAIAPpE8mEwlpAADcAD+/gbQAA==", "base64");
const VALID_WEBP = VALID_WEBP_SOURCE.subarray(0, VALID_WEBP_SOURCE.readUInt32LE(4) + 8);

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function storedZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const [name, contents] of entries) {
    const fileName = Buffer.from(name, "utf8");
    const data = Buffer.isBuffer(contents) ? contents : Buffer.from(contents, "utf8");
    const checksum = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(fileName.length, 26);
    const localPart = Buffer.concat([localHeader, fileName, data]);
    localParts.push(localPart);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(fileName.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(Buffer.concat([centralHeader, fileName]));
    localOffset += localPart.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endOfDirectory = Buffer.alloc(22);
  endOfDirectory.writeUInt32LE(0x06054b50, 0);
  endOfDirectory.writeUInt16LE(entries.length, 8);
  endOfDirectory.writeUInt16LE(entries.length, 10);
  endOfDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfDirectory.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, endOfDirectory]);
}

function presentationBuffer(slides) {
  return storedZip([
    [
      "[Content_Types].xml",
      "<?xml version=\"1.0\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Override PartName=\"/ppt/presentation.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml\"/></Types>",
    ],
    [
      "ppt/presentation.xml",
      "<?xml version=\"1.0\"?><p:presentation xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\"/>",
    ],
    ...slides.map((text, index) => [
      `ppt/slides/slide${index + 1}.xml`,
      `<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:cSld></p:sld>`,
    ]),
  ]);
}

const VALID_PPTX = presentationBuffer([
  "Transport &amp; network layers",
  "Routers forward packets between networks.",
]);

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

  const [presentation] = decodeChatAttachments([
    rawAttachment("networking.pptx", CHAT_PRESENTATION_TYPE, VALID_PPTX),
  ]);
  assert.equal(presentation.kind, "presentation");
  assert.equal(presentation.size, VALID_PPTX.length);
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
      rawAttachment("slides.pptx", CHAT_PRESENTATION_TYPE, VALID_PPTX),
    ], { allowPresentations: false }),
    (error) => error instanceof ChatAttachmentError && error.code === "CHAT_ATTACHMENT_TYPE",
  );

  assert.throws(
    () => decodeChatAttachments([
      rawAttachment("fake.pptx", CHAT_PRESENTATION_TYPE, Buffer.from("not a zip")),
    ]),
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

test("extracts PowerPoint slide text and builds a bounded text-only prompt", async () => {
  const [presentation] = decodeChatAttachments([
    rawAttachment("networking.pptx", CHAT_PRESENTATION_TYPE, VALID_PPTX),
  ]);
  const context = await prepareChatAttachmentContext([presentation]);
  const content = buildChatAttachmentUserContent("Create revision notes.", context);

  assert.equal(context.visionImages.length, 0);
  assert.equal(context.pdfDocuments.length, 0);
  assert.equal(context.presentationDocuments.length, 1);
  assert.equal(context.presentationDocuments[0].totalSlides, 2);
  assert.equal(context.presentationDocuments[0].slidesRead, 2);
  assert.equal(context.presentationDocuments[0].truncated, false);
  assert.equal(typeof content, "string");
  assert.match(content, /STUDENT POWERPOINT: networking\.pptx/);
  assert.match(content, /Transport & network layers/);
  assert.match(content, /Routers forward packets between networks/);
  assert.match(content, /untrusted reference content/i);
  assert.deepEqual(context.metadata, [{
    name: "networking.pptx",
    type: CHAT_PRESENTATION_TYPE,
    size: presentation.size,
  }]);
  assert.equal("dataUrl" in context.metadata[0], false);
});

test("bounds the number of PowerPoint slides read", async () => {
  const manySlides = presentationBuffer(
    Array.from({ length: 81 }, (_, index) => `Slide ${index + 1}`),
  );
  const [presentation] = decodeChatAttachments([
    rawAttachment("many-slides.pptx", CHAT_PRESENTATION_TYPE, manySlides),
  ]);

  const extracted = await extractPresentationAttachment(presentation);

  assert.equal(extracted.totalSlides, 81);
  assert.equal(extracted.slidesRead, 80);
  assert.equal(extracted.truncated, true);
  assert.doesNotMatch(extracted.text, /\[Slide 81\]/);
});

test("caps retained PowerPoint text while preserving a readable result", async () => {
  const longSlide = presentationBuffer([`Important topic ${"detail ".repeat(400)}`]);
  const [presentation] = decodeChatAttachments([
    rawAttachment("long-slide.pptx", CHAT_PRESENTATION_TYPE, longSlide),
  ]);

  const extracted = await extractPresentationAttachment(presentation, { maxTextChars: 1000 });

  assert.ok(extracted.text.length <= 1000);
  assert.match(extracted.text, /^\[Slide 1\]\nImportant topic/);
  assert.equal(extracted.truncated, true);
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

test("returns a safe error for corrupt PowerPoint archives", async () => {
  const corruptArchive = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from("not-a-complete-archive"),
  ]);
  const [presentation] = decodeChatAttachments([
    rawAttachment("broken.pptx", CHAT_PRESENTATION_TYPE, corruptArchive),
  ]);

  await assert.rejects(
    () => extractPresentationAttachment(presentation, { processTimeoutMs: 250 }),
    (error) => error instanceof ChatAttachmentError
      && error.code === "CHAT_PRESENTATION_READ_FAILED"
      && error.status === 422,
  );
});

test("sanitizes file names before using them in prompts or persistence", () => {
  assert.equal(sanitizeChatAttachmentName("../chapter<script>.pdf"), "..-chapterscript.pdf");
  assert.equal(sanitizeChatAttachmentName("\u0000\u0007"), "attachment");
});
