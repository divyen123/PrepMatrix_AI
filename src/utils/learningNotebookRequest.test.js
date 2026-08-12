import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { LEARNING_NOTEBOOK_REQUEST_TIMEOUT_MS } from "./learningNotebookRequest.js";

const kidsPageSource = readFileSync(
  new URL("../pages/KidsStartLearningPage.jsx", import.meta.url),
  "utf8",
);
const standardPageSource = readFileSync(
  new URL("../pages/StartLearningPage.jsx", import.meta.url),
  "utf8",
);

test("lesson generation waits safely beyond the server generation deadline", () => {
  assert.ok(LEARNING_NOTEBOOK_REQUEST_TIMEOUT_MS >= 195_000);
  assert.ok(LEARNING_NOTEBOOK_REQUEST_TIMEOUT_MS > 180_000);
});

test("kids and standard lesson generation use the shared request timeout", () => {
  for (const source of [kidsPageSource, standardPageSource]) {
    assert.match(
      source,
      /timeoutMs:\s*LEARNING_NOTEBOOK_REQUEST_TIMEOUT_MS/u,
    );
  }
});
