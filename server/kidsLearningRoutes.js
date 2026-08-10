import {
  KIDS_ATTEMPTS_COLLECTION,
  KIDS_CONTENT_VERSION,
  KIDS_PARENT_SETTINGS_COLLECTION,
  KidsLearningValidationError,
  buildKidsRetryQueue,
  calculateKidsRewards,
  chooseKidsDailyMission,
  getKidsPack,
  listKidsPacks,
  normalizeKidsAttemptSubmission,
  normalizeKidsGradeBand,
  normalizeKidsParentSettings,
  normalizeKidsSubject,
  prepareKidsParentSettingsUpdate,
  publicKidsAttempt,
  publicKidsPack,
  scoreKidsPackAttempt,
  summarizeKidsProgress,
  verifyKidsParentPin,
} from "./kidsLearning.js";
import {
  getYoungKidsAccessProfile,
  grantParentAccess,
  readParentAccess,
  revokeParentAccess,
} from "./kidsParentAccess.js";

const MAX_PROGRESS_ATTEMPTS = 500;
const PARENT_PIN_FAILURE_LIMIT = 5;
const PARENT_PIN_WINDOW_MS = 15 * 60 * 1000;
const PARENT_PIN_LOCK_MS = 15 * 60 * 1000;
const parentPinFailures = new Map();

function pinAttemptKey(req) {
  return `${String(req.user?._id || "unknown")}:${String(req.ip || req.socket?.remoteAddress || "unknown")}`;
}

function pinAttemptState(req, currentTime) {
  const key = pinAttemptKey(req);
  const nowMs = new Date(currentTime).getTime();
  const stored = parentPinFailures.get(key) || { failures: [], lockedUntil: 0 };
  const state = {
    failures: stored.failures.filter((timestamp) => nowMs - timestamp < PARENT_PIN_WINDOW_MS),
    lockedUntil: Number(stored.lockedUntil) || 0,
  };
  if (state.lockedUntil <= nowMs) state.lockedUntil = 0;
  if (!state.failures.length && !state.lockedUntil) parentPinFailures.delete(key);
  else parentPinFailures.set(key, state);
  return { key, nowMs, state };
}

function enforcePinAttemptLimit(req, res, currentTime) {
  const { nowMs, state } = pinAttemptState(req, currentTime);
  if (state.lockedUntil <= nowMs) return false;
  const retryAfterSeconds = Math.max(1, Math.ceil((state.lockedUntil - nowMs) / 1000));
  res.set("Retry-After", String(retryAfterSeconds));
  res.status(429).json({
    error: "Too many parent PIN attempts. Please wait before trying again.",
    code: "KIDS_PARENT_PIN_RATE_LIMITED",
    retryAfterSeconds,
  });
  return true;
}

function recordPinFailure(req, res, currentTime, fallbackPayload) {
  const { key, nowMs, state } = pinAttemptState(req, currentTime);
  state.failures.push(nowMs);
  if (state.failures.length < PARENT_PIN_FAILURE_LIMIT) {
    parentPinFailures.set(key, state);
    return res.status(403).json(fallbackPayload);
  }
  state.failures = [];
  state.lockedUntil = nowMs + PARENT_PIN_LOCK_MS;
  parentPinFailures.set(key, state);
  const retryAfterSeconds = Math.ceil(PARENT_PIN_LOCK_MS / 1000);
  res.set("Retry-After", String(retryAfterSeconds));
  return res.status(429).json({
    error: "Too many parent PIN attempts. Please wait before trying again.",
    code: "KIDS_PARENT_PIN_RATE_LIMITED",
    retryAfterSeconds,
  });
}

function clearPinFailures(req) {
  parentPinFailures.delete(pinAttemptKey(req));
}

