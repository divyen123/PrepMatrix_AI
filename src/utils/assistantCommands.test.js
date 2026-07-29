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
