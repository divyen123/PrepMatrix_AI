import assert from "node:assert/strict";
import test from "node:test";

import {
  FALLBACK_KIDS_PACKS,
  KIDS_GAME_TYPES,
  KIDS_STORAGE_PREFIX,
  KIDS_STORAGE_VERSION,
  applyKidsAttempt,
  buildLocalBossPack,
  buildLocalDailyMission,
  buildLocalRetryPack,
  createDefaultKidsProgress,
  evaluateLocalKidsAttempt,
  getKidsAgeBand,
  getKidsStorageKey,
  hashParentPin,
  isKidsResponseCorrect,
  isValidParentPin,
  loadKidsLocalState,
  mergeKidsProgress,
  normalizeKidsPack,
  saveKidsLocalState,
  verifyParentPin,
} from "./kidsLearning.js";

test("maps canonical learner profiles and grade aliases to Kids age bands", () => {
  const cases = [
    ["Early Years / Kindergarten", "early-years"],
    ["Nursery", "early-years"],
    ["LKG", "early-years"],
    ["UKG", "early-years"],
    ["Pre-school", "early-years"],
    ["early-years", "early-years"],
    ["Primary School", "class1-2"],
    ["Class 1", "class1-2"],
    ["Std. 2", "class1-2"],
    ["class1-2", "class1-2"],
    ["Grade 3", "class3-5"],
    ["Standard 4", "class3-5"],
    ["Class 5", "class3-5"],
    ["class3-5", "class3-5"],
  ];

  cases.forEach(([academicLevel, expected]) => {
    assert.equal(getKidsAgeBand(academicLevel), expected, academicLevel);
  });
  assert.equal(getKidsAgeBand(), "class1-2");
});

test("normalizes backend game-type aliases and safe pack defaults", () => {
  const aliases = {
    "match-pairs": "matching",
    match: "matching",
    sort: "sorting",
    "word-scramble": "scramble",
    choice: "mcq",
  };

  Object.entries(aliases).forEach(([backendType, localType], index) => {
    const pack = normalizeKidsPack({
      _id: `backend-${index}`,
      gameType: backendType,
      estimatedMinutes: 99,
      items: [{ _id: `question-${index}`, question: "  Backend question  " }],
    }, index);

    assert.equal(pack.id, `backend-${index}`);
    assert.equal(pack.gameType, localType);
    assert.equal(pack.estimatedMinutes, 15);
    assert.equal(pack.items[0].id, `question-${index}`);
    assert.equal(pack.items[0].prompt, "  Backend question  ");
    assert.equal(pack.source, "server");
  });

  const fallback = normalizeKidsPack({ gameType: "unsupported", estimatedMinutes: 0 }, 4);
  assert.equal(fallback.id, "kids-pack-5");
  assert.equal(fallback.gameType, "mcq");
  assert.equal(fallback.estimatedMinutes, 4);
  assert.deepEqual(fallback.items, []);
});

function normalizedCorrectResponse(answer, gameType) {
  if (gameType === "count-tap") return Number(answer);
  if (Array.isArray(answer)) return answer.map((value) => ` ${String(value).toUpperCase()} `);
  if (answer && typeof answer === "object") {
    return Object.fromEntries(Object.entries(answer).reverse().map(([key, value]) => (
      [` ${key.toUpperCase()} `, ` ${String(value).toUpperCase()} `]
    )));
  }
  return ` ${String(answer).toUpperCase()} `;
}

test("scores every local game schema, including numeric count-tap responses", () => {
  assert.deepEqual(
    new Set(FALLBACK_KIDS_PACKS.map(({ gameType }) => gameType)),
    new Set(Object.keys(KIDS_GAME_TYPES)),
  );

  FALLBACK_KIDS_PACKS.forEach((pack) => {
    const responses = Object.fromEntries(pack.items.map((item) => (
      [item.id, normalizedCorrectResponse(item.answer, pack.gameType)]
    )));
    const result = evaluateLocalKidsAttempt(pack, responses);

    assert.equal(result.total, pack.items.length, pack.id);
    assert.equal(result.correct, pack.items.length, pack.id);
    assert.equal(result.percentage, 100, pack.id);
    assert.ok(result.evaluations.every(({ correct }) => correct), pack.id);

    responses[pack.items[0].id] = "definitely incorrect";
    assert.equal(evaluateLocalKidsAttempt(pack, responses).evaluations[0].correct, false, pack.id);
  });
});

