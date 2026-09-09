import { createHash } from "node:crypto";
import { CODE_MATRIX_LIMITS, CodeMatrixError, codeMatrixObject, codeMatrixText } from "./codeMatrixWorkspace.js";

// Judge0 CE API documentation: https://ce.judge0.com/#submissions
// Defaults are documented CE IDs; operators can override them for their deployment.
export const CODE_MATRIX_JUDGE0_LANGUAGE_IDS = Object.freeze({ c: 50, cpp: 54, java: 62 });
export const CODE_MATRIX_JUDGE0_RESPONSE_BYTES = 512 * 1024;
const STATUSES = Object.freeze([
  null, "In Queue", "Processing", "Accepted", "Wrong Answer", "Time Limit Exceeded",
  "Compilation Error", "Runtime Error (SIGSEGV)", "Runtime Error (SIGXFSZ)",
  "Runtime Error (SIGFPE)", "Runtime Error (SIGABRT)", "Runtime Error (NZEC)",
  "Runtime Error (Other)", "Internal Error", "Exec Format Error",
]);
const TOKEN_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;

function badResponse() {
  return new CodeMatrixError(502, "CODE_MATRIX_RUNTIME_BAD_RESPONSE", "The compiler service returned an invalid response.");
}

export function normalizeCodeMatrixSubmission(body) {
  codeMatrixObject(body, ["language", "code", "input"], "submission");
  if (!Object.hasOwn(CODE_MATRIX_JUDGE0_LANGUAGE_IDS, body.language)) {
    throw new CodeMatrixError(400, "CODE_MATRIX_LANGUAGE_UNSUPPORTED", "Remote execution supports c, cpp, and java. Other runtimes run in the browser.");
  }
  return {
    language: body.language,
    code: codeMatrixText(body.code, CODE_MATRIX_LIMITS.draftBytes, "code", { nonempty: true }),
    input: codeMatrixText(body.input ?? "", CODE_MATRIX_LIMITS.inputBytes, "input"),
  };
}

function metric(value) {
  if (value === null || value === undefined) return null;
  if ((typeof value !== "number" && typeof value !== "string") || value === ""
    || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1e9) throw badResponse();
  return Number(value);
}

function exitMetric(value) {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value)) throw badResponse();
  return value;
}

export function normalizeCodeMatrixJudge0Result(data) {
  if (!data || !Number.isInteger(data.status?.id) || !STATUSES[data.status.id]) throw badResponse();
  let remaining = CODE_MATRIX_LIMITS.outputBytes;
  const truncatedFields = [];
  const decode = (name) => {
    const value = data[name];
    if (value === null || value === undefined) return null;
    if (typeof value !== "string" || value.length % 4 !== 0
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) throw badResponse();
    const decoded = Buffer.from(value, "base64").toString("utf8");
    const bytes = Buffer.from(decoded, "utf8");
    const clipped = bytes.subarray(0, remaining);
    // Avoid emitting a partial UTF-8 code point at the truncation boundary.
    let end = clipped.length;
    if (bytes.length > remaining) {
      while (end > 0 && (bytes[end] & 0xc0) === 0x80) end -= 1;
      truncatedFields.push(name);
    }
    const text = clipped.subarray(0, end).toString("utf8");
    remaining -= Buffer.byteLength(text, "utf8");
    return text;
  };
  return {
    status: { id: data.status.id, description: STATUSES[data.status.id] },
    completed: data.status.id >= 3,
    success: data.status.id === 3,
    stdout: decode("stdout"), stderr: decode("stderr"),
    compileOutput: decode("compile_output"), message: decode("message"),
    outputTruncated: truncatedFields.length > 0, truncatedFields,
    timeSeconds: metric(data.time), wallTimeSeconds: metric(data.wall_time),
    memoryKilobytes: metric(data.memory), exitCode: exitMetric(data.exit_code), exitSignal: exitMetric(data.exit_signal),
  };
}

async function boundedJson(response) {
  const length = Number(response.headers?.get("content-length"));
  if (length > CODE_MATRIX_JUDGE0_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => {});
    throw badResponse();
  }
  if (!response.body?.getReader) throw badResponse();
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > CODE_MATRIX_JUDGE0_RESPONSE_BYTES) {
        void reader.cancel().catch(() => {});
        throw badResponse();
      }
      chunks.push(Buffer.from(value));
    }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data)) throw badResponse();
    return data;
  } catch (error) {
    if (error instanceof CodeMatrixError) throw error;
    throw badResponse();
  } finally {
    reader.releaseLock();
  }
}

