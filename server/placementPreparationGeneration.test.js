import test from "node:test";
import assert from "node:assert/strict";
import { placementTopicsRequiringCode } from "./placementPreparationGeneration.js";

test("explicit coding scope works for eligible non-computing learners", () => {
  assert.deepEqual(placementTopicsRequiringCode({
    careerEligibility: { codingRelevant: false },
    targetRole: "Finance analyst",
    requestedTopics: ["Financial ratios", "Python loops", "SQL joins", "Communication"],
  }), ["Python loops", "SQL joins"]);
});

test("role scope supplies coding relevance for foundational programming topics", () => {
  assert.deepEqual(placementTopicsRequiringCode({
    careerEligibility: { codingRelevant: false },
    targetRole: "Software engineering intern",
    requestedTopics: ["Arrays", "Pointers", "Object-oriented classes", "Teamwork"],
  }), ["Arrays", "Pointers", "Object-oriented classes"]);
});

test("computing profiles still keep conceptual interpersonal topics free of required code", () => {
  assert.deepEqual(placementTopicsRequiringCode({
    careerEligibility: { codingRelevant: true },
    targetRole: "Engineering graduate trainee",
    requestedTopics: ["Project communication", "Negotiation", "Linked structures"],
  }), ["Linked structures"]);
});

test("ambiguous vocabulary in non-coding role scope does not force implementation examples", () => {
  assert.deepEqual(placementTopicsRequiringCode({
    careerEligibility: { codingRelevant: false },
    targetRole: "Business analyst",
    requestedTopics: ["Graphs for quarterly results", "Classes of financial assets", "Stakeholder interviews"],
  }), []);
});
