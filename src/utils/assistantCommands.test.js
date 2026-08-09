import test from "node:test";
import assert from "node:assert/strict";
import { resolveLocalAssistantCommand } from "./assistantCommands.js";

test("keeps material recommendation prompts in AI Chat", () => {
  let navigatedTo = null;
  const result = resolveLocalAssistantCommand(
    "Show me React materials",
    {
      navigate: (route) => { navigatedTo = route; },
    }
  );

  assert.equal(result, null);
  assert.equal(navigatedTo, null);
});

test("continues to handle explicit Materials page navigation locally", () => {
  let navigatedTo = null;
  const result = resolveLocalAssistantCommand(
    "Open the materials page",
    { navigate: (route) => { navigatedTo = route; } }
  );

  assert.equal(navigatedTo, "/resources");
  assert.match(result.response, /Opening Materials/);
});

test("preserves Notes and natural Materials-page navigation", () => {
  const scenarios = [
    ["Show me my notes", "/notes"],
    ["Can you show me the materials page?", "/resources"],
    ["I want to open materials page", "/resources"],
    ["Show materials page for me", "/resources"],
  ];

  scenarios.forEach(([message, expectedRoute]) => {
    let navigatedTo = null;
    const result = resolveLocalAssistantCommand(message, {
      navigate: (route) => { navigatedTo = route; },
    });

    assert.equal(navigatedTo, expectedRoute, message);
    assert.ok(result, message);
  });
});

test("preserves scoped subject metadata when assistant navigation builds a route", () => {
  const scenarios = [
    ["Open materials for Data Analytics", "/resources?subject=data%20analytics"],
    ["Quiz me on Operating Systems", "/quiz?subject=operating%20systems"],
  ];

  scenarios.forEach(([message, expectedRoute]) => {
    let navigatedTo = null;
    const result = resolveLocalAssistantCommand(message, {
      navigate: (route) => { navigatedTo = route; },
    });

    assert.equal(navigatedTo, expectedRoute, message);
    assert.ok(result, message);
  });
});

test("opens Kids Play & Learn using child-friendly aliases", () => {
  const scenarios = ["Open kids zone", "Show me the learning games", "Go to play and learn"];

  scenarios.forEach((message) => {
    let navigatedTo = null;
    const result = resolveLocalAssistantCommand(message, {
      navigate: (route) => { navigatedTo = route; },
    });

    assert.equal(navigatedTo, "/kids", message);
    assert.match(result.response, /Kids Play & Learn/);
  });
});

test("uses account-aware route labels and blocks unavailable assistant navigation", () => {
  let navigatedTo = null;
  const knowledgeQuest = resolveLocalAssistantCommand("Open knowledge quest", {
    availableRoutes: [{
      to: "/kids",
      label: "Knowledge Quest",
      helper: "Daily General Knowledge and personal scores",
    }],
    navigate: (route) => { navigatedTo = route; },
  });

  assert.equal(navigatedTo, "/kids");
  assert.match(knowledgeQuest.response, /Opening Knowledge Quest/);

  navigatedTo = null;
  const unavailableResume = resolveLocalAssistantCommand("Open resume builder", {
    availableRoutes: ["/dashboard", "/learn"],
    navigate: (route) => { navigatedTo = route; },
  });
  assert.equal(unavailableResume, null);
  assert.equal(navigatedTo, null);
});
