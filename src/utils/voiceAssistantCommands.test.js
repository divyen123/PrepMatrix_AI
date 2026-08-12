import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExternalSearchUrl,
  openExternalVoiceUrl,
  resolveVoiceAssistantCommand,
} from "./voiceAssistantCommands.js";

test("turns a natural YouTube search request into one allowlisted external intent", () => {
  const intent = resolveVoiceAssistantCommand(
    'go to youtube and search "photosynthesis for kids"',
  );

  assert.deepEqual(intent, {
    type: "external",
    service: "youtube",
    query: "photosynthesis for kids",
    url: "https://www.youtube.com/results?search_query=photosynthesis+for+kids",
    response: "Searching YouTube for photosynthesis for kids.",
  });
});

test("treats speech-recognition 'ask' as search only after an explicit website command", () => {
  const scenarios = [
    ["go to YouTube and ask REST API.", "REST API"],
    ["open You Tube and then ask for beginner algebra", "beginner algebra"],
  ];

  scenarios.forEach(([spokenText, query]) => {
    const intent = resolveVoiceAssistantCommand(spokenText);
    assert.equal(intent?.type, "external", spokenText);
    assert.equal(intent?.service, "youtube", spokenText);
    assert.equal(intent?.query, query, spokenText);
    const url = new URL(intent?.url);
    assert.equal(url.origin, "https://www.youtube.com", spokenText);
    assert.equal(url.pathname, "/results", spokenText);
    assert.equal(url.searchParams.get("search_query"), query, spokenText);
  });

  assert.equal(resolveVoiceAssistantCommand("ask AI about REST APIs"), null);
  assert.equal(
    resolveVoiceAssistantCommand("ask me whether YouTube has REST API tutorials"),
    null,
  );
});

test("keeps the speech-only ask alias inside explicit website commands", () => {
  const missingQuery = resolveVoiceAssistantCommand("go to YouTube and ask");
  assert.equal(missingQuery.type, "clarify");
  assert.match(missingQuery.response, /what would you like me to search for/iu);

  assert.equal(
    resolveVoiceAssistantCommand("ask YouTube for REST API"),
    null,
  );
  assert.equal(
    resolveVoiceAssistantCommand("go to YouTube and asking about REST API"),
    null,
  );
});
test("understands common natural phrasings for external searches", () => {
  const scenarios = [
    ["search You Tube for Newton's laws", "youtube", "Newton's laws"],
    ["find fractions on youtube", "youtube", "fractions"],
    ["play solar system on YouTube", "youtube", "solar system"],
    ["go to google and then look up Chandrayaan 3", "google", "Chandrayaan 3"],
    ["look up Ada Lovelace using Wikipedia", "wikipedia", "Ada Lovelace"],
  ];

  scenarios.forEach(([spokenText, service, query]) => {
    const intent = resolveVoiceAssistantCommand(spokenText);
    assert.equal(intent?.type, "external", spokenText);
    assert.equal(intent?.service, service, spokenText);
    assert.equal(intent?.query, query, spokenText);
    assert.equal(new URL(intent.url).protocol, "https:", spokenText);
  });
});

test("opens allowlisted service home pages without inventing transcript URLs", () => {
  const scenarios = [
    ["please open youtube now", "youtube", "https://www.youtube.com/"],
    ["visit Google", "google", "https://www.google.com/"],
    ["take me to wiki", "wikipedia", "https://en.wikipedia.org/"],
  ];

  scenarios.forEach(([spokenText, service, url]) => {
    assert.deepEqual(resolveVoiceAssistantCommand(spokenText), {
      type: "external",
      service,
      query: "",
      url,
      response: `Opening ${service === "youtube" ? "YouTube" : service === "google" ? "Google" : "Wikipedia"}.`,
    });
  });
});

test("asks for a missing search phrase without opening a website", () => {
  const intent = resolveVoiceAssistantCommand("go to YouTube and search");

  assert.equal(intent.type, "clarify");
  assert.match(intent.response, /what would you like me to search for on youtube/i);
  assert.equal("url" in intent, false);
});

test("blocks external commands while young-learner protection is active", () => {
  const intent = resolveVoiceAssistantCommand("search youtube for volcanoes", {
    allowExternalNavigation: false,
  });

  assert.equal(intent.type, "clarify");
  assert.match(intent.response, /grown-up.*unlock Parent Corner/i);
  assert.equal("url" in intent, false);
});

