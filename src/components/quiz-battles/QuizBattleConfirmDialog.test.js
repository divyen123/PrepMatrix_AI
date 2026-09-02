import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const ACTIONS = [
  {
    cancelLabel: "Keep battle",
    confirmLabel: "Cancel battle",
    description: "This ends the pending challenge for both learners.",
    kind: "cancel",
    title: "Cancel this battle?",
    tone: "danger",
  },
  {
    cancelLabel: "Not yet",
    confirmLabel: "Start timed attempt",
    description: "Your one-time attempt begins immediately.",
    kind: "start",
    title: "Ready to start?",
    tone: "info",
  },
  {
    cancelLabel: "Review answers",
    confirmLabel: "Submit answers",
    description: "Your answers will be submitted and locked.",
    kind: "submit",
    title: "Lock in your answers?",
    tone: "info",
  },
];

test("renders themeable accessible confirmations for every battle action", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: QuizBattleConfirmDialog } = await vite.ssrLoadModule(
      "/src/components/quiz-battles/QuizBattleConfirmDialog.jsx",
    );

    for (const action of ACTIONS) {
      const markup = renderToStaticMarkup(React.createElement(QuizBattleConfirmDialog, {
        action,
        onCancel() {},
        onConfirm() {},
        open: true,
      }));

      assert.match(markup, /role="alertdialog"/u);
      assert.match(markup, /aria-modal="true"/u);
      assert.match(markup, new RegExp(`aria-labelledby="quiz-battle-confirm-${action.kind}-title"`, "u"));
      assert.match(markup, new RegExp(`aria-describedby="quiz-battle-confirm-${action.kind}-description"`, "u"));
      assert.match(markup, new RegExp(action.title.replace(/[?]/gu, "\\?"), "u"));
      assert.match(markup, new RegExp(action.cancelLabel, "u"));
      assert.match(markup, new RegExp(action.confirmLabel, "u"));
    }
  } finally {
    await vite.close();
  }
});

test("replaces browser confirms and keeps live answer selection neutral", () => {
  const panelSource = readFileSync(new URL("./QuizBattlesPanel.jsx", import.meta.url), "utf8");
  const dialogSource = readFileSync(new URL("./QuizBattleConfirmDialog.jsx", import.meta.url), "utf8");
  const stylesheet = readFileSync(new URL("./QuizBattles.css", import.meta.url), "utf8");

  assert.doesNotMatch(panelSource, /window\.confirm|\bconfirm\(/u);
  assert.match(panelSource, /requestBattleConfirmation\("cancel"\)/u);
  assert.match(panelSource, /requestBattleConfirmation\("start"\)/u);
  assert.match(panelSource, /requestBattleConfirmation\("submit"\)/u);
  assert.match(panelSource, /<QuizBattleConfirmDialog/u);
  assert.match(dialogSource, /createPortal\(content, document\.body\)/u);
  assert.match(dialogSource, /event\.key === "Escape"/u);
  assert.match(dialogSource, /event\.key !== "Tab"/u);
  assert.match(dialogSource, /document\.body\.style\.overflow = "hidden"/u);

  assert.match(stylesheet, /\.battle-option-list label\.is-selected\s*\{[\s\S]*?rgba\(56, 189, 248/u);
  assert.doesNotMatch(
    stylesheet.match(/\.battle-option-list label\.is-selected\s*\{[^}]*\}/u)?.[0] || "",
    /239, 68, 68|34, 197, 94/u,
  );
  const radioReset = stylesheet.match(
    /body \.quiz-page \.battle-option-list input\[type="radio"\]\s*\{[^}]*\}/u,
  )?.[0] || "";
  assert.match(radioReset, /width:\s*18px !important/u);
  assert.match(radioReset, /height:\s*18px !important/u);
  assert.match(radioReset, /padding:\s*0 !important/u);
  assert.match(radioReset, /background:\s*transparent !important/u);
  assert.match(stylesheet, /\.battle-review-option\.is-correct/u);
  assert.match(stylesheet, /\.battle-review-option\.is-incorrect/u);
});

test("uses outcome-aware result tones and keeps XP beside the result action", () => {
  const panelSource = readFileSync(new URL("./QuizBattlesPanel.jsx", import.meta.url), "utf8");
  const stylesheet = readFileSync(new URL("./QuizBattles.css", import.meta.url), "utf8");

  assert.match(panelSource, /function statusPillClassName/u);
  assert.match(panelSource, /is-outcome-\$\{outcome\}/u);
  assert.match(panelSource, /className="battle-card-actions"/u);
  assert.match(panelSource, /battle-card-xp[\s\S]*?View results/u);
  assert.match(stylesheet, /\.battle-status-pill\.is-completed\.is-outcome-win/u);
  assert.match(stylesheet, /\.battle-status-pill\.is-completed\.is-outcome-loss/u);
  assert.match(stylesheet, /\.battle-scoreboard article\.is-winner/u);
  assert.match(stylesheet, /\.battle-scoreboard article\.is-loser/u);
  assert.match(stylesheet, /body\.has-bg-image \.battle-result-hero\.is-outcome-loss/u);
  assert.match(stylesheet, /\.battle-summary-card\.is-terminal\s*\{[\s\S]*?padding:\s*14px/u);
  assert.match(stylesheet, /\.battle-card-actions\s*\{[\s\S]*?display:\s*flex/u);
});

test("shows an accessible non-sticky loading state while result details open", () => {
  const panelSource = readFileSync(new URL("./QuizBattlesPanel.jsx", import.meta.url), "utf8");
  const stylesheet = readFileSync(new URL("./QuizBattles.css", import.meta.url), "utf8");

  assert.match(panelSource, /const openingBattleRef = useRef\(""\)/u);
  assert.match(panelSource, /if \(openingBattleRef\.current\) return null;/u);
  assert.match(panelSource, /openingBattleRef\.current = battleId;[\s\S]*?setBusyAction\(`open:\$\{battleId\}`\)/u);
  assert.match(panelSource, /finally \{[\s\S]*?openingBattleRef\.current = "";[\s\S]*?setBusyAction\(""\)/u);
  assert.match(panelSource, /aria-busy=\{isOpeningThisBattle\}/u);
  assert.match(panelSource, /disabled=\{isOpeningThisBattle\}/u);
  assert.match(panelSource, /<LoaderCircle[^>]*className="battle-card-action-spinner"[\s\S]*?aria-live="polite"[^>]*role="status">Loading results…/u);
  assert.match(stylesheet, /\.battle-card-action-spinner \{[\s\S]*?animation: quiz-battle-action-spin 760ms linear infinite;/u);
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.battle-card-action-spinner/u);
});