test("compares scalar, ordered, and key-value game answers consistently", () => {
  assert.equal(isKidsResponseCorrect("  New   Delhi ", "new delhi"), true);
  assert.equal(isKidsResponseCorrect(["Seed", "Sprout"], [" seed ", "SPROUT"]), true);
  assert.equal(isKidsResponseCorrect(["Seed", "Sprout"], ["Sprout", "Seed"]), false);
  assert.equal(isKidsResponseCorrect(
    { Sunlight: "Renewable", Coal: "Non-renewable" },
    { " coal ": " NON-RENEWABLE ", SUNLIGHT: "renewable" },
  ), true);
  assert.equal(isKidsResponseCorrect({ Sunlight: "Renewable" }, {}), false);
});

test("awards the same partial credit offline for mapping and sequence games", () => {
  const mapping = evaluateLocalKidsAttempt({
    id: "mapping-pack",
    subject: "EVS",
    items: [{
      id: "map-1",
      answer: { a: "one", b: "two", c: "three", d: "four" },
    }],
  }, {
    "map-1": { a: "one", b: "two", c: "three", d: "wrong" },
  });
  assert.equal(mapping.earnedPoints, 3);
  assert.equal(mapping.possiblePoints, 4);
  assert.equal(mapping.percentage, 75);
  assert.equal(mapping.correct, 0);

  const sequence = evaluateLocalKidsAttempt({
    id: "sequence-pack",
    subject: "EVS",
    items: [{ id: "sequence-1", answer: ["seed", "sprout", "flower"] }],
  }, {
    "sequence-1": ["seed", "flower", "sprout"],
  });
  assert.equal(sequence.earnedPoints, 1);
  assert.equal(sequence.possiblePoints, 3);
  assert.equal(sequence.percentage, 33);
});

test("applies effort rewards, mastery, streaks, badges, and gentle retry updates", () => {
  const first = applyKidsAttempt(createDefaultKidsProgress(), {
    id: "attempt-1",
    packId: "math-pack",
    subject: "Maths",
    correct: 1,
    total: 2,
    evaluations: [
      { itemId: "q1", correct: true },
      { itemId: "q2", correct: false },
    ],
  }, {
    today: "2026-08-01",
    completedAt: "2026-08-01T08:00:00.000Z",
  });

  assert.equal(first.stars, 3);
  assert.equal(first.coins, 10);
  assert.equal(first.streak, 1);
  assert.deepEqual(first.mastery.Maths, { correct: 1, total: 2, percentage: 50 });
  assert.deepEqual(first.retryQueue, [{
    packId: "math-pack",
    itemId: "q2",
    subject: "Maths",
    addedAt: "2026-08-01",
  }]);
  assert.deepEqual(first.lastReward, { stars: 3, coins: 10, badgeAwarded: "" });

  const mastered = applyKidsAttempt(first, {
    id: "attempt-2",
    packId: "math-pack",
    subject: "Maths",
    correct: 3,
    total: 3,
    evaluations: [
      { itemId: "q2", correct: true },
      { itemId: "q3", correct: true },
      { itemId: "q4", correct: true },
    ],
  }, {
    today: "2026-08-02",
    completedAt: "2026-08-02T08:00:00.000Z",
    isBossRound: true,
  });

  assert.equal(mastered.stars, 10);
  assert.equal(mastered.coins, 45);
  assert.equal(mastered.streak, 2);
  assert.deepEqual(mastered.mastery.Maths, { correct: 4, total: 5, percentage: 80 });
  assert.deepEqual(mastered.retryQueue, []);
  assert.ok(mastered.badges.includes("mastery-maths"));
  assert.deepEqual(mastered.lastReward, {
    stars: 7,
    coins: 35,
    badgeAwarded: "mastery-maths",
  });
  assert.equal(mastered.attempts[0].mode, "boss");

  const daily = applyKidsAttempt(mastered, {
    id: "attempt-3",
    packId: "daily-class1-2",
    subject: "EVS",
    correct: 1,
    total: 1,
    evaluations: [{ itemId: "evs-1", correct: true }],
  }, {
    today: "2026-08-02",
    completedAt: "2026-08-02T09:00:00.000Z",
    isDailyMission: true,
  });

  assert.equal(daily.streak, 2);
  assert.equal(daily.stars, 13);
  assert.equal(daily.coins, 65);
  assert.deepEqual(daily.completedDailyMissions, ["2026-08-02"]);
  assert.equal(daily.attempts[0].mode, "daily");
  assert.deepEqual(daily.lastReward, { stars: 3, coins: 20, badgeAwarded: "" });

  const afterGap = applyKidsAttempt(daily, {
    id: "attempt-4",
    packId: "retry-pack",
    subject: "English",
    correct: 0,
    total: 0,
    evaluations: [],
  }, { today: "2026-08-05", isRetry: true });
  assert.equal(afterGap.streak, 1);
  assert.equal(afterGap.attempts[0].mode, "retry");
});

