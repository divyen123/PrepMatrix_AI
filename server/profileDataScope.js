import { deriveAcademicProfilesState } from "./academicProfiles.js";
import { acquireAcademicProfileMutationLock } from "./academicProfileRestore.js";

export const ACADEMIC_PROFILE_HEADER = "x-academic-profile-id";

export const PROFILE_SCOPED_OWNED_COLLECTIONS = Object.freeze([
  "workspaces",
  "notes",
  "worktrees",
  "quizAttempts",
  "chatSessions",
  "exams",
  "learningNotebooks",
  "examAttempts",
  "scheduledReminderDeliveries",
  "notificationHistory",
  "questionPapers",
  "resumeHistory",
  "kidsAttempts",
  "kidsProfileSettings",
]);

export const PROFILE_SCOPED_UNIQUE_COLLECTIONS = Object.freeze([
  "workspaces",
  "notes",
]);

export const PROFILE_SCOPED_UNIQUE_INDEX_MIGRATIONS = Object.freeze([
  {
    collectionName: "workspaces",
    key: { userId: 1, academicProfileId: 1 },
    name: "userId_1_academicProfileId_1",
    obsolete: [{ name: "userId_1", key: { userId: 1 } }],
  },
  {
    collectionName: "notes",
    key: { userId: 1, academicProfileId: 1 },
    name: "userId_1_academicProfileId_1",
    obsolete: [{ name: "userId_1", key: { userId: 1 } }],
  },
  {
    collectionName: "examAttempts",
    key: { userId: 1, academicProfileId: 1, examId: 1 },
    name: "userId_1_academicProfileId_1_examId_1",
    obsolete: [{ name: "userId_1_examId_1", key: { userId: 1, examId: 1 } }],
  },
  {
    collectionName: "resumeHistory",
    key: { userId: 1, academicProfileId: 1, requestId: 1 },
    name: "userId_1_academicProfileId_1_requestId_1",
    partialFilterExpression: { requestId: { $type: "string" } },
    obsolete: [{ name: "userId_1_requestId_1", key: { userId: 1, requestId: 1 } }],
  },
  {
    collectionName: "notificationHistory",
    key: { userId: 1, academicProfileId: 1, eventKey: 1 },
    name: "userId_1_academicProfileId_1_eventKey_1",
    partialFilterExpression: { eventKey: { $type: "string" } },
    obsolete: [{ name: "userId_1_eventKey_1", key: { userId: 1, eventKey: 1 } }],
  },
  {
    collectionName: "kidsAttempts",
    key: { userId: 1, academicProfileId: 1, clientAttemptId: 1 },
    name: "userId_1_academicProfileId_1_clientAttemptId_1",
    partialFilterExpression: { clientAttemptId: { $type: "string" } },
    obsolete: [{ name: "userId_1_clientAttemptId_1", key: { userId: 1, clientAttemptId: 1 } }],
  },
  {
    collectionName: "kidsAttempts",
    key: { userId: 1, academicProfileId: 1, mode: 1, localDate: 1 },
    name: "userId_1_academicProfileId_1_mode_1_localDate_1",
    partialFilterExpression: { mode: "daily", localDate: { $type: "string" } },
    obsolete: [{ name: "userId_1_mode_1_localDate_1", key: { userId: 1, mode: 1, localDate: 1 } }],
  },
  {
    collectionName: "kidsProfileSettings",
    key: { userId: 1, academicProfileId: 1 },
    name: "userId_1_academicProfileId_1",
    obsolete: [],
  },
  {
    collectionName: "aiUsageEvents",
    key: { userId: 1, academicProfileId: 1, feature: 1, requestId: 1 },
    name: "userId_1_academicProfileId_1_feature_1_requestId_1",
    obsolete: [{ name: "userId_1_requestId_1", key: { userId: 1, requestId: 1 } }],
  },
]);

export const AI_USAGE_EVENTS_COLLECTION_NAME = "aiUsageEvents";
export const ACADEMIC_PROFILE_DELETION_TOMBSTONES_COLLECTION = "academicProfileDeletionTombstones";

