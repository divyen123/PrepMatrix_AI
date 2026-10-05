import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptPlacementPlaceholder,
  buildPlacementScope,
  getPlacementQuickTopics,
  getPlacementTopicSuggestion,
  MAX_PLACEMENT_CREATION_TOPICS,
  MAX_PLACEMENT_TOPIC_CHARS,
  parsePlacementCreationTopics,
} from "./placementCreation.js";

test("role suggestions distinguish coding, analysis, design, and business roles", () => {
  const frontend = getPlacementTopicSuggestion("Frontend developer");
  assert.match(frontend, /CSS layouts/u);
  assert.match(frontend, /JavaScript fundamentals/u);
  const backend = getPlacementTopicSuggestion("Backend engineer");
  assert.match(backend, /Database queries/u);
  assert.doesNotMatch(backend, /CSS layouts/u);
  assert.match(getPlacementTopicSuggestion("Data analyst"), /SQL joins/u);
  assert.match(getPlacementTopicSuggestion("UI/UX designer"), /Wireframes/u);
  assert.match(getPlacementTopicSuggestion("Finance analyst"), /Financial statements/u);
  assert.doesNotMatch(getPlacementTopicSuggestion("Finance analyst"), /Arrays and strings/u);
  assert.match(getPlacementTopicSuggestion("HR specialist"), /Recruitment/u);
});

test("coding suggestions preserve languages named in the role", () => {
  assert.match(getPlacementTopicSuggestion("Java software engineering intern"), /^Java fundamentals/u);
  assert.match(getPlacementTopicSuggestion("Python developer"), /^Python fundamentals/u);
  assert.match(getPlacementTopicSuggestion("JavaScript developer"), /^JavaScript fundamentals/u);
  assert.doesNotMatch(getPlacementTopicSuggestion("JavaScript developer"), /^Java fundamentals/u);
  assert.match(getPlacementTopicSuggestion("C++ programmer"), /^C\+\+ fundamentals/u);
  assert.match(getPlacementTopicSuggestion("C# developer"), /^C# fundamentals/u);
});

test("selected notebook topics define suggestions instead of unrelated role defaults", () => {
  const notebook = { chapters: [{ title: "Networking", topics: [{ title: "TCP/IP" }, { title: "DNS" }, { title: "DNS" }] }] };
  assert.equal(getPlacementTopicSuggestion("Frontend developer", { notebook }), "TCP/IP\nDNS");
  assert.deepEqual(getPlacementQuickTopics("Frontend developer", { notebook }), ["TCP/IP", "DNS"]);
  assert.equal(getPlacementTopicSuggestion("Java developer", { notebook }), "TCP/IP\nDNS");
  assert.equal(getPlacementTopicSuggestion("Engineer", { notebook: { chapters: [{ title: "Fluid mechanics" }, { title: "Thermodynamics" }] } }), "Fluid mechanics\nThermodynamics");
});

test("unknown roles get relevant bounded examples without assuming a software role", () => {
  const topics = getPlacementQuickTopics("Museum curator");
  assert.match(topics[0], /Museum curator/u);
  assert.doesNotMatch(topics.join(" "), /SQL|arrays|software/iu);
  assert.ok(topics.every((title) => title.length <= MAX_PLACEMENT_TOPIC_CHARS));
  assert.ok(getPlacementTopicSuggestion("A".repeat(500)).split("\n").every((title) => title.length <= MAX_PLACEMENT_TOPIC_CHARS));
  assert.match(getPlacementTopicSuggestion(""), /target role/u);
});

test("notebook suggestions and quick add keep bounded distinct topic titles", () => {
  const notebook = { topics: Array.from({ length: 18 }, (_, index) => ({ title: `Topic ${index}` })) };
  assert.equal(getPlacementTopicSuggestion("Analyst", { notebook }).split("\n").length, MAX_PLACEMENT_CREATION_TOPICS);
  assert.equal(getPlacementQuickTopics("Analyst", { notebook }).length, 6);
  assert.deepEqual(parsePlacementCreationTopics("GCD, gcd\nArrays; Ａrrays"), ["GCD", "Arrays"]);
  assert.equal(parsePlacementCreationTopics("A".repeat(141))[0].length, 141, "validation must see oversized user topics rather than silently truncate them");
});

test("empty-field Tab accepts an example without swallowing normal keyboard navigation", () => {
  let prevented = 0;
  const event = { key: "Tab", preventDefault: () => { prevented += 1; } };
  assert.equal(acceptPlacementPlaceholder(event, "", "Backend developer"), true);
  assert.equal(acceptPlacementPlaceholder(event, "   ", "Backend developer"), true);
  assert.equal(acceptPlacementPlaceholder(event, "Back", "Backend developer"), false);
  assert.equal(acceptPlacementPlaceholder({ ...event, shiftKey: true }, "", "Backend developer"), false);
  assert.equal(acceptPlacementPlaceholder({ ...event, ctrlKey: true }, "", "Backend developer"), false);
  assert.equal(acceptPlacementPlaceholder({ ...event, isComposing: true }, "", "Backend developer"), false);
  assert.equal(acceptPlacementPlaceholder({ ...event, key: "Enter" }, "", "Backend developer"), false);
  assert.equal(acceptPlacementPlaceholder(event, "", ""), false);
  assert.equal(prevented, 2);
});

test("source scope requests exact topics and detailed explanations with runnable coding examples", () => {
  const coding = buildPlacementScope("Java software engineer", ["GCD", "Second largest number in an array"]);
  assert.match(coding, /\["GCD","Second largest number in an array"\]/u);
  assert.match(coding, /complete runnable worked solution in Java/u);
  assert.match(coding, /sample inputs and expected outputs/u);
  assert.match(coding, /time and space complexity/u);
  assert.match(coding, /step by step/u);
  const finance = buildPlacementScope("Finance analyst", "Cash flow, Valuation");
  assert.match(finance, /concrete domain examples/u);
  assert.doesNotMatch(finance, /runnable worked solution/u);
  assert.match(buildPlacementScope("Business analyst", "SQL joins"), /runnable worked solution/u);
});
