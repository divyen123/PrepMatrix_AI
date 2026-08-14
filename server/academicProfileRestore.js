import { randomBytes } from "node:crypto";
import { normalizeAcademicProfile } from "../src/utils/academicProfile.js";

export const ACADEMIC_PROFILE_LOCKS_COLLECTION = "academicProfileLocks";
const DEFAULT_ACADEMIC_PROFILE_LOCK_TTL_MS = 30_000;

export const RESTORABLE_ACADEMIC_PROFILE_KEYS = Object.freeze([
  "academicLevel",
  "academicTrack",
  "schoolType",
  "grade",
  "degree",
  "department",
]);

export function academicProfileRestoreSnapshot(input = {}) {
  const profile = normalizeAcademicProfile(input);
  return RESTORABLE_ACADEMIC_PROFILE_KEYS.reduce((snapshot, key) => {
    snapshot[key] = profile[key];
    return snapshot;
  }, {});
}

export function sanitizeAcademicProfileRestore(input) {
  if (!input || typeof input !== "object" || !String(input.academicLevel || "").trim()) {
    return null;
  }
  return academicProfileRestoreSnapshot(input);
}

export function academicProfileHasChanged(current = {}, next = {}) {
  const currentSnapshot = academicProfileRestoreSnapshot(current);
  const nextSnapshot = academicProfileRestoreSnapshot(next);
  return RESTORABLE_ACADEMIC_PROFILE_KEYS.some(
    (key) => currentSnapshot[key] !== nextSnapshot[key],
  );
}

export function isYoungKidsAcademicProfile(input = {}) {
  const profile = normalizeAcademicProfile(input);
  const classNumber = Number(profile.classNumber) || null;
  return profile.band === "early"
    || (classNumber !== null && classNumber >= 1 && classNumber <= 3);
}

export function shouldCaptureAcademicProfileRestore(current = {}, next = {}) {
  return !isYoungKidsAcademicProfile(current)
    && isYoungKidsAcademicProfile(next)
    && academicProfileHasChanged(current, next);
}

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
