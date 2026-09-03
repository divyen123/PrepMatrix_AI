import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const labSource = readFileSync(new URL("./MedicalTrainingLab.jsx", import.meta.url), "utf8");
const intakeSource = readFileSync(new URL("./MedicalTrainingLabIntake.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./MedicalTrainingLab.css", import.meta.url), "utf8");

test("medical training uses a progressive, non-graded reasoning interaction", () => {
  [
    "Fictional educational scenario",
    "Your reasoning",
    "Your response stays in this browser view unless you choose Save my reasoning.",
    "Save my reasoning",
    "Adding to history...",
    "Hint",
    "Reveal reference reasoning",
    "Conceptual viva checks",
    "Practice next",
  ].forEach((label) => assert.ok(labSource.includes(label), `missing interaction: ${label}`));
  assert.ok(labSource.indexOf("Your reasoning") < labSource.indexOf("Reveal reference reasoning"));
  assert.ok(labSource.includes("answer: answer.trim()"));
  assert.ok(labSource.includes("canAskAI={!isDraft}"));
});

test("medical training keeps privacy and education boundaries visible", () => {
  assert.ok(intakeSource.includes("Fictional or de-identified material only"));
  assert.ok(intakeSource.includes("Do not enter names, records, contact details, images"));
  assert.ok(labSource.includes("not real-person assessment, diagnosis, dosing, treatment"));
  assert.equal(/placement preparation|coding interview/iu.test(`${labSource}\n${intakeSource}`), false);
});

test("medical training has responsive and reduced-motion styles", () => {
  assert.ok(styles.includes("@media (max-width: 700px)"));
  assert.ok(styles.includes("@media (prefers-reduced-motion: reduce)"));
  assert.ok(styles.includes(".medical-reference__body"));
});
