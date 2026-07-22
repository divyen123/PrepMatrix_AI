import assert from "node:assert/strict";
import test from "node:test";
import { normalizeResumeBuilderState, normalizeResumeDraft } from "./resumeBuilder.js";

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

test("preserves in-progress spaces and blank lines while editing", () => {
  const state = normalizeResumeBuilderState(
    {
      draft: {
        personal: {
          fullName: "Jane ",
          headline: "Frontend ",
          email: "jane@example.com",
          github: "github.com/jane ",
        },
        summary: "I am a frontend developer ",
        skills: ["Data structures ", ""],
        experience: [
          {
            id: "experience-1",
            highlights: ["Built reusable tools ", ""],
          },
        ],
        education: [],
        achievements: [
          {
            id: "achievement-1",
            title: "Hackathon winner ",
            description: "Won a team award ",
          },
        ],
      },
    },
    {},
    { mode: "editing" }
  );

  assert.equal(state.draft.personal.fullName, "Jane ");
  assert.equal(state.draft.personal.github, "github.com/jane ");
  assert.equal(state.draft.summary, "I am a frontend developer ");
  assert.deepEqual(state.draft.skills, ["Data structures ", ""]);
  assert.deepEqual(state.draft.experience[0].highlights, ["Built reusable tools ", ""]);
  assert.equal(state.draft.achievements[0].description, "Won a team award ");

  const finalized = normalizeResumeDraft(state.draft);
  assert.equal(finalized.personal.fullName, "Jane");
  assert.equal(finalized.personal.github, "https://github.com/jane");
  assert.equal(finalized.summary, "I am a frontend developer");
  assert.deepEqual(finalized.skills, ["Data structures"]);
  assert.deepEqual(finalized.experience[0].highlights, ["Built reusable tools"]);
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
