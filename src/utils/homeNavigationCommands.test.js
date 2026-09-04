import test from "node:test";
import assert from "node:assert/strict";
import {
  GOAL_REMINDER_SHORTCUT_ROUTE,
  HOME_NAVIGATION_DESTINATIONS,
  buildHomeNavigationRoute,
  getGoalReminderShortcutRoutes,
  getHomeNavigationSuggestions,
  normalizeHomeNavigationInput,
  resolveHomeNavigationCommand,
} from "./homeNavigationCommands.js";

const STANDARD_ROUTES = new Set([
  "/dashboard",
  "/subjects",
  "/learn",
  "/planner",
  "/analytics",
  "/notes",
  "/quiz",
  "/exam/about",
  "/exam",
  "/report",
  "/resources",
  "/resume-builder",
  "/settings",
  "/notification-history",
  "/about",
]);
const STANDARD_CONTENT_ROUTES = new Set([
  "/dashboard#smart-suggestions",
  "/dashboard#progress-status",
  "/dashboard#weekly-review",
  GOAL_REMINDER_SHORTCUT_ROUTE,
  "/subjects#subject-library",
  "/learn#subject-mastery",
  "/learn#medical-training",
  "/analytics#topic-progress",
  "/resume-builder#resume-history",
]);

test("uses only real application routes in the destination catalog", () => {
  assert.deepEqual(
    new Set(HOME_NAVIGATION_DESTINATIONS.map(({ route }) => route.split("#", 1)[0])),
    new Set([...STANDARD_ROUTES, "/kids", "/ai-chat"])
  );
  assert.deepEqual(
    HOME_NAVIGATION_DESTINATIONS.filter(({ content }) => content).map(({ route }) => route),
    [
      "/dashboard#smart-suggestions",
      "/dashboard#progress-status",
      "/dashboard#weekly-review",
      GOAL_REMINDER_SHORTCUT_ROUTE,
      "/subjects#subject-library",
      "/learn#subject-mastery",
      "/learn#placement-prep",
      "/learn#medical-training",
      "/analytics#topic-progress",
      "/resume-builder#resume-history",
    ]
  );
});

test("resolves natural navigation commands and common page aliases", () => {
  const cases = [
    ["go to materials", "/resources", "Materials"],
    ["go materials", "/resources", "Materials"],
    ["open the materials page", "/resources", "Materials"],
    ["Please open my planner", "/planner", "Planner"],
    ["show resume builder", "/resume-builder", "Resume Builder"],
    ["take me to the home page", "/dashboard", "Dashboard"],
    ["I want to view my study notes", "/notes", "Notes"],
    ["open exam eligibility", "/exam/about", "Exam Guide"],
    ["visit notification history", "/notification-history", "Alert History"],
  ];

  cases.forEach(([input, route, label]) => {
    const result = resolveHomeNavigationCommand(input, { availableRoutes: STANDARD_ROUTES });
    assert.equal(result?.type, "navigate", input);
    assert.equal(result?.route, route, input);
    assert.equal(result?.label, label, input);
    assert.ok(result.confidence >= 0.7, input);
    assert.equal(result.metadata.normalizedInput, normalizeHomeNavigationInput(input));
  });
});

test("understands content-focused intents without sending text to a remote service", () => {
  const cases = [
    ["find my saved bookmarks", "/resources"],
    ["make me a study timetable", "/planner"],
    ["how am I doing", "/analytics"],
    ["build a study notebook", "/learn"],
    ["take a practice test", "/quiz"],
    ["edit my CV", "/resume-builder"],
    ["turn on wake mode", "/settings"],
    ["what do I have today", "/dashboard"],
    ["what is planned today", "/dashboard"],
    ["what's on my schedule", "/planner"],
    ["where are my saved materials", "/resources"],
  ];

  cases.forEach(([input, route]) => {
    const result = resolveHomeNavigationCommand(input, { availableRoutes: STANDARD_ROUTES });
    assert.equal(result?.route, route, input);
    assert.equal(result?.matchType, "content-intent", input);
  });
});

