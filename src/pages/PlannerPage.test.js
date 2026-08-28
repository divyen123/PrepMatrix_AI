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
    assert.doesNotMatch(hubMarkup, /Study schedule|worktree-container|memory-review-panel/u);

    const scheduleMarkup = renderRoute("/planner/schedule");
    assert.match(scheduleMarkup, /aria-label="Back to Planner workspaces"[^>]*href="\/planner"/u);
    assert.match(scheduleMarkup, /<h2>Study schedule<\/h2>/u);
    assert.doesNotMatch(scheduleMarkup, /worktree-container|memory-review-panel/u);

    const worktreeMarkup = renderRoute("/planner/worktree");
    assert.match(worktreeMarkup, /aria-label="Back to Planner workspaces"[^>]*href="\/planner"/u);
    assert.match(worktreeMarkup, /class="worktree-container card worktree-variant--default/u);
    assert.doesNotMatch(worktreeMarkup, /<h2>Study schedule<\/h2>|memory-review-panel/u);

    const recallMarkup = renderRoute("/planner/recall");
    assert.match(recallMarkup, /aria-label="Back to Planner workspaces"[^>]*href="\/planner"/u);
    assert.match(recallMarkup, /class="memory-review-panel is-standalone"/u);
    assert.match(recallMarkup, /Loading memory checks/u);
    assert.doesNotMatch(recallMarkup, /No memory checks are due right now/u);
    assert.doesNotMatch(recallMarkup, /<h2>Study schedule<\/h2>|worktree-container/u);

    const kidsHubMarkup = renderRoute("/planner", { kidsMode: true });
    assert.equal((kidsHubMarkup.match(/class="planner-hub-card is-/gu) || []).length, 2);
    assert.doesNotMatch(kidsHubMarkup, /href="\/planner\/recall"/u);
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
  assert.match(pageSource, /className=\{`planner-hub-card is-\$\{destination\.id\}`\}/u);
  assert.match(stylesheet, /\.planner-hub-grid \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/u);
  assert.match(stylesheet, /\.planner-hub-card \{[\s\S]*?color-mix[\s\S]*?transition:/u);
  assert.match(stylesheet, /\.planner-hub-card:focus-visible \{[\s\S]*?outline: 3px solid/u);
  assert.match(stylesheet, /@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?\.planner-hub-card:hover/u);
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)/u);
});
