import crypto from "node:crypto";
import { ObjectId } from "mongodb";
import {
  normalizeResumeDraft,
  normalizeResumeLayout,
} from "../src/utils/resumeBuilder.js";
import { normalizeAcademicProfile } from "../src/utils/academicProfile.js";

export const RESUME_GENERATIONS_COLLECTION = "resumeGenerations";
export const RESUME_GENERATION_LOCKS_COLLECTION = "resumeGenerationLocks";
export const RESUME_HISTORY_COLLECTION = "resumeHistory";
export const RESUME_HISTORY_LIMIT = 30;
export const RESUME_GENERATION_LIMIT = 5;
export const RESUME_GENERATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

const ELIGIBLE_TRACKS = new Set([
  "Undergraduate / Degree",
  "Diploma / Vocational",
  "Engineering & Technology",
  "Computer Science & IT",
  "Medical & Health Sciences",
  "Law & Legal Studies",
  "Business & Management",
  "Commerce & Finance",
  "Arts & Humanities",
  "Social Sciences",
  "Natural Sciences",
  "Education & Teaching",
  "Agriculture & Environmental Studies",
  "Architecture & Design",
  "Professional Certification",
]);

const ELIGIBLE_LEVELS = new Set([
  "Diploma / Vocational",
  "Undergraduate / Bachelor's",
  "Postgraduate / Master's",
  "Doctoral / Research",
  "Medical / Health Sciences",
  "Law / Legal Studies",
  "Professional / Certification",
]);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function cleanLine(value, max = 120) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function validDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function parseResumeHistoryId(value) {
  const id = typeof value === "string" ? value.trim() : "";
  return OBJECT_ID_PATTERN.test(id) ? new ObjectId(id) : null;
}

export function normalizeResumeHistorySnapshot(value, options = {}) {
  const source = isRecord(value?.resume) ? value.resume : value;
  if (!isRecord(source)) {
    const error = new TypeError("A resume snapshot is required.");
    error.code = "RESUME_HISTORY_BODY_REQUIRED";
    throw error;
  }
  if (!isRecord(source.draft)) {
    const error = new TypeError("A resume draft is required.");
    error.code = "RESUME_HISTORY_DRAFT_REQUIRED";
    throw error;
  }
  if (source.layout !== undefined && !isRecord(source.layout)) {
    const error = new TypeError("The resume layout is invalid.");
    error.code = "RESUME_HISTORY_LAYOUT_INVALID";
    throw error;
  }

  const now = validDate(options.now) || new Date();
  const draft = normalizeResumeDraft(source.draft);
  const layout = normalizeResumeLayout(source.layout);
  return {
    name: cleanLine(draft.personal.fullName, 120) || "Untitled resume",
    draft,
    layout,
    generatedAt: now,
    updatedAt: now,
    ...(cleanLine(source.sourceGenerationId, 120)
      ? { sourceGenerationId: cleanLine(source.sourceGenerationId, 120) }
      : {}),
    ...(cleanLine(source.requestId, 100)
      ? { requestId: cleanLine(source.requestId, 100) }
      : {}),
  };
}

export function publicResumeHistoryRecord(document = {}) {
  const draft = normalizeResumeDraft(document.draft);
  const generatedAt = validDate(document.generatedAt) || validDate(document.createdAt) || new Date(0);
  const updatedAt = validDate(document.updatedAt) || generatedAt;
  return {
    id: String(document._id || ""),
    name: cleanLine(draft.personal.fullName, 120)
      || cleanLine(document.name, 120)
      || "Untitled resume",
    draft,
    layout: normalizeResumeLayout(document.layout),
    generatedAt: generatedAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    sourceGenerationId: cleanLine(document.sourceGenerationId, 120) || null,
    requestId: cleanLine(document.requestId, 100) || null,
  };
}

export function publicResumeHistorySummary(document = {}) {
  const resume = publicResumeHistoryRecord(document);
  return {
    id: resume.id,
    name: resume.name,
    headline: cleanLine(resume.draft.personal.headline, 140),
    layout: resume.layout,
    generatedAt: resume.generatedAt,
    updatedAt: resume.updatedAt,
    sourceGenerationId: resume.sourceGenerationId,
    requestId: resume.requestId,
  };
}

export async function pruneResumeHistory(collection, userId) {
  const staleDocuments = await collection
    .find({ userId })
    .sort({ updatedAt: -1, _id: -1 })
    .skip(RESUME_HISTORY_LIMIT)
    .project({ _id: 1 })
    .toArray();
  if (!staleDocuments.length) return 0;
  const result = await collection.deleteMany({
    userId,
    _id: { $in: staleDocuments.map(({ _id }) => _id) },
  });
  return result.deletedCount || 0;
}

