import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./QuizPage.jsx", import.meta.url), "utf8");
const battleStyles = readFileSync(
  new URL("../components/quiz-battles/QuizBattles.css", import.meta.url),
  "utf8",
);
test("omits the Quiz lab badge and keeps the landing heading", () => {
  assert.doesNotMatch(pageSource, /<span className="section-tag">Quiz lab<\/span>/u);
  assert.match(pageSource, /quizHubActive \? "Practice solo or challenge a friend"/u);
  assert.match(pageSource, /className="quiz-hub-card quiz-hub-card--solo"[\s\S]*?Practice any topic and review your answers\./u);
  assert.match(pageSource, /className="quiz-hub-card quiz-hub-card--battle"[\s\S]*?Challenge friends and compare scores\./u);
});

test("opens quiz subpages from the hub without the old mode buttons", () => {
  assert.doesNotMatch(pageSource, /role="tablist"|quizModeTabs|quiz-battles-header/u);
  assert.match(pageSource, /aria-label="Back to Quiz choices"[\s\S]*?updateQuizRoute\("hub"\)/u);
  assert.match(pageSource, /className=\{\[[\s\S]*?"quiz-mode-shell"[\s\S]*?battleTabActive \? "is-battles" : "is-solo"/u);
  assert.match(pageSource, /id="quiz-panel-battles"[\s\S]*?<QuizBattlesPanel/u);
});

test("keeps the solo quiz panel layout", () => {
  assert.match(pageSource, /className="quiz-builder-header"[\s\S]*?Build a quiz from your exact topic/u);
  assert.match(pageSource, /className="quiz-solo-panel"[\s\S]*?id="quiz-panel-solo"/u);
  assert.match(battleStyles, /\.quiz-solo-panel\s*\{[\s\S]*?display:\s*grid[\s\S]*?gap:\s*18px/u);
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
