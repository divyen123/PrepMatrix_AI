import assert from "node:assert/strict";
import test from "node:test";
import { resolveQuizPageView } from "./quizPageView.js";

test("a normal Quiz visit opens the two-choice hub", () => {
  assert.equal(resolveQuizPageView(), "hub");
  assert.equal(resolveQuizPageView({ tab: "hub", hasQuizSession: true }), "hub");
});

test("subject links and saved solo work go straight to Solo quiz", () => {
  for (const state of [
    { tab: "solo" },
    { hasSubject: true },
    { hasQuizSession: true },
    { hasDeferredQuizSession: true },
    { hasQuestions: true },
  ]) {
    assert.equal(resolveQuizPageView(state), "solo");
  }
});

test("battle links and invitations go straight to Quiz Battles", () => {
  for (const state of [
    { tab: "battles" },
    { hasBattleInvite: true, tab: "hub" },
    { hasBattleId: true, hasSubject: true },
  ]) {
    assert.equal(resolveQuizPageView(state), "battles");
  }
});

test("young learners remain in the permitted Solo quiz", () => {
  assert.equal(resolveQuizPageView({ isYoungKidsLearner: true, tab: "battles" }), "solo");
});