export function isResumeBuilderEnabled(profile = {}) {
  const normalized = normalizeAcademicProfile(profile);
  if (normalized.schoolType === "school") return false;
  const academicTrack = cleanLine(normalized.academicTrack);
  const academicLevel = cleanLine(normalized.academicLevel);
  return ELIGIBLE_TRACKS.has(academicTrack) || ELIGIBLE_LEVELS.has(academicLevel);
}

export function createResumeQuota(generations = [], now = new Date()) {
  const nowDate = new Date(now);
  const threshold = nowDate.getTime() - RESUME_GENERATION_WINDOW_MS;
  const active = generations
    .map((item) => new Date(item?.generatedAt ?? item))
    .filter((date) => Number.isFinite(date.getTime()) && date.getTime() > threshold && date <= nowDate)
    .sort((a, b) => a - b)
    .slice(-RESUME_GENERATION_LIMIT);
  const resetAt = active[0] ? new Date(active[0].getTime() + RESUME_GENERATION_WINDOW_MS) : null;
  const used = active.length;
  return {
    limit: RESUME_GENERATION_LIMIT,
    windowDays: 7,
    used,
    generationsUsed: used,
    remaining: Math.max(0, RESUME_GENERATION_LIMIT - used),
    reached: used >= RESUME_GENERATION_LIMIT,
    canGenerate: used < RESUME_GENERATION_LIMIT,
    resetAt: resetAt?.toISOString() || null,
    retryAfterSeconds: resetAt ? Math.max(0, Math.ceil((resetAt.getTime() - nowDate.getTime()) / 1000)) : 0,
    timestamps: active.map((date) => date.toISOString()),
  };
}

async function getQuota(db, userId, now) {
  const threshold = new Date(now.getTime() - RESUME_GENERATION_WINDOW_MS);
  const generations = await db
    .collection(RESUME_GENERATIONS_COLLECTION)
    .find({ userId, generatedAt: { $gt: threshold, $lte: now } })
    .sort({ generatedAt: 1 })
    .limit(RESUME_GENERATION_LIMIT)
    .toArray();
  return createResumeQuota(generations, now);
}

async function acquireUserLock(db, userId, nowProvider) {
  const locks = db.collection(RESUME_GENERATION_LOCKS_COLLECTION);
  const lockId = `resume-generation:${String(userId)}`;
  const token = crypto.randomUUID();

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const now = nowProvider();
    try {
      await locks.insertOne({
        _id: lockId,
        token,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 15_000),
      });
      return async () => {
        await locks.deleteOne({ _id: lockId, token });
      };
    } catch (error) {
      if (error?.code !== 11000) throw error;
      await locks.deleteOne({ _id: lockId, expiresAt: { $lte: now } });
      await sleep(Math.min(35 + attempt * 12, 180));
    }
  }

  const error = new Error("Resume generation is busy. Please try again.");
  error.code = "RESUME_GENERATION_BUSY";
  throw error;
}

function sendQuotaHeaders(res, quota) {
  res.set("Cache-Control", "no-store");
  res.set("X-Resume-Quota-Limit", String(quota.limit));
  res.set("X-Resume-Quota-Remaining", String(quota.remaining));
  if (quota.resetAt) res.set("X-Resume-Quota-Reset-At", quota.resetAt);
}

