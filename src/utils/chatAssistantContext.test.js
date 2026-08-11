import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeChatAssistantContext,
  sameChatAssistantContext,
} from "./chatAssistantContext.js";

const context = {
  artifact: "medical-training",
  mode: "education-only",
  notebookId: "507f1f77bcf86cd799439011",
  moduleId: "medical-module-1",
};

test("normalizes only a valid Medical training context and strips extra data", () => {
  assert.deepEqual(normalizeChatAssistantContext({
    ...context,
    patientNotes: "must not cross the boundary",
  }), context);
  assert.equal(normalizeChatAssistantContext({ ...context, mode: "clinical-advice" }), null);
  assert.equal(normalizeChatAssistantContext({ ...context, notebookId: "not-an-id" }), null);
  assert.equal(normalizeChatAssistantContext({ ...context, moduleId: "unsafe module" }), null);
});

test("compares normalized Medical training contexts", () => {
  assert.equal(sameChatAssistantContext(context, { ...context, extra: true }), true);
  assert.equal(sameChatAssistantContext(context, { ...context, moduleId: "medical-module-2" }), false);
  assert.equal(sameChatAssistantContext(null, undefined), true);
  assert.equal(sameChatAssistantContext(context, null), false);
});