function kidsRoute(handler) {
  return async (req, res) => {
    try {
      return await handler(req, res);
    } catch (error) {
      if (error instanceof KidsLearningValidationError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      throw error;
    }
  };
}

function youngKidsProfile(req) {
  const profile = getYoungKidsAccessProfile(req.user);
  if (!profile.eligible || !profile.gradeBand) {
    throw new KidsLearningValidationError(
      "Kids Play & Learn is available for Kindergarten through Class 3 profiles.",
      { code: "KIDS_YOUNG_PROFILE_REQUIRED", status: 403 },
    );
  }
  return profile;
}

function lockedGradeBand(req) {
  return youngKidsProfile(req).gradeBand;
}

function rejectGradeBandOverride(value, expectedGradeBand) {
  if (value === undefined || value === null || value === "") return;
  const requested = normalizeKidsGradeBand(value);
  if (requested !== expectedGradeBand) {
    throw new KidsLearningValidationError(
      "Kids activities are locked to the learner's registered class.",
      { code: "KIDS_GRADE_BAND_LOCKED", status: 403 },
    );
  }
}

function rejectParentGradeBandMutation(payload) {
  if (payload && Object.prototype.hasOwnProperty.call(payload, "gradeBand")) {
    throw new KidsLearningValidationError(
      "The Kids learning level comes from the registered class and cannot be changed here.",
      { code: "KIDS_GRADE_BAND_LOCKED" },
    );
  }
}

async function loadParentSettings(db, userId, gradeBand) {
  const document = await db.collection(KIDS_PARENT_SETTINGS_COLLECTION).findOne({ userId });
  return {
    document,
    settings: {
      ...normalizeKidsParentSettings(document || {}),
      gradeBand,
    },
  };
}

async function loadAttempts(db, userId) {
  return db.collection(KIDS_ATTEMPTS_COLLECTION)
    .find({ userId })
    .sort({ completedAt: -1, _id: -1 })
    .limit(MAX_PROGRESS_ATTEMPTS)
    .toArray();
}

async function loadProgress(db, userId, now, todayKey = null, gradeBand) {
  const [{ settings }, attempts] = await Promise.all([
    loadParentSettings(db, userId, gradeBand),
    loadAttempts(db, userId),
  ]);
  return summarizeKidsProgress(attempts, { now, settings, todayKey });
}

function evaluationFromAttempt(document) {
  return {
    correctCount: Number(document.correctCount) || 0,
    totalItems: Number(document.totalItems) || 0,
    earnedPoints: Number(document.earnedPoints) || 0,
    possiblePoints: Number(document.possiblePoints) || 0,
    scorePercent: Number(document.scorePercent) || 0,
    itemResults: Array.isArray(document.itemResults) ? document.itemResults : [],
  };
}

function rewardFromAttempt(document) {
  return {
    starsEarned: Number(document.starsEarned) || 0,
    coinsEarned: Number(document.coinsEarned) || 0,
    xpEarned: Number(document.xpEarned) || 0,
    firstCompletionBonus: Number(document.firstCompletionBonus) || 0,
    badgeAwarded: String(document.badgeAwarded || ""),
  };
}

async function attemptResponse({ db, document, now, gradeBand, replayed = false }) {
  const pack = getKidsPack(document.packId);
  const progress = await loadProgress(db, document.userId, now, document.localDate, gradeBand);
  return {
    replayed,
    attempt: publicKidsAttempt(document),
    rewards: rewardFromAttempt(document),
    evaluation: evaluationFromAttempt(document),
    retryQueue: pack ? buildKidsRetryQueue(pack, document.missedItemIds) : [],
    progress,
  };
}

function missionForSettings(settings, query, now, gradeBand) {
  const subject = normalizeKidsSubject(query.subject, { optional: true });
  return chooseKidsDailyMission({
    gradeBand,
    subject,
    allowedSubjects: settings.allowedSubjects,
    date: normalizedMissionDate(query.localDate, now),
  });
}

function normalizedMissionDate(localDate, fallback) {
  const candidate = String(localDate || "").trim();
  const parsed = /^\d{4}-\d{2}-\d{2}$/u.test(candidate)
    ? new Date(`${candidate}T12:00:00.000Z`)
    : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : fallback;
}

function localDateIsPlausible(localDate, serverTime) {
  const localDay = normalizedMissionDate(localDate, null);
  const current = new Date(serverTime);
  if (!localDay || !Number.isFinite(current.getTime())) return false;
  const serverDay = new Date(`${current.toISOString().slice(0, 10)}T12:00:00.000Z`);
  return Math.abs(localDay.getTime() - serverDay.getTime()) <= 86_400_000;
}

export function registerKidsLearningRoutes(app, {
  getDb,
  requireAuth,
  now = () => new Date(),
}) {
  app.get("/api/kids/packs", requireAuth(kidsRoute(async (req, res) => {
    const gradeBand = lockedGradeBand(req);
    rejectGradeBandOverride(req.query.gradeBand || req.query.ageBand, gradeBand);
    const packs = listKidsPacks({
      gradeBand,
      subject: req.query.subject,
      gameType: req.query.gameType,
    });
    res.set("Cache-Control", "private, max-age=300");
    return res.json({
      version: KIDS_CONTENT_VERSION,
      filters: {
        gradeBand,
        subject: req.query.subject ? normalizeKidsSubject(req.query.subject) : null,
        gameType: req.query.gameType || null,
      },
      packs,
    });
  })));

  app.get("/api/kids/packs/:id", requireAuth(kidsRoute(async (req, res) => {
    const gradeBand = lockedGradeBand(req);
    const pack = getKidsPack(req.params.id);
    if (!pack) {
      return res.status(404).json({
        error: "That Kids activity pack was not found.",
        code: "KIDS_PACK_NOT_FOUND",
      });
    }
    if (pack.gradeBand !== gradeBand) {
      throw new KidsLearningValidationError(
        "That activity is not available for the learner's registered class.",
        { code: "KIDS_PACK_GRADE_MISMATCH", status: 403 },
      );
    }
    res.set("Cache-Control", "private, max-age=300");
    return res.json({ version: KIDS_CONTENT_VERSION, pack: publicKidsPack(pack) });
  })));

  app.get("/api/kids/progress", requireAuth(kidsRoute(async (req, res) => {
    const gradeBand = lockedGradeBand(req);
    const db = await getDb();
    const progress = await loadProgress(db, req.user._id, now(), req.query.localDate, gradeBand);
    res.set("Cache-Control", "no-store");
    return res.json({ progress });
  })));

  app.get("/api/kids/daily-mission", requireAuth(kidsRoute(async (req, res) => {
    const gradeBand = lockedGradeBand(req);
    rejectGradeBandOverride(req.query.gradeBand || req.query.ageBand, gradeBand);
    const db = await getDb();
    const { settings } = await loadParentSettings(db, req.user._id, gradeBand);
    const mission = missionForSettings(settings, req.query, now(), gradeBand);
    res.set("Cache-Control", "no-store");
    return res.json({ date: mission.missionDate, mission });
  })));

  app.get("/api/kids/profile", requireAuth(kidsRoute(async (req, res) => {
    const gradeBand = lockedGradeBand(req);
    rejectGradeBandOverride(req.query.gradeBand || req.query.ageBand, gradeBand);
    const db = await getDb();
    const currentTime = now();
    const [{ settings }, attempts] = await Promise.all([
      loadParentSettings(db, req.user._id, gradeBand),
      loadAttempts(db, req.user._id),
    ]);
    const progress = summarizeKidsProgress(attempts, {
      now: currentTime,
      settings,
      todayKey: req.query.localDate,
    });
    const dailyMission = missionForSettings(settings, req.query, currentTime, gradeBand);
    const parentAccess = await readParentAccess(db, req.sessionToken, {
      parentPinConfigured: settings.parentPinConfigured,
      now: currentTime,
    });
    res.set("Cache-Control", "no-store");
    return res.json({
      profile: {
        childNickname: settings.childNickname,
        gradeBand: settings.gradeBand,
        language: settings.language,
        allowedSubjects: settings.allowedSubjects,
      },
      settings,
      progress,
      dailyMission,
      parentAccess,
    });
  })));

  app.post("/api/kids/attempts", requireAuth(kidsRoute(async (req, res) => {
    const gradeBand = lockedGradeBand(req);
    const { pack, responses, durationSeconds, clientAttemptId, mode, localDate } = normalizeKidsAttemptSubmission(req.body);
    if (pack.gradeBand !== gradeBand) {
      throw new KidsLearningValidationError(
        "That activity is not available for the learner's registered class.",
        { code: "KIDS_PACK_GRADE_MISMATCH", status: 403 },
      );
    }
    const db = await getDb();
    const attempts = db.collection(KIDS_ATTEMPTS_COLLECTION);
    const userId = req.user._id;
    const completedAt = now();

    if (clientAttemptId) {
      const existing = await attempts.findOne({ userId, clientAttemptId });
      if (existing) {
        res.set("Cache-Control", "no-store");
        return res.json(await attemptResponse({
          db,
          document: existing,
          now: completedAt,
          gradeBand,
          replayed: true,
        }));
      }
    }

    if (mode === "boss") {
      throw new KidsLearningValidationError("Boss rewards are only available from a verified Boss activity.", {
        code: "KIDS_BOSS_MODE_INVALID",
      });
    }

    if (mode === "daily") {
      if (!localDate) {
        throw new KidsLearningValidationError("Daily missions require the learner's local activity date.", {
          code: "KIDS_LOCAL_DATE_REQUIRED",
        });
      }
      if (!localDateIsPlausible(localDate, completedAt)) {
        throw new KidsLearningValidationError("Daily missions must use today's local activity date.", {
          code: "KIDS_LOCAL_DATE_OUT_OF_RANGE",
        });
      }
      const { settings } = await loadParentSettings(db, userId, gradeBand);
      const expectedMission = missionForSettings(settings, {
        localDate,
      }, completedAt, gradeBand);
      if (expectedMission.id !== pack.id) {
        throw new KidsLearningValidationError("Complete today's assigned mission to earn the Daily bonus.", {
          code: "KIDS_DAILY_MISSION_MISMATCH",
        });
      }
      const completedToday = await attempts.countDocuments({
        userId,
        mode: "daily",
        localDate,
      }, { limit: 1 });
      if (completedToday > 0) {
        throw new KidsLearningValidationError("Today's Daily mission is already complete.", {
          code: "KIDS_DAILY_ALREADY_COMPLETED",
          status: 409,
        });
      }
    }

    if (mode === "retry") {
      const currentProgress = await loadProgress(db, userId, completedAt, localDate, gradeBand);
      const allowedRetryItems = new Set(
        (currentProgress.retryQueue || []).map((entry) => `${entry.packId}:${entry.itemId || entry.id}`),
      );
      const retryIsAssigned = responses.every((response) => (
        allowedRetryItems.has(`${pack.id}:${response.itemId}`)
      ));
      if (!retryIsAssigned) {
        throw new KidsLearningValidationError("Only assigned tricky questions can use Retry mode.", {
          code: "KIDS_RETRY_ITEMS_INVALID",
        });
      }
    }

    const responseItemIds = new Set(responses.map((response) => response.itemId));
    const scoringPack = mode === "retry"
      ? { ...pack, items: pack.items.filter((item) => responseItemIds.has(item.id)) }
      : pack;
    const score = scoreKidsPackAttempt(scoringPack, responses);
    const previousCompletions = await attempts.countDocuments({ userId, packId: pack.id }, { limit: 1 });
    const rewards = calculateKidsRewards({
      scorePercent: score.scorePercent,
      earnedPoints: score.earnedPoints,
      firstCompletion: previousCompletions === 0,
      mode,
    });
    const document = {
      userId,
      ...(clientAttemptId ? { clientAttemptId } : {}),
      contentVersion: KIDS_CONTENT_VERSION,
      packId: pack.id,
      gradeBand: pack.gradeBand,
      subject: pack.subject,
      gameType: pack.gameType,
      topic: pack.topic,
      mode,
      ...(localDate ? { localDate } : {}),
      correctCount: score.correctCount,
      totalItems: score.totalItems,
      earnedPoints: score.earnedPoints,
      possiblePoints: score.possiblePoints,
      scorePercent: score.scorePercent,
      missedItemIds: score.missedItemIds,
      itemResults: score.itemResults,
      durationSeconds,
      ...rewards,
      badgeAwarded: "",
      completedAt,
      createdAt: completedAt,
    };

    try {
      const result = await attempts.insertOne(document);
      document._id = result.insertedId;
    } catch (error) {
      if (error?.code !== 11000) throw error;
      if (clientAttemptId) {
        const existing = await attempts.findOne({ userId, clientAttemptId });
        if (existing) {
          res.set("Cache-Control", "no-store");
          return res.json(await attemptResponse({
            db,
            document: existing,
            now: completedAt,
            gradeBand,
            replayed: true,
          }));
        }
      }
      if (mode === "daily") {
        return res.status(409).json({
          error: "Today's Daily mission is already complete.",
          code: "KIDS_DAILY_ALREADY_COMPLETED",
        });
      }
      throw error;
    }

    res.set("Cache-Control", "no-store");
    return res.status(201).json(await attemptResponse({
      db,
      document,
      now: completedAt,
      gradeBand,
    }));
  })));

  app.get("/api/kids/parent-settings", requireAuth(kidsRoute(async (req, res) => {
    const gradeBand = lockedGradeBand(req);
    const db = await getDb();
    const currentTime = now();
    const { settings } = await loadParentSettings(db, req.user._id, gradeBand);
    const parentAccess = await readParentAccess(db, req.sessionToken, {
      parentPinConfigured: settings.parentPinConfigured,
      now: currentTime,
    });
    res.set("Cache-Control", "no-store");
    return res.json({ settings, parentAccess });
  })));

  app.put("/api/kids/parent-settings", requireAuth(kidsRoute(async (req, res) => {
    const gradeBand = lockedGradeBand(req);
    rejectParentGradeBandMutation(req.body);
    const db = await getDb();
    const collection = db.collection(KIDS_PARENT_SETTINGS_COLLECTION);
    const existing = await collection.findOne({ userId: req.user._id });
    const requestedKeys = Object.keys(req.body || {}).filter((key) => key !== "currentParentPin");
    const changesProtectedSettings = requestedKeys.length > 0;
    const hasExistingParentPin = Boolean(existing?.pinHash && existing?.pinSalt);
    const isCreatingParentPin = Object.prototype.hasOwnProperty.call(req.body || {}, "parentPin");
    if (!hasExistingParentPin && changesProtectedSettings && !isCreatingParentPin) {
      return res.status(409).json({
        error: "Set the parent PIN before changing Kids settings.",
        code: "KIDS_PARENT_PIN_SETUP_REQUIRED",
      });
    }
    const currentTime = now();
    let parentAccess = await readParentAccess(db, req.sessionToken, {
      parentPinConfigured: hasExistingParentPin,
      now: currentTime,
    });
    if (hasExistingParentPin && changesProtectedSettings) {
      if (!parentAccess.unlocked) {
        if (enforcePinAttemptLimit(req, res, currentTime)) return undefined;
        if (!verifyKidsParentPin(req.body?.currentParentPin, existing)) {
          return recordPinFailure(req, res, currentTime, {
            error: "Verify the current parent PIN before changing Kids settings.",
            code: "KIDS_PARENT_PIN_REQUIRED",
          });
        }
        clearPinFailures(req);
        parentAccess = await grantParentAccess(db, req.sessionToken, {
          parentPinConfigured: true,
          now: currentTime,
        });
      }
    }
    const update = prepareKidsParentSettingsUpdate(
      req.body,
      { ...(existing || {}), gradeBand },
      currentTime,
    );
    update.set.gradeBand = gradeBand;
    const operation = {
      $set: update.set,
      $setOnInsert: { userId: req.user._id, createdAt: currentTime },
      ...(Object.keys(update.unset).length ? { $unset: update.unset } : {}),
    };
    await collection.updateOne({ userId: req.user._id }, operation, { upsert: true });
    const stored = await collection.findOne({ userId: req.user._id });
    const settings = {
      ...normalizeKidsParentSettings(stored || { ...existing, ...update.set }),
      gradeBand,
    };
    if (req.body?.clearParentPin === true) {
      parentAccess = await revokeParentAccess(db, req.sessionToken, {
        parentPinConfigured: false,
        now: currentTime,
      });
    } else if (!hasExistingParentPin && settings.parentPinConfigured) {
      parentAccess = await grantParentAccess(db, req.sessionToken, {
        parentPinConfigured: true,
        now: currentTime,
      });
    } else {
      parentAccess = await readParentAccess(db, req.sessionToken, {
        parentPinConfigured: settings.parentPinConfigured,
        now: currentTime,
      });
    }
    res.set("Cache-Control", "no-store");
    return res.json({ settings, parentAccess });
  })));

  app.post("/api/kids/parent-settings/verify-pin", requireAuth(kidsRoute(async (req, res) => {
    lockedGradeBand(req);
    const db = await getDb();
    const document = await db.collection(KIDS_PARENT_SETTINGS_COLLECTION).findOne({ userId: req.user._id });
    if (!document?.pinHash) {
      return res.status(409).json({
        error: "Set a parent PIN before using PIN verification.",
        code: "KIDS_PARENT_PIN_NOT_SET",
      });
    }
    const currentTime = now();
    if (enforcePinAttemptLimit(req, res, currentTime)) return undefined;
    const verified = verifyKidsParentPin(req.body?.pin, document);
    if (!verified) {
      return recordPinFailure(req, res, currentTime, {
        verified: false,
        error: "The parent PIN is incorrect.",
        code: "KIDS_PARENT_PIN_INCORRECT",
      });
    }
    clearPinFailures(req);
    const parentAccess = await grantParentAccess(db, req.sessionToken, {
      parentPinConfigured: true,
      now: currentTime,
    });
    res.set("Cache-Control", "no-store");
    return res.json({ verified: true, parentAccess });
  })));

  app.get("/api/kids/parent-access", requireAuth(kidsRoute(async (req, res) => {
    const gradeBand = lockedGradeBand(req);
    const db = await getDb();
    const currentTime = now();
    const { settings } = await loadParentSettings(db, req.user._id, gradeBand);
    const parentAccess = await readParentAccess(db, req.sessionToken, {
      parentPinConfigured: settings.parentPinConfigured,
      now: currentTime,
    });
    res.set("Cache-Control", "no-store");
    return res.json({ parentAccess });
  })));

  app.post("/api/kids/parent-access/lock", requireAuth(kidsRoute(async (req, res) => {
    const gradeBand = lockedGradeBand(req);
    const db = await getDb();
    const currentTime = now();
    const { settings } = await loadParentSettings(db, req.user._id, gradeBand);
    const parentAccess = await revokeParentAccess(db, req.sessionToken, {
      parentPinConfigured: settings.parentPinConfigured,
      now: currentTime,
    });
    res.set("Cache-Control", "no-store");
    return res.json({ parentAccess });
  })));
}

export default registerKidsLearningRoutes;
