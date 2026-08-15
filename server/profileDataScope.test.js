import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialAcademicProfiles,
  transitionAcademicProfiles,
} from "./academicProfiles.js";
import {
  AcademicProfileDataPurgeError,
  AcademicProfileScopeError,
  completeAcademicProfileDeletionTombstone,
  markAcademicProfileDeletionTombstone,
  reconcileAcademicProfileDeletionTombstones,
  PROFILE_SCOPED_OWNED_COLLECTIONS,
  academicProfileFilter,
  assertAcademicProfileWritable,
  attachAcademicProfileRequestContext,
  backfillLegacyAcademicProfileData,
  migrateProfileScopedUniqueIndexes,
  purgeAcademicProfileData,
  withAcademicProfileWriteFence,
} from "./profileDataScope.js";

test("profile purge manifest contains owned study data and excludes account ledgers", () => {
  for (const collectionName of [
    "workspaces",
    "notes",
    "quizAttempts",
    "chatSessions",
    "exams",
    "examAttempts",
    "learningNotebooks",
    "questionPapers",
    "resumeHistory",
    "kidsAttempts",
  ]) {
    assert.equal(PROFILE_SCOPED_OWNED_COLLECTIONS.includes(collectionName), true);
  }
  for (const collectionName of [
    "users",
    "sessions",
    "aiUsageEvents",
    "aiQuotaLocks",
    "resumeGenerations",
    "resumeGenerationLocks",
    "kidsParentSettings",
  ]) {
    assert.equal(PROFILE_SCOPED_OWNED_COLLECTIONS.includes(collectionName), false);
  }
});

function userWithProfile(id = "user-1") {
  const state = createInitialAcademicProfiles({
    academicLevel: "Undergraduate / Bachelor's",
    academicTrack: "Engineering & Technology",
    degree: "B.Tech",
  });
  return {
    _id: id,
    ...state.activeProfile,
    academicProfiles: state.academicProfiles,
    activeAcademicProfileId: state.activeAcademicProfileId,
  };
}

function requestFor(user, header = "") {
  return {
    user,
    headers: { "x-academic-profile-id": header },
    get(name) { return this.headers[String(name).toLowerCase()] || ""; },
  };
}

test("request context captures the immutable active data id", () => {
  const user = userWithProfile();
  const req = requestFor(user, user.academicProfiles[0].dataId);
  const context = attachAcademicProfileRequestContext(req);
  assert.equal(req.academicProfileId, user.academicProfiles[0].dataId);
  assert.equal(context.slotId, "profile-a");
});

test("a stale explicit profile header is rejected", () => {
  const req = requestFor(userWithProfile(), "academic-profile:stale-context");
  assert.throws(
    () => attachAcademicProfileRequestContext(req),
    (error) => error instanceof AcademicProfileScopeError
      && error.code === "ACADEMIC_PROFILE_CONTEXT_CHANGED",
  );
});

test("callers cannot override profile ownership in an extra filter", () => {
  const user = userWithProfile();
  const req = requestFor(user);
  attachAcademicProfileRequestContext(req);
  const filter = academicProfileFilter(req, {
    _id: "record-1",
    userId: "attacker",
    academicProfileId: "academic-profile:attacker",
  });
  assert.equal(filter.userId, user._id);
  assert.equal(filter.academicProfileId, user.academicProfiles[0].dataId);
});

test("writes fail if the active profile changed after authentication", async () => {
  const capturedUser = userWithProfile();
  const req = requestFor(capturedUser);
  attachAcademicProfileRequestContext(req);
  const changedUser = userWithProfile(capturedUser._id);
  const db = {
    collection(name) {
      assert.equal(name, "users");
      return { async findOne() { return changedUser; } };
    },
  };
  await assert.rejects(
    () => assertAcademicProfileWritable(db, req),
    (error) => error instanceof AcademicProfileScopeError
      && error.code === "ACADEMIC_PROFILE_CONTEXT_CHANGED",
  );
});

