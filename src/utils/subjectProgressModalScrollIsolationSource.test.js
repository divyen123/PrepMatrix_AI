import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const modalSource = readFileSync(new URL("../components/SubjectProgressModal.jsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("../App.css", import.meta.url), "utf8");

test("Subject Performance locks and restores document scrolling", () => {
  const effectStart = modalSource.indexOf("const releaseScrollLock = acquireDocumentScrollLock()");
  const effectEnd = modalSource.indexOf("}, [closeAskAIDialog, handleClose]);", effectStart);
  const effect = modalSource.slice(effectStart, effectEnd);

  assert.ok(effectStart >= 0 && effectEnd > effectStart);
  assert.match(
    modalSource,
    /import \{ acquireDocumentScrollLock \} from "\.\.\/utils\/documentScrollLock"/u,
  );
  assert.match(effect, /document\.body\.classList\.add\("modal-open"\)/u);
  assert.match(effect, /releaseScrollLock\(\)/u);
  assert.doesNotMatch(effect, /document\.body\.style\.overflow/u);
});

test("Subject Performance has one outer vertical scroll owner", () => {
  assert.match(
    stylesheet,
    /\.subject-modal-overlay\s*\{[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*hidden;[^}]*overscroll-behavior:\s*none;/u,
  );
  assert.match(
    stylesheet,
    /\.subject-progress-modal\s*\{[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;[^}]*scrollbar-gutter:\s*stable;/u,
  );
});
