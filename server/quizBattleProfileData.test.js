import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";

import {
  backfillLegacyQuizBattleAcademicProfiles,
  cleanupQuizBattleAcademicProfileData,
} from "./quizBattleRoutes.js";
import {
  QUIZ_BATTLE_ATTEMPTS_COLLECTION,
  QUIZ_BATTLE_REWARDS_COLLECTION,
  QUIZ_BATTLES_COLLECTION,
} from "./quizBattleCore.js";

const GENERATION_COLLECTION = "quizBattleGenerationAttempts";
const REWARD_LEDGER_COLLECTION = "quizBattleRewardLedger";

function sameValue(left, right) {
  if (left instanceof Date || right instanceof Date) {
    return new Date(left).getTime() === new Date(right).getTime();
  }
  return String(left) === String(right);
}

function fieldValue(document, path) {
  return String(path).split(".").reduce((value, key) => value?.[key], document);
}

function matchesValue(actual, expected) {
  if (
    expected
    && typeof expected === "object"
    && !Array.isArray(expected)
    && !(expected instanceof Date)
    && !(expected instanceof ObjectId)
  ) {
    return Object.entries(expected).every(([operator, value]) => {
      if (operator === "$exists") return (actual !== undefined) === Boolean(value);
      if (operator === "$ne") return !sameValue(actual, value);
      if (operator === "$in") return value.some((candidate) => sameValue(actual, candidate));
      if (operator === "$lte") return new Date(actual).getTime() <= new Date(value).getTime();
      if (operator === "$lt") return new Date(actual).getTime() < new Date(value).getTime();
      if (operator === "$gte") return new Date(actual).getTime() >= new Date(value).getTime();
      if (operator === "$gt") return new Date(actual).getTime() > new Date(value).getTime();
      return false;
    });
  }
  if (Array.isArray(actual)) return actual.some((value) => sameValue(value, expected));
  return sameValue(actual, expected);
}

function matches(document, filter = {}) {
  if (filter.$and && !filter.$and.every((item) => matches(document, item))) return false;
  if (filter.$or && !filter.$or.some((item) => matches(document, item))) return false;
  return Object.entries(filter).every(([field, expected]) => (
    field.startsWith("$") || matchesValue(fieldValue(document, field), expected)
  ));
}

function setField(document, path, value) {
  const keys = String(path).split(".");
  let target = document;
  for (const key of keys.slice(0, -1)) {
    if (!target[key] || typeof target[key] !== "object") target[key] = {};
    target = target[key];
  }
  target[keys.at(-1)] = value;
}

function unsetField(document, path) {
  const keys = String(path).split(".");
  let target = document;
  for (const key of keys.slice(0, -1)) {
    target = target?.[key];
    if (!target) return;
  }
  delete target[keys.at(-1)];
}

class FakeCollection {
  constructor(documents = [], indexes = []) {
    this.documents = documents;
    this.indexSpecs = [{ name: "_id_", key: { _id: 1 }, unique: true }, ...indexes];
  }

  find(filter = {}) {
    let rows = this.documents.filter((document) => matches(document, filter));
    const cursor = {
      sort: () => cursor,
      limit: (count) => {
        rows = rows.slice(0, count);
        return cursor;
      },
      toArray: async () => rows.map((document) => ({ ...document })),
    };
    return cursor;
  }

  async findOne(filter = {}) {
    return this.documents.find((document) => matches(document, filter)) || null;
  }

  async countDocuments(filter = {}) {
    return this.documents.filter((document) => matches(document, filter)).length;
  }

  async insertOne(document) {
    if (document._id !== undefined && this.documents.some((row) => sameValue(row._id, document._id))) {
      const error = new Error("duplicate");
      error.code = 11000;
      throw error;
    }
    const stored = { ...document, _id: document._id ?? new ObjectId() };
    this.documents.push(stored);
    return { insertedId: stored._id };
  }

  async updateOne(filter, update, options = {}) {
    let document = this.documents.find((row) => matches(row, filter));
    let upserted = false;
    if (!document && options.upsert) {
      document = { ...filter, ...(update.$setOnInsert || {}) };
      delete document.$and;
      delete document.$or;
      this.documents.push(document);
      upserted = true;
    }
    if (!document) return { matchedCount: 0, modifiedCount: 0 };
    for (const [field, value] of Object.entries(update.$set || {})) setField(document, field, value);
    for (const field of Object.keys(update.$unset || {})) unsetField(document, field);
    return {
      matchedCount: 1,
      modifiedCount: 1,
      upsertedCount: upserted ? 1 : 0,
    };
  }