test("final-write fence rejects a stale commit after deletion switches the active profile", async () => {
  const first = userWithProfile();
  const created = transitionAcademicProfiles(first, {
    requestedAcademic: {
      academicLevel: "Postgraduate / Master's",
      academicTrack: "Engineering & Technology",
      degree: "M.Tech",
    },
  });
  let storedUser = {
    ...first,
    ...created.activeProfile,
    academicProfiles: created.academicProfiles,
    activeAcademicProfileId: created.activeAcademicProfileId,
  };
  const req = requestFor(storedUser, created.activeProfile.dataId);
  attachAcademicProfileRequestContext(req);

  let released = false;
  let writeCalled = false;
  const db = {
    collection(name) {
      assert.equal(name, "users");
      return { async findOne() { return storedUser; } };
    },
  };
  const acquireLock = async () => {
    const survivor = storedUser.academicProfiles.find((profile) => profile.id === "profile-a");
    storedUser = {
      ...storedUser,
      ...survivor,
      activeAcademicProfileId: survivor.id,
      academicProfiles: storedUser.academicProfiles.map((profile) => (
        profile.id === "profile-b"
          ? { ...profile, deletionPending: { operationId: "delete-b", requestedAt: new Date() } }
          : profile
      )),
    };
    return {
      async release() {
        released = true;
      },
    };
  };

  await assert.rejects(
    () => withAcademicProfileWriteFence(
      db,
      req,
      async () => {
        writeCalled = true;
      },
      { acquireLock, lockWaitMs: 0 },
    ),
    (error) => error instanceof AcademicProfileScopeError
      && error.code === "ACADEMIC_PROFILE_CONTEXT_CHANGED",
  );
  assert.equal(writeCalled, false);
  assert.equal(released, true);
});
function matches(document, query = {}) {
  return Object.entries(query).every(([key, expected]) => {
    if (key === "$or") return expected.some((candidate) => matches(document, candidate));
    const actual = document?.[key];
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      if (Object.prototype.hasOwnProperty.call(expected, "$exists")) {
        return Object.prototype.hasOwnProperty.call(document, key) === expected.$exists;
      }
      if (Object.prototype.hasOwnProperty.call(expected, "$lt")) {
        return actual === undefined || actual < expected.$lt;
      }
      if (Object.prototype.hasOwnProperty.call(expected, "$lte")) {
        return actual !== undefined && actual <= expected.$lte;
      }
      if (Object.prototype.hasOwnProperty.call(expected, "$in")) {
        return expected.$in.includes(actual);
      }
    }
    return actual === expected;
  });
}

function applyUpdate(document, update = {}) {
  Object.assign(document, update.$set || {});
  for (const key of Object.keys(update.$unset || {})) delete document[key];
}

function memoryDb(seed = {}) {
  const documents = new Map(Object.entries(seed).map(([name, items]) => [
    name,
    items.map((item) => ({ ...item })),
  ]));
  return {
    documents,
    collection(name) {
      if (!documents.has(name)) documents.set(name, []);
      const items = documents.get(name);
      return {
        async deleteMany(query) {
          const kept = items.filter((item) => !matches(item, query));
          const deletedCount = items.length - kept.length;
          items.splice(0, items.length, ...kept);
          return { deletedCount };
        },
        async updateMany(query, update) {
          let modifiedCount = 0;
          for (const item of items) {
            if (!matches(item, query)) continue;
            applyUpdate(item, update);
            modifiedCount += 1;
          }
          return { matchedCount: modifiedCount, modifiedCount };
        },
        async updateOne(query, update) {
          const item = items.find((candidate) => matches(candidate, query));
          if (!item) return { matchedCount: 0, modifiedCount: 0 };
          applyUpdate(item, update);
          return { matchedCount: 1, modifiedCount: 1 };
        },
        async findOne(query) {
          return items.find((candidate) => matches(candidate, query)) || null;
        },
        async countDocuments(query) {
          return items.filter((item) => matches(item, query)).length;
        },
      };
    },
  };
}

test("profile purge deletes only exact owned records and preserves charged AI usage", async () => {
  const db = memoryDb({
    workspaces: [
      { userId: "student", academicProfileId: "data-a", subjects: ["A"] },
      { userId: "student", academicProfileId: "data-b", subjects: ["B"] },
      { userId: "other", academicProfileId: "data-b", subjects: ["Other"] },
    ],
    notes: [{ userId: "student", academicProfileId: "data-b", notes: ["private"] }],
    aiUsageEvents: [
      {
        userId: "student",
        academicProfileId: "data-b",
        status: "committed",
        cost: 5,
        replayPayload: { private: true },
        resultRef: { collection: "notes", id: "note-b" },
      },
      { userId: "student", academicProfileId: "data-a", status: "committed", cost: 3 },
    ],
  });
  const quizCleanupCalls = [];
  const result = await purgeAcademicProfileData(db, {
    userId: "student",
    academicProfileId: "data-b",
  }, {
    ownedCollections: ["workspaces", "notes"],
    quizBattleCleanup: async (_db, context) => quizCleanupCalls.push(context),
    now: () => new Date("2026-08-14T00:00:00.000Z"),
  });

  assert.equal(result.verified, true);
  assert.deepEqual(quizCleanupCalls, [{ userId: "student", academicProfileId: "data-b" }]);
  assert.deepEqual(db.documents.get("workspaces").map((item) => item.subjects[0]), ["A", "Other"]);
  assert.equal(db.documents.get("notes").length, 0);
  const chargedEvent = db.documents.get("aiUsageEvents")[0];
  assert.equal(chargedEvent.status, "committed");
  assert.equal(chargedEvent.cost, 5);
  assert.equal("replayPayload" in chargedEvent, false);
  assert.equal("resultRef" in chargedEvent, false);

  await purgeAcademicProfileData(db, {
    userId: "student",
    academicProfileId: "data-b",
  }, {
    ownedCollections: ["workspaces", "notes"],
    quizBattleCleanup: async () => undefined,
  });
  assert.equal(db.documents.get("workspaces").length, 2);
});

