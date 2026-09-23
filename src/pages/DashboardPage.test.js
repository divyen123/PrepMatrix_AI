import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { getDashboardCommandExampleCopy } from "../utils/dashboardCommandExamples.js";
import { runDashboardGoalReminderShortcut } from "../utils/dashboardGoalReminderShortcut.js";
import { getDashboardOverviewCardAction } from "../utils/dashboardOverviewCards.js";

test("routes Planned Tasks through the shared mouse and keyboard card handler", () => {
  const pageSource = readFileSync(new URL("./DashboardPage.jsx", import.meta.url), "utf8");

  assert.deepEqual(
    getDashboardOverviewCardAction("Planned tasks", 0),
    { type: "navigate", route: "/planner/schedule" },
  );
  assert.match(pageSource, /onClick=\{\(\) => handleOverviewCardActivation\(card\)\}/u);
  assert.match(pageSource, /handleOverviewCardActivation\(card\);/u);
});

test("keeps Completed and Remaining cards on the dashboard until a subject exists", () => {
  assert.deepEqual(
    getDashboardOverviewCardAction("Completed", 0),
    { type: "notice", message: "Add a subject first to view your progress." },
  );
  assert.deepEqual(
    getDashboardOverviewCardAction("Remaining", 0),
    { type: "notice", message: "Add a subject first to view your progress." },
  );
  assert.deepEqual(
    getDashboardOverviewCardAction("Completed", 1),
    { type: "navigate", route: "/analytics" },
  );
  assert.deepEqual(
    getDashboardOverviewCardAction("Remaining", 1),
    { type: "navigate", route: "/analytics#topic-progress" },
  );
});