test("merges progress without double-counting attempts or losing local achievements", () => {
  const merged = mergeKidsProgress({
    stars: 12,
    coins: 5,
    streak: 4,
    badges: ["local-badge"],
    attempts: [
      { id: "shared", packId: "local-version" },
      { id: "local", packId: "local-only" },
    ],
    completedDailyMissions: ["2026-08-01"],
    mastery: { Maths: { correct: 4, total: 5, percentage: 80 } },
    retryQueue: [{ packId: "offline-pack", itemId: "offline-item", addedAt: "2026-08-01" }],
  }, {
    stars: 8,
    coins: 30,
    streak: 2,
    badges: ["server-badge"],
    attempts: [
      { id: "shared", packId: "server-version" },
      { id: "server", packId: "server-only" },
    ],
    completedDailyMissions: ["2026-08-01", "2026-08-02"],
    mastery: { Maths: { correct: 3, total: 3, percentage: 100 } },
    retryQueue: [{ packId: "server-pack", itemId: "server-item" }],
  });

  assert.equal(merged.stars, 12);
  assert.equal(merged.coins, 30);
  assert.equal(merged.streak, 4);
  assert.deepEqual(merged.badges, ["local-badge", "server-badge"]);
  assert.deepEqual(merged.attempts.map(({ id }) => id), ["shared", "server", "local"]);
  assert.equal(merged.attempts[0].packId, "server-version");
  assert.deepEqual(merged.completedDailyMissions, ["2026-08-01", "2026-08-02"]);
  assert.deepEqual(merged.mastery.Maths, { correct: 7, total: 8, percentage: 88 });
  assert.deepEqual(merged.retryQueue, [
    { packId: "offline-pack", itemId: "offline-item", addedAt: "2026-08-01" },
    { packId: "server-pack", itemId: "server-item" },
  ]);

  const resolved = mergeKidsProgress({
    retryQueue: [{ packId: "server-pack", itemId: "resolved-item", prompt: "Try me" }],
  }, {
    retryQueue: [],
  });
  assert.deepEqual(resolved.retryQueue, []);
});

test("keeps offline reward deltas additive as online totals advance", () => {
  const offline = applyKidsAttempt(createDefaultKidsProgress(), {
    id: "offline-1",
    packId: "offline-pack",
    subject: "English",
    correct: 1,
    total: 1,
    evaluations: [{ itemId: "word-1", correct: true }],
  }, { today: "2026-08-01" });

  assert.equal(offline.stars, 3);
  assert.equal(offline.offlineStars, 3);
  assert.deepEqual(offline.offlineMastery.English, { correct: 1, total: 1, percentage: 100 });

  const firstSync = mergeKidsProgress(offline, {
    stars: 100,
    coins: 200,
    mastery: { English: { correct: 8, total: 10, percentage: 80 } },
  });
  assert.equal(firstSync.stars, 103);
  assert.equal(firstSync.coins, 210);
  assert.deepEqual(firstSync.mastery.English, { correct: 9, total: 11, percentage: 82 });

  const secondSync = mergeKidsProgress(firstSync, {
    stars: 102,
    coins: 215,
    mastery: { English: { correct: 9, total: 11, percentage: 82 } },
  });
  assert.equal(secondSync.stars, 105);
  assert.equal(secondSync.coins, 225);
  assert.deepEqual(secondSync.mastery.English, { correct: 10, total: 12, percentage: 83 });
});

