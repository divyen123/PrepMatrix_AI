import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerResumeBuilderRoutes } from "./resumeBuilderRoutes.js";
import {
  MAX_RESUME_TEXT_CHARS,
  MAX_RESUME_UPLOAD_BYTES,
  extractResumeText,
} from "./resumeTextExtraction.js";

function upload(name, type, bytes) {
  return {
    name,
    type,
    dataUrl: `data:${type};base64,${Buffer.from(bytes).toString("base64")}`,
  };
}

test("extracts UTF-8 text resumes without changing readable lines", async () => {
  const text = await extractResumeText(upload(
    "resume.txt",
    "text/plain",
    "Ada Lovelace\r\nSkills: analytical engines, mathematics\r\nExperience: programming",
  ));
  assert.equal(text, "Ada Lovelace\nSkills: analytical engines, mathematics\nExperience: programming");
});

test("accepts a PDF only when its signature matches and returns extracted text", async () => {
  let called = false;
  const text = await extractResumeText(
    upload("resume.pdf", "application/pdf", "%PDF-1.7\nresume bytes"),
    { pdfExtractor: async (file, limits) => {
      called = true;
      assert.equal(file.kind, "pdf");
      assert.equal(limits.maxOcrPages, 0);
      return { text: "Ada Lovelace\nSkills: mathematics and programming", truncated: false };
    } },
  );
  assert.equal(called, true);
  assert.match(text, /Skills: mathematics/u);
  await assert.rejects(
    extractResumeText(upload("fake.pdf", "application/pdf", "plain text masquerading as a PDF")),
    { code: "RESUME_FILE_INVALID", status: 400 },
  );
});

test("rejects unsupported, oversized, unreadable, and overlong resumes", async () => {
  await assert.rejects(
    extractResumeText(upload("resume.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "content")),
    { code: "RESUME_FILE_TYPE" },
  );
  await assert.rejects(
    extractResumeText(upload("huge.txt", "text/plain", Buffer.alloc(MAX_RESUME_UPLOAD_BYTES + 1, 65))),
    { code: "RESUME_FILE_TOO_LARGE", status: 413 },
  );
  await assert.rejects(
    extractResumeText(upload("binary.txt", "text/plain", Buffer.from([0xff, 0xff, 0xff]))),
    { code: "RESUME_FILE_ENCODING" },
  );
  await assert.rejects(
    extractResumeText(upload("short.txt", "text/plain", "name only")),
    { code: "RESUME_NO_TEXT", status: 422 },
  );
  await assert.rejects(
    extractResumeText(upload("long.txt", "text/plain", "Skills and experience ".repeat(MAX_RESUME_TEXT_CHARS / 10))),
    { code: "RESUME_TEXT_TOO_LONG", status: 413 },
  );
});

test("reports scanned PDFs as lacking selectable text", async () => {
  await assert.rejects(
    extractResumeText(
      upload("scanned.pdf", "application/pdf", "%PDF-1.7\nimage bytes"),
      { pdfExtractor: async () => {
        const error = new Error("No text");
        error.code = "CHAT_PDF_NO_TEXT";
        throw error;
      } },
    ),
    { code: "RESUME_NO_TEXT", status: 422 },
  );
});

test("the extraction endpoint requires an eligible signed-in user and does not use storage", async () => {
  const app = express();
  app.use(express.json({ limit: "8mb" }));
  registerResumeBuilderRoutes(app, {
    getDb: async () => assert.fail("Resume extraction must not access storage"),
    requireAuth: (handler) => (req, res) => {
      const identity = req.get("Authorization");
      if (!identity) return res.status(401).json({ error: "Login required." });
      req.user = { academicLevel: identity === "school" ? "Primary School" : "Undergraduate / Bachelor's" };
      return handler(req, res);
    },
  });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const url = `http://127.0.0.1:${server.address().port}/api/resume-builder/extract-text`;
  const body = JSON.stringify(upload("resume.txt", "text/plain", "Ada Lovelace has mathematics and programming experience."));
  try {
    const unauthenticated = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    assert.equal(unauthenticated.status, 401);
    const ineligible = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "school" }, body });
    assert.equal(ineligible.status, 403);
    const accepted = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "learner" }, body });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await accepted.json(), { text: "Ada Lovelace has mathematics and programming experience." });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeIdleConnections?.();
    });
  }
});