const UNTAGGED_ACADEMIC_PROFILE_FILTER = Object.freeze({
  $or: [
    { academicProfileId: { $exists: false } },
    { academicProfileId: null },
    { academicProfileId: "" },
  ],
});

let quizBattleAcademicProfileCleanup = null;

export function setQuizBattleAcademicProfileCleanup(cleanup) {
  quizBattleAcademicProfileCleanup = typeof cleanup === "function" ? cleanup : null;
}

export async function runQuizBattleAcademicProfileCleanup(db, context) {
  if (!quizBattleAcademicProfileCleanup) return { skipped: true };
  return quizBattleAcademicProfileCleanup(db, context);
}

export class AcademicProfileScopeError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "AcademicProfileScopeError";
    this.status = status;
    this.code = code;
  }
}

export class AcademicProfileDataPurgeError extends Error {
  constructor(message = "The academic profile data could not be deleted completely.", options = {}) {
    super(message, options);
    this.name = "AcademicProfileDataPurgeError";
    this.status = 503;
    this.code = "ACADEMIC_PROFILE_DELETE_INCOMPLETE";
  }
}

function requireProfileDataContext({ userId, academicProfileId } = {}) {
  const normalizedAcademicProfileId = String(academicProfileId || "").trim();
  if (!userId || !normalizedAcademicProfileId) {
    throw new TypeError("Academic profile data operations require userId and academicProfileId.");
  }
  return { userId, academicProfileId: normalizedAcademicProfileId };
}

function exactProfileFilter(context, extra = {}) {
  return {
    ...extra,
    userId: context.userId,
    academicProfileId: context.academicProfileId,
  };
}

async function injectFault(faultInjector, stage, details = {}) {
  if (typeof faultInjector === "function") await faultInjector(stage, details);
}

export async function purgeAcademicProfileData(db, rawContext, {
  ownedCollections = PROFILE_SCOPED_OWNED_COLLECTIONS,
  aiUsageCollection = AI_USAGE_EVENTS_COLLECTION_NAME,
  quizBattleCleanup = runQuizBattleAcademicProfileCleanup,
  faultInjector,
  now = () => new Date(),
} = {}) {
  if (!db?.collection) throw new TypeError("Academic profile deletion requires a database.");
  const context = requireProfileDataContext(rawContext);
  const deletedCounts = {};

  try {
    for (const collectionName of ownedCollections) {
      await injectFault(faultInjector, "before-owned-delete", { collectionName, context });
      const result = await db.collection(collectionName).deleteMany(exactProfileFilter(context));
      deletedCounts[collectionName] = Number(result?.deletedCount || 0);
      await injectFault(faultInjector, "after-owned-delete", { collectionName, context });
    }

    await injectFault(faultInjector, "before-quiz-battle-cleanup", { context });
    await quizBattleCleanup(db, context);
    await injectFault(faultInjector, "after-quiz-battle-cleanup", { context });

    const scrubbedAt = now();
    await injectFault(faultInjector, "before-ai-usage-scrub", { context });
    const aiUsageResult = await db.collection(aiUsageCollection).updateMany(
      exactProfileFilter(context),
      {
        $set: { profileDataDeletedAt: scrubbedAt, updatedAt: scrubbedAt },
        $unset: { replayPayload: "", resultRef: "" },
      },
    );
    await injectFault(faultInjector, "after-ai-usage-scrub", { context });

    const remaining = {};
    for (const collectionName of ownedCollections) {
      remaining[collectionName] = await db.collection(collectionName)
        .countDocuments(exactProfileFilter(context), { limit: 1 });
    }
    const replayArtifactsRemaining = await db.collection(aiUsageCollection).countDocuments({
      ...exactProfileFilter(context),
      $or: [
        { replayPayload: { $exists: true } },
        { resultRef: { $exists: true } },
      ],
    }, { limit: 1 });
    const incompleteCollections = Object.entries(remaining)
      .filter(([, count]) => count > 0)
      .map(([collectionName]) => collectionName);
    if (incompleteCollections.length || replayArtifactsRemaining > 0) {
      throw new Error(`Profile data remains in: ${[
        ...incompleteCollections,
        ...(replayArtifactsRemaining ? [aiUsageCollection] : []),
      ].join(", ")}`);
    }

    return {
      deletedCounts,
      aiUsageEventsScrubbed: Number(aiUsageResult?.modifiedCount || 0),
      verified: true,
    };
  } catch (error) {
    if (error instanceof AcademicProfileDataPurgeError) throw error;
    throw new AcademicProfileDataPurgeError(
      "The profile is still marked for deletion because not all of its data could be removed. Try again.",
      { cause: error },
    );
  }
}

