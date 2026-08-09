import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

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
