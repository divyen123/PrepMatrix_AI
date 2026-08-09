import assert from "node:assert/strict";
import test from "node:test";
import express from "express";

import {
  KIDS_ATTEMPTS_COLLECTION,
  KIDS_CURATED_PACKS,
  KIDS_GAME_TYPES,
  KIDS_GRADE_BANDS,
  KIDS_PARENT_SETTINGS_COLLECTION,
  KIDS_SUBJECTS,
  KidsLearningValidationError,
  calculateKidsRewards,
  chooseKidsDailyMission,
  hashKidsParentPin,
  listKidsPacks,
  normalizeKidsAttemptSubmission,
  prepareKidsParentSettingsUpdate,
  publicKidsPack,
  scoreKidsPackAttempt,
  summarizeKidsProgress,
  verifyKidsParentPin,
} from "./kidsLearning.js";
import { registerKidsLearningRoutes } from "./kidsLearningRoutes.js";

function correctResponse(pack, item) {
  if (pack.gameType === "count-tap") return item.tapItems.slice(0, item.targetCount).map(({ id }) => id);
  return item.answer;
}

test("curated catalog covers every supported band, subject, and game type without exposing answers", () => {
  assert.deepEqual(new Set(KIDS_CURATED_PACKS.map(({ gradeBand }) => gradeBand)), new Set(KIDS_GRADE_BANDS));
  assert.deepEqual(new Set(KIDS_CURATED_PACKS.map(({ subject }) => subject)), new Set(KIDS_SUBJECTS));
  assert.deepEqual(new Set(KIDS_CURATED_PACKS.map(({ gameType }) => gameType)), new Set(KIDS_GAME_TYPES));

  for (const privatePack of KIDS_CURATED_PACKS) {
    const pack = publicKidsPack(privatePack);
    assert.equal(JSON.stringify(pack).includes('"answer"'), false);
    assert.equal(JSON.stringify(pack).includes('"explanation"'), false);
    assert.ok(pack.items.length > 0);
    assert.equal(pack.items.every(({ id, prompt }) => id && prompt), true);
  }

  const filtered = listKidsPacks({ gradeBand: "CLASS1-2", subject: "maths", gameType: "MCQ" });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, "class12-maths-number-quest");
});

test("server scoring handles all game schemas and grants effort rewards", () => {
  for (const pack of KIDS_CURATED_PACKS) {
    const responses = pack.items.map((item) => ({ itemId: item.id, response: correctResponse(pack, item) }));
    const score = scoreKidsPackAttempt(pack, responses);
    assert.equal(score.scorePercent, 100, pack.id);
    assert.equal(score.correctCount, pack.items.length, pack.id);
    assert.equal(score.missedItemIds.length, 0, pack.id);
  }

  const countingPack = KIDS_CURATED_PACKS.find(({ gameType }) => gameType === "count-tap");
  const countingItem = countingPack.items[0];
  const anyValidObjects = countingItem.tapItems
    .slice(-countingItem.targetCount)
    .map(({ id }) => id);
  const countingScore = scoreKidsPackAttempt(countingPack, [
    { itemId: countingItem.id, response: anyValidObjects },
  ]);
  assert.equal(countingScore.itemResults[0].correct, true);
  assert.deepEqual(countingScore.itemResults[0].correctResponse, { targetCount: countingItem.targetCount });

  const pack = KIDS_CURATED_PACKS.find(({ gameType }) => gameType === "mcq");
  const score = scoreKidsPackAttempt(pack, [{ itemId: pack.items[0].id, response: "wrong" }]);
  assert.ok(score.scorePercent < 100);
  assert.ok(score.missedItemIds.length > 0);
  assert.deepEqual(calculateKidsRewards({ scorePercent: 0, earnedPoints: 0, firstCompletion: true }), {
    starsEarned: 1,
    coinsEarned: 10,
    xpEarned: 10,
    firstCompletionBonus: 5,
  });
  assert.deepEqual(calculateKidsRewards({ scorePercent: 0, earnedPoints: 0, mode: "daily" }), {
    starsEarned: 1,
    coinsEarned: 15,
    xpEarned: 10,
    firstCompletionBonus: 0,
  });
  assert.deepEqual(calculateKidsRewards({ scorePercent: 100, earnedPoints: 3, mode: "boss" }), {
    starsEarned: 3,
    coinsEarned: 30,
    xpEarned: 40,
    firstCompletionBonus: 0,
  });
});