test("returns subject metadata for explicit Materials and Quiz content commands", () => {
  const materials = resolveHomeNavigationCommand("open materials for Data Analytics", {
    availableRoutes: STANDARD_ROUTES,
  });
  assert.equal(materials?.route, "/resources");
  assert.equal(materials?.matchType, "scoped-content");
  assert.deepEqual(materials?.metadata.query, { subject: "data analytics" });
  assert.equal(
    buildHomeNavigationRoute(materials),
    "/resources?subject=data%20analytics"
  );

  const quiz = resolveHomeNavigationCommand("quiz me on Operating Systems", {
    availableRoutes: STANDARD_ROUTES,
  });
  assert.equal(quiz?.route, "/quiz");
  assert.deepEqual(quiz?.query, { subject: "operating systems" });
  assert.equal(
    buildHomeNavigationRoute(quiz),
    "/quiz?subject=operating%20systems"
  );
  assert.equal(
    buildHomeNavigationRoute({
      route: "/planner",
      query: { subject: "ignored" },
    }),
    "/planner"
  );

  assert.equal(
    resolveHomeNavigationCommand("open materials for React", {
      availableRoutes: ["/planner"],
    }),
    null
  );
});

test("handles likely typing mistakes while keeping deterministic metadata", () => {
  const materials = resolveHomeNavigationCommand("go to materails", { availableRoutes: STANDARD_ROUTES });
  assert.equal(materials?.route, "/resources");
  assert.equal(materials?.matchType, "fuzzy");
  assert.equal(materials?.matchedAlias, "materials");

  const dashboard = resolveHomeNavigationCommand("open dashbord", { availableRoutes: STANDARD_ROUTES });
  assert.equal(dashboard?.route, "/dashboard");
  assert.ok(dashboard?.confidence >= 0.82);
  assert.equal(resolveHomeNavigationCommand("dashbord", { availableRoutes: STANDARD_ROUTES }), null);
});

test("resolves supported page content to stable in-page anchors", () => {
  const cases = [
    ["show smart suggestions", "/dashboard#smart-suggestions"],
    ["check my progress status", "/dashboard#progress-status"],
    ["open weekly review", "/dashboard#weekly-review"],
    ["go to goals", GOAL_REMINDER_SHORTCUT_ROUTE],
    ["open reminders", GOAL_REMINDER_SHORTCUT_ROUTE],
    ["goal reminder", GOAL_REMINDER_SHORTCUT_ROUTE],
    ["browse subject library", "/subjects#subject-library"],
    ["show subject mastery", "/learn#subject-mastery"],
    ["show my topic mastery", "/analytics#topic-progress"],
    ["open resume history", "/resume-builder#resume-history"],
  ];

  cases.forEach(([input, route]) => {
    assert.equal(
      resolveHomeNavigationCommand(input, {
        availableRoutes: new Set([...STANDARD_ROUTES, ...STANDARD_CONTENT_ROUTES]),
      })?.route,
      route,
      input
    );
  });

  assert.equal(
    resolveHomeNavigationCommand("open weekly review", { availableRoutes: ["/planner"] }),
    null
  );
});

test("requires exact account availability for gated content destinations", () => {
  assert.equal(
    resolveHomeNavigationCommand("open reminders", {
      availableRoutes: ["/dashboard"],
    }),
    null
  );
  assert.equal(
    resolveHomeNavigationCommand("open reminders", {
      availableRoutes: ["/dashboard", GOAL_REMINDER_SHORTCUT_ROUTE],
    })?.route,
    GOAL_REMINDER_SHORTCUT_ROUTE
  );

  assert.equal(
    resolveHomeNavigationCommand("open placement prep", {
      availableRoutes: ["/learn"],
    }),
    null
  );
  assert.equal(
    getHomeNavigationSuggestions("placement", {
      availableRoutes: ["/learn"],
    }).length,
    0
  );

  const eligiblePlacement = resolveHomeNavigationCommand("open placement prep", {
    availableRoutes: ["/learn", "/learn#placement-prep"],
  });
  assert.equal(eligiblePlacement?.route, "/learn#placement-prep");
  assert.equal(eligiblePlacement?.metadata.destinationId, "placement-prep");

  ["medical training", "open medical reasoning", "start clinical reasoning", "open health sciences training"]
    .forEach((input) => {
      assert.equal(
        resolveHomeNavigationCommand(input, {
          availableRoutes: ["/learn"],
        }),
        null,
        input,
      );
      const eligibleMedical = resolveHomeNavigationCommand(input, {
        availableRoutes: ["/learn", "/learn#medical-training"],
      });
      assert.equal(eligibleMedical?.route, "/learn#medical-training", input);
      assert.equal(eligibleMedical?.metadata.destinationId, "medical-training", input);
    });
  assert.equal(
    getHomeNavigationSuggestions("clinical reasoning", {
      availableRoutes: ["/learn"],
    }).length,
    0,
  );
  assert.equal(
    resolveHomeNavigationCommand("open placement prep", {
      availableRoutes: ["/learn", "/learn#medical-training"],
    }),
    null,
  );
  assert.equal(
    resolveHomeNavigationCommand("open medical training", {
      availableRoutes: ["/learn", "/learn#placement-prep"],
    }),
    null,
  );

  assert.equal(
    resolveHomeNavigationCommand("open subject mastery", {
      availableRoutes: ["/learn"],
    }),
    null
  );
  assert.equal(
    resolveHomeNavigationCommand("open resume history", {
      availableRoutes: ["/resume-builder"],
    }),
    null
  );
  assert.equal(
    resolveHomeNavigationCommand("start learning", {
      availableRoutes: ["/learn"],
    })?.route,
    "/learn"
  );
  assert.equal(
    resolveHomeNavigationCommand("open resume builder", {
      availableRoutes: ["/resume-builder"],
    })?.route,
    "/resume-builder"
  );
});

