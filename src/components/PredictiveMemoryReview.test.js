import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const componentSource = readFileSync(
  new URL("./PredictiveMemoryReview.jsx", import.meta.url),
  "utf8",
);
const stylesheet = readFileSync(
  new URL("./PredictiveMemoryReview.css", import.meta.url),
  "utf8",
);

test("merges due reviews into the latest Planner state instead of replacing it", () => {
  assert.match(
    componentSource,
    /setSchedule\(\(currentSchedule\) => mergeMemoryReviewSchedule\(currentSchedule, \{[\s\S]*?notebooks,[\s\S]*?\}\)\)/u,
  );
  assert.doesNotMatch(componentSource, /setSchedule\(experience\.schedule\)/u);
});

test("uses an accessible viewport portal with retained close lifecycle", () => {
  assert.match(componentSource, /import \{ createPortal \} from "react-dom"/u);
  assert.match(componentSource, /const DIALOG_EXIT_DURATION_MS = 240/u);
  assert.match(componentSource, /const \[dialogOpen, setDialogOpen\] = useState\(false\)/u);
  assert.match(componentSource, /const \[dialogRendered, setDialogRendered\] = useState\(false\)/u);
  assert.match(componentSource, /window\.setTimeout\(\(\) => \{[\s\S]*?setDialogRendered\(false\);[\s\S]*?resetQuiz\(\);[\s\S]*?DIALOG_EXIT_DURATION_MS/u);
  assert.match(componentSource, /createPortal\([\s\S]*?aria-modal="true"[\s\S]*?role="dialog"[\s\S]*?document\.body/u);
  assert.match(componentSource, /aria-hidden=\{!dialogOpen\}[\s\S]*?inert=\{!dialogOpen \? true : undefined\}/u);
  assert.match(componentSource, /event\.target === event\.currentTarget[\s\S]*?closeQuiz\(\)/u);
  assert.match(componentSource, /event\.key === "Escape"[\s\S]*?event\.key !== "Tab"/u);
  assert.match(componentSource, /document\.body\.style\.overflow = "hidden"/u);
  assert.match(componentSource, /document\.documentElement\.style\.overflow = "hidden"/u);
  assert.match(componentSource, /previouslyFocused\?\.isConnected[\s\S]*?previouslyFocused\.focus/u);
  assert.match(componentSource, /setDialogOpen\(false\);[\s\S]*?catch \(submissionError\)/u);
});

test("exposes progress and prompt ratings with useful semantics", () => {
  assert.match(componentSource, /aria-valuemax=\{questions\.length\}/u);
  assert.match(componentSource, /aria-valuemin=\{0\}/u);
  assert.match(componentSource, /aria-valuenow=\{ratedCount\}/u);
  assert.match(componentSource, /className="memory-review-progress"[\s\S]*?role="progressbar"/u);
  assert.match(componentSource, /className="memory-review-rating"[\s\S]*?role="group"/u);
});

test("confirms recall choices and briefly guides another review", () => {
  assert.match(componentSource, /const REVIEW_GUIDANCE_DURATION_MS = 4000/u);
  assert.match(componentSource, /aria-pressed=\{ratings\[question\.id\] === "recalled"\}/u);
  assert.match(componentSource, /rateQuestion\(question\.id, "recalled"\)/u);
  assert.match(componentSource, /rateQuestion\(question\.id, "review"\)/u);
  assert.match(componentSource, /window\.setTimeout\([\s\S]*?REVIEW_GUIDANCE_DURATION_MS/u);
  assert.match(componentSource, /aria-atomic="true"[\s\S]*?className="memory-review-rating-guidance"[\s\S]*?role="status"/u);
  assert.match(componentSource, /Marked for review\.[\s\S]*?try again from memory\./u);
  assert.match(
    stylesheet,
    /body \.memory-review-dialog \.memory-review-rating > button\.is-selected\[aria-pressed="true"\]:not\(\.is-review\) \{[\s\S]*?color: #065f46 !important;[\s\S]*?background: rgba\(16, 185, 129, 0\.2\) !important;[\s\S]*?border-color: rgba\(5, 150, 105, 0\.62\) !important;[\s\S]*?box-shadow: [^;]+ !important;/u,
  );
  assert.match(
    stylesheet,
    /body \.memory-review-dialog \.memory-review-rating > button\.is-selected\.is-review\[aria-pressed="true"\] \{[\s\S]*?color: #92400e !important;[\s\S]*?background: rgba\(245, 158, 11, 0\.18\) !important;[\s\S]*?border-color: rgba\(217, 119, 6, 0\.58\) !important;[\s\S]*?box-shadow: [^;]+ !important;/u,
  );
  assert.match(
    stylesheet,
    /body\.dark \.memory-review-dialog[\s\S]*?button\.is-selected\[aria-pressed="true"\]:not\(\.is-review\)[\s\S]*?background: rgba\(16, 185, 129, 0\.24\) !important;/u,
  );
  assert.match(stylesheet, /\.memory-review-rating-guidance \{[\s\S]*?rgba\(245, 158, 11, 0\.1\)/u);
});

test("centers an opaque responsive dialog over a dimmed blurred backdrop", () => {
  assert.match(stylesheet, /\.memory-review-dialog-backdrop \{[\s\S]*?position: fixed;[\s\S]*?inset: 0;[\s\S]*?place-items: center;/u);
  assert.match(stylesheet, /backdrop-filter: blur\(14px\) saturate\(0\.72\) brightness\(0\.76\)/u);
  assert.match(stylesheet, /\.memory-review-dialog-backdrop\.is-open \{[\s\S]*?opacity: 1;[\s\S]*?pointer-events: auto;/u);
  assert.match(stylesheet, /\.memory-review-dialog \{[\s\S]*?grid-template-rows: auto auto minmax\(0, 1fr\) auto auto;[\s\S]*?background: var\(--bg, #f3f0e8\);[\s\S]*?overflow: hidden;/u);
  assert.match(stylesheet, /body\.has-bg-image \.memory-review-dialog \{[\s\S]*?rgb\(var\(--bg-surface-rgb, 18, 27, 45\)\)/u);
  assert.match(stylesheet, /\.memory-review-questions \{[\s\S]*?overflow-y: auto;[\s\S]*?overscroll-behavior: contain;/u);
  assert.match(stylesheet, /@media \(max-width: 640px\)[\s\S]*?max-height: calc\(100dvh - 16px\)/u);
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?memory-review-dialog-backdrop[\s\S]*?transition-duration: 0\.01ms !important/u);
});
