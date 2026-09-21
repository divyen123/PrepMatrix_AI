import { extractPdfAttachment } from "./chatAttachments.js";

export const MAX_RESUME_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_RESUME_TEXT_CHARS = 60_000;

const ALLOWED_TYPES = new Set(["application/pdf", "text/plain"]);

export class ResumeTextExtractionError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.name = "ResumeTextExtractionError";
    this.code = code;
    this.status = status;
  }
}

function reject(message, code, status) {
  throw new ResumeTextExtractionError(message, code, status);
}

function decodeUpload({ name, type, dataUrl } = {}) {
  const fileName = String(name || "resume").trim().slice(0, 140);
  const fileType = String(type || "").toLowerCase().trim();
  if (!ALLOWED_TYPES.has(fileType)) {
    reject("Upload a PDF or plain-text resume.", "RESUME_FILE_TYPE");
  }
  if (typeof dataUrl !== "string" || dataUrl.length > Math.ceil(MAX_RESUME_UPLOAD_BYTES * 4 / 3) + 100) {
    reject("The resume file must be 5 MB or smaller.", "RESUME_FILE_TOO_LARGE", 413);
  }
  const match = dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/u);
  if (!match || match[1].toLowerCase() !== fileType || match[2].length % 4 !== 0) {
    reject("The resume file could not be read.", "RESUME_FILE_INVALID");
  }
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > MAX_RESUME_UPLOAD_BYTES) {
    reject("The resume file must be 5 MB or smaller.", "RESUME_FILE_TOO_LARGE", 413);
  }
  if (buffer.toString("base64") !== match[2]) {
    reject("The resume file could not be read.", "RESUME_FILE_INVALID");
  }
  if (fileType === "application/pdf" && !buffer.subarray(0, Math.min(1024, buffer.length)).includes(Buffer.from("%PDF-"))) {
    reject("The uploaded file is not a valid PDF.", "RESUME_FILE_INVALID");
  }
  return { name: fileName, type: fileType, buffer };
}

function validateText(value) {
  const text = String(value || "").replace(/\r\n?/gu, "\n").trim();
  if (!text || text.replace(/[^\p{L}\p{N}]/gu, "").length < 20) {
    reject("This resume has too little readable text. Try a text-based PDF or a plain-text file.", "RESUME_NO_TEXT", 422);
  }
  if (text.length > MAX_RESUME_TEXT_CHARS) {
    reject("This resume has too much text to analyze.", "RESUME_TEXT_TOO_LONG", 413);
  }
  return text;
}

export async function extractResumeText(upload, { pdfExtractor = extractPdfAttachment } = {}) {
  const file = decodeUpload(upload);
  if (file.type === "text/plain") {
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(file.buffer);
    } catch {
      reject("The text file must use UTF-8 encoding.", "RESUME_FILE_ENCODING");
    }
    if (text.includes("\0")) reject("The uploaded text file is invalid.", "RESUME_FILE_INVALID");
    return validateText(text);
  }

  try {
    const extracted = await pdfExtractor({
      name: file.name,
      type: file.type,
      kind: "pdf",
      size: file.buffer.length,
      buffer: file.buffer,
    }, {
      maxTextChars: MAX_RESUME_TEXT_CHARS + 1,
      maxOcrPages: 0,
      maxOcrBytes: 0,
    });
    if (extracted?.truncated) {
      reject("This PDF has too much text to analyze.", "RESUME_TEXT_TOO_LONG", 413);
    }
    return validateText(extracted?.text);
  } catch (error) {
    if (error instanceof ResumeTextExtractionError) throw error;
    if (error?.code === "CHAT_PDF_NO_TEXT") {
      reject("This PDF has no selectable text. Upload a text-based PDF or a plain-text file.", "RESUME_NO_TEXT", 422);
    }
    reject("The PDF could not be read. It may be encrypted or damaged.", "RESUME_PDF_READ_FAILED", 422);
  }
}