test("never resolves or suggests a route unavailable to the current account", () => {
  const schoolRoutes = [...STANDARD_ROUTES].filter((route) => route !== "/resume-builder");

  assert.equal(
    resolveHomeNavigationCommand("create my resume", { availableRoutes: schoolRoutes }),
    null
  );
  assert.equal(
    getHomeNavigationSuggestions("resume", { availableRoutes: schoolRoutes }).length,
    0
  );

  const kidsOnly = resolveHomeNavigationCommand("open kids zone", {
    availableRoutes: (route) => route === "/kids" || route === "/ai-chat",
  });
  assert.equal(kidsOnly?.route, "/kids");
  assert.equal(
    resolveHomeNavigationCommand("open kids AI chat", {
      availableRoutes: (route) => route === "/kids" || route === "/ai-chat",
    })?.route,
    "/ai-chat"
  );
  assert.equal(
    resolveHomeNavigationCommand("open planner", {
      availableRoutes: (route) => route === "/kids",
    }),
    null
  );
});

test("kids dashboard commands can open Subjects and its library without exposing Materials", () => {
  const kidsRoutes = [
    "/dashboard",
    "/kids",
    "/ai-chat",
    "/subjects",
    "/subjects#subject-library",
    "/learn",
    "/planner",
  ];

  assert.equal(
    resolveHomeNavigationCommand("open subjects", { availableRoutes: kidsRoutes })?.route,
    "/subjects",
  );
  assert.equal(
    resolveHomeNavigationCommand("browse subject library", { availableRoutes: kidsRoutes })?.route,
    "/subjects#subject-library",
  );
  assert.equal(
    resolveHomeNavigationCommand("open materials", { availableRoutes: kidsRoutes }),
    null,
  );
  assert.equal(
    resolveHomeNavigationCommand("open reminders", { availableRoutes: kidsRoutes }),
    null,
  );
  assert.equal(
    getHomeNavigationSuggestions("", {
      availableRoutes: kidsRoutes,
      limit: 10,
    }).some(({ route }) => route === GOAL_REMINDER_SHORTCUT_ROUTE),
    false,
  );
});

test("only exposes the Goals & Reminders shortcut when its dialog is available", () => {
  assert.deepEqual(
    getGoalReminderShortcutRoutes({
      hasDashboard: true,
      isKidsLearner: false,
    }),
    [GOAL_REMINDER_SHORTCUT_ROUTE],
  );
  assert.deepEqual(
    getGoalReminderShortcutRoutes({
      hasDashboard: true,
      isKidsLearner: true,
    }),
    [],
  );
  assert.deepEqual(
    getGoalReminderShortcutRoutes({
      hasDashboard: false,
      isKidsLearner: false,
    }),
    [],
  );
});

test("accepts route objects and boolean maps as availability inputs", () => {
  assert.equal(
    resolveHomeNavigationCommand("materials", { availableRoutes: [{ to: "/resources" }] })?.route,
    "/resources"
  );
  assert.equal(
    resolveHomeNavigationCommand("open settings", {
      availableRoutes: { "/settings": true, "/resources": false },
    })?.route,
    "/settings"
  );
  const knowledgeQuest = resolveHomeNavigationCommand("open knowledge quest", {
    availableRoutes: [{
      to: "/kids",
      label: "Knowledge Quest",
      helper: "Daily questions and a private scoreboard",
    }],
  });
  assert.equal(knowledgeQuest?.route, "/kids");
  assert.equal(knowledgeQuest?.label, "Knowledge Quest");
  assert.equal(
    getHomeNavigationSuggestions("knowledge", {
      availableRoutes: [{
        to: "/kids",
        label: "Knowledge Quest",
        helper: "Daily questions and a private scoreboard",
      }],
    })[0]?.description,
    "Daily questions and a private scoreboard"
  );
});

