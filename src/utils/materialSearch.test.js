import test from "node:test";
import assert from "node:assert/strict";
import { buildMaterialSearchUrl, getMaterialSearchOptions } from "./materialSearch.js";

function searchQuery(options) {
  return new URL(buildMaterialSearchUrl(options)).searchParams.get("q");
}

test("unnamed chapters never become generated search options", () => {
  assert.deepEqual(getMaterialSearchOptions({ chapters: 4 }), { chapters: [], topics: [] });
  assert.deepEqual(getMaterialSearchOptions({ chapters: 4, chapterNames: ["", " "] }), { chapters: [], topics: [] });
  assert.deepEqual(getMaterialSearchOptions(), { chapters: [], topics: [] });
  assert.deepEqual(getMaterialSearchOptions(null), { chapters: [], topics: [] });
});

test("chapter and topic choices stay separate for one or multiple configured names", () => {
  assert.deepEqual(getMaterialSearchOptions({
    chapters: 1,
    chapterNames: ["Network models"],
    topics: ["TCP"],
  }), { chapters: ["Network models"], topics: ["TCP"] });
  assert.deepEqual(getMaterialSearchOptions({
    chapters: 4,
    chapterNames: [" Network  models ", "", { title: "Routing" }, "NETWORK MODELS"],
    topics: [" TCP ", { name: "IP  addressing" }, { label: "Subnetting" }, "tcp", "IP addressing"],
  }), { chapters: ["Network models", "Routing"], topics: ["TCP", "IP addressing", "Subnetting"] });
});

test("each group includes a name only when it was explicitly added to that group", () => {
  assert.deepEqual(getMaterialSearchOptions({ chapters: 2, chapterNames: ["Routing"] }), {
    chapters: ["Routing"], topics: [],
  });
  assert.deepEqual(getMaterialSearchOptions({ chapters: 2, topics: ["Routing"] }), {
    chapters: [], topics: ["Routing"],
  });
  assert.deepEqual(getMaterialSearchOptions({ chapters: 1, chapterNames: ["Routing"], topics: ["Routing"] }), {
    chapters: ["Routing"], topics: ["Routing"],
  });
});

test("chapter options respect the configured count and ignore stale names", () => {
  const chapterNames = ["Introduction", "Routing", "Security"];
  assert.deepEqual(getMaterialSearchOptions({ chapters: "2", chapterNames }).chapters, ["Introduction", "Routing"]);
  for (const chapters of [0, -1, "invalid", undefined]) {
    assert.deepEqual(getMaterialSearchOptions({ chapters, chapterNames }).chapters, []);
  }
});

test("institution materials uses the subject and saved institution without academic profile padding", () => {
  assert.equal(searchQuery({
    subjectName: "Linear algebra", institutionName: "Sathyabama", includeInstitution: true,
  }), "Linear algebra Sathyabama materials");
});

test("chapter and topic queries combine the subject with the selected search term", () => {
  assert.equal(searchQuery({ subjectName: "Linear algebra", searchTerm: "Vector spaces" }),
    "Linear algebra Vector spaces materials pdf");
  assert.equal(searchQuery({
    subjectName: "Linear algebra", searchTerm: "Eigenvalues", institutionName: "Sathyabama", includeInstitution: true,
  }), "Linear algebra Eigenvalues Sathyabama materials");
});

test("disabled or missing institution falls back to materials pdf", () => {
  assert.equal(searchQuery({ subjectName: "Networks", institutionName: "Sathyabama" }), "Networks materials pdf");
  assert.equal(searchQuery({ subjectName: "Networks", institutionName: "  ", includeInstitution: true }), "Networks materials pdf");
  assert.equal(searchQuery({ subjectName: "Networks", includeInstitution: true }), "Networks materials pdf");
});

test("searches normalize whitespace and deduplicate whole query parts without altering names", () => {
  assert.equal(searchQuery({
    subjectName: "  Linear\n algebra ", searchTerm: "LINEAR ALGEBRA", institutionName: " Sathyabama\t University ", includeInstitution: true,
  }), "Linear algebra Sathyabama University materials");
  assert.equal(searchQuery({ subjectName: "Materials", searchTerm: "Materials science" }),
    "Materials Materials science materials pdf");
});

test("search URLs safely preserve punctuation and Unicode within a single query parameter", () => {
  const url = new URL(buildMaterialSearchUrl({
    subjectName: "C++ & REST APIs", searchTerm: "#1 / arrays? q=x", institutionName: "Université d'été", includeInstitution: true,
  }));
  assert.equal(url.protocol, "https:");
  assert.equal(url.hostname, "www.google.com");
  assert.equal(url.pathname, "/search");
  assert.equal(url.hash, "");
  assert.deepEqual([...url.searchParams.keys()], ["q"]);
  assert.equal(url.searchParams.get("q"), "C++ & REST APIs #1 / arrays? q=x Université d'été materials");
});
