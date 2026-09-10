import { createHash, randomUUID } from "node:crypto";
import express from "express";
import {
  AcademicProfileScopeError, academicProfileFilter, withAcademicProfileWriteFence,
} from "./profileDataScope.js";
import {
  CODE_MATRIX_LANGUAGES, CODE_MATRIX_LIMITS, CodeMatrixError,
  defaultCodeMatrixWorkspace, mergeCodeMatrixWorkspace,
  publicCodeMatrixWorkspace, validateCodeMatrixWorkspacePatch,
} from "./codeMatrixWorkspace.js";
import { createCodeMatrixJudge0Client, normalizeCodeMatrixSubmission } from "./codeMatrixJudge0.js";
import { getCodeMatrixEligibility, getCodeMatrixSetupSteps } from "../src/utils/codeMatrixProfile.js";

export const CODE_MATRIX_WORKSPACES_COLLECTION = "codeMatrixWorkspaces";
export const CODE_MATRIX_SUBMISSIONS_COLLECTION = "codeMatrixSubmissions";
export const CODE_MATRIX_RATE_LIMITS_COLLECTION = "codeMatrixRateLimits";
export const CODE_MATRIX_COLLECTIONS = Object.freeze({
  workspaceCollectionName: CODE_MATRIX_WORKSPACES_COLLECTION,
  submissionsCollectionName: CODE_MATRIX_SUBMISSIONS_COLLECTION,
  rateLimitsCollectionName: CODE_MATRIX_RATE_LIMITS_COLLECTION,
  studyWorkspaceCollectionName: "workspaces",
  notebooksCollectionName: "learningNotebooks",
});
export const CODE_MATRIX_RATE_LIMITS = Object.freeze({
  workspaceRead: Object.freeze([{ limit: 120, windowMs: 60_000 }]),
  workspaceWrite: Object.freeze([{ limit: 60, windowMs: 60_000 }]),
  capabilities: Object.freeze([{ limit: 120, windowMs: 60_000 }]),
  create: Object.freeze([{ limit: 10, windowMs: 60_000 }, { limit: 100, windowMs: 3_600_000 }]),
  poll: Object.freeze([{ limit: 120, windowMs: 60_000 }]),
});

const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const digest = (values) => createHash("sha256").update(JSON.stringify(values)).digest("hex");

function collectionNames(overrides) {
  return Object.fromEntries(Object.entries(CODE_MATRIX_COLLECTIONS).map(([key, fallback]) => [key, overrides[key] ?? fallback]));
}

