import assert from "node:assert/strict";
import test from "node:test";
import api, { setApiAcademicProfileScope } from "./apiClient.js";

function setup(t, fetchImpl) {
  const previousFetch = globalThis.fetch;
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => "test-token", removeItem() {}, setItem() {} };
  globalThis.fetch = fetchImpl;
  setApiAcademicProfileScope("syllabus-profile");
  t.after(() => {
    globalThis.fetch = previousFetch;
    globalThis.localStorage = previousStorage;
    setApiAcademicProfileScope("");
  });
}
const options = { target: "chapters", subjectName: "Computer networks", chapterCount: 12 };
const response = (payload, status = 200) => ({ status, ok: status === 200, json: async () => payload, headers: { get: () => null } });

test("syllabus API serializes UTF-8 bytes, scope, and an idempotency key", async (t) => {
  let call;
  setup(t, async (url, request) => { call = { url, request }; return response({ items: [{ number: 1, title: "தமிழ்" }], warnings: [] }); });
  const result = await api.importSubjectSyllabus(new File(["Chapter 1: தமிழ்"], "syllabus.txt", { type: "text/plain" }), options);
  assert.equal(call.url.endsWith("/api/subjects/import-syllabus"), true);
  assert.equal(call.request.method, "POST");
  assert.equal(call.request.headers["X-Academic-Profile-Id"], "syllabus-profile");
  assert.match(call.request.headers["Idempotency-Key"], /^[\da-f-]{36}$/u);
  const body = JSON.parse(call.request.body);
  assert.equal(Buffer.from(body.file.dataUrl.split(",")[1], "base64").toString("utf8"), "Chapter 1: தமிழ்");
  assert.equal(body.target, "chapters");
  assert.equal(body.subjectName, "Computer networks");
  assert.equal(body.chapterCount, 12);
  assert.equal(result.items.length, 1);
});

test("syllabus API rejects unsupported, empty, oversized, or cancelled files before a request", async (t) => {
  let calls = 0;
  setup(t, async () => { calls += 1; return response({}); });
  await assert.rejects(api.importSubjectSyllabus(new File(["test"], "file.exe"), options), /Choose a PDF/u);
  await assert.rejects(api.importSubjectSyllabus(new File([], "syllabus.txt"), options), /empty/u);
  await assert.rejects(api.importSubjectSyllabus({ name: "syllabus.txt", size: 11 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(1) }, options), /10 MB/u);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(api.importSubjectSyllabus(new File(["test"], "syllabus.txt"), options, { signal: controller.signal }), { name: "AbortError" });
  assert.equal(calls, 0);
});

test("retrying an unresolved quota request retains the import idempotency key", async (t) => {
  const keys = [];
  setup(t, async (_url, request) => {
    keys.push(request.headers["Idempotency-Key"]);
    return keys.length === 1 ? response({ code: "AI_QUOTA_UNAVAILABLE", error: "Import commit uncertain" }, 503) : response({ items: [{ number: 1, title: "Network fundamentals" }], warnings: [] });
  });
  const file = new File(["Unstructured syllabus text"], "syllabus.txt");
  await assert.rejects(api.importSubjectSyllabus(file, options), /Import commit uncertain/u);
  await api.importSubjectSyllabus(file, options);
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
});

test("dialog cancellation aborts the network request while retaining timeout protection", async (t) => {
  let requestSignal;
  setup(t, (_url, request) => new Promise((_resolve, reject) => {
    requestSignal = request.signal;
    request.signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
  }));
  const controller = new AbortController();
  const pending = api.importSubjectSyllabus(new File(["Unstructured text"], "syllabus.txt"), { ...options, target: "topics" }, { signal: controller.signal });
  while (!requestSignal) await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(requestSignal.aborted, true);
});
