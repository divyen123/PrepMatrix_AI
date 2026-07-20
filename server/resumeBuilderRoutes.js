import crypto from "node:crypto";

export const RESUME_GENERATIONS_COLLECTION = "resumeGenerations";
export const RESUME_GENERATION_LOCKS_COLLECTION = "resumeGenerationLocks";
export const RESUME_GENERATION_LIMIT = 5;
export const RESUME_GENERATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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

export function isResumeBuilderEnabled(profile = {}) {
  const academicTrack = cleanLine(profile.academicTrack);
  const academicLevel = cleanLine(profile.academicLevel);
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