export function registerResumeBuilderRoutes(app, { getDb, requireAuth, now = () => new Date() }) {
  const invalidHistoryId = (res) => res.status(400).json({
    error: "The resume history ID is invalid.",
    code: "INVALID_RESUME_HISTORY_ID",
  });

  const sendHistoryError = (res, error) => {
    const inputCodes = new Set([
      "RESUME_HISTORY_BODY_REQUIRED",
      "RESUME_HISTORY_DRAFT_REQUIRED",
      "RESUME_HISTORY_LAYOUT_INVALID",
    ]);
    if (inputCodes.has(error?.code)) {
      return res.status(400).json({ error: error.message, code: error.code });
    }
    if (error?.code === 11000) {
      return res.status(409).json({
        error: "This generated resume is already saved in history.",
        code: "RESUME_HISTORY_DUPLICATE",
      });
    }
    return res.status(500).json({
      error: "Resume history could not be updated. Please try again.",
      code: "RESUME_HISTORY_UNAVAILABLE",
    });
  };

  const requireResumeHistoryAccess = (handler) => requireAuth(async (req, res) => {
    if (!isResumeBuilderEnabled(req.user)) {
      res.set("Cache-Control", "no-store");
      return res.status(403).json({
        error: "Resume Builder is not available for the selected academic category.",
        code: "RESUME_NOT_ELIGIBLE",
      });
    }
    return handler(req, res);
  });

  app.get(
    "/api/resume-builder/history",
    requireResumeHistoryAccess(async (req, res) => {
      try {
        const db = await getDb();
        const documents = await db.collection(RESUME_HISTORY_COLLECTION)
          .find({ userId: req.user._id })
          .sort({ updatedAt: -1, _id: -1 })
          .limit(RESUME_HISTORY_LIMIT)
          .toArray();
        res.set("Cache-Control", "no-store");
        return res.json({
          history: documents.map(publicResumeHistorySummary),
          limit: RESUME_HISTORY_LIMIT,
        });
      } catch (error) {
        return sendHistoryError(res, error);
      }
    }),
  );

  app.get(
    "/api/resume-builder/history/:id",
    requireResumeHistoryAccess(async (req, res) => {
      res.set("Cache-Control", "no-store");
      const historyId = parseResumeHistoryId(req.params.id);
      if (!historyId) return invalidHistoryId(res);
      try {
        const db = await getDb();
        const document = await db.collection(RESUME_HISTORY_COLLECTION).findOne({
          _id: historyId,
          userId: req.user._id,
        });
        if (!document) {
          return res.status(404).json({
            error: "Resume history item not found.",
            code: "RESUME_HISTORY_NOT_FOUND",
          });
        }
        return res.json({ resume: publicResumeHistoryRecord(document) });
      } catch (error) {
        return sendHistoryError(res, error);
      }
    }),
  );

  app.post(
    "/api/resume-builder/history",
    requireResumeHistoryAccess(async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const recordedAt = validDate(now()) || new Date();
        const snapshot = normalizeResumeHistorySnapshot(req.body, { now: recordedAt });
        const db = await getDb();
        const collection = db.collection(RESUME_HISTORY_COLLECTION);
        if (snapshot.requestId) {
          const existing = await collection.findOne({
            userId: req.user._id,
            requestId: snapshot.requestId,
          });
          if (existing) {
            return res.json({
              resume: publicResumeHistoryRecord(existing),
              idempotent: true,
            });
          }
        }

        const document = {
          userId: req.user._id,
          ...snapshot,
          createdAt: recordedAt,
        };
        let result;
        try {
          result = await collection.insertOne(document);
        } catch (error) {
          if (error?.code !== 11000 || !snapshot.requestId) throw error;
          const existing = await collection.findOne({
            userId: req.user._id,
            requestId: snapshot.requestId,
          });
          if (!existing) throw error;
          return res.json({
            resume: publicResumeHistoryRecord(existing),
            idempotent: true,
          });
        }
        await pruneResumeHistory(collection, req.user._id);
        return res.status(201).json({
          resume: publicResumeHistoryRecord({ _id: result.insertedId, ...document }),
          idempotent: false,
        });
      } catch (error) {
        return sendHistoryError(res, error);
      }
    }),
  );

  const updateResumeHistory = requireResumeHistoryAccess(async (req, res) => {
    res.set("Cache-Control", "no-store");
    const historyId = parseResumeHistoryId(req.params.id);
    if (!historyId) return invalidHistoryId(res);
    try {
      const db = await getDb();
      const collection = db.collection(RESUME_HISTORY_COLLECTION);
      const filter = { _id: historyId, userId: req.user._id };
      const existing = await collection.findOne(filter);
      if (!existing) {
        return res.status(404).json({
          error: "Resume history item not found.",
          code: "RESUME_HISTORY_NOT_FOUND",
        });
      }

      const source = isRecord(req.body?.resume) ? req.body.resume : req.body;
      if (!isRecord(source)) {
        const error = new TypeError("A resume snapshot is required.");
        error.code = "RESUME_HISTORY_BODY_REQUIRED";
        throw error;
      }
      const snapshot = normalizeResumeHistorySnapshot({
        draft: source.draft === undefined ? existing.draft : source.draft,
        layout: source.layout === undefined ? existing.layout : source.layout,
        sourceGenerationId: source.sourceGenerationId === undefined
          ? existing.sourceGenerationId
          : source.sourceGenerationId,
        requestId: source.requestId === undefined ? existing.requestId : source.requestId,
      }, { now: validDate(now()) || new Date() });
      await collection.updateOne(filter, { $set: snapshot });
      return res.json({
        resume: publicResumeHistoryRecord({ ...existing, ...snapshot }),
      });
    } catch (error) {
      return sendHistoryError(res, error);
    }
  });

  app.put("/api/resume-builder/history/:id", updateResumeHistory);
  app.patch("/api/resume-builder/history/:id", updateResumeHistory);

  app.delete(
    "/api/resume-builder/history",
    requireResumeHistoryAccess(async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const db = await getDb();
        const result = await db.collection(RESUME_HISTORY_COLLECTION).deleteMany({
          userId: req.user._id,
        });
        return res.json({ success: true, deletedCount: result.deletedCount || 0 });
      } catch (error) {
        return sendHistoryError(res, error);
      }
    }),
  );

  app.delete(
    "/api/resume-builder/history/:id",
    requireResumeHistoryAccess(async (req, res) => {
      res.set("Cache-Control", "no-store");
      const historyId = parseResumeHistoryId(req.params.id);
      if (!historyId) return invalidHistoryId(res);
      try {
        const db = await getDb();
        const result = await db.collection(RESUME_HISTORY_COLLECTION).deleteOne({
          _id: historyId,
          userId: req.user._id,
        });
        if (result.deletedCount !== 1) {
          return res.status(404).json({
            error: "Resume history item not found.",
            code: "RESUME_HISTORY_NOT_FOUND",
          });
        }
        return res.json({ success: true, id: historyId.toString() });
      } catch (error) {
        return sendHistoryError(res, error);
      }
    }),
  );

  app.get(
    "/api/resume-builder/status",
    requireAuth(async (req, res) => {
      if (!isResumeBuilderEnabled(req.user)) {
        res.set("Cache-Control", "no-store");
        return res.status(403).json({
          error: "Resume Builder is not available for the selected academic category.",
          code: "RESUME_NOT_ELIGIBLE",
        });
      }
      const db = await getDb();
      const quota = await getQuota(db, req.user._id, now());
      sendQuotaHeaders(res, quota);
      return res.json({ quota });
    })
  );

  app.post(
    "/api/resume-builder/generate",
    requireAuth(async (req, res) => {
      if (!isResumeBuilderEnabled(req.user)) {
        return res.status(403).json({
          error: "Resume Builder is not available for the selected academic category.",
          code: "RESUME_NOT_ELIGIBLE",
        });
      }

      const requestId = cleanLine(req.body?.requestId, 100) || crypto.randomUUID();
      const db = await getDb();
      const generations = db.collection(RESUME_GENERATIONS_COLLECTION);
      const existing = await generations.findOne({ userId: req.user._id, requestId });
      if (existing) {
        const quota = await getQuota(db, req.user._id, now());
        sendQuotaHeaders(res, quota);
        return res.json({
          generation: { id: String(existing._id), generatedAt: existing.generatedAt },
          quota,
          idempotent: true,
        });
      }

      let releaseLock;
      try {
        releaseLock = await acquireUserLock(db, req.user._id, now);
        const lockedExisting = await generations.findOne({ userId: req.user._id, requestId });
        if (lockedExisting) {
          const quota = await getQuota(db, req.user._id, now());
          sendQuotaHeaders(res, quota);
          return res.json({
            generation: { id: String(lockedExisting._id), generatedAt: lockedExisting.generatedAt },
            quota,
            idempotent: true,
          });
        }

        const generatedAt = now();
        const quotaBefore = await getQuota(db, req.user._id, generatedAt);
        if (!quotaBefore.canGenerate) {
          sendQuotaHeaders(res, quotaBefore);
          if (quotaBefore.retryAfterSeconds) res.set("Retry-After", String(quotaBefore.retryAfterSeconds));
          return res.status(429).json({
            error: "You have reached the limit of 5 resume generations in 7 days.",
            code: "RESUME_WEEKLY_LIMIT_REACHED",
            quota: quotaBefore,
          });
        }

        const result = await generations.insertOne({
          userId: req.user._id,
          requestId,
          generatedAt,
          source: "resume-builder",
        });
        const quota = await getQuota(db, req.user._id, generatedAt);
        sendQuotaHeaders(res, quota);
        return res.status(201).json({
          generation: { id: String(result.insertedId), generatedAt: generatedAt.toISOString() },
          quota,
        });
      } catch (error) {
        if (error?.code === "RESUME_GENERATION_BUSY") {
          return res.status(503).json({
            error: error.message,
            code: error.code,
          });
        }
        if (error?.code === 11000) {
          const duplicate = await generations.findOne({ userId: req.user._id, requestId });
          if (duplicate) {
            const quota = await getQuota(db, req.user._id, now());
            sendQuotaHeaders(res, quota);
            return res.json({
              generation: { id: String(duplicate._id), generatedAt: duplicate.generatedAt },
              quota,
              idempotent: true,
            });
          }
        }
        throw error;
      } finally {
        await releaseLock?.();
      }
    })
  );
}