test("uses a centered add-subject empty state for the dashboard Subjects panel", () => {
  const pageSource = readFileSync(new URL("./DashboardPage.jsx", import.meta.url), "utf8");
  const stylesheet = readFileSync(new URL("../App.css", import.meta.url), "utf8");

  assert.match(
    pageSource,
    /subjects\.length === 0 \? \([\s\S]*?className="db-subjects-empty"[\s\S]*?No subjects added yet\.[\s\S]*?className="primary-btn db-subjects-add-btn"[\s\S]*?navigate\("\/subjects#add-subject"\)[\s\S]*?Add subjects/u,
  );
  assert.match(
    pageSource,
    /\) : \([\s\S]*?className="db-subjects-timeline-header"[\s\S]*?Your Subjects[\s\S]*?Open subjects/u,
  );
  assert.match(
    stylesheet,
    /\.db-subjects-empty\s*\{[\s\S]*?justify-items: center;[\s\S]*?text-align: center;/u,
  );
});

test("keeps dashboard action button hovers free of an outside glow", () => {
  const stylesheet = readFileSync(new URL("../App.css", import.meta.url), "utf8");

  assert.match(
    stylesheet,
    /\.db-page \.db-panel-btn:hover\s*\{[\s\S]*?box-shadow: none !important;/u,
  );
  assert.match(
    stylesheet,
    /\.db-page \.db-subjects-add-btn:hover\s*\{[\s\S]*?box-shadow: none !important;/u,
  );
});

test("keeps the dashboard subject-card sweep faint", () => {
  const pageSource = readFileSync(new URL("./DashboardPage.jsx", import.meta.url), "utf8");
  const subjectCardGlow = pageSource.match(
    /<BorderGlow[\s\S]*?className="db-timeline-node"[\s\S]*?>/u,
  )?.[0] || "";

  assert.match(subjectCardGlow, /animated=\{showSubjectsPopup\}/u);
  assert.equal((subjectCardGlow.match(/12%, transparent/gu) || []).length, 3);
  assert.match(subjectCardGlow, /fillOpacity=\{0\.04\}/u);
  assert.match(subjectCardGlow, /glowIntensity=\{0\.18\}/u);
  assert.match(subjectCardGlow, /glowRadius=\{10\}/u);
});

test("keeps the empty-progress notice open when switching progress cards and closes it on a repeat click", () => {
  const pageSource = readFileSync(new URL("./DashboardPage.jsx", import.meta.url), "utf8");
  const stylesheet = readFileSync(new URL("../App.css", import.meta.url), "utf8");
  const panelButtonsIndex = pageSource.indexOf('className="db-panel-buttons"');
  const noticeIndex = pageSource.indexOf('className={`db-overview-notice');

  assert.ok(panelButtonsIndex >= 0 && noticeIndex > panelButtonsIndex);
  assert.match(pageSource, /const \[overviewNoticeSource, setOverviewNoticeSource\] = useState\(null\);/u);
  assert.match(
    pageSource,
    /overviewNoticePhase === "visible" && overviewNoticeSource === card\.label\) \{\s*dismissOverviewNotice\(\);\s*\} else \{\s*showOverviewNotice\(action\.message, card\.label\);/u,
  );
  assert.match(pageSource, /setOverviewNoticeSource\(null\);/u);
  assert.match(
    stylesheet,
    /\.db-overview-notice\s*\{[\s\S]*?margin: 2rem auto 0;[\s\S]*?padding: 0;[\s\S]*?background: transparent;[\s\S]*?border: 0;[\s\S]*?box-shadow: none;[\s\S]*?font-size: 0\.9rem;[\s\S]*?font-weight: 600;[\s\S]*?text-align: center;/u,
  );
  assert.match(stylesheet, /\.db-overview-notice\.is-visible\s*\{[\s\S]*?animation: dbOverviewNoticeIn 220ms/u);
  assert.match(stylesheet, /\.db-overview-notice\.is-closing\s*\{[\s\S]*?animation: dbOverviewNoticeOut 220ms/u);
});

test("renders the locked weekly review as centered background-free copy", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: WeeklyReview } = await vite.ssrLoadModule("/src/components/WeeklyReview.jsx");
    const markup = renderToStaticMarkup(React.createElement(WeeklyReview, {
      completed: [],
      schedule: [],
    }));
    const stylesheet = readFileSync(new URL("../App.css", import.meta.url), "utf8");

    assert.match(markup, /class="weekly-review-empty-state"/u);
    assert.match(markup, /Generate a timetable in Planner to unlock your weekly review\./u);
    assert.doesNotMatch(markup, /weekly-review-card|weekly-review-output/u);
    assert.match(
      stylesheet,
      /\.weekly-review-empty-state\s*\{[^}]*place-items: center;[^}]*background: transparent;[^}]*border: 0;[^}]*box-shadow: none;[^}]*text-align: center;/u,
    );
  } finally {
    await vite.close();
  }
});

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
          {
            description: "Write, run, and debug code",
            label: "CodeMatrix",
            route: "/learn/code-matrix",
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
    assert.match(markup, /CodeMatrix/u);
    assert.match(markup, /Write, run, and debug code/u);
  } finally {
    await vite.close();
  }
});

test("renders a background-free dashboard voice example for the inline helper row", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { DashboardVoiceEntryHint } = await vite.ssrLoadModule(
      "/src/pages/DashboardPage.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(
      DashboardVoiceEntryHint,
      { hint: "Hey PrepMatrix, plan my study day." },
    ));

    assert.match(markup, /class="db-voice-entry-hint"/u);
    assert.match(markup, /--db-voice-hint-duration:5000ms/u);
    assert.match(markup, /<strong>Say<\/strong>/u);
    assert.match(markup, /<q>Hey PrepMatrix, plan my study day\.<\/q>/u);
    assert.doesNotMatch(markup, /gradient|dock/u);
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