  async updateMany(filter, update) {
    const rows = this.documents.filter((row) => matches(row, filter));
    for (const document of rows) {
      for (const [field, value] of Object.entries(update.$set || {})) setField(document, field, value);
      for (const field of Object.keys(update.$unset || {})) unsetField(document, field);
    }
    return { matchedCount: rows.length, modifiedCount: rows.length };
  }

  async deleteOne(filter) {
    const index = this.documents.findIndex((document) => matches(document, filter));
    if (index < 0) return { deletedCount: 0 };
    this.documents.splice(index, 1);
    return { deletedCount: 1 };
  }

  async deleteMany(filter) {
    const before = this.documents.length;
    this.documents = this.documents.filter((document) => !matches(document, filter));
    return { deletedCount: before - this.documents.length };
  }

  async createIndex(key, options = {}) {
    const name = options.name || Object.entries(key).map(([field, direction]) => `${field}_${direction}`).join("_");
    const existing = this.indexSpecs.find((index) => index.name === name);
    if (!existing) this.indexSpecs.push({ name, key, ...options });
    return name;
  }

  async indexes() {
    return this.indexSpecs.map((index) => ({ ...index }));
  }

  async dropIndex(name) {
    this.indexSpecs = this.indexSpecs.filter((index) => index.name !== name);
  }
}

function createDb(seed = {}, indexes = {}) {
  const collections = new Map();
  return {
    collections,
    collection(name) {
      if (!collections.has(name)) {
        collections.set(name, new FakeCollection(
          [...(seed[name] || [])],
          [...(indexes[name] || [])],
        ));
      }
      return collections.get(name);
    },
  };
}

function userWithProfile(_id, dataId) {
  const academic = {
    academicLevel: "Undergraduate / Bachelor's",
    academicTrack: "Engineering & Technology",
    schoolType: "",
    grade: "",
    degree: "B.Tech",
    department: "IT",
  };
  return {
    _id,
    ...academic,
    academicProfiles: [{
      id: "profile-a",
      label: "Profile A",
      dataId,
      ...academic,
    }],
    activeAcademicProfileId: "profile-a",
  };
}

test("legacy Quiz Battle rows backfill to each participant's active immutable profile idempotently", async () => {
  const creatorId = new ObjectId();
  const inviteeId = new ObjectId();
  const battleId = new ObjectId();
  const creatorProfile = "academic-profile:creator-active";
  const inviteeProfile = "academic-profile:invitee-active";
  const db = createDb({
    users: [
      userWithProfile(creatorId, creatorProfile),
      userWithProfile(inviteeId, inviteeProfile),
    ],
    [QUIZ_BATTLES_COLLECTION]: [{ _id: battleId, creatorId, inviteeId }],
    [QUIZ_BATTLE_ATTEMPTS_COLLECTION]: [{ _id: new ObjectId(), battleId, userId: creatorId }],
    [QUIZ_BATTLE_REWARDS_COLLECTION]: [{ _id: new ObjectId(), battleId, userId: inviteeId }],
    [GENERATION_COLLECTION]: [{ _id: new ObjectId(), userId: creatorId, requestId: "legacy-request" }],
  });

  const first = await backfillLegacyQuizBattleAcademicProfiles(db);
  const second = await backfillLegacyQuizBattleAcademicProfiles(db);
  const battle = db.collection(QUIZ_BATTLES_COLLECTION).documents[0];

  assert.equal(battle.creatorAcademicProfileId, creatorProfile);
  assert.equal(battle.inviteeAcademicProfileId, inviteeProfile);
  assert.equal(db.collection(QUIZ_BATTLE_ATTEMPTS_COLLECTION).documents[0].academicProfileId, creatorProfile);
  assert.equal(db.collection(QUIZ_BATTLE_REWARDS_COLLECTION).documents[0].academicProfileId, inviteeProfile);
  assert.equal(db.collection(GENERATION_COLLECTION).documents[0].academicProfileId, creatorProfile);
  assert.ok(Object.values(first).some((count) => count > 0));
  assert.equal(Object.values(second).every((count) => count === 0), true);
});