test("builds retry-first daily missions, retry practice, and subject boss rounds", () => {
  const progress = {
    ...createDefaultKidsProgress(),
    retryQueue: [
      { packId: "early-maths-count", itemId: "early-count-5" },
      { packId: "early-evs-match", itemId: "early-match-homes" },
    ],
  };
  const daily = buildLocalDailyMission("early-years", progress);

  assert.equal(daily.id, "daily-early-years");
  assert.equal(daily.items.length, 5);
  assert.deepEqual(daily.items.slice(0, 2).map(({ id }) => id), [
    "early-count-5",
    "early-match-homes",
  ]);
  assert.equal(new Set(daily.items.map(({ id }) => id)).size, daily.items.length);
  assert.ok(daily.items.every(({ originalGameType }) => KIDS_GAME_TYPES[originalGameType]));
  assert.equal(daily.mixedGameTypes, true);

  const retry = buildLocalRetryPack("early-years", progress);
  assert.deepEqual(retry.items.map(({ id }) => id), ["early-count-5", "early-match-homes"]);
  assert.deepEqual(retry.items.map(({ originalPackId }) => originalPackId), [
    "early-maths-count",
    "early-evs-match",
  ]);
  assert.equal(buildLocalRetryPack("early-years", createDefaultKidsProgress()), null);

  const boss = buildLocalBossPack("early-years", "English");
  assert.equal(boss.id, "boss-early-years-english");
  assert.equal(boss.subject, "English");
  assert.equal(boss.items.length, 5);
  assert.deepEqual(new Set(boss.items.map(({ originalGameType }) => originalGameType)), new Set([
    "listen-pick",
    "picture-choice",
  ]));
  assert.equal(buildLocalBossPack("early-years", "Science"), null);
});

function memoryStorage(initialValue) {
  let value = initialValue;
  return {
    getItem() {
      return value;
    },
    setItem(_key, nextValue) {
      value = nextValue;
    },
    value() {
      return value;
    },
  };
}

test("normalizes versioned local state and safely persists only supported fields", () => {
  const storage = memoryStorage(JSON.stringify({
    version: KIDS_STORAGE_VERSION,
    progress: { stars: 7, mastery: { Maths: { correct: 2, total: 3, percentage: 67 } } },
    settings: { language: "hi", timeLimitMinutes: 30 },
    selectedAgeBand: "not-a-band",
  }));
  const loaded = loadKidsLocalState(storage, "kids-state");

  assert.equal(loaded.progress.stars, 7);
  assert.equal(loaded.progress.coins, 0);
  assert.deepEqual(loaded.progress.retryQueue, []);
  assert.equal(loaded.settings.language, "hi");
  assert.equal(loaded.settings.timeLimitMinutes, 30);
  assert.equal(loaded.settings.audioEnabled, true);
  assert.equal(loaded.selectedAgeBand, "");

  const state = {
    ...loaded,
    selectedAgeBand: "class3-5",
    ignored: "do not persist",
  };
  assert.equal(saveKidsLocalState(storage, "kids-state", state), true);
  const persisted = JSON.parse(storage.value());
  assert.deepEqual(Object.keys(persisted).sort(), [
    "progress",
    "selectedAgeBand",
    "settings",
    "version",
  ]);
  assert.equal(persisted.version, KIDS_STORAGE_VERSION);
  assert.equal(loadKidsLocalState(storage, "kids-state").selectedAgeBand, "class3-5");

  assert.equal(loadKidsLocalState(memoryStorage("not-json"), "kids-state"), null);
  assert.equal(loadKidsLocalState(memoryStorage(JSON.stringify({ version: 0 })), "kids-state"), null);
  assert.equal(loadKidsLocalState({ getItem() { throw new Error("blocked"); } }, "kids-state"), null);
  assert.equal(saveKidsLocalState({ setItem() { throw new Error("full"); } }, "kids-state", state), false);
});

test("derives stable user-scoped storage keys and validates parent PINs", () => {
  const idKey = getKidsStorageKey({ id: "learner-1", email: "ignored@example.com" });
  assert.match(idKey, new RegExp(`^${KIDS_STORAGE_PREFIX}:`));
  assert.equal(idKey, getKidsStorageKey({ id: "learner-1" }));
  assert.notEqual(idKey, getKidsStorageKey({ id: "learner-2" }));
  assert.notEqual(getKidsStorageKey({ _id: "mongo-id" }), getKidsStorageKey({ email: "kid@example.com" }));

  assert.equal(isValidParentPin("0123"), true);
  assert.equal(isValidParentPin(4826), true);
  ["123", "12345", "12a4", " 1234 ", ""].forEach((pin) => {
    assert.equal(isValidParentPin(pin), false, pin);
  });

  const hash = hashParentPin("4826");
  assert.equal(hash, hashParentPin(4826));
  assert.notEqual(hash, hashParentPin("0000"));
  assert.equal(verifyParentPin("4826", hash), true);
  assert.equal(verifyParentPin("0000", hash), false);
  assert.equal(verifyParentPin("4826", ""), false);
  assert.equal(verifyParentPin("not-a-pin", hashParentPin("not-a-pin")), false);
});