test("opens the Goals & To-Do center and consumes its legacy dashboard hash", async () => {
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

test("offers the rotating voice hint once per real app entry and after the splash", () => {
  const appSource = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
  const pageSource = readFileSync(new URL("./DashboardPage.jsx", import.meta.url), "utf8");
  const stylesheet = readFileSync(new URL("../App.css", import.meta.url), "utf8");

  assert.equal(
    (appSource.match(/setDashboardVoiceHintPending\(true\)/gu) || []).length,
    3,
    "login, recovered-session entry, and a background re-entry should each queue a hint",
  );
  assert.match(
    appSource,
    /showEntryVoiceHint=\{dashboardVoiceHintPending\s*&&\s*!entrySplash/u,
  );
  assert.match(
    appSource,
    /document\.addEventListener\("visibilitychange", handleVisibilityChange\)/u,
  );
  assert.match(appSource, /hasDashboardVoiceHintReentryGapElapsed\(hiddenAt, now\)/u);
  assert.match(pageSource, /onEntryVoiceHintConsumed\?\.\(\)/u);
  assert.match(
    pageSource,
    /window\.setTimeout\(\(\) => \{\s*setVoiceEntryHint\(""\);\s*\}, DASHBOARD_VOICE_HINT_DURATION_MS\)/u,
  );
  assert.match(
    stylesheet,
    /\.db-voice-entry-hint\s*\{[^}]*background: none;[^}]*border: 0;[^}]*box-shadow: none;[^}]*backdrop-filter: none;/u,
  );
  assert.match(stylesheet, /@keyframes db-voice-entry-hint-cycle/u);
  assert.match(
    pageSource,
    /<p[\s\S]*className=\{`db-command-help[\s\S]*id=\{searchHelpId\}[\s\S]*role="status"[\s\S]*\{voiceEntryHint \? \(\s*<DashboardVoiceEntryHint hint=\{voiceEntryHint\} \/>/u,
  );
  assert.doesNotMatch(pageSource, /createPortal|DashboardVoiceEntryDock/u);
  assert.match(
    stylesheet,
    /\.db-voice-entry-hint\s*\{[^}]*color: var\(--text-muted\);[^}]*background: none;[^}]*border: 0;[^}]*box-shadow: none;[^}]*backdrop-filter: none;/u,
  );
  assert.match(stylesheet, /\.db-voice-entry-hint > svg\s*\{[^}]*color: var\(--accent\);/u);
  assert.match(stylesheet, /\.db-voice-entry-hint q\s*\{[^}]*color: var\(--text\);/u);
  assert.doesNotMatch(stylesheet, /db-voice-entry-dock|db-voice-entry-gradient-cycle/u);
  assert.match(stylesheet, /\.db-voice-entry-hint > svg\s*\{[^}]*filter: none;/u);
  assert.match(stylesheet, /\.db-voice-entry-hint\s*\{[^}]*text-shadow: none;/u);
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)/u);
});

test("positions weekly review and smart suggestions contents slightly down from panel buttons", () => {
  const pageSource = readFileSync(new URL("./DashboardPage.jsx", import.meta.url), "utf8");
  const stylesheet = readFileSync(new URL("../App.css", import.meta.url), "utf8");

  assert.match(
    pageSource,
    /className="db-panel-inner db-panel-inner--suggestions db-panel-enter"/u,
  );
  assert.match(
    pageSource,
    /className="db-panel-inner db-panel-inner--review db-panel-enter"/u,
  );
  assert.match(
    stylesheet,
    /\.db-panel-inner--suggestions,\s*\.db-panel-inner--review\s*\{[^}]*padding-top:\s*2\.35rem;/u,
  );
  assert.match(
    stylesheet,
    /\.db-panel-inner \.smart-suggestion-card\s*\{[^}]*margin-top:\s*0\.5rem;/u,
  );
  assert.match(
    stylesheet,
    /\.db-panel-inner \.weekly-review-output,\s*\.db-panel-inner \.weekly-review-empty-state\s*\{[^}]*margin-top:\s*0\.5rem;/u,
  );
});

test("omits the empty milestone detail prompt when total tasks is zero", () => {
  const progressSource = readFileSync(new URL("../components/Progressbar1.jsx", import.meta.url), "utf8");

  assert.doesNotMatch(
    progressSource,
    /Add subjects and generate a timetable to unlock milestone tracking/u,
  );
  assert.match(
    progressSource,
    /metrics\.totalTasks === 0\s*\?\s*""/u,
  );
  assert.match(
    progressSource,
    /\{milestoneDetail \? \(\s*<div className="db-progress-milestone-detail">/u,
  );
});