test("attempt and parent-setting validation reject unknown content and unsafe values", () => {
  assert.throws(
    () => normalizeKidsAttemptSubmission({ packId: "made-up", responses: [] }),
    (error) => error instanceof KidsLearningValidationError && error.code === "KIDS_PACK_NOT_FOUND",
  );
  assert.throws(
    () => prepareKidsParentSettingsUpdate({ dailyPlayLimitMinutes: 999 }),
    (error) => error instanceof KidsLearningValidationError && error.code === "KIDS_PLAY_LIMIT_INVALID",
  );

  const modePack = KIDS_CURATED_PACKS[0];
  const fullResponses = modePack.items.map((item) => ({
    itemId: item.id,
    response: correctResponse(modePack, item),
  }));
  const partialResponses = fullResponses.slice(0, 1);
  for (const mode of ["game", "daily", "boss"]) {
    assert.throws(
      () => normalizeKidsAttemptSubmission({
        packId: modePack.id,
        responses: partialResponses,
        mode,
      }),
      (error) => error instanceof KidsLearningValidationError && error.code === "KIDS_RESPONSES_INVALID",
    );
  }
  assert.equal(normalizeKidsAttemptSubmission({
    packId: modePack.id,
    responses: partialResponses,
    mode: "retry",
  }).responses.length, 1);
  assert.equal(normalizeKidsAttemptSubmission({
    packId: modePack.id,
    responses: fullResponses,
    mode: "daily",
  }).mode, "daily");
  assert.equal(normalizeKidsAttemptSubmission({
    packId: modePack.id,
    responses: fullResponses,
    mode: "not-a-mode",
  }).mode, "game");
  assert.equal(normalizeKidsAttemptSubmission({
    packId: modePack.id,
    responses: fullResponses,
    localDate: " 2026-08-01 ",
  }).localDate, "2026-08-01");
  assert.throws(
    () => normalizeKidsAttemptSubmission({
      packId: modePack.id,
      responses: fullResponses,
      localDate: "2026-02-30",
    }),
    (error) => error instanceof KidsLearningValidationError && error.code === "KIDS_LOCAL_DATE_INVALID",
  );

  const pinRecord = hashKidsParentPin("4826", { salt: "test-salt", iterations: 10 });
  assert.equal(verifyKidsParentPin("4826", pinRecord), true);
  assert.equal(verifyKidsParentPin("0000", pinRecord), false);
});

test("progress summarizes mastery, rewards, retry topics, play time, and user history", () => {
  const settings = { dailyPlayLimitMinutes: 20 };
  const attempts = [
    {
      _id: "a1",
      packId: "class12-maths-number-quest",
      gradeBand: "class1-2",
      subject: "Maths",
      gameType: "mcq",
      topic: "Addition and subtraction",
      mode: "daily",
      correctCount: 2,
      totalItems: 3,
      scorePercent: 90,
      starsEarned: 3,
      coinsEarned: 20,
      xpEarned: 40,
      durationSeconds: 300,
      missedItemIds: ["subtract-5"],
      completedAt: new Date("2026-08-01T06:00:00.000Z"),
    },
    {
      _id: "a2",
      packId: "class12-maths-number-quest",
      gradeBand: "class1-2",
      subject: "Maths",
      gameType: "mcq",
      topic: "Addition and subtraction",
      mode: "boss",
      badgeAwarded: "boss-maths",
      correctCount: 2,
      totalItems: 3,
      scorePercent: 80,
      starsEarned: 2,
      coinsEarned: 10,
      xpEarned: 30,
      durationSeconds: 180,
      missedItemIds: ["add-7", "subtract-5"],
      completedAt: new Date("2026-07-31T06:00:00.000Z"),
    },
  ];
  const progress = summarizeKidsProgress(attempts, { now: new Date("2026-08-01T12:00:00.000Z"), settings });

  assert.equal(progress.totalAttempts, 2);
  assert.equal(progress.completedPacks, 1);
  assert.equal(progress.totalStars, 5);
  assert.equal(progress.streakDays, 2);
  assert.equal(progress.playTime.minutesToday, 5);
  assert.equal(progress.bySubject.Maths.masteryLevel, "practicing");
  assert.deepEqual(progress.mastery.Maths, { correct: 4, total: 6, percentage: 67 });
  assert.deepEqual(progress.weakTopics[0], { topic: "Addition and subtraction", missedItems: 3 });
  assert.equal(progress.stars, progress.totalStars);
  assert.equal(progress.coins, progress.totalCoins);
  assert.equal(progress.streak, progress.streakDays);
  assert.deepEqual(progress.attempts, progress.recentAttempts);
  assert.deepEqual(progress.badges, ["boss-maths"]);
  assert.deepEqual(progress.completedDailyMissions, ["2026-08-01"]);
  assert.deepEqual(new Set(progress.retryQueue.map(({ itemId }) => itemId)), new Set(["add-7", "subtract-5"]));
  assert.equal(JSON.stringify(progress.retryQueue).includes('"answer"'), false);
  assert.equal(JSON.stringify(progress.retryQueue).includes('"explanation"'), false);
});

