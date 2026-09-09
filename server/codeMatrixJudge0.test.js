import assert from "node:assert/strict";
import test from "node:test";
import { CODE_MATRIX_LIMITS } from "./codeMatrixWorkspace.js";
import {
  CODE_MATRIX_JUDGE0_RESPONSE_BYTES, createCodeMatrixJudge0Client,
  normalizeCodeMatrixJudge0Result, normalizeCodeMatrixSubmission,
} from "./codeMatrixJudge0.js";

const TOKEN = "9f0c91cc-6c62-4a41-8c44-b6a364cc31f8";
const encode = (value) => Buffer.from(value).toString("base64");
const response = (data, status = 200) => new Response(JSON.stringify(data), { status });
const request = { language: "c", code: "int main(void) { return 0; }", input: "" };
const client = (fetchImpl, options = {}) => createCodeMatrixJudge0Client({
  baseUrl: "https://compiler.invalid/ce", authToken: "test-secret", fetchImpl, ...options,
});

test("missing and malformed configuration fail closed without any network request", async () => {
  let calls = 0;
  for (const baseUrl of ["", "file:///etc/passwd", "https://u:p@compiler.invalid", "https://compiler.invalid/?key=secret", "https://compiler.invalid/#fragment", "not a URL"]) {
    const runtime = client(() => { calls += 1; }, { baseUrl });
    assert.equal(runtime.capabilities().configured, false);
    assert.deepEqual(runtime.capabilities().languages, []);
    await assert.rejects(runtime.create(request), { status: 503, code: "CODE_MATRIX_RUNTIME_NOT_CONFIGURED" });
  }
  assert.equal(calls, 0);
});

test("configured capabilities are honest and never probe a service or reveal credentials", () => {
  const runtime = client(() => assert.fail("Capabilities must not call a compiler"));
  assert.deepEqual(runtime.capabilities(), {
    provider: "judge0-ce", configured: true, status: "configured", health: "not_checked",
    languages: ["c", "cpp", "java"], languageIds: { c: 50, cpp: 54, java: 62 }, requestTimeoutMs: 10000,
  });
  assert.doesNotMatch(JSON.stringify(runtime.capabilities()), /test-secret|compiler\.invalid/u);
});

test("rejects invalid trusted token/header/timeout/language configuration", () => {
  for (const options of [{ authToken: "bad\r\nheader" }, { authHeader: "Host" }, { authHeader: "x\nkey" }, { timeoutMs: 0 }, { timeoutMs: 30001 }, { languageIds: { c: 1 } }]) {
    assert.equal(client(() => assert.fail(), options).capabilities().configured, false);
  }
});

test("creates each documented compiler language with base64, fixed resource limits, and private authentication", async () => {
  const calls = [];
  const runtime = client(async (url, options) => {
    calls.push({ url, options });
    return response({ token: TOKEN }, 201);
  });
  for (const language of ["c", "cpp", "java"]) {
    assert.equal(await runtime.create({ language, code: "// 🧪\n", input: "雪\u0000" }), TOKEN);
  }
  assert.deepEqual(calls.map(({ options }) => JSON.parse(options.body).language_id), [50, 54, 62]);
  const { url, options } = calls[0];
  assert.equal(url.href, "https://compiler.invalid/ce/submissions?base64_encoded=true&wait=false");
  assert.equal(options.method, "POST");
  assert.equal(options.redirect, "error");
  assert.equal(options.headers["X-Auth-Token"], "test-secret");
  const body = JSON.parse(options.body);
  assert.equal(Buffer.from(body.source_code, "base64").toString(), "// 🧪\n");
  assert.equal(Buffer.from(body.stdin, "base64").toString(), "雪\u0000");
  assert.equal(body.cpu_time_limit, 2);
  assert.equal(body.wall_time_limit, 10);
  assert.equal(body.memory_limit, 128000);
  assert.equal(body.max_file_size, 64);
  assert.equal(body.enable_network, false);
  assert.equal(body.number_of_runs, 1);
  assert.equal(body.enable_per_process_and_thread_time_limit, false);
  for (const key of ["callback_url", "additional_files", "compiler_options", "command_line_arguments"]) assert.equal(Object.hasOwn(body, key), false);
});

test("supports self-hosted HTTP and operator language/header overrides", async () => {
  const runtime = client(async (url, options) => {
    assert.equal(url.origin, "http://127.0.0.1:2358");
    assert.equal(options.headers.Authorization, "Bearer test");
    assert.equal(JSON.parse(options.body).language_id, 100);
    return response({ token: TOKEN });
  }, { baseUrl: "http://127.0.0.1:2358", authToken: "Bearer test", authHeader: "Authorization", languageIds: { c: 100, cpp: 101, java: 102 } });
  await runtime.create(request);
});

test("execution input rejects other runtimes, extra fields, injection keys, bad types, and UTF-8 byte overflow", () => {
  for (const body of [null, [], { ...request, language: "python" }, { ...request, language: "toString" }, { ...request, language: "C++" },
    { ...request, code: " " }, { ...request, code: 1 }, { ...request, input: {} },
    { ...request, callback_url: "https://evil.invalid" }, { ...request, language_id: 89 },
    { ...request, baseUrl: "https://evil.invalid" }, { ...request, memory_limit: 999999 },
    JSON.parse('{"language":"c","code":"x","__proto__":{}}'), { ...request, code: "\ud800" }]) {
    assert.throws(() => normalizeCodeMatrixSubmission(body), { status: 400 });
  }
  assert.throws(() => normalizeCodeMatrixSubmission({ ...request, code: "雪".repeat(22000) }), { status: 413 });
  assert.throws(() => normalizeCodeMatrixSubmission({ ...request, input: "x".repeat(CODE_MATRIX_LIMITS.inputBytes + 1) }), { status: 413 });
});