export async function backfillLegacyAcademicProfileData(db, user, {
  dataVersion,
  ownedCollections = PROFILE_SCOPED_OWNED_COLLECTIONS,
  aiUsageCollection = AI_USAGE_EVENTS_COLLECTION_NAME,
  faultInjector,
  now = () => new Date(),
} = {}) {
  if (!db?.collection || !user?._id) {
    throw new TypeError("Legacy academic profile migration requires a database user.");
  }
  const targetVersion = Number(dataVersion);
  if (!Number.isInteger(targetVersion) || targetVersion < 1) {
    throw new TypeError("Legacy academic profile migration requires a positive data version.");
  }
  if (Number(user.academicProfileDataVersion || 0) >= targetVersion) {
    return { user, migrated: false };
  }

  const state = deriveAcademicProfilesState(user);
  const context = requireProfileDataContext({
    userId: user._id,
    academicProfileId: state.activeProfile?.dataId,
  });
  const migrationCollections = [...ownedCollections, aiUsageCollection];
  for (const collectionName of migrationCollections) {
    await injectFault(faultInjector, "before-legacy-backfill", { collectionName, context });
    await db.collection(collectionName).updateMany(
      { userId: context.userId, ...UNTAGGED_ACADEMIC_PROFILE_FILTER },
      { $set: { academicProfileId: context.academicProfileId } },
    );
    await injectFault(faultInjector, "after-legacy-backfill", { collectionName, context });
  }

  const migratedAt = now();
  const activeProfile = state.activeProfile;
  const userUpdate = await db.collection("users").updateOne(
    {
      _id: user._id,
      $or: [
        { academicProfileDataVersion: { $exists: false } },
        { academicProfileDataVersion: { $lt: targetVersion } },
      ],
    },
    {
      $set: {
        academicProfiles: state.academicProfiles,
        activeAcademicProfileId: state.activeAcademicProfileId,
        academicLevel: activeProfile.academicLevel,
        academicTrack: activeProfile.academicTrack,
        department: activeProfile.department,
        schoolType: activeProfile.schoolType,
        grade: activeProfile.grade,
        degree: activeProfile.degree,
        academicProfileDataVersion: targetVersion,
        academicProfileDataMigratedAt: migratedAt,
        updatedAt: migratedAt,
      },
      $unset: { academicProfileRestore: "" },
    },
  );
  const migratedUser = userUpdate?.matchedCount === 1
    ? {
      ...user,
      ...activeProfile,
      academicProfiles: state.academicProfiles,
      activeAcademicProfileId: state.activeAcademicProfileId,
      academicProfileDataVersion: targetVersion,
      academicProfileDataMigratedAt: migratedAt,
    }
    : await db.collection("users").findOne({ _id: user._id });
  if (!migratedUser) throw new Error("The user disappeared during academic profile migration.");
  return { user: migratedUser, migrated: userUpdate?.matchedCount === 1, context };
}

function isExactIndexKey(key, expectedEntries) {
  const entries = Object.entries(key || {});
  return entries.length === expectedEntries.length
    && entries.every(([field, direction], index) => (
      field === expectedEntries[index][0] && direction === expectedEntries[index][1]
    ));
}