test("progress removes an older retry miss after a newer attempt marks the item correct", () => {
  const pack = KIDS_CURATED_PACKS.find(({ id }) => id === "class12-maths-number-quest");
  const retriedItem = pack.items[0];
  const attempts = [
    {
      _id: "older-miss",
      packId: pack.id,
      gradeBand: pack.gradeBand,
      subject: pack.subject,
      gameType: pack.gameType,
      topic: pack.topic,
      mode: "game",
      correctCount: 0,
      totalItems: 1,
      missedItemIds: [retriedItem.id],
      itemResults: [{ itemId: retriedItem.id, correct: false }],
      completedAt: new Date("2026-07-31T06:00:00.000Z"),
    },
    {
      _id: "newer-correct-retry",
      packId: pack.id,
      gradeBand: pack.gradeBand,
      subject: pack.subject,
      gameType: pack.gameType,
      topic: pack.topic,
      mode: "retry",
      correctCount: 1,
      totalItems: 1,
      missedItemIds: [],
      itemResults: [{ itemId: retriedItem.id, correct: true }],
      completedAt: new Date("2026-08-01T06:00:00.000Z"),
    },
  ];

  const progress = summarizeKidsProgress(attempts, { now: new Date("2026-08-01T12:00:00.000Z") });

  assert.deepEqual(progress.retryQueue, []);
});

test("progress uses a valid local date for daily completion and today's play time", () => {
  const progress = summarizeKidsProgress([{
    _id: "local-day-daily",
    packId: "class12-maths-number-quest",
    gradeBand: "class1-2",
    subject: "Maths",
    gameType: "mcq",
    topic: "Addition and subtraction",
    mode: "daily",
    localDate: "2026-08-01",
    durationSeconds: 180,
    completedAt: new Date("2026-07-31T20:30:00.000Z"),
  }], {
    now: new Date("2026-07-31T20:30:00.000Z"),
    todayKey: "2026-08-01",
  });

  assert.equal(progress.playTime.minutesToday, 3);
  assert.deepEqual(progress.completedDailyMissions, ["2026-08-01"]);
  assert.equal(progress.recentAttempts[0].localDate, "2026-08-01");
});

function sameValue(left, right) {
  return String(left) === String(right);
}

function matches(document, filter = {}) {
  return Object.entries(filter).every(([field, value]) => sameValue(document[field], value));
}

class FakeCollection {
  constructor(documents = []) {
    this.documents = documents;
    this.nextId = documents.length + 1;
  }

  async findOne(filter) {
    return this.documents.find((document) => matches(document, filter)) || null;
  }

  find(filter) {
    let rows = this.documents.filter((document) => matches(document, filter));
    const cursor = {
      sort(specification) {
        const [[field, direction]] = Object.entries(specification);
        rows = [...rows].sort((left, right) => direction * (new Date(left[field]) - new Date(right[field])));
        return cursor;
      },
      limit(count) {
        rows = rows.slice(0, count);
        return cursor;
      },
      async toArray() {
        return rows.map((document) => ({ ...document }));
      },
    };
    return cursor;
  }

