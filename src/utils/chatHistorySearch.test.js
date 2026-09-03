import test from "node:test";
import assert from "node:assert/strict";
import {
  filterChatSessionsByTitle,
  sortChatSessionsPinnedFirst,
} from "./chatHistorySearch.js";

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

test("sorts pinned chats before recent unpinned chats without mutating the input", () => {
  const unsorted = [
    { _id: "recent", updatedAt: "2026-09-03T12:00:00.000Z" },
    { _id: "older-pinned", pinned: true, updatedAt: "2026-09-01T12:00:00.000Z" },
    { _id: "old", updatedAt: "2026-08-31T12:00:00.000Z" },
    { _id: "newer-pinned", pinned: true, updatedAt: "2026-09-02T12:00:00.000Z" },
  ];

  assert.deepEqual(
    sortChatSessionsPinnedFirst(unsorted).map(({ _id }) => _id),
    ["newer-pinned", "older-pinned", "recent", "old"],
  );
  assert.deepEqual(unsorted.map(({ _id }) => _id), [
    "recent",
    "older-pinned",
    "old",
    "newer-pinned",
  ]);
});

test("keeps the existing order when chat timestamps are missing or malformed", () => {
  const malformed = [
    { _id: "first", updatedAt: "not-a-date" },
    { _id: "second" },
    { _id: "string-false", pinned: "false", updatedAt: "2026-09-04T12:00:00.000Z" },
    { _id: "pinned", pinned: true, updatedAt: null },
  ];

  assert.deepEqual(
    sortChatSessionsPinnedFirst(malformed).map(({ _id }) => _id),
    ["pinned", "string-false", "first", "second"],
  );
  assert.deepEqual(sortChatSessionsPinnedFirst(null), []);
});
