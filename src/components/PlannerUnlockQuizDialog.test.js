import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import {
  buildPlannerUnlockQuizRequest,
  normalizePlannerUnlockTopicDetails,
  normalizePlannerUnlockQuestions,
  scorePlannerUnlockQuiz,
} from "../utils/plannerUnlockQuiz.js";

function makeQuestions() {
  return Array.from({ length: 10 }, (_, index) => ({
    answerIndex: index % 4,
    explanation: "Explanation " + (index + 1),
    id: "question-" + (index + 1),
    options: ["A", "B", "C", "D"],
    question: "Question " + (index + 1),
  }));
}

const context = {
  sourceDayNumber: 1,
  sourceTaskSignature: "v1-source",
  targetDayNumber: 2,
  topics: ["Fractions", "Decimals"],
};

test("planner unlock scoring passes at 8 of 10 and rejects malformed question sets", () => {
  const questions = makeQuestions();
  const eightCorrect = Object.fromEntries(
    questions.map((question, index) => [
      index,
      index < 8 ? question.answerIndex : (question.answerIndex + 1) % 4,
    ]),
  );
  const sevenCorrect = {
    ...eightCorrect,
    7: (questions[7].answerIndex + 1) % 4,
  };

  assert.deepEqual(scorePlannerUnlockQuiz(questions, eightCorrect), {
    passed: true,
    percentage: 80,
    score: 8,
    total: 10,
  });
  assert.deepEqual(scorePlannerUnlockQuiz(questions, sevenCorrect), {
    passed: false,
    percentage: 70,
    score: 7,
    total: 10,
  });
  assert.equal(normalizePlannerUnlockQuestions(questions).length, 10);
  assert.deepEqual(normalizePlannerUnlockQuestions(questions.slice(0, 9)), []);
  assert.deepEqual(normalizePlannerUnlockQuestions([
    ...questions.slice(0, 9),
    { ...questions[9], options: ["A", "B"] },
  ]), []);
  assert.deepEqual(normalizePlannerUnlockQuestions([
    ...questions.slice(0, 9),
    { ...questions[9], options: ["A", "A", "C", "D"] },
  ]), []);
  assert.deepEqual(normalizePlannerUnlockQuestions([
    ...questions.slice(0, 9),
    { ...questions[9], answerIndex: null },
  ]), []);
  assert.deepEqual(normalizePlannerUnlockQuestions([
    ...questions.slice(0, 9),
    { ...questions[9], question: questions[0].question },
  ]), []);
});

test("custom topic details enrich generic chapter quiz requests", () => {
  const genericContext = {
    needsTopicDetails: true,
    sourceDayNumber: 1,
    subjectName: "RestAPI, Cloud, Data analytics",
    topic: "RestAPI — Chapter 1; Cloud — Chapter 2; Data analytics — Chapter 1",
    topics: [
      "RestAPI — Chapter 1",
      "Cloud — Chapter 2",
      "Data analytics — Chapter 1",
    ],
  };
  const normalized = normalizePlannerUnlockTopicDetails(
    "  REST authentication, cloud deployment, and dashboard charts  ",
  );
  const request = buildPlannerUnlockQuizRequest(genericContext, normalized);

  assert.equal(
    normalized,
    "REST authentication, cloud deployment, and dashboard charts",
  );
  assert.equal(request.customTopicDetails, normalized);
  assert.equal(request.subjectName, genericContext.subjectName);
  assert.match(request.topic, /RestAPI.*Chapter 1/iu);
  assert.match(request.topic, /REST authentication/iu);

  const inferredOnly = buildPlannerUnlockQuizRequest(context, "   ");
  assert.equal(inferredOnly.customTopicDetails, "");
  assert.match(inferredOnly.topic, /Fractions.*Decimals/iu);
});