  async countDocuments(filter) {
    return this.documents.filter((document) => matches(document, filter)).length;
  }

  async insertOne(document) {
    if (document.clientAttemptId && this.documents.some((item) => (
      sameValue(item.userId, document.userId) && item.clientAttemptId === document.clientAttemptId
    ))) {
      const error = new Error("duplicate");
      error.code = 11000;
      throw error;
    }
    const stored = { ...document, _id: `attempt-${this.nextId}` };
    this.nextId += 1;
    this.documents.push(stored);
    return { insertedId: stored._id };
  }

  async updateOne(filter, update, options = {}) {
    let document = this.documents.find((item) => matches(item, filter));
    if (!document && options.upsert) {
      document = { ...filter, ...update.$setOnInsert };
      this.documents.push(document);
    }
    if (!document) return { matchedCount: 0, modifiedCount: 0 };
    Object.assign(document, update.$set || {});
    for (const key of Object.keys(update.$unset || {})) delete document[key];
    return { matchedCount: 1, modifiedCount: 1, upsertedCount: options.upsert ? 1 : 0 };
  }
}

async function withKidsRoutes(run) {
  const attempts = new FakeCollection();
  const settings = new FakeCollection();
  const sessions = new FakeCollection();
  let currentTime = new Date("2026-08-01T12:00:00.000Z");
  const db = {
    collection(name) {
      if (name === KIDS_ATTEMPTS_COLLECTION) return attempts;
      if (name === KIDS_PARENT_SETTINGS_COLLECTION) return settings;
      if (name === "sessions") return sessions;
      throw new Error(`Unexpected collection: ${name}`);
    },
  };
  const app = express();
  app.use(express.json());
  const requireAuth = (handler) => async (req, res) => {
    const userId = String(req.headers.authorization || "").replace(/^Bearer\s+/iu, "");
    if (!userId) return res.status(401).json({ error: "Login required." });
    const grade = String(req.headers["x-test-grade"] || (userId === "parent-one" ? "Class 3" : "Class 2"));
    const academicLevel = String(req.headers["x-test-academic-level"] || "Primary School");
    req.user = { _id: userId, academicLevel, grade };
    req.sessionToken = `session-${userId}`;
    let session = await sessions.findOne({ token: req.sessionToken });
    if (!session) {
      await sessions.insertOne({
        token: req.sessionToken,
        userId,
        createdAt: currentTime,
        expiresAt: new Date(currentTime.getTime() + 86_400_000),
      });
      session = await sessions.findOne({ token: req.sessionToken });
    }
    req.session = session;
    return handler(req, res);
  };
  registerKidsLearningRoutes(app, {
    getDb: async () => db,
    requireAuth,
    now: () => new Date(currentTime),
  });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const { port } = server.address();
  try {
    await run({
      baseUrl: `http://127.0.0.1:${port}`,
      attempts,
      settings,
      sessions,
      setNow(value) {
        currentTime = new Date(value);
      },
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeIdleConnections?.();
    });
  }
}

function authOptions(userId, method = "GET", body = null, profile = {}) {
  const options = { method, headers: { Authorization: `Bearer ${userId}` } };
  if (profile.grade) options.headers["X-Test-Grade"] = profile.grade;
  if (profile.academicLevel) options.headers["X-Test-Academic-Level"] = profile.academicLevel;
  if (body !== null) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  return options;
}