test("maps home aliases to the learner's configured accessible home route", () => {
  const youngLearnerRoutes = ["/dashboard", "/kids", "/learn"];
  assert.equal(
    resolveHomeNavigationCommand("take me home", {
      availableRoutes: youngLearnerRoutes,
      homeRoute: "/kids",
    })?.route,
    "/kids"
  );
  assert.equal(
    resolveHomeNavigationCommand("show home page", {
      availableRoutes: youngLearnerRoutes,
      homeRoute: "/kids",
    })?.route,
    "/kids"
  );
  assert.equal(
    getHomeNavigationSuggestions("show home page", {
      availableRoutes: youngLearnerRoutes,
      homeRoute: "/kids",
    })[0]?.route,
    "/kids"
  );
  assert.equal(
    resolveHomeNavigationCommand("open dashboard", {
      availableRoutes: youngLearnerRoutes,
      homeRoute: "/kids",
    })?.route,
    "/dashboard"
  );
  assert.equal(
    resolveHomeNavigationCommand("home", {
      availableRoutes: ["/dashboard"],
      homeRoute: "/kids",
    })?.route,
    "/dashboard"
  );
  assert.equal(
    getHomeNavigationSuggestions("home", {
      availableRoutes: youngLearnerRoutes,
      homeRoute: "/kids",
    })[0]?.route,
    "/kids"
  );
});

test("ranks autocomplete suggestions and applies a stable limit", () => {
  const suggestions = getHomeNavigationSuggestions("mat", {
    availableRoutes: STANDARD_ROUTES,
    limit: 3,
  });

  assert.equal(suggestions[0]?.route, "/resources");
  assert.equal(suggestions[0]?.label, "Materials");
  assert.ok(suggestions.length <= 3);
  assert.equal(new Set(suggestions.map(({ route }) => route)).size, suggestions.length);
});

test("returns accessible defaults for an empty autocomplete query", () => {
  const suggestions = getHomeNavigationSuggestions("", {
    availableRoutes: ["/planner", "/resources"],
    limit: 5,
  });

  assert.deepEqual(suggestions.map(({ route }) => route), ["/planner", "/resources"]);
  assert.ok(suggestions.every(({ matchType }) => matchType === "default"));

  const prioritized = getHomeNavigationSuggestions("", {
    availableRoutes: STANDARD_ROUTES,
    limit: 4,
  });
  assert.deepEqual(
    prioritized.map(({ route }) => route),
    ["/learn", "/planner", "/resources", "/analytics"]
  );
  assert.equal(
    getHomeNavigationSuggestions("", {
      availableRoutes: STANDARD_ROUTES,
      currentRoute: "/learn",
      limit: 1,
    })[0]?.route,
    "/planner"
  );

  const dashboardShortcuts = getHomeNavigationSuggestions("", {
    availableRoutes: new Set([...STANDARD_ROUTES, ...STANDARD_CONTENT_ROUTES]),
    currentRoute: "/dashboard",
    limit: 6,
  });
  assert.deepEqual(
    dashboardShortcuts.map(({ route }) => route),
    [
      "/learn",
      "/planner",
      GOAL_REMINDER_SHORTCUT_ROUTE,
      "/resources",
      "/analytics",
      "/quiz",
    ],
  );
  assert.equal(dashboardShortcuts[2]?.label, "Goals & Reminders");
});

test("does not hijack ordinary study questions or invent unknown routes", () => {
  [
    "how do I create a resume in HTML",
    "explain how to create a study schedule",
    "how to build a study notebook app",
    "can you explain how to make a quiz",
    "what is the best way to create a resume",
    "why should I create a study schedule",
    "when should I build a study notebook",
    "where can I learn to make a timetable",
    "should I create a resume now",
    "explain material science",
    "Show me React materials",
    "what is a planner algorithm",
    "how do operating systems schedule tasks",
    "go to admin panel",
    "open https example com",
    "",
  ].forEach((input) => {
    assert.equal(
      resolveHomeNavigationCommand(input, { availableRoutes: STANDARD_ROUTES }),
      null,
      input
    );
  });
});