test("profile cleanup removes only the selected participant data, verifies zero, and preserves shared anti-abuse ledgers", async () => {
  const deletedUserId = new ObjectId();
  const opponentUserId = new ObjectId();
  const battleId = new ObjectId();
  const deletedProfileId = "academic-profile:profile-b";
  const opponentProfileId = "academic-profile:opponent";
  const oldCreatorIndex = {
    name: "creatorId_1_requestId_1",
    key: { creatorId: 1, requestId: 1 },
    unique: true,
  };
  const oldGenerationIndex = {
    name: "userId_1_requestId_1",
    key: { userId: 1, requestId: 1 },
    unique: true,
  };
  const globalAttemptIndex = {
    name: "battleId_1_userId_1",
    key: { battleId: 1, userId: 1 },
    unique: true,
  };
  const globalRewardIndex = {
    name: "userId_1_rewardDate_1_rewardSlot_1",
    key: { userId: 1, rewardDate: 1, rewardSlot: 1 },
    unique: true,
  };
  const db = createDb({
    users: [
      userWithProfile(deletedUserId, deletedProfileId),
      userWithProfile(opponentUserId, opponentProfileId),
    ],
    [QUIZ_BATTLES_COLLECTION]: [{
      _id: battleId,
      creatorId: deletedUserId,
      creatorAcademicProfileId: deletedProfileId,
      inviteeId: opponentUserId,
      inviteeAcademicProfileId: opponentProfileId,
      participantIds: [deletedUserId, opponentUserId],
      creatorDisplayName: "Deleted",
      inviteeDisplayName: "Opponent",
      status: "active",
      requestId: "create-battle",
      academicProfileSnapshot: { degree: "B.Tech" },
      result: { kind: "win", winnerUserId: deletedUserId },
    }],
    [QUIZ_BATTLE_ATTEMPTS_COLLECTION]: [
      { _id: new ObjectId(), battleId, userId: deletedUserId, academicProfileId: deletedProfileId },
      { _id: new ObjectId(), battleId, userId: opponentUserId, academicProfileId: opponentProfileId },
    ],
    [QUIZ_BATTLE_REWARDS_COLLECTION]: [
      { _id: new ObjectId(), battleId, userId: deletedUserId, academicProfileId: deletedProfileId },
      { _id: new ObjectId(), battleId, userId: opponentUserId, academicProfileId: opponentProfileId },
    ],
    [GENERATION_COLLECTION]: [{
      _id: new ObjectId(),
      userId: deletedUserId,
      academicProfileId: deletedProfileId,
      requestId: "create-battle",
      battleId,
      replayPayload: { topic: "private" },
    }],
    [REWARD_LEDGER_COLLECTION]: [{
      _id: "shared-slot",
      userId: deletedUserId,
      rewardDate: "2026-08-15",
      rewardSlot: 1,
      awardedAt: new Date("2026-08-15T00:00:00.000Z"),
    }],
  }, {
    [QUIZ_BATTLES_COLLECTION]: [oldCreatorIndex],
    [QUIZ_BATTLE_ATTEMPTS_COLLECTION]: [globalAttemptIndex],
    [QUIZ_BATTLE_REWARDS_COLLECTION]: [globalRewardIndex],
    [GENERATION_COLLECTION]: [oldGenerationIndex],
  });

  const result = await cleanupQuizBattleAcademicProfileData(db, {
    userId: deletedUserId,
    academicProfileId: deletedProfileId,
  });

  assert.equal(result.verified, true);
  assert.equal(db.collection(QUIZ_BATTLE_ATTEMPTS_COLLECTION).documents.length, 1);
  assert.equal(db.collection(QUIZ_BATTLE_ATTEMPTS_COLLECTION).documents[0].userId.toString(), opponentUserId.toString());
  assert.equal(db.collection(QUIZ_BATTLE_REWARDS_COLLECTION).documents.length, 1);
  assert.equal(db.collection(REWARD_LEDGER_COLLECTION).documents.length, 1);

  const battle = db.collection(QUIZ_BATTLES_COLLECTION).documents[0];
  assert.equal(battle.creatorId, null);
  assert.equal(battle.creatorAcademicProfileId, null);
  assert.equal(battle.status, "cancelled");
  assert.deepEqual(battle.participantIds.map(String), [opponentUserId.toString()]);
  assert.equal("academicProfileSnapshot" in battle, false);

  const generation = db.collection(GENERATION_COLLECTION).documents[0];
  assert.equal("battleId" in generation, false);
  assert.equal("replayPayload" in generation, false);
  assert.ok(generation.profileDeletedAt instanceof Date);

  const battleIndexes = await db.collection(QUIZ_BATTLES_COLLECTION).indexes();
  const generationIndexes = await db.collection(GENERATION_COLLECTION).indexes();
  const attemptIndexes = await db.collection(QUIZ_BATTLE_ATTEMPTS_COLLECTION).indexes();
  const rewardIndexes = await db.collection(QUIZ_BATTLE_REWARDS_COLLECTION).indexes();
  assert.equal(battleIndexes.some(({ key }) => key.creatorId === 1 && key.requestId === 1 && !key.creatorAcademicProfileId), false);
  assert.equal(generationIndexes.some(({ key }) => key.userId === 1 && key.requestId === 1 && !key.academicProfileId), false);
  assert.equal(attemptIndexes.some(({ key, unique }) => unique && key.battleId === 1 && key.userId === 1), true);
  assert.equal(rewardIndexes.some(({ key, unique }) => unique && key.userId === 1 && key.rewardDate === 1), true);
});