test("Kids routes authenticate, filter sanitized packs, score on the server, and isolate progress", async () => {
  await withKidsRoutes(async ({ baseUrl, attempts }) => {
    assert.equal((await fetch(`${baseUrl}/api/kids/progress`)).status, 401);

    const packsResponse = await fetch(
      `${baseUrl}/api/kids/packs?gradeBand=class1-2&subject=Maths&gameType=mcq`,
      authOptions("user-one"),
    );
    const catalog = await packsResponse.json();
    assert.equal(packsResponse.status, 200);
    assert.equal(catalog.packs.length, 1);
    assert.equal(JSON.stringify(catalog).includes('"answer"'), false);

    const pack = KIDS_CURATED_PACKS.find(({ id }) => id === catalog.packs[0].id);
    const responses = pack.items.map((item, index) => ({
      itemId: item.id,
      response: index === 0 ? item.answer : "deliberately-wrong",
    }));
    const attemptResponse = await fetch(`${baseUrl}/api/kids/attempts`, authOptions("user-one", "POST", {
      packId: pack.id,
      clientAttemptId: "offline:attempt-0001",
      durationSeconds: 125,
      scorePercent: 100,
      responses,
    }));
    const result = await attemptResponse.json();
    assert.equal(attemptResponse.status, 201);
    assert.ok(result.evaluation.scorePercent < 100);
    assert.equal(result.attempt.scorePercent, result.evaluation.scorePercent);
    assert.equal(result.attempt.mode, "game");
    assert.equal(result.attempt.localDate, null);
    assert.equal(result.retryQueue.length, pack.items.length - 1);
    assert.equal(result.progress.totalAttempts, 1);
    assert.deepEqual(result.progress.completedDailyMissions, []);
    assert.equal(attempts.documents[0].userId, "user-one");
    assert.equal(attempts.documents[0].mode, "game");

    const replay = await fetch(`${baseUrl}/api/kids/attempts`, authOptions("user-one", "POST", {
      packId: pack.id,
      clientAttemptId: "offline:attempt-0001",
      responses,
    }));
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).replayed, true);
    assert.equal(attempts.documents.length, 1);

    const bossResponse = await fetch(`${baseUrl}/api/kids/attempts`, authOptions("user-one", "POST", {
      packId: pack.id,
      clientAttemptId: "offline:attempt-0002",
      mode: "boss",
      responses: pack.items.map((item) => ({ itemId: item.id, response: correctResponse(pack, item) })),
    }));
    const bossResult = await bossResponse.json();
    assert.equal(bossResponse.status, 400);
    assert.equal(bossResult.code, "KIDS_BOSS_MODE_INVALID");
    assert.equal(attempts.documents.length, 1);

    const retriedItem = pack.items[1];
    const retryResponse = await fetch(`${baseUrl}/api/kids/attempts`, authOptions("user-one", "POST", {
      packId: pack.id,
      clientAttemptId: "offline:attempt-0003",
      mode: "retry",
      responses: [{ itemId: retriedItem.id, response: correctResponse(pack, retriedItem) }],
    }));
    const retryResult = await retryResponse.json();
    assert.equal(retryResponse.status, 201);
    assert.equal(retryResult.attempt.mode, "retry");
    assert.equal(retryResult.attempt.totalItems, 1);
    assert.equal(retryResult.evaluation.totalItems, 1);
    assert.equal(retryResult.evaluation.correctCount, 1);
    assert.equal(retryResult.evaluation.scorePercent, 100);
    assert.equal(retryResult.evaluation.itemResults.length, 1);
    assert.equal(attempts.documents.length, 2);

    const localDate = "2026-08-02";
    const expectedMission = chooseKidsDailyMission({
      gradeBand: "class1-2",
      date: new Date(`${localDate}T12:00:00.000Z`),
    });
    const missionResponse = await fetch(
      `${baseUrl}/api/kids/daily-mission?gradeBand=class1-2&localDate=${localDate}`,
      authOptions("user-one"),
    );
    const missionPayload = await missionResponse.json();
    assert.equal(missionResponse.status, 200);
    assert.equal(missionPayload.mission.id, expectedMission.id);
    assert.equal(JSON.stringify(missionPayload).includes('"answer"'), false);

    const dailyPack = KIDS_CURATED_PACKS.find(({ id }) => id === expectedMission.id);
    const dailyResponses = dailyPack.items.map((item) => ({
      itemId: item.id,
      response: "deliberately-wrong",
    }));
    const missingDate = await fetch(`${baseUrl}/api/kids/attempts`, authOptions("user-one", "POST", {
      packId: dailyPack.id,
      mode: "daily",
      responses: dailyResponses,
    }));
    assert.equal(missingDate.status, 400);
    assert.equal((await missingDate.json()).code, "KIDS_LOCAL_DATE_REQUIRED");

    const mismatchedPack = KIDS_CURATED_PACKS.find((candidate) => (
      candidate.gradeBand === "class1-2" && candidate.id !== dailyPack.id
    ));
    const mismatch = await fetch(`${baseUrl}/api/kids/attempts`, authOptions("user-one", "POST", {
      packId: mismatchedPack.id,
      mode: "daily",
      localDate,
      responses: mismatchedPack.items.map((item) => ({ itemId: item.id, response: "deliberately-wrong" })),
    }));
    assert.equal(mismatch.status, 400);
    assert.equal((await mismatch.json()).code, "KIDS_DAILY_MISSION_MISMATCH");

    const firstDailyPackCompletion = !attempts.documents.some(({ packId }) => packId === dailyPack.id);
    const dailyResponse = await fetch(`${baseUrl}/api/kids/attempts`, authOptions("user-one", "POST", {
      packId: dailyPack.id,
      clientAttemptId: "offline:attempt-0004",
      durationSeconds: 125,
      mode: "daily",
      localDate: ` ${localDate} `,
      responses: dailyResponses,
    }));
    const dailyResult = await dailyResponse.json();
    assert.equal(dailyResponse.status, 201);
    assert.equal(dailyResult.attempt.mode, "daily");
    assert.equal(dailyResult.attempt.localDate, localDate);
    assert.equal(dailyResult.evaluation.scorePercent, 0);
    assert.equal(dailyResult.rewards.coinsEarned, calculateKidsRewards({
      scorePercent: 0,
      earnedPoints: 0,
      firstCompletion: firstDailyPackCompletion,
      mode: "daily",
    }).coinsEarned);
    assert.equal(dailyResult.progress.totalAttempts, 3);
    assert.deepEqual(dailyResult.progress.completedDailyMissions, [localDate]);
    assert.equal(dailyResult.progress.playTime.minutesToday, 2);
    assert.equal(attempts.documents.find(({ clientAttemptId }) => (
      clientAttemptId === "offline:attempt-0004"
    )).localDate, localDate);

    const repeatedDaily = await fetch(`${baseUrl}/api/kids/attempts`, authOptions("user-one", "POST", {
      packId: dailyPack.id,
      clientAttemptId: "offline:attempt-0005",
      mode: "daily",
      localDate,
      responses: dailyResponses,
    }));
    assert.equal(repeatedDaily.status, 409);
    assert.equal((await repeatedDaily.json()).code, "KIDS_DAILY_ALREADY_COMPLETED");
    assert.equal(attempts.documents.length, 3);

    const foreignProgress = await fetch(`${baseUrl}/api/kids/progress`, authOptions("user-two"));
    assert.equal((await foreignProgress.json()).progress.totalAttempts, 0);
  });
});

