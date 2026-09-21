import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
const readSource = (relativePath) => readFileSync(path.join(sourceRoot, relativePath), "utf8");
const toastAdapter = readSource("utils/toast.jsx");
const swipeToast = readSource("components/SwipeToast.jsx");
const swipeToastStyles = readSource("components/SwipeToast.css");
const appStyles = readSource("App.css");

function collectJavaScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScriptFiles(absolutePath);
    return /\.(?:js|jsx)$/u.test(entry.name) ? [absolutePath] : [];
  });
}

test("routes every app toast through the SwipeToast adapter", () => {
  const directToastifyImports = collectJavaScriptFiles(sourceRoot)
    .filter((filePath) => /from\s+["']react-toastify["']/u.test(readFileSync(filePath, "utf8")))
    .map((filePath) => path.relative(sourceRoot, filePath).replaceAll("\\", "/"));

  assert.deepEqual(directToastifyImports, ["utils/toast.jsx"]);
  assert.match(readSource("App.jsx"), /from\s+["']\.\/utils\/toast["']/u);
  const worktreeSource = readSource("components/WorktreeMapper.jsx");
  assert.match(
    worktreeSource,
    /from\s+["']\.\.\/utils\/toast["']/u,
  );
  assert.match(worktreeSource, /<ToastContainer[\s\S]*?\bdraggable\b/u);
  assert.doesNotMatch(worktreeSource, /draggable=\{false\}/u);
});

test("keeps Toastify orchestration while SwipeToast owns interaction and timing", () => {
  assert.match(toastAdapter, /<SwipeToast[\s\S]*?open=\{open\}/u);
  assert.match(toastAdapter, /autoClose:\s*false/u);
  assert.match(toastAdapter, /dismiss:\s*requestToastClose/u);
  assert.match(toastAdapter, /rawToast\.clearWaitingQueue\(\)/u);
  assert.match(toastAdapter, /closeToast:\s*\(\)\s*=>\s*requestToastClose\(toastId\)/u);
  assert.match(toastAdapter, /const\s+closeControllers\s*=\s*new Map\(\)/u);
  assert.match(toastAdapter, /\.\.\.options,[\s\S]*?toastId,[\s\S]*?transition:\s*hostTransition/u);
});

test("supports swipe, fuse, keyboard dismissal, and reduced motion", () => {
  assert.match(swipeToast, /setPointerCapture\(event\.pointerId\)/u);
  assert.match(swipeToast, /velocity\s*>\s*FLICK_VELOCITY/u);
  assert.match(swipeToast, /distanceY\s*>=\s*swipeDistance/u);
  assert.match(swipeToast, /fuseRef\.current\.animate\(FUSE_KEYFRAMES/u);
  assert.match(swipeToast, /event\.key\s*===\s*"Escape"/u);
  assert.match(swipeToast, /useReducedMotion\(\)/u);
  assert.match(swipeToast, /visibilitychange/u);
  assert.match(swipeToastStyles, /@media \(prefers-reduced-motion: reduce\)/u);
});

test("maps toast types and every app background mode to theme tokens", () => {
  for (const type of ["success", "error", "warning", "info"]) {
    assert.match(appStyles, new RegExp(`\\.swipe-toast--${type}\\s*\\{`, "u"));
  }

  assert.match(appStyles, /body\.dark \.prepmatrix-swipe-toast-host/u);
  assert.match(appStyles, /body\.has-bg-image \.prepmatrix-swipe-toast-host/u);
  assert.match(appStyles, /body\.no-glass-cards \.prepmatrix-swipe-toast-host/u);
  assert.match(appStyles, /--swipe-toast-surface:\s*var\(--surface-strong\)/u);
  assert.match(appStyles, /--swipe-toast-ink:\s*var\(--text\)/u);
});
