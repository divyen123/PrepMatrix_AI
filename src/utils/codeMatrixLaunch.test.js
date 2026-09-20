import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChatCodeMatrixLaunch,
  inferCodeMatrixLanguage,
  normalizeCodeMatrixLaunch,
} from "./codeMatrixLaunch.js";

test("maps supported AI code fences and infers unlabelled executable code", () => {
  assert.equal(inferCodeMatrixLanguage("const answer = 42;", "typescript"), "javascript");
  assert.equal(inferCodeMatrixLanguage("#include <iostream>\nint main() {}"), "cpp");
  assert.equal(inferCodeMatrixLanguage("def total(values):\n    return sum(values)"), "python");
  assert.equal(inferCodeMatrixLanguage("SELECT name FROM students;"), "sql");
  assert.equal(inferCodeMatrixLanguage("hello", "markdown"), "");
});

test("builds only bounded executable AI Chat launches", () => {
  const launch = buildChatCodeMatrixLaunch({
    code: "console.log('Ready');\n",
    language: "js",
  });

  assert.equal(launch.language, "javascript");
  assert.equal(launch.source, "chat");
  assert.equal(launch.code, "console.log('Ready');\n");
  assert.deepEqual(normalizeCodeMatrixLaunch(launch), {
    ...launch,
    notebookId: "",
    returnTo: "",
    topicId: "",
  });
  assert.equal(buildChatCodeMatrixLaunch({ code: "# Heading", language: "markdown" }), null);
  assert.equal(normalizeCodeMatrixLaunch({ source: "chat", language: "python", title: "Python", task: "Run" }), null);
});
