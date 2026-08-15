import { randomBytes } from "node:crypto";

export const ACADEMIC_PROFILE_LOCKS_COLLECTION = "academicProfileLocks";
const DEFAULT_ACADEMIC_PROFILE_LOCK_TTL_MS = 30_000;

export async function acquireAcademicProfileMutationLock(db, userId, {
  now = new Date(),
  ttlMs = DEFAULT_ACADEMIC_PROFILE_LOCK_TTL_MS,
} = {}) {
  const acquiredAt = now instanceof Date ? now : new Date(now);
  const safeNow = Number.isFinite(acquiredAt.getTime()) ? acquiredAt : new Date();
  const safeTtlMs = Math.max(5_000, Math.min(120_000, Number(ttlMs) || DEFAULT_ACADEMIC_PROFILE_LOCK_TTL_MS));
  const ownerToken = randomBytes(18).toString("hex");
  const collection = db.collection(ACADEMIC_PROFILE_LOCKS_COLLECTION);

  let result;
  try {
    result = await collection.updateOne(
      {
        _id: userId,
        $or: [
          { expiresAt: { $lte: safeNow } },
          { ownerToken },
        ],
      },
      {
        $set: {
          ownerToken,
          acquiredAt: safeNow,
          expiresAt: new Date(safeNow.getTime() + safeTtlMs),
        },
        $setOnInsert: { createdAt: safeNow },
      },
      { upsert: true },
    );
  } catch (error) {
    if (Number(error?.code) === 11000) return null;
    throw error;
  }

  if (!result?.modifiedCount && !result?.upsertedCount) return null;
  let released = false;
  return {
    ownerToken,
    async release() {
      if (released) return;
      released = true;
      await collection.deleteOne({ _id: userId, ownerToken });
    },
  };
}
