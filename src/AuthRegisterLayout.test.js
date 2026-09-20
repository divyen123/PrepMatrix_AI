import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authSource = readFileSync(new URL("./pages/AuthPage.jsx", import.meta.url), "utf8");
const appStyles = readFileSync(new URL("./App.css", import.meta.url), "utf8");

test("registration omits the introductory subtitle while login keeps its guidance", () => {
  assert.doesNotMatch(
    authSource,
    /Set up your institution, class, and learning path to get personalised quizzes and plans\./u,
  );
  assert.match(
    authSource,
    /!isRegister && <p>Sign in to continue your personalised study journey\.<\/p>/u,
  );
});

test("registration fields retain a modest consistent gap", () => {
  assert.match(
    appStyles,
    /\.auth-card--v2\.auth-card--register \.auth-fields-base,[\s\S]*?\.auth-card--v2\.auth-card--register \.auth-fields-register \{\s*gap: 10px !important;\s*margin-bottom: 10px !important;/u,
  );
});
