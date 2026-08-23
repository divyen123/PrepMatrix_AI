import { normalizeAcademicProfile } from "../src/utils/academicProfile.js";

export const KIDS_PARENT_ACCESS_TTL_MS = 15 * 60 * 1000;

function scheduleWithoutPlannerProgressMetadata(schedule) {
  if (!Array.isArray(schedule)) return schedule;

  return schedule.map((day) => {
    if (!day || typeof day !== "object" || Array.isArray(day)) return day;

    const protectedDay = { ...day };
    delete protectedDay.plannerQuizUnlock;

    if (!Array.isArray(protectedDay.tasks)) return protectedDay;

    protectedDay.tasks = protectedDay.tasks.map((task) => {
      if (
        !task
        || typeof task !== "object"
        || Array.isArray(task)
        || typeof task.recheckPending !== "boolean"
      ) {
        return task;
      }

      const protectedTask = { ...task };
      delete protectedTask.recheckPending;
      return protectedTask;
    });

    return protectedDay;
  });
}

export function kidsWorkspaceScheduleChanged(existingWorkspace = {}, update = {}) {
  const scheduleChanged = Object.prototype.hasOwnProperty.call(update, "schedule")
    && JSON.stringify(scheduleWithoutPlannerProgressMetadata(existingWorkspace?.schedule || []))
      !== JSON.stringify(scheduleWithoutPlannerProgressMetadata(update.schedule || []));
  const startDateChanged = Object.prototype.hasOwnProperty.call(update, "scheduleStartDate")
    && String(existingWorkspace?.scheduleStartDate || "") !== String(update.scheduleStartDate || "");
  return scheduleChanged || startDateChanged;
}

function validDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function getYoungKidsAccessProfile(user = {}) {
  const academicProfile = normalizeAcademicProfile(user);
  const classNumber = Number(academicProfile.classNumber) || null;
  const earlyYears = academicProfile.band === "early";
  const primaryYears = classNumber !== null && classNumber >= 1 && classNumber <= 3;
  const eligible = earlyYears || primaryYears;

  let gradeBand = null;
  if (earlyYears) gradeBand = "early-years";
  else if (classNumber !== null && classNumber <= 2) gradeBand = "class1-2";
  else if (classNumber === 3) gradeBand = "class3-5";

  return {
    academicProfile,
    classNumber,
    eligible,
    gradeBand,
  };
}

export function parentAccessStatus(session = {}, {
  parentPinConfigured = false,
  now = new Date(),
} = {}) {
  const currentTime = validDate(now) || new Date();
  const parentAccessUntil = validDate(session?.parentAccessUntil);
  const unlocked = Boolean(parentAccessUntil && parentAccessUntil.getTime() > currentTime.getTime());

  return {
    unlocked,
    expiresAt: unlocked ? parentAccessUntil.toISOString() : null,
    setupRequired: !parentPinConfigured,
  };
}

export async function readParentAccess(db, sessionToken, options = {}) {
  const token = String(sessionToken || "").trim();
  const session = token
    ? await db.collection("sessions").findOne({ token })
    : null;
  return parentAccessStatus(session || {}, options);
}

export async function readYoungKidsParentFeatureAccess(db, {
  user = {},
  sessionToken = "",
  parentSettingsCollection = "kidsParentSettings",
  now = new Date(),
} = {}) {
  const profile = getYoungKidsAccessProfile(user);
  if (!profile.eligible) {
    return {
      allowed: true,
      required: false,
      parentAccess: null,
    };
  }

  const parentSettings = await db.collection(parentSettingsCollection)
    .findOne({ userId: user?._id });
  const parentAccess = await readParentAccess(db, sessionToken, {
    parentPinConfigured: Boolean(parentSettings?.pinHash && parentSettings?.pinSalt),
    now,
  });

  return {
    allowed: parentAccess.unlocked,
    required: true,
    parentAccess,
  };
}

export async function grantParentAccess(db, sessionToken, {
  parentPinConfigured = true,
  now = new Date(),
  ttlMs = KIDS_PARENT_ACCESS_TTL_MS,
} = {}) {
  const token = String(sessionToken || "").trim();
  if (!token) return parentAccessStatus({}, { parentPinConfigured, now });

  const currentTime = validDate(now) || new Date();
  const safeTtlMs = Math.max(60_000, Math.min(60 * 60 * 1000, Number(ttlMs) || KIDS_PARENT_ACCESS_TTL_MS));
  const parentAccessUntil = new Date(currentTime.getTime() + safeTtlMs);
  const result = await db.collection("sessions").updateOne(
    { token },
    { $set: { parentAccessUntil, parentAccessGrantedAt: currentTime } },
  );
  if (!result?.matchedCount) return parentAccessStatus({}, { parentPinConfigured, now: currentTime });

  return parentAccessStatus({ parentAccessUntil }, { parentPinConfigured, now: currentTime });
}

export async function revokeParentAccess(db, sessionToken, {
  parentPinConfigured = true,
  now = new Date(),
} = {}) {
  const token = String(sessionToken || "").trim();
  if (token) {
    await db.collection("sessions").updateOne(
      { token },
      { $unset: { parentAccessUntil: "", parentAccessGrantedAt: "" } },
    );
  }
  return parentAccessStatus({}, { parentPinConfigured, now });
}