/**
 * Mount (in server/index.js, by the integrating owner):
 *   await ensureCodeMatrixIndexes(db); // put inside getDb's existing index initialization
 *   registerCodeMatrixRoutes(app, { getDb, requireAuth });
 * requireAuth is the existing handler wrapper that attaches req.user and req.academicProfileId.
 * The default write fence uses users and the existing academic-profile mutation-lock collection.
 * Optional: all names in CODE_MATRIX_COLLECTIONS, withProfileWriteFence, judge0, now,
 * and getEligibility(profile, subjects) (normally the shared profile helper).
 *
 * All endpoints require auth + the usual x-academic-profile-id header convention.
 * GET/PUT /api/code-matrix/workspace => {workspace, eligibility, setup}.
 * PUT accepts {language?, drafts?, inputs?, setupDismissed?, completedSteps?, updatedAt?, revision?}.
 * Language keys: python,c,cpp,java,javascript,sql,html,css; draft/input values are strings.
 * Maps merge by language; omit a key to preserve it, send "" to clear it. true dismissal is sticky.
 * completedSteps accepts subjects/notebook/plan but only database observations are persisted.
 * updatedAt retains the client edit timestamp. Optional revision enables stale-write 409s.
 * Workspace contains language,drafts,inputs,setupDismissed,completedSteps,createdAt,updatedAt,savedAt,revision.
 * workspace is null until the first PUT, including when GET remembers setup observations.
 * setup = {completedSteps,subjects:boolean,notebook:boolean,plan:boolean,
 *          counts:{subjects,notebooks,plannerTasks}}; booleans describe current persisted state.
 * Setup is optional. Workspace GET/PUT remain accessible to noncoding profiles.
 *
 * GET /api/code-matrix/capabilities => {remote,browser,eligibility,limits,rateLimits,onboardingRequired:false}.
 * remote.configured describes configuration ONLY; health is not_checked, never a service health claim.
 * POST /api/code-matrix/submissions {language:"c"|"cpp"|"java",code:string,input?:string}
 * => 202 {submission}; GET /api/code-matrix/submissions/:id => 200 {submission}.
 * Submission IDs are local UUIDs, never provider tokens. Both endpoints enforce current eligibility.
 * No automatic POST retries, caller-chosen URLs, callbacks, compiler flags, or host process execution.
 * Results expire after 24 hours, and terminal results are cached. Poll at most once per second.
 * Errors: {error,code}; 400 validation, 401 auth, 403 eligibility, 404 missing/foreign/expired,
 * 409 profile/revision changes, 413 size, 415 media type, 429 local quota, 502 provider failure,
 * 503 missing/busy runtime, 504 timeout. Runtime errors never become successful execution results.
 *
 * Deletion integration: add codeMatrixWorkspaces and codeMatrixSubmissions to
 * PROFILE_SCOPED_OWNED_COLLECTIONS and the account deleteMany({userId}) list.
 * codeMatrixRateLimits is ACCOUNT scoped; delete it on account deletion only. Retain it on
 * profile deletion to prevent quota bypass. All collection names can be overridden consistently.
 * Source/input are forwarded to Judge0 but not duplicated in submission records. Local deletion
 * removes local records only; the configured Judge0 operator controls remote retention.
 */
export async function ensureCodeMatrixIndexes(db, overrides = {}) {
  const names = collectionNames(overrides);
  await db.collection(names.workspaceCollectionName).createIndex({ userId: 1, academicProfileId: 1 }, { unique: true });
  await db.collection(names.submissionsCollectionName).createIndex({ userId: 1, academicProfileId: 1, createdAt: -1 });
  await db.collection(names.submissionsCollectionName).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection(names.rateLimitsCollectionName).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection(names.rateLimitsCollectionName).createIndex({ userId: 1 });
}

// Fixed buckets are stored in MongoDB so restarts, multiple servers, and profile changes
// do not reset an account's quota. Duplicate _id on a saturated upsert means denied.
export async function consumeCodeMatrixRateLimit(collection, userId, action, now) {
  for (const { limit, windowMs } of CODE_MATRIX_RATE_LIMITS[action]) {
    const start = Math.floor(now.getTime() / windowMs) * windowMs;
    const resetAt = new Date(start + windowMs);
    try {
      await collection.updateOne(
        { _id: digest([String(userId), action, windowMs, start]), count: { $lt: limit } },
        {
          $inc: { count: 1 },
          $setOnInsert: { userId, action, resetAt, expiresAt: resetAt },
        },
        { upsert: true },
      );
    } catch (error) {
      if (error?.code !== 11000) throw error;
      throw new CodeMatrixError(429, "CODE_MATRIX_RATE_LIMITED", "Too many CodeMatrix requests. Try again later.", Math.max(1, Math.ceil((resetAt - now) / 1000)));
    }
  }
}

export function publicCodeMatrixSubmission(doc) {
  const {
    language, status, completed, success, stdout, stderr, compileOutput, message,
    outputTruncated, truncatedFields, timeSeconds, wallTimeSeconds, memoryKilobytes,
    exitCode, exitSignal, createdAt, updatedAt, finishedAt, expiresAt,
  } = doc;
  return {
    id: doc._id, language, status, completed, success, stdout, stderr, compileOutput, message,
    durationMs: timeSeconds === null ? null : timeSeconds * 1000,
    outputTruncated, truncatedFields, timeSeconds, wallTimeSeconds, memoryKilobytes,
    exitCode, exitSignal, createdAt, updatedAt, finishedAt, expiresAt,
    pollAfterMs: completed ? null : CODE_MATRIX_LIMITS.pollIntervalMs,
  };
}