test("profile purge reports a retryable failure and an idempotent retry finishes cleanup", async () => {
  const db = memoryDb({
    workspaces: [{ userId: "student", academicProfileId: "data-b" }],
    notes: [{ userId: "student", academicProfileId: "data-b" }],
    aiUsageEvents: [],
  });
  await assert.rejects(
    () => purgeAcademicProfileData(db, { userId: "student", academicProfileId: "data-b" }, {
      ownedCollections: ["workspaces", "notes"],
      quizBattleCleanup: async () => undefined,
      faultInjector(stage, { collectionName }) {
        if (stage === "after-owned-delete" && collectionName === "workspaces") {
          throw new Error("injected failure");
        }
      },
    }),
    (error) => error instanceof AcademicProfileDataPurgeError
      && error.status === 503
      && error.code === "ACADEMIC_PROFILE_DELETE_INCOMPLETE",
  );
  assert.equal(db.documents.get("workspaces").length, 0);
  assert.equal(db.documents.get("notes").length, 1);

  const retry = await purgeAcademicProfileData(db, {
    userId: "student",
    academicProfileId: "data-b",
  }, {
    ownedCollections: ["workspaces", "notes"],
    quizBattleCleanup: async () => undefined,
  });
  assert.equal(retry.verified, true);
  assert.equal(db.documents.get("notes").length, 0);
});

test("legacy backfill assigns untagged records only to the current active profile before marking complete", async () => {
  const user = {
    _id: "student",
    academicLevel: "Postgraduate / Master's",
    academicTrack: "Engineering & Technology",
    degree: "M.Tech",
    academicProfileRestore: {
      academicLevel: "Undergraduate / Bachelor's",
      academicTrack: "Engineering & Technology",
      degree: "B.Tech",
    },
  };
  const db = memoryDb({
    users: [user],
    workspaces: [{ userId: "student", schedule: ["legacy"] }],
    notes: [{ userId: "student", notes: ["legacy"] }],
    aiUsageEvents: [{ userId: "student", status: "committed", cost: 3 }],
  });
  const result = await backfillLegacyAcademicProfileData(db, user, {
    dataVersion: 1,
    ownedCollections: ["workspaces", "notes"],
    now: () => new Date("2026-08-14T00:00:00.000Z"),
  });
  const activeDataId = result.user.academicProfiles.find((profile) => profile.id === "profile-b").dataId;
  const inactiveDataId = result.user.academicProfiles.find((profile) => profile.id === "profile-a").dataId;
  assert.equal(result.user.activeAcademicProfileId, "profile-b");
  assert.equal(db.documents.get("workspaces")[0].academicProfileId, activeDataId);
  assert.equal(db.documents.get("notes")[0].academicProfileId, activeDataId);
  assert.equal(db.documents.get("aiUsageEvents")[0].academicProfileId, activeDataId);
  assert.equal(db.documents.get("workspaces").some((item) => item.academicProfileId === inactiveDataId), false);
  assert.equal(db.documents.get("users")[0].academicProfileDataVersion, 1);
});

test("legacy backfill never marks migration complete after a partial failure", async () => {
  const user = {
    _id: "student",
    academicLevel: "Undergraduate / Bachelor's",
    academicTrack: "Engineering & Technology",
    degree: "B.Tech",
  };
  const db = memoryDb({ users: [user], workspaces: [{ userId: "student" }], notes: [{ userId: "student" }] });
  await assert.rejects(() => backfillLegacyAcademicProfileData(db, user, {
    dataVersion: 1,
    ownedCollections: ["workspaces", "notes"],
    faultInjector(stage, { collectionName }) {
      if (stage === "before-legacy-backfill" && collectionName === "notes") throw new Error("stop");
    },
  }));
  assert.equal(db.documents.get("users")[0].academicProfileDataVersion, undefined);
});

