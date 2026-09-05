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

test("Subject Performance removes redundant hero copy and uses compact footer actions", () => {
  assert.doesNotMatch(modalSource, /A focused view of completed chapters, upcoming work, and exam readiness\./u);
  assert.doesNotMatch(modalSource, /aria-describedby="subject-progress-description"/u);
  assert.match(
    stylesheet,
    /\.subject-progress-modal \.subject-modal-actions\s*\{[^}]*gap:\s*10px;[^}]*padding:\s*12px 30px 16px;/u,
  );
  assert.match(
    stylesheet,
    /body \.subject-progress-modal \.subject-action-btn\s*\{[^}]*grid-template-columns:\s*32px minmax\(0, 1fr\) auto;[^}]*min-height:\s*58px;[^}]*padding:\s*8px 10px;/u,
  );
  assert.match(
    stylesheet,
    /\.subject-action-icon\s*\{[^}]*width:\s*32px;[^}]*height:\s*32px;/u,
  );
  assert.match(
    stylesheet,
    /@media \(max-width: 800px\)\s*\{[\s\S]*?\.subject-progress-modal \.subject-modal-actions\s*\{[^}]*grid-template-columns:\s*1fr;[^}]*gap:\s*8px;[^}]*padding:\s*10px 18px 14px;[\s\S]*?body \.subject-progress-modal \.subject-action-btn\s*\{[^}]*min-height:\s*52px;/u,
  );
});