test("encodes untrusted search text as one query parameter", () => {
  const rawQuery = "javascript:alert(1)&redirect=https://evil.test/\r\nnext";
  const value = buildExternalSearchUrl("youtube", rawQuery);
  const url = new URL(value);

  assert.equal(url.origin, "https://www.youtube.com");

  assert.equal(url.pathname, "/results");
  assert.equal(
    url.searchParams.get("search_query"),
    "javascript:alert(1)&redirect=https://evil.test/ next",
  );
  assert.equal(url.searchParams.has("redirect"), false);
  assert.equal(value.includes("evil.test/&redirect="), false);
});

test("asks for clarification when one command names multiple websites", () => {
  const intent = resolveVoiceAssistantCommand("search YouTube and Google for algebra");

  assert.equal(intent.type, "clarify");
  assert.match(intent.response, /more than one website/i);
  assert.equal("url" in intent, false);
});

test("allows another service name to be ordinary search text", () => {
  const intent = resolveVoiceAssistantCommand("search YouTube for Google Earth lessons");

  assert.equal(intent.type, "external");
  assert.equal(intent.service, "youtube");
  assert.equal(intent.query, "Google Earth lessons");
});

test("rejects unknown services and empty search text", () => {
  assert.equal(buildExternalSearchUrl("untrusted", "query"), "");
  assert.equal(buildExternalSearchUrl("youtube", "   "), "");
});

test("preserves account-aware internal navigation and AI Chat behavior", () => {
  assert.deepEqual(
    resolveVoiceAssistantCommand("please open planner", {
      availableRoutes: ["/dashboard", "/planner", "/ai-chat"],
    }),
    {
      type: "navigate",
      route: "/planner",
      response: "Opening Planner.",
    },
  );

  assert.deepEqual(
    resolveVoiceAssistantCommand("open ai chat", {
      availableRoutes: ["/dashboard", "/ai-chat"],
    }),
    { type: "chat", response: "Opening AI Chat." },
  );

  assert.equal(
    resolveVoiceAssistantCommand("open resume builder", {
      availableRoutes: ["/dashboard", "/planner"],
    }),
    null,
  );
});

test("does not mistake explanatory questions for commands", () => {
  assert.equal(resolveVoiceAssistantCommand("explain how to go to planner"), null);
  assert.equal(resolveVoiceAssistantCommand("how do I search YouTube for fractions?"), null);
  assert.equal(resolveVoiceAssistantCommand("is YouTube useful for learning algebra?"), null);
});

test("creates deterministic scroll and theme intents", () => {
  assert.deepEqual(resolveVoiceAssistantCommand("scroll down", { viewportHeight: 900 }), {
    type: "scroll",
    mode: "by",
    top: 675,
    response: "Scrolling down.",
  });
  assert.equal(
    resolveVoiceAssistantCommand("move the page up", { viewportHeight: 100 }).top,
    -240,
  );
  assert.deepEqual(resolveVoiceAssistantCommand("go to the top"), {
    type: "scroll",
    mode: "to",
    top: 0,
    response: "Going to the top.",
  });
  assert.equal(resolveVoiceAssistantCommand("go to the bottom").top, Number.MAX_SAFE_INTEGER);
  assert.deepEqual(resolveVoiceAssistantCommand("switch to dark mode"), {
    type: "theme",
    darkMode: true,
    response: "Dark theme enabled.",
  });
});

test("safe opener accepts only the HTTPS origins and paths produced by the parser", () => {
  const location = {
    assigned: "",
    assign(value) {
      this.assigned = value;
    },
  };

  assert.equal(
    openExternalVoiceUrl(
      "https://www.youtube.com/results?search_query=safe+study",
      location,
    ),
    true,
  );
  assert.equal(
    location.assigned,
    "https://www.youtube.com/results?search_query=safe+study",
  );

  const rejected = [
    "javascript:alert(1)",
    "http://www.youtube.com/results?search_query=unsafe",
    "https://www.youtube.com.evil.test/results?search_query=unsafe",
    "https://www.youtube.com/watch?v=unsafe",
    "https://evil.test/",
    "not a URL",
  ];

  rejected.forEach((url) => {
    location.assigned = "unchanged";
    assert.equal(openExternalVoiceUrl(url, location), false, url);
    assert.equal(location.assigned, "unchanged", url);
  });
  assert.equal(openExternalVoiceUrl("https://www.google.com/", {}), false);
});
