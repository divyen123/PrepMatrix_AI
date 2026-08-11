import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");

test("gates the medical dashboard destination to medical profiles", () => {
  assert.match(appSource, /getLearningMedicalTrainingEligibility/);
  assert.match(
    appSource,
    /const learningMedicalTrainingEligibility = useMemo\([\s\S]*?getLearningMedicalTrainingEligibility\(/,
  );
  assert.match(
    appSource,
    /learningCareerEligibility\.enabled\s*&&\s*!learningMedicalTrainingEligibility\.enabled\s*\?\s*\["\/learn#placement-prep"\]/,
  );
  assert.match(
    appSource,
    /learningMedicalTrainingEligibility\.enabled\s*\?\s*\["\/learn#medical-training"\]/,
  );
});