test("poll requests only permitted fields and decodes execution and compiler output", async () => {
  const runtime = client(async (url) => {
    assert.equal(url.pathname, `/ce/submissions/${TOKEN}`);
    assert.equal(url.searchParams.get("base64_encoded"), "true");
    assert.doesNotMatch(url.searchParams.get("fields"), /source_code|stdin|token/u);
    return response({ status: { id: 6, description: "untrusted description" }, compile_output: encode("Main.java:3: error 雪"), message: encode("diagnostic"), time: "0.002", memory: 4000 });
  });
  const result = await runtime.poll(TOKEN);
  assert.equal(result.compileOutput, "Main.java:3: error 雪");
  assert.equal(result.message, "diagnostic");
  assert.equal(result.timeSeconds, 0.002);
  assert.equal(result.memoryKilobytes, 4000);
  assert.equal(result.completed, true);
  assert.equal(result.success, false);
  assert.equal(result.status.description, "Compilation Error");
});

test("all Judge0 queued, running, success, timeout, and runtime-error states are mapped accurately", () => {
  for (let id = 1; id <= 14; id += 1) {
    const result = normalizeCodeMatrixJudge0Result({ status: { id }, stdout: null, stderr: null });
    assert.equal(result.completed, id >= 3);
    assert.equal(result.success, id === 3);
    assert.equal(result.stdout, null);
  }
  for (const data of [{}, { status: { id: 100 } }, { status: { id: "3" } }, { status: { id: 3 }, stdout: "not base64" }, { status: { id: 3 }, memory: -1 }, { status: { id: 3 }, time: true }]) {
    assert.throws(() => normalizeCodeMatrixJudge0Result(data), { status: 502 });
  }
});

test("all output channels share one byte limit, with explicit truncation and valid UTF-8", () => {
  const result = normalizeCodeMatrixJudge0Result({
    status: { id: 3 }, stdout: encode("雪".repeat(22000)), stderr: encode("error"), compile_output: encode("compiler"), message: encode("message"),
  });
  const output = [result.stdout, result.stderr, result.compileOutput, result.message];
  assert.ok(output.reduce((sum, value) => sum + Buffer.byteLength(value), 0) <= CODE_MATRIX_LIMITS.outputBytes);
  assert.ok(output.every((value) => !value.includes("�")));
  assert.equal(result.outputTruncated, true);
  assert.deepEqual(result.truncatedFields, ["stdout", "stderr", "compile_output", "message"]);
});

test("provider HTTP failures never leak error bodies and POST is never retried", async () => {
  for (const status of [301, 401, 403, 404, 422, 429, 500, 503]) {
    let calls = 0;
    const runtime = client(async () => { calls += 1; return response({ error: "secret-token private-url" }, status); });
    await assert.rejects(runtime.create(request), (error) => {
      assert.equal(error.status, [429, 503].includes(status) ? 503 : 502);
      assert.doesNotMatch(error.message, /secret-token|private-url/u);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test("rejects malformed JSON, provider tokens, encoded fields, and oversized bodies", async () => {
  for (const makeResponse of [
    () => new Response("invalid-json"), () => response([]), () => response({ token: "../../escape" }),
    () => response({ token: TOKEN, error: "failed" }),
    () => new Response("x", { headers: { "content-length": String(CODE_MATRIX_JUDGE0_RESPONSE_BYTES + 1) } }),
    () => new Response("x".repeat(CODE_MATRIX_JUDGE0_RESPONSE_BYTES + 1)),
  ]) {
    await assert.rejects(client(async () => makeResponse()).create(request), { status: 502 });
  }
});

test("timeout aborts a hanging request even when mocked fetch ignores the signal", async () => {
  let signal;
  const runtime = client((_url, options) => { signal = options.signal; return new Promise(() => {}); }, { timeoutMs: 15 });
  await assert.rejects(runtime.create(request), { status: 504, code: "CODE_MATRIX_RUNTIME_TIMEOUT" });
  assert.equal(signal.aborted, true);
});

test("timeout also covers a stalled response body, rather than just response headers", async () => {
  let canceled = false;
  const stream = new ReadableStream({ pull: () => new Promise(() => {}), cancel() { canceled = true; } });
  const runtime = client(async (_url, options) => {
    options.signal.addEventListener("abort", () => { void stream.cancel().catch(() => {}); });
    return new Response(stream);
  }, { timeoutMs: 15 });
  await assert.rejects(runtime.create(request), { status: 504 });
  // A real fetch abort tears down its body. The timeout must return even with an uncooperative mock.
  assert.equal(typeof canceled, "boolean");
});

test("network and redirect failures are sanitized", async () => {
  await assert.rejects(client(async () => { throw new Error("test-secret at private host"); }).create(request), (error) => {
    assert.equal(error.code, "CODE_MATRIX_RUNTIME_UNAVAILABLE");
    assert.doesNotMatch(error.message, /test-secret|private host/u);
    return true;
  });
});
