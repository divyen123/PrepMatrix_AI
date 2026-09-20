import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPlacementCodeMatrixHandoff,
  getPlacementCodeMatrixLanguage,
  normalizePlacementCodeMatrixHandoff,
} from "./placementCodeMatrix.js";

test("chooses an explicit or domain-suited CodeMatrix language for placement work", () => {
  const language = (title, fallbackLanguage = "python") => getPlacementCodeMatrixLanguage({
    fallbackLanguage,
    target: { title },
    topic: { title },
  });

  assert.equal(language("Build a responsive HTML and CSS portfolio"), "html");
  assert.equal(language("Implement a C++ graph traversal"), "cpp");
  assert.equal(language("Create CRUD endpoints with Express.js"), "javascript");
  assert.equal(language("Train a computer vision classifier"), "python");
  assert.equal(language("Implement a Spring Boot controller"), "java");
  assert.equal(language("Optimize a relational database query"), "sql");
  assert.equal(language("Implement a linked list in C"), "c");
  assert.equal(language("Solve a queue problem", "java"), "java");
  assert.equal(language("Solve a queue problem", "unsupported"), "python");
  assert.equal(getPlacementCodeMatrixLanguage({
    fallbackLanguage: "python",
    notebook: { subjectName: "HTML and CSS foundations" },
    target: { title: "Build a React component" },
    topic: { title: "Interactive interface" },
  }), "javascript");
});

test("builds and bounds a placement handoff without accepting non-coding targets", () => {
  const target = {
    id: "placement:api:practice:1",
    metadata: { codingRelevant: true, topicId: "api" },
    title: "Practice: Implement CRUD endpoints with Express.js",
  };
  const handoff = buildPlacementCodeMatrixHandoff({
    fallbackLanguage: "python",
    notebook: { id: "notebook-1", subjectName: "REST API" },
    target,
    topic: { id: "api", title: "API implementation" },
  });

  assert.deepEqual(handoff, {
    id: "placement:api:practice:1",
    language: "javascript",
    notebookId: "notebook-1",
    returnTo: "/learn#placement-prep",
    source: "placement",
    task: "Implement CRUD endpoints with Express.js",
    title: "API implementation",
    topicId: "api",
  });
  assert.deepEqual(normalizePlacementCodeMatrixHandoff(handoff), handoff);
  assert.equal(buildPlacementCodeMatrixHandoff({ target: { metadata: {} } }), null);
  assert.equal(normalizePlacementCodeMatrixHandoff({ source: "placement", title: "Missing task" }), null);
  assert.equal(normalizePlacementCodeMatrixHandoff({ source: "external", title: "A", task: "B" }), null);
});
