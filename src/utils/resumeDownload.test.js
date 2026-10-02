import test from "node:test";
import assert from "node:assert/strict";
import { prepareResumeDownload } from "./resumeDownload.js";

const draft = { personal: { fullName: "Avery Sharma" } };

test("prepares the PDF bytes before exposing the download action", async () => {
  const pdfBlob = new Blob(["%PDF-1.7"], { type: "application/pdf" });
  const result = await prepareResumeDownload({}, draft, {}, {
    createPdf: async () => ({ output: (type) => {
      assert.equal(type, "blob");
      return pdfBlob;
    } }),
  });
  assert.equal(result.blob, pdfBlob);
  assert.equal(result.format, "pdf");
  assert.equal(result.filename, "Avery-Sharma-resume.pdf");
  assert.equal(typeof result.save, "function");
});

test("reuses the same capture as PNG if PDF encoding fails", async () => {
  let captures = 0;
  const png = new Blob(["preview pixels"], { type: "image/png" });
  const result = await prepareResumeDownload({}, draft, {}, {
    renderElement: async () => {
      captures += 1;
      return { toBlob: (callback, type) => {
        assert.equal(type, "image/png");
        callback(png);
      } };
    },
    createPdf: async (node, _draft, _layout, { renderElement }) => {
      await renderElement(node, {});
      return { output: () => { throw new Error("PDF encoding failed"); } };
    },
  });
  assert.equal(captures, 1);
  assert.equal(result.blob, png);
  assert.equal(result.format, "png");
  assert.equal(result.filename, "Avery-Sharma-resume.png");
});

test("exports the selected PNG format directly from the live preview capture", async () => {
  const png = new Blob(["preview pixels"], { type: "image/png" });
  const renderer = async () => assert.fail("The supplied capture must be reused");
  let pdfCalled = false;
  const result = await prepareResumeDownload({}, draft, {}, {
    format: "png",
    renderElement: renderer,
    captureElement: async (_element, options) => {
      assert.equal(options.renderElement, renderer);
      return { canvas: { toBlob: (callback, type) => {
        assert.equal(type, "image/png");
        callback(png);
      } } };
    },
    createPdf: async () => {
      pdfCalled = true;
      throw new Error("PNG export should not build a PDF");
    },
  });
  assert.equal(pdfCalled, false);
  assert.equal(result.blob, png);
  assert.equal(result.format, "png");
  assert.equal(result.filename, "Avery-Sharma-resume.png");
});

test("stops when capture fails instead of offering an invalid download", async () => {
  await assert.rejects(prepareResumeDownload({}, draft, {}, {
    renderElement: async () => { throw new Error("Fonts unavailable"); },
    createPdf: async (node, _draft, _layout, { renderElement }) => renderElement(node, {}),
  }), /Fonts unavailable/u);
});

test("stops when both PDF and PNG encoding fail", async () => {
  await assert.rejects(prepareResumeDownload({}, draft, {}, {
    renderElement: async () => ({ toBlob: (callback) => callback(null) }),
    createPdf: async (node, _draft, _layout, { renderElement }) => {
      await renderElement(node, {});
      return { output: () => null };
    },
  }), /PDF could not be encoded/u);
});
