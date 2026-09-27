import test from "node:test";
import assert from "node:assert/strict";
import { fetchSubjectBooks, resolveBookRetailers } from "./bookRecommendations.js";

async function withMockFetch(mock, run) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await run();
  } finally {
    globalThis.fetch = previousFetch;
  }
}

function response(docs, ok = true) {
  return { ok, json: async () => ({ docs }) };
}

test("maps real search metadata into relevant books and honest retailer searches", async () => {
  const docs = [
    { key: "/works/OL111W", title: "The Art of Computing", author_name: ["A. Writer"], subject: ["Art"] },
    {
      key: "/works/OL222W",
      title: "Data Structures and Algorithms",
      author_name: ["Alex Author", "R. Editor"],
      description: { value: "A practical guide to data structures and algorithms." },
      subject: ["Computer science", "Data structures", "Algorithms", "Textbooks"],
      cover_i: 12345,
      editions: { docs: [{ key: "/books/OL333M", isbn: ["9780123456789"], edition_name: "Second edition" }] },
    },
    {
      key: "/works/OL444W",
      title: "Practical Data Structures",
      author_name: ["B. Author"],
      first_sentence: ["Explains data structures through examples."],
      subject: ["Algorithms"],
    },
    { key: "/works/OL555W", title: "Data Structures: A Novel", author_name: ["C. Author"], subject: ["Fiction"] },
    { key: "/works/OL222W", title: "Data Structures Duplicate", author_name: ["A. Author"], subject: ["Algorithms"] },
  ];

  await withMockFetch(async (url) => {
    const request = new URL(url);
    assert.equal(request.origin, "https://openlibrary.org");
    assert.equal(request.pathname, "/search.json");
    assert.equal(request.searchParams.get("q"), "Data Structures");
    assert.match(request.searchParams.get("fields"), /description/u);
    return response(docs);
  }, async () => {
    const books = await fetchSubjectBooks("Data Structures");
    assert.equal(books.length, 2);
    assert.equal(books[0].kind, "book");
    assert.equal(books[0].bookId, "OL222W");
    assert.equal(books[0].subject, "Data Structures");
    assert.equal(books[0].author, "Alex Author, R. Editor");
    assert.equal(books[0].description, "A practical guide to data structures and algorithms.");
    assert.equal(books[0].cover, "https://covers.openlibrary.org/b/id/12345-M.jpg?default=false");
    assert.equal(books[0].isbn, "9780123456789");
    assert.equal(books[0].edition, "Second edition");
    assert.deepEqual(books[0].retailers.map(({ name, mode }) => ({ name, mode })), [
      { name: "Amazon", mode: "search" },
      { name: "Flipkart", mode: "search" },
    ]);
    assert.equal(books[0].href, books[0].retailers[0].href);
    assert.equal(new URL(books[0].retailers[0].href).searchParams.get("k"), "Data Structures and Algorithms");
    assert.equal(new URL(books[0].retailers[1].href).searchParams.get("q"), "Data Structures and Algorithms");
    assert.equal(books[1].description, "Explains data structures through examples.");
    assert.equal(books[1].isbn, "");
    assert.equal(books[1].cover, "");
    assert.equal(new URL(books[1].href).searchParams.get("k"), "Practical Data Structures");
  });
});

test("replaces saved ISBN searches without discarding direct product links", () => {
  const retailers = resolveBookRetailers({
    title: "Computer Vision – ECCV 2012",
    isbn: "9783642337154",
    retailers: [
      { name: "Amazon", href: "https://www.amazon.in/s?k=9783642337154", mode: "search" },
      { name: "Flipkart", href: "https://www.flipkart.com/book/exact-edition/p/abc", mode: "product" },
      { name: "Other shop", href: "https://books.example.com/item/123", mode: "product" },
    ],
  });

  assert.equal(new URL(retailers[0].href).searchParams.get("k"), "Computer Vision – ECCV 2012");
  assert.equal(retailers[1].href, "https://www.flipkart.com/book/exact-edition/p/abc");
  assert.equal(retailers[1].mode, "product");
  assert.equal(retailers[2].href, "https://books.example.com/item/123");
});

