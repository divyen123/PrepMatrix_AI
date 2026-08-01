import test from "node:test";
import assert from "node:assert/strict";
import { filterChatSessionsByTitle } from "./chatHistorySearch.js";

const sessions = [
  { _id: "newest", title: "Linear Algebra Revision" },
  { _id: "middle", title: "Photosynthesis quick notes" },
  { _id: "oldest", title: "World War II quiz" },
];

test("returns every chat in its existing order for a blank search", () => {
  const result = filterChatSessionsByTitle(sessions, "   ");

  assert.deepEqual(result, sessions);
  assert.notStrictEqual(result, sessions);
});

test("matches chat titles case-insensitively and ignores surrounding whitespace", () => {
  assert.deepEqual(
    filterChatSessionsByTitle(sessions, "  PHOTOSYNTHESIS  ").map(({ _id }) => _id),
    ["middle"],
  );
});

test("normalizes repeated whitespace while matching multi-word title searches", () => {
  assert.deepEqual(
    filterChatSessionsByTitle(sessions, "linear    algebra").map(({ _id }) => _id),
    ["newest"],
  );
});

test("preserves the backend order when multiple titles match", () => {
  const overlapping = [
    { _id: "1", title: "Science revision plan" },
    { _id: "2", title: "Math practice" },
    { _id: "3", title: "Science chapter quiz" },
  ];

  assert.deepEqual(
    filterChatSessionsByTitle(overlapping, "science").map(({ _id }) => _id),
    ["1", "3"],
  );
});

test("safely skips sessions with missing or non-string titles", () => {
  const malformed = [
    { _id: "missing" },
    { _id: "null", title: null },
    { _id: "number", title: 42 },
    { _id: "valid", title: "Fractions practice" },
    null,
  ];

  assert.deepEqual(
    filterChatSessionsByTitle(malformed, "fractions").map(({ _id }) => _id),
    ["valid"],
  );
});

test("returns an empty list for invalid session collections or no matches", () => {
  assert.deepEqual(filterChatSessionsByTitle(null, "math"), []);
  assert.deepEqual(filterChatSessionsByTitle(sessions, "organic chemistry"), []);
});