test("Kids routes enforce the registered Kindergarten-to-Class-3 cohort and grade band", async () => {
  await withKidsRoutes(async ({ baseUrl, attempts }) => {
    const earlyProfile = { academicLevel: "Early Years / Kindergarten", grade: "UKG" };
    const earlyResponse = await fetch(`${baseUrl}/api/kids/profile`, authOptions("early-child", "GET", null, earlyProfile));
    assert.equal(earlyResponse.status, 200);
    const earlyPayload = await earlyResponse.json();
    assert.equal(earlyPayload.profile.gradeBand, "early-years");
    assert.deepEqual(earlyPayload.parentAccess, {
      unlocked: false,
      expiresAt: null,
      setupRequired: true,
    });
    assert.equal(JSON.stringify(earlyPayload).includes("pinHash"), false);

    const classThreeProfile = { academicLevel: "Primary School", grade: "Class 3" };
    const classThreePacks = await fetch(
      `${baseUrl}/api/kids/packs?gradeBand=class3-5`,
      authOptions("class-three", "GET", null, classThreeProfile),
    );
    assert.equal(classThreePacks.status, 200);
    assert.equal((await classThreePacks.json()).packs.every((pack) => pack.gradeBand === "class3-5"), true);

    const mismatchedQuery = await fetch(
      `${baseUrl}/api/kids/packs?gradeBand=class1-2`,
      authOptions("class-three", "GET", null, classThreeProfile),
    );
    assert.equal(mismatchedQuery.status, 403);
    assert.equal((await mismatchedQuery.json()).code, "KIDS_GRADE_BAND_LOCKED");

    const mismatchedDaily = await fetch(
      `${baseUrl}/api/kids/daily-mission?gradeBand=class1-2`,
      authOptions("class-three", "GET", null, classThreeProfile),
    );
    assert.equal(mismatchedDaily.status, 403);
    assert.equal((await mismatchedDaily.json()).code, "KIDS_GRADE_BAND_LOCKED");

    const earlyPack = KIDS_CURATED_PACKS.find((pack) => pack.gradeBand === "early-years");
    const crossGradeAttempt = await fetch(`${baseUrl}/api/kids/attempts`, authOptions(
      "class-three",
      "POST",
      {
        packId: earlyPack.id,
        responses: earlyPack.items.map((item) => ({
          itemId: item.id,
          response: correctResponse(earlyPack, item),
        })),
      },
      classThreeProfile,
    ));
    assert.equal(crossGradeAttempt.status, 403);
    assert.equal((await crossGradeAttempt.json()).code, "KIDS_PACK_GRADE_MISMATCH");
    assert.equal(attempts.documents.length, 0);

    const ineligibleProfiles = [
      ["class-four", { academicLevel: "Primary School", grade: "Class 4" }],
      ["class-six", { academicLevel: "Middle School", grade: "Class 6" }],
      ["college", { academicLevel: "Undergraduate / Bachelor's", grade: "none" }],
    ];
    for (const [userId, profile] of ineligibleProfiles) {
      const response = await fetch(`${baseUrl}/api/kids/profile`, authOptions(userId, "GET", null, profile));
      assert.equal(response.status, 403, userId);
      assert.equal((await response.json()).code, "KIDS_YOUNG_PROFILE_REQUIRED", userId);
    }
  });
});