export async function migrateProfileScopedUniqueIndexes(db, {
  collectionNames,
  migrations = collectionNames
    ? PROFILE_SCOPED_UNIQUE_INDEX_MIGRATIONS.filter((migration) => collectionNames.includes(migration.collectionName))
    : PROFILE_SCOPED_UNIQUE_INDEX_MIGRATIONS,
} = {}) {
  if (!db?.collection) throw new TypeError("Profile index migration requires a database.");
  for (const migration of migrations) {
    const collection = db.collection(migration.collectionName);
    await collection.createIndex(
      migration.key,
      {
        unique: true,
        name: migration.name,
        ...(migration.partialFilterExpression
          ? { partialFilterExpression: migration.partialFilterExpression }
          : {}),
      },
    );
    const indexes = await collection.indexes();
    for (const obsoleteSpec of migration.obsolete || []) {
      const expectedEntries = Object.entries(obsoleteSpec.key);
      const obsolete = indexes.find((index) => (
        index?.name === obsoleteSpec.name
        && index?.unique === true
        && isExactIndexKey(index.key, expectedEntries)
      ));
      if (obsolete) await collection.dropIndex(obsolete.name);
    }
  }
}

export function academicProfileContext(user) {
  const state = deriveAcademicProfilesState(user);
  const profile = state.activeProfile;
  if (!profile?.dataId) {
    throw new AcademicProfileScopeError(
      409,
      "ACADEMIC_PROFILE_CONTEXT_UNAVAILABLE",
      "Reload before using profile-specific study data.",
    );
  }
  return {
    slotId: profile.id,
    academicProfileId: profile.dataId,
    dataId: profile.dataId,
    profile,
  };
}

export function getRequestAcademicProfileId(req) {
  const value = typeof req?.academicProfileId === "string" ? req.academicProfileId.trim() : "";
  if (!value) {
    throw new AcademicProfileScopeError(
      409,
      "ACADEMIC_PROFILE_CONTEXT_REQUIRED",
      "Reload before saving profile-specific study data.",
    );
  }
  return value;
}

export function academicProfileFilter(req, extra = {}) {
  return {
    ...extra,
    userId: req.user._id,
    academicProfileId: getRequestAcademicProfileId(req),
  };
}

export function attachAcademicProfileRequestContext(req) {
  const context = academicProfileContext(req.user);
  const headerValue = String(req.get?.(ACADEMIC_PROFILE_HEADER) || req.headers?.[ACADEMIC_PROFILE_HEADER] || "").trim();
  if (headerValue && headerValue !== context.academicProfileId) {
    throw new AcademicProfileScopeError(
      409,
      "ACADEMIC_PROFILE_CONTEXT_CHANGED",
      "The active academic profile changed. Reload and try again.",
    );
  }
  if (context.profile.deletionPending) {
    throw new AcademicProfileScopeError(
      409,
      "ACADEMIC_PROFILE_DELETION_PENDING",
      "The active academic profile is being deleted.",
    );
  }
  req.academicProfileId = context.academicProfileId;
  req.academicProfileSlotId = context.slotId;
  req.academicProfileContext = context;
  return context;
}

export async function assertAcademicProfileWritable(db, req, { session } = {}) {
  const user = await db.collection("users").findOne(
    { _id: req.user._id, deletingAt: { $exists: false } },
    session ? { session } : undefined,
  );
  if (!user) {
    throw new AcademicProfileScopeError(
      409,
      "ACCOUNT_DELETION_IN_PROGRESS",
      "Account deletion is in progress.",
    );
  }
  const context = academicProfileContext(user);
  if (context.academicProfileId !== getRequestAcademicProfileId(req)) {
    throw new AcademicProfileScopeError(
      409,
      "ACADEMIC_PROFILE_CONTEXT_CHANGED",
      "The active profile changed before this data could be saved. Reload and try again.",
    );
  }
  if (context.profile.deletionPending) {
    throw new AcademicProfileScopeError(
      409,
      "ACADEMIC_PROFILE_DELETION_PENDING",
      "This profile is being deleted and cannot accept new data.",
    );
  }
  return { user, ...context };
}

/**
 * Serialize the final profile-owned database commit with academic-profile
 * transitions. Provider/network work must happen before entering this fence.
 * Keeping this section short also prevents lock-order inversion with feature
 * locks such as Quiz Battle's per-user action lock.
 */
