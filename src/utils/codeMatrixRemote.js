import api from "./apiClient.js";

export function normalizeCodeMatrixRemoteResult(submission) {
  if (!submission || !Number.isInteger(submission.status?.id)) throw new Error("The compiler returned an invalid result.");
  const status = submission.status.id;
  let stderr = [submission.compileOutput, submission.stderr, submission.message].filter(Boolean).join("\n");
  if (submission.completed && !submission.success && !stderr) stderr = submission.status.description || "Execution failed.";
  if (submission.outputTruncated) stderr += "\n[Compiler output was truncated.]";
  return {
    status: status === 3 ? "success" : status === 5 ? "timeout" : "error",
    stdout: String(submission.stdout || "").slice(0, 65_536),
    stderr: stderr.slice(0, 65_536),
    durationMs: Number.isFinite(submission.durationMs) ? submission.durationMs : null,
  };
}

export function createCodeMatrixRemoteRun({ language, code, input = "", academicProfileId, onEvent, apiClient = api, pollIntervalMs = 1100, timeoutMs = 60_000 }) {
  let stopped = false;
  let timer;
  let wake;
  let resolveCancel;
  const cancelled = new Promise((resolve) => { resolveCancel = resolve; });
  const options = { academicProfileId, timeoutMs: 15_000 };
  const work = async () => {
    const started = Date.now();
    const payload = await apiClient.post("/api/code-matrix/submissions", { language, code, input }, options);
    let submission = payload.submission;
    if (!submission?.id) throw new Error("The compiler did not return a submission reference.");
    while (!stopped && !submission.completed) {
      if (Date.now() - started >= timeoutMs) return { status: "timeout", stdout: "", stderr: "The compiler has not returned a result yet. Its execution time limit still applies.", durationMs: null };
      onEvent?.({ message: submission.status?.description === "Processing" ? "Compiling and running…" : "Waiting for the compiler…" });
      await new Promise((resolve) => { wake = resolve; timer = setTimeout(resolve, pollIntervalMs); });
      if (stopped) break;
      const result = await apiClient.get(`/api/code-matrix/submissions/${encodeURIComponent(submission.id)}`, options);
      if (!result?.submission) throw new Error("The compiler result could not be loaded.");
      submission = result.submission;
    }
    return stopped ? { status: "stopped", stdout: "", stderr: "Stopped waiting. Remote execution remains subject to the compiler’s time limit.", durationMs: null } : normalizeCodeMatrixRemoteResult(submission);
  };
  return {
    promise: Promise.race([work(), cancelled]).finally(() => clearTimeout(timer)),
    cancel() {
      stopped = true;
      clearTimeout(timer);
      wake?.();
      resolveCancel({ status: "stopped", stdout: "", stderr: "Stopped waiting. Remote execution remains subject to the compiler’s time limit.", durationMs: null });
    },
  };
}