export function createCodeMatrixJudge0Client({
  baseUrl = process.env.JUDGE0_CE_BASE_URL ?? "",
  authToken = process.env.JUDGE0_CE_TOKEN ?? "",
  authHeader = process.env.JUDGE0_CE_AUTH_HEADER ?? "X-Auth-Token",
  languageIds = CODE_MATRIX_JUDGE0_LANGUAGE_IDS,
  timeoutMs = 10_000,
  fetchImpl = globalThis.fetch,
} = {}) {
  let url;
  let configurationStatus = "not_configured";
  try {
    if (baseUrl) {
      url = new URL(baseUrl);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash
        || typeof authToken !== "string" || authToken.length > 4096 || /[^\x20-\x7e]/u.test(authToken)
        || typeof authHeader !== "string" || !/^[A-Za-z][A-Za-z0-9-]{0,99}$/u.test(authHeader)
        || /^(host|content-type|content-length|connection|transfer-encoding|cookie|accept)$/iu.test(authHeader)
        || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000
        || typeof fetchImpl !== "function"
        || !Object.keys(CODE_MATRIX_JUDGE0_LANGUAGE_IDS).every((language) => Number.isInteger(languageIds?.[language]) && languageIds[language] > 0)) {
        throw new Error("Invalid Judge0 configuration");
      }
      url.pathname = `${url.pathname.replace(/\/+$/u, "")}/`;
      configurationStatus = "configured";
    }
  } catch {
    configurationStatus = "invalid_configuration";
    url = null;
  }
  const configured = configurationStatus === "configured";
  const providerKey = configured ? createHash("sha256").update(url.href).digest("hex") : null;
  const ids = Object.fromEntries(Object.keys(CODE_MATRIX_JUDGE0_LANGUAGE_IDS).map((key) => [key, languageIds?.[key]]));
  const ensureConfigured = () => {
    if (!configured) throw new CodeMatrixError(503, "CODE_MATRIX_RUNTIME_NOT_CONFIGURED", "Remote compilation is not configured. C, C++, and Java execution is unavailable.");
  };

  async function request(path, method, body) {
    ensureConfigured();
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new CodeMatrixError(504, "CODE_MATRIX_RUNTIME_TIMEOUT", "The compiler service request timed out. A submitted program may already have been accepted; submissions are never retried automatically."));
        controller.abort();
      }, timeoutMs);
    });
    try {
      return await Promise.race([timeout, (async () => {
        const response = await fetchImpl(new URL(path, url), {
          method, redirect: "error", signal: controller.signal,
          headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...(authToken ? { [authHeader]: authToken } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        if (!response.ok) {
          void response.body?.cancel().catch(() => {});
          if ([429, 503].includes(response.status)) throw new CodeMatrixError(503, "CODE_MATRIX_RUNTIME_BUSY", "The compiler service is busy. Try again later.", 5);
          // Do not forward provider bodies, tokens, URLs, or configuration errors.
          throw new CodeMatrixError(502, "CODE_MATRIX_RUNTIME_ERROR", "The compiler service rejected the request or is unavailable.");
        }
        return boundedJson(response);
      })()]);
    } catch (error) {
      controller.abort();
      if (error instanceof CodeMatrixError) throw error;
      throw new CodeMatrixError(502, "CODE_MATRIX_RUNTIME_UNAVAILABLE", "The compiler service could not be reached.");
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    providerKey, timeoutMs, ensureConfigured,
    capabilities: () => ({
      provider: "judge0-ce", configured, status: configurationStatus, health: "not_checked",
      languages: configured ? Object.keys(ids) : [],
      languageIds: configured ? { ...ids } : {}, requestTimeoutMs: configured ? timeoutMs : null,
    }),
    async create(body) {
      const submission = normalizeCodeMatrixSubmission(body);
      const result = await request("submissions?base64_encoded=true&wait=false", "POST", {
        language_id: ids[submission.language],
        source_code: Buffer.from(submission.code, "utf8").toString("base64"),
        stdin: Buffer.from(submission.input, "utf8").toString("base64"),
        cpu_time_limit: CODE_MATRIX_LIMITS.cpuTimeSeconds,
        cpu_extra_time: 0.5, wall_time_limit: CODE_MATRIX_LIMITS.wallTimeSeconds,
        memory_limit: CODE_MATRIX_LIMITS.memoryKilobytes, stack_limit: 64000,
        max_processes_and_or_threads: 60, max_file_size: CODE_MATRIX_LIMITS.outputBytes / 1024,
        enable_per_process_and_thread_time_limit: false, enable_per_process_and_thread_memory_limit: false,
        enable_network: false, redirect_stderr_to_stdout: false, number_of_runs: 1,
      });
      if (typeof result.token !== "string" || !TOKEN_PATTERN.test(result.token) || result.error) throw badResponse();
      return result.token;
    },
    async poll(token) {
      if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) throw badResponse();
      const fields = "status,stdout,stderr,compile_output,message,time,wall_time,memory,exit_code,exit_signal";
      return normalizeCodeMatrixJudge0Result(await request(`submissions/${token}?base64_encoded=true&fields=${fields}`, "GET"));
    },
  };
}
