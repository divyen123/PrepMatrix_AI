import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { getDashboardCommandExampleCopy } from "../utils/dashboardCommandExamples.js";
import { runDashboardGoalReminderShortcut } from "../utils/dashboardGoalReminderShortcut.js";

test("renders page shortcuts as an accessible keyboard-selectable list", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { DashboardNavigationSuggestions } = await vite.ssrLoadModule(
      "/src/pages/DashboardPage.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(
      DashboardNavigationSuggestions,
      {
        activeIndex: 1,
        id: "homepage-shortcuts",
        query: "go to mat",
        suggestions: [
          {
            description: "Study materials and saved bookmarks",
            label: "Materials",
            route: "/resources",
          },
          {
            description: "Study plan and scheduled tasks",
            label: "Planner",
            route: "/planner",
          },
        ],
      },
    ));

    assert.match(markup, /role="listbox"/u);
    assert.match(markup, /aria-label="Page shortcuts"/u);
    assert.match(markup, /id="homepage-shortcuts-option-0"/u);
    assert.match(markup, /role="option"/u);
    assert.match(markup, /aria-selected="false"/u);
    assert.match(markup, /aria-selected="true"/u);
    assert.match(markup, /Study materials and saved bookmarks/u);
  } finally {
    await vite.close();
  }
});

test("shows a shortcut row container only for hover or keyboard selection", () => {
  const stylesheet = readFileSync(new URL("../App.css", import.meta.url), "utf8");

  assert.match(
    stylesheet,
    /body \.db-command-menu > button\.db-command-option\s*\{[^}]*border: 1px solid transparent !important;[^}]*background: transparent !important;[^}]*box-shadow: none !important;[^}]*backdrop-filter: none !important;[^}]*transform: none !important;[^}]*transition:[^}]*background 160ms ease,[^}]*border-color 160ms ease,[^}]*transform 160ms ease !important;/u,
  );
  assert.match(
    stylesheet,
    /body \.db-command-menu > button\.db-command-option::after\s*\{[^}]*content: none !important;[^}]*display: none !important;/u,
  );
  assert.match(
    stylesheet,
    /body \.db-command-menu > button\.db-command-option:hover,\s*body \.db-command-menu > button\.db-command-option:focus-visible,\s*body \.db-command-menu > button\.db-command-option--active,\s*body \.db-command-menu > button\.db-command-option\[aria-selected="true"\]\s*\{[^}]*border-color: color-mix\([^}]*!important;[^}]*background: color-mix\([^}]*!important;[^}]*transform: translateX\(2px\) !important;/u,
  );
});

test("renders a helpful AI fallback when no page shortcut matches", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { DashboardNavigationSuggestions } = await vite.ssrLoadModule(
      "/src/pages/DashboardPage.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(
      DashboardNavigationSuggestions,
      {
        id: "homepage-shortcuts",
        query: "explain binary trees",
        suggestions: [],
      },
    ));

    assert.match(markup, /role="status"/u);
    assert.match(markup, /No matching page shortcut/u);
    assert.match(markup, /Press Enter to ask the AI/u);
    assert.match(markup, /explain binary trees/u);
  } finally {
    await vite.close();
  }
});

test("renders an explicit action instead of an AI fallback for the current page", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { DashboardNavigationSuggestions } = await vite.ssrLoadModule(
      "/src/pages/DashboardPage.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(
      DashboardNavigationSuggestions,
      {
        currentRoute: "/dashboard",
        id: "homepage-shortcuts",
        navigationCommand: {
          label: "Dashboard",
          route: "/dashboard",
          type: "navigate",
        },
        query: "dashboard",
        suggestions: [],
      },
    ));

    assert.match(markup, />Dashboard</u);
    assert.match(markup, /You’re already on Dashboard/u);
    assert.doesNotMatch(markup, /No matching page shortcut/u);
    assert.doesNotMatch(markup, /ask the AI about/u);
  } finally {
    await vite.close();
  }
});

test("opens the existing Goals & Reminders center and consumes its dashboard hash", async () => {
  const navigationCalls = [];
  const cancelledFrames = [];
  let openCount = 0;

  const cleanup = runDashboardGoalReminderShortcut({
    cancel: (frame) => cancelledFrames.push(frame),
    location: {
      pathname: "/dashboard",
      search: "?focus=today",
      hash: "#GOALS-REMINDERS",
    },
    navigate: (...args) => navigationCalls.push(args),
    openCenter: () => {
      openCount += 1;
    },
    schedule: (callback) => {
      callback();
      return 42;
    },
  });

  assert.equal(openCount, 1);
  assert.deepEqual(navigationCalls, [[{
    pathname: "/dashboard",
    search: "?focus=today",
    hash: "",
  }, { replace: true }]]);
  cleanup();
  assert.deepEqual(cancelledFrames, [42]);

  assert.equal(
    runDashboardGoalReminderShortcut({
      location: {
        pathname: "/dashboard",
        hash: "#weekly-review",
      },
      openCenter: () => {
        openCount += 1;
      },
    }),
    undefined,
  );
  assert.equal(openCount, 1);
});

test("uses only reachable dashboard command examples", () => {
  const kidsCopy = getDashboardCommandExampleCopy([
    "/dashboard",
    "/subjects",
    "/planner",
  ]);
  const standardCopy = getDashboardCommandExampleCopy([
    "/dashboard",
    "/resources",
    "/subjects",
    "/planner",
  ]);

  assert.match(kidsCopy.placeholder, /go to subjects/u);
  assert.match(kidsCopy.helper, /open planner/u);
  assert.doesNotMatch(`${kidsCopy.placeholder} ${kidsCopy.helper}`, /materials/iu);

  assert.match(standardCopy.placeholder, /go to materials/u);
  assert.match(standardCopy.helper, /go to materials/u);
});
