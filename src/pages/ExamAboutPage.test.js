import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./ExamAboutPage.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./ExamAboutPage.css", import.meta.url), "utf8");

test("Exam guide removes decorative badge labels while keeping section titles", () => {
  assert.doesNotMatch(page, /exam-guide-kicker|Component 0[1-6]/u);
  assert.doesNotMatch(page, /Online exam limits|Recommended workflow|Privacy \+ exam behavior|Exam workspace guide/u);
  assert.doesNotMatch(styles, /exam-guide-kicker/u);

  for (const title of [
    "Everything enforced during an attempt",
    "Set up, attempt, and review",
    "Attend Exam",
    "Distraction-Aware Focus Room",
    "Generate Question Paper",
    "View Results",
    "Offline Exam Timer",
    "Saved Papers & Exports",
    "Advisory only, never recorded",
  ]) {
    assert.ok(page.includes(title), `Missing section title: ${title}`);
  }
});
