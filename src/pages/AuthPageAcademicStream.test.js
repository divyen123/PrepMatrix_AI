import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("registration requests and submits a stream for Class 11 and Class 12", () => {
  const source = readFileSync(new URL("./AuthPage.jsx", import.meta.url), "utf8");
  const serverSource = readFileSync(new URL("../../server/index.js", import.meta.url), "utf8");

  assert.match(source, /isSeniorSecondaryClass\(form\.grade\)/u);
  assert.match(source, /Stream \/ subject group/u);
  assert.match(source, /registration-senior-stream-options/u);
  assert.match(source, /value=\{form\.schoolStream\}/u);
  assert.match(source, /required[\s\S]*?value=\{form\.schoolStream\}/u);
  assert.match(source, /academicProfilePayload\(form\)/u);

  assert.match(serverSource, /schoolStream,/u);
  assert.match(serverSource, /isSeniorSecondaryClass\(academicProfile\)/u);
  assert.match(serverSource, /Choose or enter the Class 11\/12 stream or subject group\./u);
});
