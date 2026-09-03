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

test("opens and consumes the exact routed memory check after a completed redo is pending", () => {
  assert.match(componentSource, /parseMemoryReviewRoute\(location\.search\)/u);
  assert.match(componentSource, /buildMemoryReviewExperience\(\{[\s\S]*?requestedTaskId,[\s\S]*?requestedUnitKey,/u);
  assert.match(
    componentSource,
    /experience\.entries\.find\(\(entry\) => entry\.requested\)/u,
  );
  assert.match(
    componentSource,
    /requestedEntry\.historicallyCompleted && !requestedEntry\.recheckPending/u,
  );
  assert.match(
    componentSource,
    /const opened = openQuiz\(requestedEntry\)/u,
  );
  assert.match(
    componentSource,
    /search: clearMemoryReviewRouteRequest\(location\.search\)[\s\S]*?replace: true/u,
  );
});

test("finishes the exact rescheduled memory check only after its notebook save", () => {
  assert.match(
    componentSource,
    /await onNotebookUpdated\(payload\);[\s\S]*?setSchedule\(\(currentSchedule\) => clearMemoryReviewTaskRecheck\([\s\S]*?currentSchedule,[\s\S]*?payload\.task,[\s\S]*?\)\);/u,
  );
  assert.match(
    componentSource,
    /entry\.recheckPending \? "Review again" : "Start check"/u,
  );
  assert.match(
    componentSource,
    /typeof setCompleted === "function" && activeEntry\.historicallyCompleted === false/u,
  );
});

test("requires an accessible inline confirmation before dismissing a memory check", () => {
  assert.match(componentSource, /import \{[\s\S]*?Trash2,[\s\S]*?\} from "lucide-react"/u);
  assert.match(componentSource, /const \[pendingDeleteTaskId, setPendingDeleteTaskId\] = useState\(null\)/u);
  assert.match(
    componentSource,
    /setSchedule\(\(currentSchedule\) => dismissMemoryReviewTask\([\s\S]*?mergeMemoryReviewSchedule\(currentSchedule,[\s\S]*?entry\.task,[\s\S]*?dateKey: experience\.dateKey/u,
  );
  assert.match(
    componentSource,
    /aria-label=\{`Delete memory check for \$\{entry\.candidate\.title\}`\}[\s\S]*?className="memory-review-delete"[\s\S]*?onClick=\{\(\) => setPendingDeleteTaskId\(taskId\)\}[\s\S]*?<Trash2/u,
  );
  assert.doesNotMatch(
    componentSource,
    /className="memory-review-delete"[\s\S]{0,160}?onClick=\{\(\) => deleteReview\(entry\)\}/u,
  );
  assert.match(componentSource, /const isConfirmingDelete = pendingDeleteTaskId === taskId/u);
  assert.match(
    componentSource,
    /role="group"[\s\S]*?Delete this check\?[\s\S]*?aria-label=\{`Confirm deleting memory check for \$\{entry\.candidate\.title\}`\}[\s\S]*?autoFocus[\s\S]*?onClick=\{\(\) => deleteReview\(entry\)\}[\s\S]*?<Check/u,
  );
  assert.match(
    componentSource,
    /aria-label=\{`Cancel deleting memory check for \$\{entry\.candidate\.title\}`\}[\s\S]*?onClick=\{\(\) => cancelDeleteReview\(taskId\)\}[\s\S]*?<X/u,
  );
  assert.match(componentSource, /event\.key === "Escape"[\s\S]*?cancelDeleteReview\(taskId\)/u);
  assert.match(
    stylesheet,
    /\.memory-review-list \{[\s\S]*?max-height: 264px;[\s\S]*?overflow-y: auto;[\s\S]*?scrollbar-gutter: stable;/u,
  );
  assert.match(stylesheet, /body \.memory-review-panel \.memory-review-delete \{[\s\S]*?color: var\(--danger\) !important;/u);
  assert.match(stylesheet, /\.memory-review-delete-confirm \{[\s\S]*?background: color-mix\(in srgb, var\(--danger\) 8%/u);
  assert.match(stylesheet, /\.memory-review-confirm-button\.is-confirm:focus-visible[\s\S]*?background: var\(--danger\) !important;/u);
  assert.match(stylesheet, /\.memory-review-confirm-button\.is-cancel:focus-visible[\s\S]*?background: var\(--surface-strong\) !important;/u);
});

test("supports a standalone note-like card grid with visible loading and empty states", () => {
  assert.match(componentSource, /loadError = "",[\s\S]*?loading = false,[\s\S]*?standalone = false/u);
  assert.match(
    componentSource,
    /className=\{`memory-review-panel\$\{standalone \? " is-standalone" : ""\}`\}/u,
  );
  assert.match(componentSource, /aria-label=\{standalone \? "Recall sessions" : undefined\}/u);
  assert.match(componentSource, /aria-labelledby=\{standalone \? undefined : "memory-review-title"\}/u);
  assert.match(componentSource, /standalone \? \([\s\S]*?memory-review-standalone-toolbar[\s\S]*?\) : \([\s\S]*?<header className="memory-review-heading">/u);
  assert.match(componentSource, /loading \? "Loading" : `\$\{experience\.pendingEntries\.length\} due`/u);
  assert.match(componentSource, /No memory checks are due right now/u);
  assert.match(componentSource, /Memory checks are temporarily unavailable/u);
  assert.match(
    stylesheet,
    /\.memory-review-panel\.is-standalone \{[\s\S]*?padding: 0;[\s\S]*?background: transparent;[\s\S]*?border: 0;[\s\S]*?box-shadow: none;/u,
  );
  assert.match(
    stylesheet,
    /\.memory-review-panel\.is-standalone \.memory-review-list \{[\s\S]*?grid-template-columns: repeat\(auto-fill, minmax\(min\(100%, 230px\), 280px\)\);[\s\S]*?gap: 12px;[\s\S]*?max-height: 448px;/u,
  );
  assert.match(stylesheet, /\.memory-review-list \{[\s\S]*?overflow-y: auto;/u);
  assert.match(
    stylesheet,
    /\.memory-review-panel\.is-standalone \.memory-review-card \{[\s\S]*?min-height: 180px;[\s\S]*?flex-direction: column;[\s\S]*?padding: 16px;[\s\S]*?background:/u,
  );
});

test("gives completed recall actions a subtle theme-safe green tone", () => {
  assert.match(
    stylesheet,
    /\.memory-review-card\.is-complete \.memory-review-complete-label \{[\s\S]*?color: #167a42;[\s\S]*?background: color-mix\(in srgb, #22c55e 13%,[\s\S]*?border-color: color-mix\(in srgb, #16a34a 38%,[\s\S]*?opacity: 1;/u,
  );
  assert.match(
    stylesheet,
    /body\.dark \.memory-review-card\.is-complete \.memory-review-complete-label,[\s\S]*?body\.has-bg-image \.memory-review-card\.is-complete \.memory-review-complete-label \{[\s\S]*?color: #86efac;[\s\S]*?background: rgba\(34, 197, 94, 0\.14\);/u,
  );
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
