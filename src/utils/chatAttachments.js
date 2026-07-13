export const MAX_CHAT_ATTACHMENTS = 3;
export const MAX_CHAT_ATTACHMENT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_CHAT_ATTACHMENT_TOTAL_BYTES = 14 * 1024 * 1024;
export const MAX_CHAT_IMAGE_BYTES = 850 * 1024;
export const MAX_CHAT_IMAGE_TOTAL_BYTES = 2550 * 1024;
export const MAX_CHAT_IMAGE_DIMENSION = 1800;
export const DEFAULT_ATTACHMENT_PROMPT = "Please analyze and explain the attached file(s).";
export const CHAT_ATTACHMENT_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

export const CHAT_IMAGE_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const CHAT_ATTACHMENT_TYPES = new Set([...CHAT_IMAGE_TYPES, "application/pdf"]);

export function formatChatFileSize(bytes = 0) {
  const normalizedBytes = Math.max(0, Number(bytes) || 0);
  if (normalizedBytes < 1024) return `${normalizedBytes} B`;
  if (normalizedBytes < 1024 * 1024) return `${Math.round(normalizedBytes / 1024)} KB`;
  return `${(normalizedBytes / (1024 * 1024)).toFixed(normalizedBytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function validateChatAttachmentSelection(files = [], existingAttachments = []) {
  const selectedFiles = Array.from(files || []);
  const existing = Array.from(existingAttachments || []);

  if (existing.length + selectedFiles.length > MAX_CHAT_ATTACHMENTS) {
    return `Attach up to ${MAX_CHAT_ATTACHMENTS} files at a time.`;
  }

  for (const file of selectedFiles) {
    const type = String(file?.type || "").toLowerCase();
    const name = String(file?.name || "This file");
    const size = Number(file?.size || 0);

    if (!CHAT_ATTACHMENT_TYPES.has(type)) {
      return `${name} is not supported. Choose a JPG, PNG, WebP, or PDF file.`;
    }
    if (!size) {
      return `${name} is empty and cannot be attached.`;
    }
    if (size > MAX_CHAT_ATTACHMENT_FILE_BYTES) {
      return `${name} is larger than ${formatChatFileSize(MAX_CHAT_ATTACHMENT_FILE_BYTES)}.`;
    }
  }

  const totalBytes = [...existing, ...selectedFiles]
    .reduce((total, file) => total + Math.max(0, Number(file?.originalSize ?? file?.size ?? 0)), 0);

  if (totalBytes > MAX_CHAT_ATTACHMENT_TOTAL_BYTES) {
    return `Attachments can total up to ${formatChatFileSize(MAX_CHAT_ATTACHMENT_TOTAL_BYTES)}.`;
  }

  return "";
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The selected file could not be read."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(blob);
  });
}

async function loadImageSource(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close?.(),
      };
    } catch {
      // Fall back to an HTMLImageElement for browsers with partial bitmap support.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("The selected image could not be decoded."));
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The selected image could not be prepared."));
    }, type, quality);
  });
}

async function prepareImageBlob(file) {
  const loaded = await loadImageSource(file);
  const longestSide = Math.max(loaded.width, loaded.height);
  const initialScale = Math.min(1, MAX_CHAT_IMAGE_DIMENSION / Math.max(1, longestSide));

  if (typeof document === "undefined") {
    loaded.cleanup();
    throw new Error("Image compression is unavailable in this browser.");
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    loaded.cleanup();
    throw new Error("Image compression is unavailable in this browser.");
  }

  let scale = initialScale;
  let quality = 0.88;
  let result = null;

  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      canvas.width = Math.max(1, Math.round(loaded.width * scale));
      canvas.height = Math.max(1, Math.round(loaded.height * scale));
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(loaded.source, 0, 0, canvas.width, canvas.height);
      result = await canvasToBlob(canvas, "image/jpeg", quality);
      if (result.size <= MAX_CHAT_IMAGE_BYTES) break;

      if (quality > 0.62) quality = Math.max(0.62, quality - 0.08);
      else scale *= 0.8;
    }
  } finally {
    loaded.cleanup();
  }

  if (!result || result.size > MAX_CHAT_IMAGE_BYTES) {
    throw new Error(`This image could not be reduced below ${formatChatFileSize(MAX_CHAT_IMAGE_BYTES)}.`);
  }

  return result;
}

export async function prepareChatAttachment(file) {
  const type = String(file?.type || "").toLowerCase();
  const preparedBlob = CHAT_IMAGE_TYPES.includes(type)
    ? await prepareImageBlob(file)
    : file;
  const dataUrl = await readBlobAsDataUrl(preparedBlob);

  if (!dataUrl) throw new Error("The selected file could not be read.");

  return {
    id: globalThis.crypto?.randomUUID?.() || `attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: String(file.name || "attachment").slice(0, 140),
    type: preparedBlob.type || type,
    size: preparedBlob.size,
    originalSize: file.size,
    dataUrl,
  };
}

export function chatAttachmentMetadata(attachment) {
  return {
    name: attachment.name,
    type: attachment.type,
    size: attachment.size,
  };
}
