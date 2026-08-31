import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("renders a descriptive, non-blocking Quiz Battles status intro", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: QuizBattleIntro } = await vite.ssrLoadModule(
      "/src/components/quiz-battles/QuizBattleIntro.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(QuizBattleIntro, {
      phase: "playing",
    }));

    assert.match(markup, /role="status"/u);
    assert.match(markup, /aria-live="polite"/u);
    assert.match(markup, /aria-busy="true"/u);
    assert.match(markup, /aria-labelledby="quiz-battle-intro-title"/u);
    assert.match(markup, /aria-describedby="quiz-battle-intro-description"/u);
    assert.match(markup, /Asynchronous 1v1/u);
    assert.match(markup, /Challenge a friend to a topic duel/u);
    assert.match(markup, /Preparing Quiz Battles/u);
    assert.doesNotMatch(markup, /role="dialog"|autofocus|<button/u);
  } finally {
    await vite.close();
  }
});

test("uses the intro only at the panel entry boundary and removes the old hero", () => {
  const panelSource = readFileSync(new URL("./QuizBattlesPanel.jsx", import.meta.url), "utf8");
  const pageSource = readFileSync(new URL("../../pages/QuizPage.jsx", import.meta.url), "utf8");

  assert.doesNotMatch(panelSource, /battle-dashboard-hero/u);
  assert.equal((panelSource.match(/<QuizBattleIntro phase=/gu) || []).length, 1);
  assert.ok(
    panelSource.indexOf("if (introState.phase") < panelSource.indexOf("if (selectedBattle)"),
    "the intro must gate both dashboard and deep-linked battle detail content",
  );
  assert.match(panelSource, /refreshList\(\)\.finally[\s\S]*?list_settled/u);
  assert.match(panelSource, /openBattle\(initialBattleId\)\.finally[\s\S]*?battle_settled/u);
  assert.match(panelSource, /dispatchIntro\(\{ type: "invite_settled" \}\)/u);
  assert.match(panelSource, /return \(\) => window\.clearTimeout\(timer\)/u);
  assert.match(pageSource, /battleTabActive \? \([\s\S]*?<QuizBattlesPanel/u);
  assert.match(pageSource, /quizBattleInviteCodeFromHash\(location\.hash\)/u);
});

test("provides staggered text, logo, page reveal, mobile, and reduced-motion styling", () => {
  const stylesheet = readFileSync(new URL("./QuizBattles.css", import.meta.url), "utf8");

  assert.doesNotMatch(stylesheet, /battle-dashboard-hero/u);
  assert.match(stylesheet, /\.quiz-battle-intro\s*\{[\s\S]*?min-height:/u);
  assert.match(stylesheet, /quiz-battle-intro-mark-in/u);
  assert.match(stylesheet, /quiz-battle-intro-copy-in/u);
  assert.match(stylesheet, /\.quiz-battle-intro__eyebrow > span\s*\{[\s\S]*?animation-delay:\s*520ms/u);
  assert.match(stylesheet, /\.quiz-battle-intro h2 > span\s*\{[\s\S]*?animation-delay:\s*700ms/u);
  assert.match(stylesheet, /\.battle-panel-entry\s*\{[\s\S]*?quiz-battle-content-in/u);
  assert.match(stylesheet, /body\.has-bg-image \.quiz-battle-intro__mark/u);
  assert.match(stylesheet, /@media \(max-width: 640px\)[\s\S]*?\.quiz-battle-intro__mark/u);
  assert.match(
    stylesheet,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.quiz-battle-intro__orbit[\s\S]*?animation:\s*none !important/u,
  );
});