function sendError(res, error) {
  if (error instanceof CodeMatrixError || error instanceof AcademicProfileScopeError) {
    if (error.retryAfterSeconds) res.set("Retry-After", String(error.retryAfterSeconds));
    return res.status(error.status).json({ code: error.code, error: error.message });
  }
  return res.status(500).json({ code: "CODE_MATRIX_UNAVAILABLE", error: "CodeMatrix could not complete the request." });
}

async function readBody(req, res, limit) {
  if (!req.is("application/json")) throw new CodeMatrixError(415, "CODE_MATRIX_JSON_REQUIRED", "Use Content-Type: application/json.");
  if (req.body === undefined) {
    await new Promise((resolve, reject) => express.json({ limit, inflate: false })(req, res, (error) => {
      if (!error) return resolve();
      return reject(new CodeMatrixError(error.status === 413 ? 413 : 400, "CODE_MATRIX_INVALID_JSON", "The JSON request is invalid or too large."));
    }));
  }
  if (Buffer.byteLength(JSON.stringify(req.body) ?? "", "utf8") > limit) {
    throw new CodeMatrixError(413, "CODE_MATRIX_SIZE_LIMIT", "The request body is too large.");
  }
  return req.body;
}

export function registerCodeMatrixRoutes(app, {
  getDb,
  requireAuth,
  now = () => new Date(),
  withProfileWriteFence = withAcademicProfileWriteFence,
  judge0 = createCodeMatrixJudge0Client(),
  getEligibility = getCodeMatrixEligibility,
  ...overrides
} = {}) {
  if (typeof getDb !== "function" || typeof requireAuth !== "function") throw new TypeError("CodeMatrix requires getDb and requireAuth.");
  const names = collectionNames(overrides);
  const guarded = (handler) => requireAuth(async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      academicProfileFilter(req); // Never fall back to user-only or untagged legacy records.
      return await handler(req, res);
    } catch (error) {
      return sendError(res, error);
    }
  });
  const access = async (db, req, action, work) => withProfileWriteFence(db, req, async () => {
    await consumeCodeMatrixRateLimit(db.collection(names.rateLimitsCollectionName), req.user._id, action, now());
    return work();
  });
  const profileSnapshot = (req) => req.academicProfileContext?.profile ?? req.user;
  const readStudy = (db, req) => db.collection(names.studyWorkspaceCollectionName).findOne(
    academicProfileFilter(req), { projection: { subjects: 1, schedule: 1 } },
  );
  const eligibilityFor = async (db, req, study) => getEligibility(profileSnapshot(req), (study ?? await readStudy(db, req))?.subjects ?? []);
  const requireEligible = async (db, req) => {
    const eligibility = await eligibilityFor(db, req);
    if (eligibility?.eligible !== true) throw new CodeMatrixError(403, "CODE_MATRIX_NOT_ELIGIBLE", "Add a relevant coding subject or use an eligible academic profile to run compiled programs.");
    return eligibility;
  };
  const readState = async (db, req) => {
    const study = await readStudy(db, req);
    const notebookCursor = db.collection(names.notebooksCollectionName).find(
      academicProfileFilter(req, { artifactKind: { $ne: "placement-workspace" } }),
    );
    // Stream records rather than collecting potentially large notebook documents in memory.
    let notebookCount = 0;
    for await (const notebook of notebookCursor) {
      if (getCodeMatrixSetupSteps({ notebooks: [notebook] }).find((step) => step.id === "notebook").complete) notebookCount += 1;
    }
    const subjectCount = (Array.isArray(study?.subjects) ? study.subjects : []).filter((subject) => getCodeMatrixSetupSteps({ subjects: [subject] })[0].complete).length;
    const plannerTaskCount = (Array.isArray(study?.schedule) ? study.schedule : []).reduce((count, day) => count + (Array.isArray(day?.tasks) ? day.tasks : [])
      .filter((task) => typeof task === "string" ? Boolean(task.trim()) : Boolean(typeof task?.task === "string" && task.task.trim())).length, 0);
    const setupProgress = {
      subjects: subjectCount > 0, notebook: notebookCount > 0, plan: plannerTaskCount > 0,
      counts: { subjects: subjectCount, notebooks: notebookCount, plannerTasks: plannerTaskCount },
    };
    return {
      setupProgress,
      observedSteps: ["subjects", "notebook", "plan"].filter((step) => setupProgress[step]),
      eligibility: await eligibilityFor(db, req, study),
    };
  };
  const saveWorkspace = async (db, req, current, next) => {
    const scope = academicProfileFilter(req);
    try {
      const result = await db.collection(names.workspaceCollectionName).updateOne(
        { ...scope, _id: digest([String(scope.userId), scope.academicProfileId]), ...(current ? { revision: current.revision } : { revision: { $exists: false } }) },
        { $set: next, $setOnInsert: scope }, { upsert: !current },
      );
      if (current && result.matchedCount !== 1) throw new CodeMatrixError(409, "CODE_MATRIX_REVISION_CONFLICT", "Workspace changed. Reload before saving.");
    } catch (error) {
      if (error?.code === 11000) throw new CodeMatrixError(409, "CODE_MATRIX_REVISION_CONFLICT", "Workspace changed. Reload before saving.");
      throw error;
    }
  };
  const workspaceResponse = async (db, req, body) => {
    const state = await readState(db, req);
    let doc = await db.collection(names.workspaceCollectionName).findOne(academicProfileFilter(req));
    const observedNewStep = state.observedSteps.some((step) => !doc?.completedSteps?.includes(step));
    if (body || observedNewStep) {
      const next = body ? mergeCodeMatrixWorkspace(doc, body, now(), state.observedSteps) : {
        ...defaultCodeMatrixWorkspace(),
        ...(publicCodeMatrixWorkspace(doc) ?? {}),
        hasWorkspace: doc?.hasWorkspace === true,
        revision: (doc?.revision ?? 0) + 1,
        completedSteps: ["subjects", "notebook", "plan"].filter((step) => doc?.completedSteps?.includes(step) || state.observedSteps.includes(step)),
        createdAt: doc?.createdAt ?? now(), savedAt: now(),
      };
      await saveWorkspace(db, req, doc, next);
      doc = next;
    }
    return { workspace: publicCodeMatrixWorkspace(doc), eligibility: state.eligibility, setup: { ...state.setupProgress, completedSteps: doc?.completedSteps ?? [] } };
  };

  app.get("/api/code-matrix/workspace", guarded(async (req, res) => {
    const db = await getDb();
    return res.json(await access(db, req, "workspaceRead", () => workspaceResponse(db, req)));
  }));
  app.put("/api/code-matrix/workspace", guarded(async (req, res) => {
    const body = validateCodeMatrixWorkspacePatch(await readBody(req, res, CODE_MATRIX_LIMITS.workspaceRequestBytes));
    const db = await getDb();
    return res.json(await access(db, req, "workspaceWrite", () => workspaceResponse(db, req, body)));
  }));
  app.get("/api/code-matrix/capabilities", guarded(async (req, res) => {
    const db = await getDb();
    const eligibility = await access(db, req, "capabilities", () => eligibilityFor(db, req));
    return res.json({
      remote: judge0.capabilities(),
      browser: { languages: CODE_MATRIX_LANGUAGES, health: "client_managed" },
      eligibility, limits: CODE_MATRIX_LIMITS, rateLimits: CODE_MATRIX_RATE_LIMITS, onboardingRequired: false,
    });
  }));
  app.post("/api/code-matrix/submissions", guarded(async (req, res) => {
    const body = normalizeCodeMatrixSubmission(await readBody(req, res, CODE_MATRIX_LIMITS.submissionRequestBytes));
    const db = await getDb();
    await access(db, req, "create", async () => {
      await requireEligible(db, req);
      judge0.ensureConfigured();
    });
    // Network work stays outside the academic-profile lock. No retries on ambiguous creation.
    const providerToken = await judge0.create(body);
    const createdAt = now();
    const doc = {
      _id: randomUUID(), ...academicProfileFilter(req), language: body.language,
      providerKey: judge0.providerKey, providerToken,
      status: { id: 1, description: "In Queue" }, completed: false, success: false,
      stdout: null, stderr: null, compileOutput: null, message: null,
      outputTruncated: false, truncatedFields: [], timeSeconds: null, wallTimeSeconds: null,
      memoryKilobytes: null, exitCode: null, exitSignal: null,
      createdAt, updatedAt: createdAt, finishedAt: null, lastPolledAt: null,
      expiresAt: new Date(createdAt.getTime() + CODE_MATRIX_LIMITS.submissionRetentionSeconds * 1000),
    };
    await withProfileWriteFence(db, req, async () => {
      await requireEligible(db, req);
      await db.collection(names.submissionsCollectionName).insertOne(doc);
    });
    res.set("Location", `/api/code-matrix/submissions/${doc._id}`);
    return res.status(202).json({ submission: publicCodeMatrixSubmission(doc) });
  }));
  app.get("/api/code-matrix/submissions/:id", guarded(async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) throw new CodeMatrixError(400, "CODE_MATRIX_INVALID_SUBMISSION_ID", "The submission ID is invalid.");
    const db = await getDb();
    const collection = db.collection(names.submissionsCollectionName);
    const filter = academicProfileFilter(req, { _id: req.params.id.toLowerCase(), expiresAt: { $gt: now() } });
    const leaseId = randomUUID();
    let acquired = false;
    let doc = await access(db, req, "poll", async () => {
      const found = await collection.findOne(filter);
      if (!found) throw new CodeMatrixError(404, "CODE_MATRIX_SUBMISSION_NOT_FOUND", "Submission not found.");
      await requireEligible(db, req);
      if (found.completed) return found;
      judge0.ensureConfigured();
      if (found.providerKey !== judge0.providerKey) throw new CodeMatrixError(503, "CODE_MATRIX_RUNTIME_CHANGED", "This submission belongs to a previous compiler service configuration.");
      const timestamp = now();
      if (found.lastPolledAt && timestamp - found.lastPolledAt < CODE_MATRIX_LIMITS.pollIntervalMs) return found;
      const lease = await collection.updateOne({
        ...filter, completed: false,
        $or: [{ pollLeaseUntil: { $exists: false } }, { pollLeaseUntil: { $lte: timestamp } }],
      }, { $set: { pollLeaseId: leaseId, pollLeaseUntil: new Date(timestamp.getTime() + judge0.timeoutMs + 2000) } });
      acquired = lease.matchedCount === 1;
      return found;
    });
    if (acquired) {
      try {
        const result = await judge0.poll(doc.providerToken);
        const updatedAt = now();
        const update = { ...result, updatedAt, lastPolledAt: updatedAt, finishedAt: result.completed ? updatedAt : null };
        await withProfileWriteFence(db, req, async () => {
          await requireEligible(db, req);
          const committed = await collection.updateOne({ ...filter, completed: false, pollLeaseId: leaseId }, {
            $set: update, $unset: { pollLeaseId: "", pollLeaseUntil: "" },
          });
          if (committed.matchedCount !== 1) throw new CodeMatrixError(409, "CODE_MATRIX_SUBMISSION_CHANGED", "Submission changed or was deleted. Reload its status.");
        });
        doc = { ...doc, ...update };
      } catch (error) {
        // Existing-row-only cleanup cannot resurrect deleted profile data. Lease expiry also
        // recovers after process death; failed cleanup must not hide the original provider error.
        await withProfileWriteFence(db, req, () => collection.updateOne(
          { ...filter, pollLeaseId: leaseId }, { $unset: { pollLeaseId: "", pollLeaseUntil: "" } },
        )).catch(() => {});
        throw error;
      }
    }
    if (!doc.completed) res.set("Retry-After", "1");
    return res.json({ submission: publicCodeMatrixSubmission(doc) });
  }));
  return { collections: names };
}

export { CODE_MATRIX_LIMITS, defaultCodeMatrixWorkspace };
