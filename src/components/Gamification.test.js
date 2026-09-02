import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./Gamification.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./Gamification.css", import.meta.url), "utf8");
const appStyles = readFileSync(new URL("../App.css", import.meta.url), "utf8");

test("routes the Study Momentum battle action directly to Quiz Battles", () => {
  assert.match(source, /const openQuizBattles = \(\) => navigate\("\/quiz\?tab=battles"\)/u);
  assert.match(source, /className="momentum-action-grid"[\s\S]*?Exam-ready achievement[\s\S]*?Quiz Battle arena/u);
  assert.match(source, /className="secondary-btn quiz-battle-cta"[\s\S]*?Attend quiz/u);
  assert.match(styles, /\.momentum-action-grid\s*\{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u);
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
  assert.match(styles, /\.gamification-card > \.gamification-scroll-region::-webkit-scrollbar\s*\{[\s\S]*?width: 5px/u);
  assert.match(styles, /\.battle-insights-popover\s*\{[\s\S]*?right: 0;[\s\S]*?left: auto/u);
  assert.match(styles, /\.battle-record-win-count\s*\{[\s\S]*?#16a34a/u);
  assert.match(styles, /\.battle-record-loss-count\s*\{[\s\S]*?var\(--danger\)/u);
  assert.match(styles, /body \.battle-insights-popover \.battle-insights-link\s*\{[\s\S]*?min-height: 30px;[\s\S]*?font-size: 0\.72rem/u);
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

test("uses a bounded inner scroller instead of the previous translated card hack", () => {
  assert.match(styles, /\.gamification-scroll-region\s*\{[\s\S]*?overflow-y: auto/u);
  assert.match(styles, /\.analytics-support-grid > \.gamification-card\s*\{[\s\S]*?height: clamp\(540px, calc\(100vh - 160px\), 680px\)/u);
  assert.match(styles, /body\.has-bg-image \.battle-insights-popover\s*\{[\s\S]*?background: rgb\(var\(--bg-surface-rgb, 18, 27, 45\)\)/u);
  assert.doesNotMatch(appStyles, /\.gamification-card > \*\s*\{[\s\S]*?translateY\(-96px\)/u);
  assert.doesNotMatch(appStyles, /\.gamification-card::before\s*\{[\s\S]*?translateY\(-96px\)/u);
});

test("keeps the Study Momentum header pinned to the top grid row", () => {
  assert.match(styles, /\.gamification-card\s*\{[\s\S]*?grid-template-rows: auto minmax\(0, 1fr\)[\s\S]*?align-items: stretch/u);
  assert.match(styles, /\.gamification-card > \.gamification-orb\s*\{[\s\S]*?position: absolute[\s\S]*?z-index: 0/u);
  assert.match(styles, /\.gamification-card \.gamification-header\s*\{[\s\S]*?align-self: start/u);
  assert.match(styles, /\.gamification-scroll-region\s*\{[\s\S]*?align-self: stretch[\s\S]*?overflow-y: auto/u);
  assert.match(styles, /@media \(max-width: 1180px\)\s*\{[\s\S]*?\.gamification-card > \.gamification-scroll-region\s*\{[\s\S]*?overflow: visible/u);
});
