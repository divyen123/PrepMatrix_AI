import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const panelSource = readFileSync(new URL("./QuizBattlesPanel.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./QuizBattles.css", import.meta.url), "utf8");

test("opens create, join, and history as separate Quiz Battle views", () => {
  assert.match(panelSource, /const \[battleView, setBattleView\] = useState\(initialInviteCode \? "join" : "hub"\)/u);
  assert.match(panelSource, /className="battle-choice-hub"/u);
  for (const view of ["create", "join", "history"]) {
    assert.match(panelSource, new RegExp(`battle-choice-card--${view}`, "u"));
    assert.match(panelSource, new RegExp(`openBattleView\\("${view}"\\)`, "u"));
  }
  assert.match(panelSource, /\{showHistory && \(loading \?/u);
  assert.match(panelSource, /className="battle-subpage-back"/u);
  assert.doesNotMatch(panelSource, /battle-dashboard-actions|dashboardActionsHost|createPortal/u);
  assert.match(panelSource, /renderGroup\("Completed",[^\n]*grouped\.completed\)/u);
  assert.match(panelSource, /className="battle-form battle-create-form card"/u);
  assert.match(panelSource, /className="battle-form battle-join-form card"/u);
  const createSection = panelSource.slice(panelSource.indexOf("{showCreate && ("), panelSource.indexOf("{showJoin && ("));
  const joinSection = panelSource.slice(panelSource.indexOf("{showJoin && ("), panelSource.indexOf("{showHistory && (loading ? ("));
  assert.doesNotMatch(createSection, /<span className="section-tag">Create a private duel<\/span>/u);
  assert.doesNotMatch(joinSection, /<span className="section-tag">Private invite<\/span>/u);
  assert.match(styles, /\.battle-create-form \{\s*max-width: 760px;/u);
  assert.match(styles, /\.battle-join-form \{[\s\S]*?max-width: 560px;/u);
  assert.match(styles, /\.battle-eligibility \{\s*color: #b45309;\s*margin: 0;\s*\}/u);
});

test("renders ten alphanumeric animated invite slots with an accessible text input", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  try {
    const { default: CodeSlots } = await vite.ssrLoadModule(
      "/src/components/quiz-battles/CodeSlots.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(CodeSlots, {
      ariaLabel: "Battle invite code",
      length: 10,
      value: "abcd234efg",
    }));

    assert.equal((markup.match(/class="code-slots__slot"/gu) || []).length, 10);
    assert.match(markup, /aria-label="Battle invite code"/u);
    assert.match(markup, /inputMode="text"|inputmode="text"/u);
    assert.match(markup, /ABCD234EFG|>A<\/span>/u);
    assert.match(markup, /10 of 10 characters entered/u);
  } finally {
    await vite.close();
  }
});