test("planner unlock dialog explains eligibility and never starts a blocked quiz", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: PlannerUnlockQuizDialog } = await vite.ssrLoadModule(
      "/src/components/PlannerUnlockQuizDialog.jsx",
    );
    const eligibleMarkup = renderToStaticMarkup(React.createElement(
      PlannerUnlockQuizDialog,
      {
        canAttempt: true,
        context,
        sessionKey: "eligible",
      },
    ));
    const blockedMarkup = renderToStaticMarkup(React.createElement(
      PlannerUnlockQuizDialog,
      {
        canAttempt: false,
        context,
        sessionKey: "blocked",
      },
    ));
    const detailsRequiredMarkup = renderToStaticMarkup(React.createElement(
      PlannerUnlockQuizDialog,
      {
        canAttempt: true,
        context: { ...context, needsTopicDetails: true },
        sessionKey: "details-required",
      },
    ));

    assert.match(eligibleMarkup, /role="dialog"/u);
    assert.match(eligibleMarkup, /aria-modal="true"/u);
    assert.match(eligibleMarkup, /Unlock Day 2/u);
    assert.match(eligibleMarkup, /Start 10-question quiz/u);
    assert.match(eligibleMarkup, />Fractions</u);
    assert.match(eligibleMarkup, />Decimals</u);
    assert.match(eligibleMarkup, /scheduled date/u);
    assert.match(eligibleMarkup, /Topic or chapter details/u);
    assert.match(eligibleMarkup, /aria-required="false"/u);
    assert.match(
      eligibleMarkup,
      /placeholder="e\.g\. REST API: HTTP methods; Cloud: IAM and regions"/u,
    );
    const startButton = eligibleMarkup.match(
      /<button class="planner-unlock-quiz-primary planner-unlock-quiz-start"[^>]*>[\s\S]*?Start 10-question quiz[\s\S]*?<\/button>/u,
    )?.[0] || "";
    assert.doesNotMatch(startButton, /disabled=/u);

    assert.match(blockedMarkup, /Finish Day 1 first/u);
    assert.doesNotMatch(blockedMarkup, /Start 10-question quiz/u);

    assert.match(detailsRequiredMarkup, /Topic or chapter details<span>Required<\/span>/u);
    assert.match(detailsRequiredMarkup, /aria-required="true"/u);
    assert.match(detailsRequiredMarkup, /Start 10-question quiz/u);
    assert.match(
      detailsRequiredMarkup,
      /<button class="planner-unlock-quiz-primary planner-unlock-quiz-start" disabled=""/u,
    );
  } finally {
    await vite.close();
  }
});

test("planner unlock dialog is portaled above scroll-clipped planner cards", async () => {
  const styles = await readFile(
    new URL("./PlannerUnlockQuizDialog.css", import.meta.url),
    "utf8",
  );

  assert.match(
    styles,
    /\.planner-unlock-quiz-backdrop\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*3200;/su,
  );
  assert.match(
    styles,
    /\.planner-unlock-quiz-dialog\s*\{[^}]*max-height:[^;]+;[^}]*overflow:\s*hidden;/su,
  );
  const primaryButtonRule = styles.match(
    /body \.planner-unlock-quiz-dialog \.planner-unlock-quiz-primary\s*\{[^}]*\}/su,
  )?.[0] || "";
  assert.match(primaryButtonRule, /color:\s*var\(--text\)\s*!important;/u);
  assert.match(
    primaryButtonRule,
    /background:\s*rgba\(var\(--accent-rgb[^;]+0\.16\)\s*!important;/u,
  );
  assert.doesNotMatch(primaryButtonRule, /background:\s*var\(--accent\)/u);
  assert.match(
    styles,
    /body \.planner-unlock-quiz-dialog \.planner-unlock-quiz-primary:disabled,[\s\S]*?\{[^}]*color:\s*var\(--text-muted\)\s*!important;[^}]*background:[^}]*opacity:\s*0\.62\s*!important;/u,
  );
  assert.match(
    styles,
    /body \.planner-unlock-quiz-dialog \.planner-unlock-quiz-primary::after,[\s\S]*?\{[^}]*content:\s*none\s*!important;/u,
  );
});
