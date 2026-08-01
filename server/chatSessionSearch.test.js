import assert from "node:assert/strict";
import test from "node:test";

import {
  CHAT_SESSION_SEARCH_QUERY_MAX_LENGTH,
  buildChatSessionListFilter,
  escapeRegexLiteral,
  normalizeChatSessionSearchQuery,
} from "./chatSessionSearch.js";

test("normalizes chat-session search input by type, whitespace, and length", () => {
  assert.equal(normalizeChatSessionSearchQuery(undefined), "");
  assert.equal(normalizeChatSessionSearchQuery(["math"]), "");
  assert.equal(normalizeChatSessionSearchQuery("   fractions review   "), "fractions review");
  assert.equal(
    normalizeChatSessionSearchQuery(`  ${"a".repeat(CHAT_SESSION_SEARCH_QUERY_MAX_LENGTH + 20)}  `),
    "a".repeat(CHAT_SESSION_SEARCH_QUERY_MAX_LENGTH),
  );
});

test("escapes every regular-expression metacharacter so searches remain literal", () => {
  const input = String.raw`photosynthesis.* + (quiz)? [week-1] ^review$ {2} | \\`;
  const escaped = escapeRegexLiteral(input);

  assert.equal(
    escaped,
    String.raw`photosynthesis\.\* \+ \(quiz\)\? \[week-1\] \^review\$ \{2\} \| \\\\`,
  );
  assert.equal(new RegExp(escaped, "iu").test(input), true);
});

test("builds a user-scoped title and message-text search filter", () => {
  const userId = { id: "user-one" };
  const filter = buildChatSessionListFilter(userId, "  Solar (system)?  ");

  assert.equal(filter.userId, userId);
  assert.deepEqual(filter.$or, [
    { title: { $regex: String.raw`Solar \(system\)\?`, $options: "i" } },
    { "messages.text": { $regex: String.raw`Solar \(system\)\?`, $options: "i" } },
  ]);
});

test("keeps user scoping for an empty query and rejects missing scope", () => {
  assert.deepEqual(buildChatSessionListFilter("user-one", "   "), { userId: "user-one" });
  assert.throws(
    () => buildChatSessionListFilter(undefined, "math"),
    /user ID is required/iu,
  );
});