export async function withAcademicProfileWriteFence(db, req, write, {
  acquireLock = acquireAcademicProfileMutationLock,
  lockWaitMs = 1_500,
  retryDelayMs = 25,
} = {}) {
  if (typeof write !== "function") throw new TypeError("A profile write callback is required.");
  const deadline = Date.now() + Math.max(0, Number(lockWaitMs) || 0);
  let lock = null;
  do {
    lock = await acquireLock(db, req?.user?._id);
    if (lock) break;
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, Math.max(1, Number(retryDelayMs) || 25)));
  } while (!lock);

  if (!lock) {
    throw new AcademicProfileScopeError(
      409,
      "ACADEMIC_PROFILE_WRITE_BUSY",
      "Another profile update is in progress. Try saving again.",
    );
  }

  try {
    const context = await assertAcademicProfileWritable(db, req);
    return await write(context);
  } finally {
    await lock.release().catch(() => undefined);
  }
}
function deletionTombstoneId({ userId, academicProfileId }) {
  return `${String(userId)}:${encodeURIComponent(academicProfileId)}`;
}

export async function markAcademicProfileDeletionTombstone(db, rawContext, {
  slotId = null,
  operationId = null,
  now = () => new Date(),
} = {}) {
  const context = requireProfileDataContext(rawContext);
  const markedAt = now();
  await db.collection(ACADEMIC_PROFILE_DELETION_TOMBSTONES_COLLECTION).updateOne(
    { _id: deletionTombstoneId(context) },
    {
      $set: {
        ...context,
        slotId,
        operationId,
        status: "pending",
        updatedAt: markedAt,
        nextReconcileAt: markedAt,
      },
      $setOnInsert: { createdAt: markedAt },
    },
    { upsert: true },
  );
  return context;
}

export async function completeAcademicProfileDeletionTombstone(db, rawContext, {
  now = () => new Date(),
  reconcileAfterMs = 15 * 60 * 1000,
} = {}) {
  const context = requireProfileDataContext(rawContext);
  const completedAt = now();
  await db.collection(ACADEMIC_PROFILE_DELETION_TOMBSTONES_COLLECTION).updateOne(
    { _id: deletionTombstoneId(context), ...context },
    {
      $set: {
        status: "completed",
        completedAt,
        updatedAt: completedAt,
        nextReconcileAt: new Date(completedAt.getTime() + reconcileAfterMs),
      },
    },
  );
}

export async function reconcileAcademicProfileDeletionTombstones(db, {
  limit = 25,
  now = () => new Date(),
  purge = purgeAcademicProfileData,
  reconcileAfterMs = 15 * 60 * 1000,
  afterPurge = null,
} = {}) {
  const startedAt = now();
  const tombstones = await db.collection(ACADEMIC_PROFILE_DELETION_TOMBSTONES_COLLECTION)
    .find({ nextReconcileAt: { $lte: startedAt } })
    .sort({ nextReconcileAt: 1 })
    .limit(Math.max(1, Math.min(100, Number(limit) || 25)))
    .toArray();
  const results = [];
  for (const tombstone of tombstones) {
    const context = requireProfileDataContext(tombstone);
    try {
      await purge(db, context);
      if (typeof afterPurge === "function") {
        await afterPurge(db, tombstone, context);
      }
      const reconciledAt = now();
      await db.collection(ACADEMIC_PROFILE_DELETION_TOMBSTONES_COLLECTION).updateOne(
        { _id: tombstone._id, ...context },
        {
          $set: {
            lastReconciledAt: reconciledAt,
            updatedAt: reconciledAt,
            nextReconcileAt: new Date(reconciledAt.getTime() + reconcileAfterMs),
          },
          $inc: { reconciliationCount: 1 },
        },
      );
      results.push({ ...context, ok: true });
    } catch (error) {
      const failedAt = now();
      await db.collection(ACADEMIC_PROFILE_DELETION_TOMBSTONES_COLLECTION).updateOne(
        { _id: tombstone._id, ...context },
        {
          $set: {
            lastErrorAt: failedAt,
            lastError: String(error?.message || error).slice(0, 500),
            nextReconcileAt: new Date(failedAt.getTime() + 60_000),
            updatedAt: failedAt,
          },
        },
      );
      results.push({ ...context, ok: false, error });
    }
  }
  return results;
}
