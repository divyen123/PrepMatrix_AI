import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const chatSource = readFileSync(new URL("./components/Chatbot.jsx", import.meta.url), "utf8");
const windowSource = readFileSync(new URL("./components/CodeMatrixWindow.jsx", import.meta.url), "utf8");
const windowStyles = readFileSync(new URL("./components/CodeMatrixWindow.css", import.meta.url), "utf8");
const codeMatrixSource = readFileSync(new URL("./pages/CodeMatrixPage.jsx", import.meta.url), "utf8");

test("wires AI Chat and Placement Preparation to one in-place CodeMatrix window", () => {
  assert.match(appSource, /const \[codeMatrixWindow, setCodeMatrixWindow\] = useState\(null\)/u);
  assert.match(appSource, /onOpenCodeMatrix=\{openCodeMatrixWindow\}/u);
  assert.match(appSource, /<CodeMatrixWindow[\s\S]*?<CodeMatrixPage[\s\S]*?embedded[\s\S]*?launch=\{codeMatrixWindow\.launch\}/u);
  assert.match(chatSource, /const handleExecuteCode = useCallback\(\(launch\) => \{[\s\S]*?setOpen\(false\);[\s\S]*?onOpenCodeMatrix\(launch\)/u);
  assert.match(chatSource, /message\.role === "assistant"[\s\S]*?handleExecuteCode/u);
  assert.match(codeMatrixSource, /className=\{`cmx-page[\s\S]*?\$\{embedded \? " is-embedded" : ""\}`\}/u);
  assert.match(codeMatrixSource, /\{!embedded && \([\s\S]*?<header className="cmx-header">/u);
});

test("uses a draggable compact macOS-style window with close, maximize, and genie exit", () => {
  assert.match(windowSource, /onPointerDown=\{startDrag\}/u);
  assert.match(windowSource, /document\.addEventListener\("focusin", keepFocusInside, true\)/u);
  assert.match(windowSource, /code-matrix-window-close/u);
  assert.match(windowSource, /code-matrix-window-maximize/u);
  assert.match(windowSource, /<h2 id="code-matrix-window-title">CodeMatrix<\/h2>/u);
  assert.match(windowSource, /setMaximized\(\(current\) => !current\)/u);
  assert.match(windowStyles, /\.code-matrix-window-header\s*\{[\s\S]*?grid-template-rows|\.code-matrix-window\s*\{[\s\S]*?grid-template-rows:\s*38px/u);
  assert.match(windowStyles, /\.code-matrix-window-close\s*\{\s*background:\s*#ff5f57/u);
  assert.match(windowStyles, /\.code-matrix-window-maximize\s*\{\s*background:\s*#28c840/u);
  assert.match(windowStyles, /@keyframes code-matrix-window-genie-out/u);
  assert.match(windowStyles, /@media \(prefers-reduced-motion: reduce\)/u);
});
