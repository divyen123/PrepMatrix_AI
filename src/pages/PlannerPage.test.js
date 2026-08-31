import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

const baseProps = {
  academicProfile: {},
  academicProfileDataId: "academic-profile:test",
  completed: [],
  schedule: [],
  scheduleStartDate: null,
  setCompleted: () => {},
  setSchedule: () => {},
  setScheduleStartDate: () => {},
  subjects: [],
};

test("renders the Planner hub and isolates each workspace on its own subpage", async () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => "true",
      setItem: () => {},
    },
  });

  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: PlannerPage } = await vite.ssrLoadModule(
      "/src/pages/PlannerPage.jsx",
    );
    const renderRoute = (route, props = {}) => renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: [route] },
        React.createElement(PlannerPage, { ...baseProps, ...props }),
      ),
    );

    const hubMarkup = renderRoute("/planner");
    const trailingSlashHubMarkup = renderRoute("/planner/");
    assert.equal((hubMarkup.match(/class="planner-hub-card is-/gu) || []).length, 3);
    assert.equal((trailingSlashHubMarkup.match(/class="planner-hub-card is-/gu) || []).length, 3);
    assert.match(hubMarkup, /href="\/planner\/schedule"[^>]*>[\s\S]*?<strong>Planner<\/strong>/u);
    assert.match(hubMarkup, /href="\/planner\/worktree"[^>]*>[\s\S]*?<strong>Worktree<\/strong>/u);
    assert.match(hubMarkup, /href="\/planner\/recall"[^>]*>[\s\S]*?<strong>Recall session<\/strong>/u);
    assert.doesNotMatch(
      hubMarkup,
      /Open one focused space at a time|Study schedule|worktree-container|memory-review-panel/u,
    );

    const scheduleMarkup = renderRoute("/planner/schedule");
    assert.match(scheduleMarkup, /aria-label="Back to Planner workspaces"[^>]*href="\/planner"/u);
    assert.match(scheduleMarkup, /<span class="section-tag">Schedule<\/span>/u);
    assert.match(scheduleMarkup, /<h2>Study schedule<\/h2>/u);
    assert.doesNotMatch(scheduleMarkup, /worktree-container|memory-review-panel/u);

    const worktreeMarkup = renderRoute("/planner/worktree");
    assert.match(worktreeMarkup, /aria-label="Back to Planner workspaces"[^>]*href="\/planner"/u);
    assert.match(worktreeMarkup, /<span class="section-tag">Worktree<\/span>/u);
    assert.match(worktreeMarkup, /class="worktree-container card worktree-variant--default/u);
    assert.doesNotMatch(worktreeMarkup, /<h2>Study schedule<\/h2>|memory-review-panel/u);

    const recallMarkup = renderRoute("/planner/recall");
    assert.match(recallMarkup, /aria-label="Back to Planner workspaces"[^>]*href="\/planner"/u);
    assert.match(recallMarkup, /<span class="section-tag">Recall session<\/span>/u);
    assert.match(recallMarkup, /class="memory-review-panel is-standalone"/u);
    assert.match(recallMarkup, /Loading memory checks/u);
    assert.doesNotMatch(recallMarkup, /No memory checks are due right now/u);
    assert.doesNotMatch(
      recallMarkup,
      /<h2>Study schedule<\/h2>|worktree-container|Open a due card, answer from memory, and rate your recall honestly\.|Predictive spaced repetition|Three-minute memory checks/u,
    );
    [scheduleMarkup, worktreeMarkup, recallMarkup].forEach((markup) => {
      assert.doesNotMatch(markup, /Planner \/ (?:Schedule|Worktree|Recall session)/u);
    });

    const kidsHubMarkup = renderRoute("/planner", { kidsMode: true });
    assert.equal((kidsHubMarkup.match(/class="planner-hub-card is-/gu) || []).length, 2);
    assert.doesNotMatch(kidsHubMarkup, /href="\/planner\/recall"/u);

    const attentionMarkup = renderRoute("/planner", {
      plannerAttention: { active: true, pendingCount: 2 },
    });
    assert.match(
      attentionMarkup,
      /class="planner-hub-destination is-schedule"[\s\S]*?href="\/planner\/schedule"[\s\S]*?role="status"[\s\S]*?Today&#x27;s schedule is not complete · 2 tasks remaining/u,
    );
    assert.equal((attentionMarkup.match(/role="status"/gu) || []).length, 1);
    assert.doesNotMatch(
      attentionMarkup.match(/class="planner-hub-destination is-worktree"[\s\S]*?<\/div>/u)?.[0] || "",
      /role="status"/u,
    );

    const singularAttentionMarkup = renderRoute("/planner", {
      plannerAttention: { active: true, pendingCount: 1 },
    });
    assert.match(singularAttentionMarkup, /1 task remaining/u);
    assert.doesNotMatch(singularAttentionMarkup, /1 tasks remaining/u);

    const inactiveAttentionMarkup = renderRoute("/planner", {
      plannerAttention: { active: false, pendingCount: 2 },
    });
    assert.doesNotMatch(inactiveAttentionMarkup, /role="status"/u);
  } finally {
    await vite.close();
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else delete globalThis.localStorage;
  }
});

test("registers deep Planner routes and retains accessible themed card behavior", () => {
  const appSource = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
  const pageSource = readFileSync(new URL("./PlannerPage.jsx", import.meta.url), "utf8");
  const stylesheet = readFileSync(new URL("./PlannerPage.css", import.meta.url), "utf8");

  assert.match(appSource, /path="\/planner\/\*"/u);
  assert.match(appSource, /location\.pathname === "\/planner"[\s\S]*?location\.pathname\.startsWith\("\/planner\/"\)[\s\S]*?\? "\/planner"/u);
  assert.match(pageSource, /return <Navigate replace to="\/planner" \/>/u);
  assert.match(pageSource, /kidsMode && plannerView === "recall"/u);
  assert.match(pageSource, /setSchedule\(\(currentSchedule\) => mergeMemoryReviewSchedule\(currentSchedule, \{/u);
  assert.match(pageSource, /<nav aria-label="Planner workspaces"/u);
  assert.match(pageSource, /plannerAttention\?\.active/u);
  assert.match(pageSource, /className="planner-hub-attention-message"/u);
  assert.match(pageSource, /className=\{`planner-hub-card is-\$\{destination\.id\}`\}/u);
  assert.match(stylesheet, /\.planner-hub-grid \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/u);
  assert.match(stylesheet, /\.planner-hub-grid \{[\s\S]*?margin-top: clamp\(28px, 4vh, 48px\);/u);
  assert.match(stylesheet, /\.planner-hub-card \{[\s\S]*?color-mix[\s\S]*?transition:/u);
  assert.match(stylesheet, /\.planner-hub-card:focus-visible \{[\s\S]*?outline: 3px solid/u);
  assert.match(stylesheet, /\.planner-hub-attention-message \{[\s\S]*?var\(--danger\)/u);
  assert.match(stylesheet, /@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\.planner-hub-card:hover/u);
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)/u);
});