test("rebuilds both searches for saved books with no author or retailer links", () => {
  const retailers = resolveBookRetailers({ title: "Data Communications & Computer Networks", isbn: "9781118848371" });
  assert.deepEqual(retailers.map(({ name, mode }) => ({ name, mode })), [
    { name: "Amazon", mode: "search" },
    { name: "Flipkart", mode: "search" },
  ]);
  assert.equal(new URL(retailers[0].href).searchParams.get("k"), "Data Communications & Computer Networks");
  assert.equal(new URL(retailers[1].href).searchParams.get("q"), "Data Communications & Computer Networks");
  assert.deepEqual(resolveBookRetailers({ title: "", isbn: "9781118848371" }), []);
});

test("prefers the student's class and caps distinct works at six", async () => {
  const docs = [
    { key: "/works/OL1W", title: "Biology Class 9", author_name: ["Teacher"], subject: ["Biology"] },
    { key: "/works/OL2W", title: "Biology Class 10", author_name: ["Teacher"], subject: ["Biology"] },
    ...Array.from({ length: 10 }, (_, index) => ({
      key: `/works/OL${index + 3}W`,
      title: `Biology Study Guide ${index}`,
      author_name: ["Teacher"],
      subject: ["Biology"],
    })),
  ];

  await withMockFetch(async (url) => {
    assert.equal(new URL(url).searchParams.get("q"), "Biology Class 10");
    return response(docs);
  }, async () => {
    const books = await fetchSubjectBooks("Biology", { grade: "Class 10" });
    assert.equal(books.length, 6);
    assert.equal(books[0].title, "Biology Class 10");
    assert.equal(books.some((book) => book.title === "Biology Class 9"), false);
  });
});

test("does not trust arbitrary URLs or aggregate work ISBNs in search data", async () => {
  await withMockFetch(async () => response([{
    key: "/works/OL456W",
    title: "Neuroscience Textbook",
    author_name: ["Researcher"],
    subject: ["Neuroscience"],
    cover_i: "https://unsafe.example/book.jpg",
    isbn: ["9780000000002"],
    editions: { docs: [{ isbn: ["invalid"] }] },
  }]), async () => {
    const [book] = await fetchSubjectBooks("Neuroscience");
    assert.equal(book.cover, "");
    assert.equal(book.isbn, "");
    assert.equal(new URL(book.href).protocol, "https:");
    assert.equal(new URL(book.href).hostname, "www.amazon.in");
    assert.equal(new URL(book.retailers[1].href).hostname, "www.flipkart.com");
  });
});

test("honors abort signals and does not cache failed responses", async () => {
  const controller = new AbortController();
  controller.abort();
  await withMockFetch(async () => assert.fail("aborted request must not start"), async () => {
    await assert.rejects(fetchSubjectBooks("Quantum Chemistry", {}, { signal: controller.signal }), {
      name: "AbortError",
    });
  });

  let attempts = 0;
  await withMockFetch(async (_url, options) => {
    attempts += 1;
    assert.ok(options.signal);
    return attempts === 1 ? response([], false) : response([]);
  }, async () => {
    const signal = new AbortController().signal;
    await assert.rejects(fetchSubjectBooks("Quantum Chemistry", {}, { signal }), /Unable to load books/u);
    assert.deepEqual(await fetchSubjectBooks("Quantum Chemistry", {}, { signal }), []);
    assert.equal(attempts, 2);
  });
});

test("caches successful searches and returns independent arrays", async () => {
  let calls = 0;
  await withMockFetch(async () => {
    calls += 1;
    return response([{
      key: "/works/OL999W",
      title: "Thermodynamics",
      author_name: ["Scientist"],
      subject: ["Thermodynamics"],
    }]);
  }, async () => {
    const first = await fetchSubjectBooks("Thermodynamics");
    first[0].retailers[0].name = "Changed";
    const second = await fetchSubjectBooks("Thermodynamics");
    assert.equal(calls, 1);
    assert.equal(second[0].retailers[0].name, "Amazon");
  });
});
