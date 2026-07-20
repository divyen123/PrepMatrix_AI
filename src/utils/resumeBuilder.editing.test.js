import assert from "node:assert/strict";
import test from "node:test";
import { normalizeResumeDraft } from "./resumeBuilder.js";

test("keeps intentionally cleared prefilled fields empty", () => {
  const draft = normalizeResumeDraft(
    {
      personal: { fullName: "", headline: "", email: "" },
      education: [],
    },
    {
      username: "Profile name",
      email: "profile@example.com",
      academicLevel: "Undergraduate / Bachelor's",
    }
  );

  assert.equal(draft.personal.fullName, "");
  assert.equal(draft.personal.email, "");
  assert.deepEqual(draft.education, []);
});

test("normalizes optional links and rejects unsafe URL schemes", () => {
  const draft = normalizeResumeDraft({
    personal: {
      github: "github.com/example",
      linkedin: "javascript:alert(1)",
      portfolio: "https://example.com/work",
    },
  });

  assert.equal(draft.personal.github, "https://github.com/example");
  assert.equal(draft.personal.linkedin, "");
  assert.equal(draft.personal.portfolio, "https://example.com/work");
});