test("index migration creates composite uniqueness before dropping only the obsolete unique user index", async () => {
  const operations = [];
  const collections = new Map();
  const db = {
    collection(name) {
      if (!collections.has(name)) {
        const indexes = [
          { name: "_id_", key: { _id: 1 }, unique: true },
          { name: "userId_1", key: { userId: 1 }, unique: true },
          { name: "keep_created", key: { userId: 1, createdAt: -1 } },
        ];
        collections.set(name, {
          async createIndex(key, options) {
            operations.push(`${name}:create:${options.name}`);
            indexes.push({ name: options.name, key, unique: options.unique });
          },
          async indexes() { return indexes; },
          async dropIndex(indexName) {
            operations.push(`${name}:drop:${indexName}`);
            indexes.splice(indexes.findIndex((index) => index.name === indexName), 1);
          },
        });
      }
      return collections.get(name);
    },
  };

  await migrateProfileScopedUniqueIndexes(db, { collectionNames: ["workspaces", "notes"] });
  assert.deepEqual(operations, [
    "workspaces:create:userId_1_academicProfileId_1",
    "workspaces:drop:userId_1",
    "notes:create:userId_1_academicProfileId_1",
    "notes:drop:userId_1",
  ]);
  assert.equal((await collections.get("workspaces").indexes()).some((index) => index.name === "keep_created"), true);
});
test("completed tombstones re-purge a deliberately late row without touching another profile", async () => {
  const tombstones = [];
  const notes = [
    { userId: "student", academicProfileId: "data-a", value: "keep" },
  ];
  const collectionFor = (name) => {
    if (name === "academicProfileDeletionTombstones") {
      return {
        async updateOne(filter, update, options = {}) {
          let document = tombstones.find((item) => item._id === filter._id);
          if (!document && options.upsert) {
            document = { _id: filter._id };
            tombstones.push(document);
          }
          if (!document) return { matchedCount: 0, modifiedCount: 0 };
          applyUpdate(document, update);
          for (const [key, value] of Object.entries(update.$inc || {})) {
            document[key] = Number(document[key] || 0) + Number(value || 0);
          }
          return { matchedCount: 1, modifiedCount: 1 };
        },
        find(query) {
          let selected = tombstones.filter((document) => matches(document, query));
          const cursor = {
            sort() { return cursor; },
            limit(value) {
              selected = selected.slice(0, value);
              return cursor;
            },
            async toArray() { return selected.map((item) => ({ ...item })); },
          };
          return cursor;
        },
      };
    }
    if (name === "notes") {
      return {
        async deleteMany(query) {
          const kept = notes.filter((item) => !matches(item, query));
          const deletedCount = notes.length - kept.length;
          notes.splice(0, notes.length, ...kept);
          return { deletedCount };
        },
        async countDocuments(query) {
          return notes.filter((item) => matches(item, query)).length;
        },
      };
    }
    if (name === "aiUsageEvents") {
      return {
        async updateMany() { return { modifiedCount: 0 }; },
        async countDocuments() { return 0; },
      };
    }
    return {
      async deleteMany() { return { deletedCount: 0 }; },
      async countDocuments() { return 0; },
    };
  };
  const db = { collection: collectionFor };
  const context = { userId: "student", academicProfileId: "data-b" };
  const at = new Date("2026-08-15T10:00:00.000Z");

  await markAcademicProfileDeletionTombstone(db, context, {
    slotId: "profile-b",
    operationId: "delete-b",
    now: () => at,
  });
  await completeAcademicProfileDeletionTombstone(db, context, {
    now: () => at,
    reconcileAfterMs: 1,
  });

  notes.push({ ...context, value: "late-stale-write" });
  tombstones[0].nextReconcileAt = new Date(at.getTime() - 1);
  let finalized = 0;
  const results = await reconcileAcademicProfileDeletionTombstones(db, {
    now: () => at,
    purge: (database, target) => purgeAcademicProfileData(database, target, {
      ownedCollections: ["notes"],
      quizBattleCleanup: async () => undefined,
      now: () => at,
    }),
    afterPurge: async () => {
      finalized += 1;
    },
  });

  assert.deepEqual(results.map(({ ok }) => ok), [true]);
  assert.deepEqual(notes, [{ userId: "student", academicProfileId: "data-a", value: "keep" }]);
  assert.equal(tombstones[0].status, "completed");
  assert.equal(tombstones[0].reconciliationCount, 1);
  assert.equal(finalized, 1);
});
