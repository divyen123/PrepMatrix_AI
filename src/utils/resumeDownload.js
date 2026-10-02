import { captureResumeCanvas } from "./resumeCapture.js";
import { captureResumeCanvasFromElement, createResumePdfFromElement, getResumePdfFilename } from "./resumePdf.js";

export function saveResumeBlob(blob, filename, doc = document) {
  const url = URL.createObjectURL(blob);
  const link = doc.createElement("a");
  link.href = url;
  link.download = filename;
  doc.body.appendChild(link);
  try { link.click(); } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

// Prepare every byte before the page records a generation. If PDF encoding
// fails, reuse the same verified preview image without capturing or charging again.
export async function prepareResumeDownload(element, draft, layout, {
  format: requestedFormat = "pdf",
  renderElement = captureResumeCanvas,
  captureElement = captureResumeCanvasFromElement,
  createPdf = createResumePdfFromElement,
} = {}) {
  let canvas;
  let blob;
  let format = requestedFormat === "png" ? "png" : "pdf";
  if (format === "png") {
    ({ canvas } = await captureElement(element, { renderElement }));
    blob = await new Promise((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("The preview image could not be encoded.")), "image/png");
    });
    if (!(blob instanceof Blob) || !blob.size) throw new Error("The preview image could not be encoded.");
  } else {
    try {
      const pdf = await createPdf(element, draft, layout, {
        renderElement: async (node, options) => {
          canvas = await renderElement(node, options);
          return canvas;
        },
      });
      blob = pdf.output("blob");
      if (!(blob instanceof Blob) || !blob.size) throw new Error("The PDF could not be encoded.");
    } catch (error) {
      if (!canvas) throw error;
      blob = await new Promise((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(error), "image/png");
      });
      format = "png";
    }
  }
  const filename = getResumePdfFilename(draft).replace(/\.pdf$/u, `.${format}`);
  return { blob, filename, format, save: () => saveResumeBlob(blob, filename, element.ownerDocument) };
}
