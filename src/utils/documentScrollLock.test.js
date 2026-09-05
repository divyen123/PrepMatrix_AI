import assert from "node:assert/strict";
import test from "node:test";
import {
  acquireDocumentScrollLock,
  DOCUMENT_SCROLL_LOCK_CLASS,
} from "./documentScrollLock.js";

function createClassList() {
  const values = new Set();
  return {
    add: (value) => values.add(value),
    contains: (value) => values.has(value),
    remove: (value) => values.delete(value),
  };
}

function createDocument() {
  return {
    body: { classList: createClassList(), style: { overflow: "visible" } },
    documentElement: { classList: createClassList(), style: { overflow: "clip" } },
  };
}

test("keeps the shared document lock until every nested owner releases it", () => {
  const targetDocument = createDocument();
  const releaseNote = acquireDocumentScrollLock(targetDocument);
  const releaseChat = acquireDocumentScrollLock(targetDocument);

  assert.equal(targetDocument.body.classList.contains(DOCUMENT_SCROLL_LOCK_CLASS), true);
  assert.equal(targetDocument.documentElement.classList.contains(DOCUMENT_SCROLL_LOCK_CLASS), true);

  releaseNote();
  assert.equal(targetDocument.body.classList.contains(DOCUMENT_SCROLL_LOCK_CLASS), true);
  assert.equal(targetDocument.documentElement.classList.contains(DOCUMENT_SCROLL_LOCK_CLASS), true);

  releaseChat();
  assert.equal(targetDocument.body.classList.contains(DOCUMENT_SCROLL_LOCK_CLASS), false);
  assert.equal(targetDocument.documentElement.classList.contains(DOCUMENT_SCROLL_LOCK_CLASS), false);
});

test("release is idempotent and never overwrites inline styles owned by another modal", () => {
  const targetDocument = createDocument();
  const release = acquireDocumentScrollLock(targetDocument);

  targetDocument.body.style.overflow = "hidden";
  targetDocument.documentElement.style.overflow = "auto";
  release();
  release();

  assert.equal(targetDocument.body.style.overflow, "hidden");
  assert.equal(targetDocument.documentElement.style.overflow, "auto");
  assert.equal(targetDocument.body.classList.contains(DOCUMENT_SCROLL_LOCK_CLASS), false);
});
