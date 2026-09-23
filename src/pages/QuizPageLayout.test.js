import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./QuizPage.jsx", import.meta.url), "utf8");
const battleStyles = readFileSync(
  new URL("../components/quiz-battles/QuizBattles.css", import.meta.url),
  "utf8",
);
const battlePanelSource = readFileSync(
  new URL("../components/quiz-battles/QuizBattlesPanel.jsx", import.meta.url),
  "utf8",
);

test("keeps one accessible quiz mode tablist available across both panels", () => {
  assert.equal((pageSource.match(/role="tablist"/gu) || []).length, 1);
  assert.equal((pageSource.match(/id="quiz-tab-solo"/gu) || []).length, 1);
  assert.equal((pageSource.match(/id="quiz-tab-battles"/gu) || []).length, 1);
  assert.match(pageSource, /className=\{\[[\s\S]*?"quiz-mode-shell"[\s\S]*?battleTabActive \? "is-battles" : "is-solo"/u);
  assert.match(pageSource, /aria-controls="quiz-panel-solo"[\s\S]*?aria-selected=\{!battleTabActive\}/u);
  assert.match(pageSource, /aria-controls="quiz-panel-battles"[\s\S]*?aria-selected=\{battleTabActive\}/u);
  assert.match(pageSource, /!isYoungKidsLearner && \([\s\S]*?role="tablist"/u);
  assert.match(pageSource, /const \[battleActionsHost, setBattleActionsHost\] = useState\(null\)/u);
  assert.match(
    pageSource,
    /battleTabActive \? \([\s\S]*?className="quiz-battles-header"[\s\S]*?className="quiz-battle-dashboard-slot" ref=\{setBattleActionsHost\}[\s\S]*?\{quizModeTabs\}/u,
  );
  assert.match(pageSource, /dashboardActionsHost=\{battleActionsHost\}/u);
  assert.match(battlePanelSource, /createPortal\(dashboardActions, dashboardActionsHost\)/u);
});

test("uses compact, theme-aware tabs and spaces the solo quiz panels", () => {
  assert.match(pageSource, /className="quiz-builder-header"[\s\S]*?Build a quiz from your exact topic/u);
  assert.match(pageSource, /className="quiz-solo-panel"[\s\S]*?id="quiz-panel-solo"/u);
  assert.match(battleStyles, /\.quiz-solo-panel\s*\{[\s\S]*?display:\s*grid[\s\S]*?gap:\s*18px/u);
  assert.match(battleStyles, /\.quiz-mode-shell\.is-solo\.has-mode-tabs > \.quiz-mode-tabs\s*\{[\s\S]*?position:\s*absolute[\s\S]*?right:\s*var\(--card-padding/u);
  assert.match(battleStyles, /body \.quiz-page \.quiz-mode-tabs button\s*\{[\s\S]*?min-height:\s*32px[\s\S]*?padding:\s*5px 9px !important/u);
  assert.match(battleStyles, /body\.has-bg-image \.quiz-mode-tabs\s*\{[\s\S]*?background:\s*rgba\(var\(--bg-surface-rgb/u);
  assert.match(battleStyles, /button\[aria-selected="true"\]\s*\{[\s\S]*?background:\s*rgba\(var\(--accent-rgb\), 0\.16\)/u);
  assert.match(battleStyles, /@media \(max-width: 760px\)[\s\S]*?body \.quiz-page \.quiz-mode-tabs button\s*\{[\s\S]*?min-height:\s*38px/u);
  assert.match(
    battleStyles,
    /\.quiz-mode-shell\.is-battles > \.quiz-battles-header\s*\{[\s\S]*?display:\s*flex[\s\S]*?justify-content:\s*space-between/u,
  );
  assert.match(
    battleStyles,
    /\.quiz-mode-shell\.is-battles \.quiz-mode-tabs\s*\{[\s\S]*?margin-left:\s*auto/u,
  );
  assert.match(
    battleStyles,
    /\.quiz-battles-header \.battle-dashboard-actions\s*\{[\s\S]*?flex-wrap:\s*wrap/u,
  );
  assert.match(
    battleStyles,
    /@media \(max-width: 760px\)[\s\S]*?\.quiz-mode-shell\.is-battles > \.quiz-battles-header\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/u,
  );
});

test("shows the battle detail sheen only during fine-pointer hover", () => {
  assert.match(
    battleStyles,
    /\.battle-detail\.card::before\s*\{[\s\S]*?opacity:\s*0 !important/u,
  );
  assert.match(
    battleStyles,
    /@media \(hover: hover\) and \(pointer: fine\)\s*\{[\s\S]*?\.battle-detail\.card:hover::before\s*\{[\s\S]*?opacity:\s*0\.38 !important/u,
  );
});

test("displays background-free empty note when there are 0 quiz attempts", () => {
  const appCss = readFileSync(new URL("../App.css", import.meta.url), "utf8");
  assert.match(
    pageSource,
    /\{attempts\.length === 0 \? \(\s*<p className="quiz-history-empty-note">\s*\{isHistoryLoading \? "Loading quiz history\.\.\." : "Your recent quiz attempts appear here\."\}\s*<\/p>\s*\) : \(\s*<section className="card quiz-history-card">/u,
  );
  assert.match(
    appCss,
    /\.quiz-history-empty-note\s*\{[^}]*color:\s*var\(--text-muted\);[^}]*background:\s*transparent;[^}]*border:\s*0;/u,
  );
});
