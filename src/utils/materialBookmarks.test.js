import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeMaterialBookmark,
  normalizeMaterialBookmarks,
} from "./materialBookmarks.js";

test("normalizes a canonical HTTPS material bookmark", () => {
  const bookmark = normalizeMaterialBookmark({
    academicLevel: "  Undergraduate / Bachelor's  ",
    academicTrack: " Engineering & Technology ",
    description: "  A concise\nreference   guide. ",
    href: "HTTPS://Example.COM:443/guide?q=data%20structures#intro",
    provider: " Example Academy ",
    subject: " Data Structures ",
    title: "  Core Concepts  ",
    id: " bookmark-1 ",
    savedAt: " 2026-07-29T10:00:00.000Z ",
    ignored: "not canonical",
  });

  assert.deepEqual(bookmark, {
    academicLevel: "Undergraduate / Bachelor's",
    academicTrack: "Engineering & Technology",
    description: "A concise reference guide.",
    href: "https://example.com/guide?q=data%20structures#intro",
    provider: "Example Academy",
    subject: "Data Structures",
    title: "Core Concepts",
    id: "bookmark-1",
    savedAt: "2026-07-29T10:00:00.000Z",
  });
});

test("requires a nonempty title and a valid HTTPS URL", () => {
  const invalid = [
    null,
    undefined,
    "bookmark",
    [],
    {},
    { title: "", href: "https://example.com" },
    { title: "   ", href: "https://example.com" },
    { title: "Missing URL" },
    { title: "Invalid URL", href: "not a url" },
    { title: "HTTP only", href: "http://example.com/material" },
    { title: "Protocol relative", href: "//example.com/material" },
    { title: "Script", href: "javascript:alert(1)" },
    { title: "Data", href: "data:text/html,hello" },
  ];

  invalid.forEach((candidate) => {
    assert.equal(normalizeMaterialBookmark(candidate), null);
  });
});

test("rejects HTTPS URLs containing credentials", () => {
  assert.equal(
    normalizeMaterialBookmark({
      title: "Credentialed",
      href: "https://student:secret@example.com/material",
    }),
    null
  );
  assert.equal(
    normalizeMaterialBookmark({
      title: "Username only",
      href: "https://student@example.com/material",
    }),
    null
  );
});

test("allows ordinary HTTPS hosts, paths, ports, queries, and fragments", () => {
  const urls = [
    "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
    "https://university.example.edu:8443/library/item?id=42#chapter-2",
    "https://sub.domain.example.org/a/b/c?mode=study",
  ];

  urls.forEach((href) => {
    const bookmark = normalizeMaterialBookmark({ title: "Reference", href });
    assert.equal(bookmark.href, new URL(href).toString());
  });
});

test("bounds and cleans every canonical string field", () => {
  const noisy = ` \u202E${"x".repeat(2600)}\u0000\n `;
  const bookmark = normalizeMaterialBookmark({
    academicLevel: noisy,
    academicTrack: noisy,
    description: noisy,
    href: "https://example.com/material",
    provider: noisy,
    subject: noisy,
    title: noisy,
    id: noisy,
    savedAt: noisy,
  });

  assert.equal(bookmark.academicLevel.length, 80);
  assert.equal(bookmark.academicTrack.length, 120);
  assert.equal(bookmark.description.length, 500);
  assert.equal(bookmark.provider.length, 80);
  assert.equal(bookmark.subject.length, 120);
  assert.equal(bookmark.title.length, 160);
  assert.equal(bookmark.id.length, 128);
  assert.equal(bookmark.savedAt.length, 64);
  assert.equal(JSON.stringify(bookmark).includes("\u0000"), false);
  assert.equal(JSON.stringify(bookmark).includes("\u202E"), false);
  Object.values(bookmark).forEach((value) => {
    assert.equal(/\s{2,}/u.test(value), false);
  });
});

test("does not generate optional IDs or timestamps", () => {
  const bookmark = normalizeMaterialBookmark({
    title: "No metadata",
    href: "https://example.com/",
  });

  assert.equal(Object.hasOwn(bookmark, "id"), false);
  assert.equal(Object.hasOwn(bookmark, "savedAt"), false);
  assert.equal(bookmark.academicLevel, "");
  assert.equal(bookmark.academicTrack, "");
  assert.equal(bookmark.description, "");
  assert.equal(bookmark.provider, "");
  assert.equal(bookmark.subject, "");
});

test("deduplicates by canonical href while preserving first valid item order", () => {
  const bookmarks = normalizeMaterialBookmarks([
    { title: "First", href: "https://EXAMPLE.com:443" },
    { title: "Duplicate", href: "https://example.com/" },
    { title: "Second", href: "https://example.org/path" },
    { title: "Invalid", href: "http://example.net" },
  ]);

  assert.deepEqual(
    bookmarks.map(({ title, href }) => ({ title, href })),
    [
      { title: "First", href: "https://example.com/" },
      { title: "Second", href: "https://example.org/path" },
    ]
  );
});

test("caps output using maxItems after dropping invalid and duplicate entries", () => {
  const raw = [
    { title: "Invalid", href: "ftp://example.com/a" },
    { title: "One", href: "https://example.com/1" },
    { title: "Duplicate one", href: "https://example.com/1" },
    { title: "Two", href: "https://example.com/2" },
    { title: "Three", href: "https://example.com/3" },
  ];

  assert.deepEqual(
    normalizeMaterialBookmarks(raw, { maxItems: 2 }).map((item) => item.title),
    ["One", "Two"]
  );
  assert.deepEqual(normalizeMaterialBookmarks(raw, { maxItems: 0 }), []);
  assert.deepEqual(normalizeMaterialBookmarks(raw, { maxItems: -4 }), []);
  assert.deepEqual(normalizeMaterialBookmarks(raw, { maxItems: Number.POSITIVE_INFINITY }), []);
});

test("uses a default cap of 200 and accepts only arrays", () => {
  const raw = Array.from({ length: 205 }, (_, index) => ({
    title: `Material ${index}`,
    href: `https://example.com/material/${index}`,
  }));

  assert.equal(normalizeMaterialBookmarks(raw).length, 200);
  assert.deepEqual(normalizeMaterialBookmarks(null), []);
  assert.deepEqual(normalizeMaterialBookmarks({ materials: raw }), []);
});

test("does not mutate source objects or arrays", () => {
  const candidate = {
    title: "  Immutable  ",
    href: "https://EXAMPLE.com:443/path",
  };
  const raw = [candidate];
  const snapshot = JSON.stringify(raw);

  const normalized = normalizeMaterialBookmarks(raw);

  assert.equal(JSON.stringify(raw), snapshot);
  assert.notEqual(normalized, raw);
  assert.notEqual(normalized[0], candidate);
});
