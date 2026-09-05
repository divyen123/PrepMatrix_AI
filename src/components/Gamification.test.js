import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./Gamification.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./Gamification.css", import.meta.url), "utf8");
const appStyles = readFileSync(new URL("../App.css", import.meta.url), "utf8");
const analyticsPageSource = readFileSync(new URL("../pages/AnalyticsPage.jsx", import.meta.url), "utf8");

test("routes the Study Momentum battle action directly to Quiz Battles", () => {
  assert.match(source, /const openQuizBattles = \(\) => navigate\("\/quiz\?tab=battles"\)/u);
  assert.match(source, /className="momentum-action-grid"[\s\S]*?Exam-ready achievement[\s\S]*?Quiz Battle arena/u);
  assert.match(source, /className="secondary-btn quiz-battle-cta"[\s\S]*?Attend quiz/u);
  assert.match(styles, /\.momentum-action-grid\s*\{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u);
});

test("keeps the Momentum action CTAs aligned at the bottom of equal-height cards", () => {
  assert.match(styles, /\.momentum-action-grid \.momentum-action-card\s*\{[\s\S]*?grid-template-rows: auto minmax\(0, 1fr\) auto;[\s\S]*?align-content: stretch/u);
  assert.match(styles, /\.momentum-action-grid \.momentum-action-card \.exam-eligibility-cta,[\s\S]*?\.quiz-battle-cta\s*\{[\s\S]*?grid-row: 3;[\s\S]*?align-self: end;[\s\S]*?margin-top: auto/u);
});

test("always presents both Momentum actions and disables them until eligible", () => {
  assert.doesNotMatch(source, /\(metrics\.isExamEligible \|\| battleStatsEnabled\) &&/u);
  assert.match(source, /aria-disabled=\{!metrics\.isExamEligible\}[\s\S]*?disabled=\{!metrics\.isExamEligible\}/u);
  assert.match(source, /const hasQuizSubjects = Array\.isArray\(subjects\)/u);
  assert.match(source, /const isQuizEligible = battleStatsEnabled && hasQuizSubjects/u);
  assert.match(analyticsPageSource, /<Gamification[\s\S]*?subjects=\{subjects\}/u);
  assert.match(source, /aria-disabled=\{!isQuizEligible\}[\s\S]*?disabled=\{!isQuizEligible\}/u);
  assert.match(source, /Reach 80% to unlock the exam/u);
  assert.match(source, /Add at least one subject to unlock Quiz Battles/u);
});

test("only enabled Momentum actions receive the subtle reduced-motion-safe shake", () => {
  assert.match(source, /metrics\.isExamEligible \? "is-enabled" : "is-disabled"/u);
  assert.match(source, /isQuizEligible \? "is-enabled" : "is-disabled"/u);
  assert.match(styles, /\.momentum-action-grid \.momentum-action-card\.is-enabled\s*\{[\s\S]*?animation: momentum-action-ready/u);
  assert.match(styles, /@keyframes momentum-action-ready/u);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.momentum-action-grid \.momentum-action-card\.is-enabled[\s\S]*?animation: none/u);
});

test("moves Quiz Battle stats from exposed badges into an accessible popover", () => {
  assert.match(source, /aria-expanded=\{battleDetailsOpen\}/u);
  assert.match(source, /aria-haspopup="dialog"/u);
  assert.match(source, /aria-label="View Quiz Battle momentum"/u);
  assert.match(source, /aria-labelledby=\{battleDetailsTitleId\}[\s\S]*?role="dialog"/u);
  assert.match(source, /<dt>Planner XP<\/dt>[\s\S]*?<dt>Battle XP<\/dt>[\s\S]*?<dt>Battles played<\/dt>[\s\S]*?<dt>Record<\/dt>/u);
  assert.match(source, /battleStatsLoading \? "Loading…" : momentumXp\.battleXp/u);
  assert.match(source, /battleStatsError && \([\s\S]*?onRetryBattleStats/u);
  assert.doesNotMatch(source, /momentum-xp-breakdown|battle-record-strip|battle-badge-strip/u);
});

test("keeps the Quiz Battle shortcut and details compact in the Momentum header", () => {
  const headerIndex = source.indexOf('className="gamification-header"');
  const battleTriggerIndex = source.indexOf('className="battle-insights"');
  const scrollRegionIndex = source.indexOf('className="gamification-scroll-region"');

  assert.ok(headerIndex >= 0 && headerIndex < battleTriggerIndex);
  assert.ok(battleTriggerIndex < scrollRegionIndex);
  assert.match(source, /className="gamification-header-actions"[\s\S]*?className="battle-insights"[\s\S]*?className="badge-emblem"/u);
  assert.match(source, /className="battle-record-win-count"[\s\S]*?className="battle-record-loss-count"/u);
  assert.match(styles, /\.battle-insights-popover\s*\{[\s\S]*?right: 0;[\s\S]*?left: auto/u);
  assert.match(styles, /\.battle-record-win-count\s*\{[\s\S]*?#16a34a/u);
  assert.match(styles, /\.battle-record-loss-count\s*\{[\s\S]*?var\(--danger\)/u);
  assert.match(styles, /body \.battle-insights-popover \.battle-insights-link\s*\{[\s\S]*?min-height: 30px;[\s\S]*?font-size: 0\.72rem/u);
});

test("keeps Battle momentum fully opaque across app themes", () => {
  assert.match(
    styles,
    /\.battle-insights-popover\s*\{[\s\S]*?--battle-insights-solid-surface: #ffffff;[\s\S]*?background: var\(--battle-insights-solid-surface\);[\s\S]*?backdrop-filter: none;/u,
  );
  assert.match(
    styles,
    /body\.dark \.battle-insights-popover\s*\{\s*--battle-insights-solid-surface: #121b2d;\s*\}/u,
  );
  assert.match(
    styles,
    /body\.has-bg-image \.battle-insights-popover\s*\{[\s\S]*?--battle-insights-solid-surface: rgb\(var\(--bg-surface-rgb, 18, 27, 45\)\);[\s\S]*?background: var\(--battle-insights-solid-surface\);/u,
  );
});

test("keeps the battle refresh Retry action compact and comfortably padded", () => {
  assert.match(
    styles,
    /body \.battle-insights-popover \.battle-insights-warning > button\s*\{[\s\S]*?width: fit-content !important;[\s\S]*?min-height: 30px !important;[\s\S]*?padding: 0 10px !important;[\s\S]*?border-radius: 9px !important;/u,
  );
  assert.match(
    styles,
    /body \.battle-insights-popover \.battle-insights-warning > button::after\s*\{[\s\S]*?content: none !important;[\s\S]*?display: none !important;/u,
  );
  assert.match(
    styles,
    /body \.battle-insights-popover \.battle-insights-warning > button:hover,[\s\S]*?button:focus-visible\s*\{[\s\S]*?transform: none !important;/u,
  );
});

test("moves the level guidance into an accessible badge tooltip", () => {
  assert.match(source, /aria-describedby=\{badgeGuidanceId\}/u);
  assert.match(source, /className="badge-guidance-tooltip"[\s\S]*?role="tooltip"/u);
  assert.match(source, /\{MOMENTUM_GUIDANCE\}/u);
  assert.doesNotMatch(source, /<p className="card-desc">[\s\S]*?Complete planner tasks/u);
  assert.match(styles, /\.badge-emblem-wrap:hover \.badge-guidance-tooltip,[\s\S]*?\.badge-emblem-wrap:focus-within \.badge-guidance-tooltip/u);
});

test("closes battle details on outside interaction or Escape and restores keyboard focus", () => {
  assert.match(source, /document\.addEventListener\("pointerdown", closeOnOutsidePointer\)/u);
  assert.match(source, /document\.addEventListener\("keydown", closeOnEscape\)/u);
  assert.match(source, /event\.key !== "Escape"/u);
  assert.match(source, /battleDetailsTriggerRef\.current\?\.focus\(\)/u);
  assert.match(source, /battleDetailsCloseRef\.current\?\.focus\(\)/u);
  assert.match(source, /document\.removeEventListener\("pointerdown", closeOnOutsidePointer\)/u);
  assert.match(source, /document\.removeEventListener\("keydown", closeOnEscape\)/u);
});

test("shows all Study Momentum content without an internal scrollbar", () => {
  assert.match(styles, /\.gamification-card > \.gamification-scroll-region\s*\{[\s\S]*?overflow: visible/u);
  assert.doesNotMatch(styles, /gamification-scroll-region::-webkit-scrollbar|overflow-y: auto|scrollbar-width: thin/u);
  assert.match(styles, /\.analytics-support-grid > \.gamification-card\s*\{[\s\S]*?height: auto/u);
  assert.match(styles, /body\.has-bg-image \.battle-insights-popover\s*\{[\s\S]*?background: var\(--battle-insights-solid-surface\)/u);
  assert.doesNotMatch(appStyles, /\.gamification-card > \*\s*\{[\s\S]*?translateY\(-96px\)/u);
  assert.doesNotMatch(appStyles, /\.gamification-card::before\s*\{[\s\S]*?translateY\(-96px\)/u);
});

test("keeps the Study Momentum header pinned to the top grid row", () => {
  assert.match(styles, /\.gamification-card\s*\{[\s\S]*?grid-template-rows: auto auto[\s\S]*?align-items: stretch/u);
  assert.match(styles, /\.gamification-card > \.gamification-orb\s*\{[\s\S]*?position: absolute[\s\S]*?z-index: 0/u);
  assert.match(styles, /\.gamification-card \.gamification-header\s*\{[\s\S]*?align-self: start/u);
  assert.match(styles, /\.gamification-card > \.gamification-scroll-region\s*\{[\s\S]*?align-self: start[\s\S]*?overflow: visible/u);
  assert.match(styles, /@media \(max-width: 1180px\)\s*\{[\s\S]*?\.gamification-card > \.gamification-scroll-region\s*\{[\s\S]*?overflow: visible/u);
});

test("uses compact Momentum stat and next-level cards", () => {
  assert.match(styles, /\.gamification-card \.momentum-stats-grid article\s*\{[\s\S]*?padding: 9px 11px;[\s\S]*?border-radius: 14px/u);
  assert.match(styles, /\.gamification-card \.momentum-stats-grid strong\s*\{[\s\S]*?font-size: 1\.35rem/u);
  assert.match(styles, /\.gamification-card \.next-reward-strip\s*\{[\s\S]*?min-height: 42px;[\s\S]*?padding: 8px 12px/u);
  assert.match(styles, /\.gamification-card \.next-reward-strip strong\s*\{[\s\S]*?font-size: 1rem/u);
});