test("profile, daily mission, parent settings, and PIN verification share persisted controls", async () => {
  await withKidsRoutes(async ({ baseUrl, setNow }) => {
    const lockedGradeResponse = await fetch(`${baseUrl}/api/kids/parent-settings`, authOptions("parent-one", "PUT", {
      gradeBand: "class1-2",
    }));
    assert.equal(lockedGradeResponse.status, 400);
    assert.equal((await lockedGradeResponse.json()).code, "KIDS_GRADE_BAND_LOCKED");

    const unconfiguredProtectedUpdate = await fetch(
      `${baseUrl}/api/kids/parent-settings`,
      authOptions("parent-one", "PUT", { dailyPlayLimitMinutes: 60 }),
    );
    assert.equal(unconfiguredProtectedUpdate.status, 409);
    assert.equal(
      (await unconfiguredProtectedUpdate.json()).code,
      "KIDS_PARENT_PIN_SETUP_REQUIRED",
    );

    const updateResponse = await fetch(`${baseUrl}/api/kids/parent-settings`, authOptions("parent-one", "PUT", {
      childNickname: "Mira",
      language: "hi",
      dailyPlayLimitMinutes: 40,
      dailyMissionMinutes: 10,
      allowedSubjects: ["Science", "Maths"],
      parentPin: "4826",
    }));
    const updated = await updateResponse.json();
    assert.equal(updateResponse.status, 200);
    assert.equal(updated.settings.childNickname, "Mira");
    assert.equal(updated.settings.gradeBand, "class3-5");
    assert.equal(updated.settings.parentPinConfigured, true);
    assert.equal("pinHash" in updated.settings, false);
    assert.equal(updated.parentAccess.unlocked, true);
    assert.equal(updated.parentAccess.setupRequired, false);

    const initialAccess = await fetch(`${baseUrl}/api/kids/parent-access`, authOptions("parent-one"));
    assert.equal((await initialAccess.json()).parentAccess.unlocked, true);
    const initialLock = await fetch(
      `${baseUrl}/api/kids/parent-access/lock`,
      authOptions("parent-one", "POST", {}),
    );
    assert.equal((await initialLock.json()).parentAccess.unlocked, false);

    const languageOnly = await fetch(`${baseUrl}/api/kids/parent-settings`, authOptions("parent-one", "PUT", {
      language: "en",
    }));
    assert.equal(languageOnly.status, 200);
    assert.equal((await languageOnly.json()).settings.language, "en");

    const missingCurrentPin = await fetch(`${baseUrl}/api/kids/parent-settings`, authOptions("parent-one", "PUT", {
      childNickname: "Mira Two",
    }));
    assert.equal(missingCurrentPin.status, 403);
    assert.equal((await missingCurrentPin.json()).code, "KIDS_PARENT_PIN_REQUIRED");

    const wrongCurrentPin = await fetch(`${baseUrl}/api/kids/parent-settings`, authOptions("parent-one", "PUT", {
      childNickname: "Mira Two",
      currentParentPin: "0000",
    }));
    assert.equal(wrongCurrentPin.status, 403);
    assert.equal((await wrongCurrentPin.json()).code, "KIDS_PARENT_PIN_REQUIRED");

    const incorrectPin = await fetch(`${baseUrl}/api/kids/parent-settings/verify-pin`, authOptions("parent-one", "POST", { pin: "0000" }));
    assert.equal(incorrectPin.status, 403);
    assert.deepEqual(await incorrectPin.json(), {
      verified: false,
      error: "The parent PIN is incorrect.",
      code: "KIDS_PARENT_PIN_INCORRECT",
    });
    const correctPin = await fetch(`${baseUrl}/api/kids/parent-settings/verify-pin`, authOptions("parent-one", "POST", { pin: "4826" }));
    assert.equal(correctPin.status, 200);
    const correctPinPayload = await correctPin.json();
    assert.equal(correctPinPayload.verified, true);
    assert.equal(correctPinPayload.parentAccess.unlocked, true);
    assert.equal(correctPinPayload.parentAccess.setupRequired, false);

    setNow("2026-08-01T12:16:00.000Z");
    const expiredAccess = await fetch(`${baseUrl}/api/kids/parent-access`, authOptions("parent-one"));
    assert.deepEqual((await expiredAccess.json()).parentAccess, {
      unlocked: false,
      expiresAt: null,
      setupRequired: false,
    });

    const correctCurrentPin = await fetch(`${baseUrl}/api/kids/parent-settings`, authOptions("parent-one", "PUT", {
      childNickname: "Mira Two",
      currentParentPin: "4826",
    }));
    assert.equal(correctCurrentPin.status, 200);
    assert.equal((await correctCurrentPin.json()).settings.childNickname, "Mira Two");

    const profileResponse = await fetch(`${baseUrl}/api/kids/profile`, authOptions("parent-one"));
    const profile = await profileResponse.json();
    assert.equal(profile.profile.gradeBand, "class3-5");
    assert.equal(profile.dailyMission.gradeBand, "class3-5");
    assert.equal(["Science", "Maths"].includes(profile.dailyMission.subject), true);

    const missionResponse = await fetch(`${baseUrl}/api/kids/daily-mission?subject=Science`, authOptions("parent-one"));
    const mission = await missionResponse.json();
    assert.equal(mission.mission.subject, "Science");
    assert.equal(JSON.stringify(mission).includes('"answer"'), false);

    const relock = await fetch(
      `${baseUrl}/api/kids/parent-access/lock`,
      authOptions("parent-one", "POST", {}),
    );
    assert.equal((await relock.json()).parentAccess.unlocked, false);

    const wrongVerifyRequest = () => fetch(
      `${baseUrl}/api/kids/parent-settings/verify-pin`,
      authOptions("parent-one", "POST", { pin: "0000" }),
    );
    const wrongProtectedRequest = () => fetch(
      `${baseUrl}/api/kids/parent-settings`,
      authOptions("parent-one", "PUT", {
        childNickname: "Should not change",
        currentParentPin: "0000",
      }),
    );
    for (const request of [wrongVerifyRequest, wrongProtectedRequest, wrongVerifyRequest, wrongProtectedRequest]) {
      const response = await request();
      assert.equal(response.status, 403);
    }

    const rateLimited = await wrongVerifyRequest();
    assert.equal(rateLimited.status, 429);
    assert.equal(rateLimited.headers.get("retry-after"), "900");
    assert.deepEqual(await rateLimited.json(), {
      error: "Too many parent PIN attempts. Please wait before trying again.",
      code: "KIDS_PARENT_PIN_RATE_LIMITED",
      retryAfterSeconds: 900,
    });
  });
});
