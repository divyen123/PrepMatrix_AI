import { createHash, randomUUID } from "node:crypto";

import {
  PUSH_DELIVERY_TIMEOUT_MS,
  REMINDER_CLAIM_TTL_MS,
  buildPushSubscriptionRemovalOperation,
  getPushDeliveryStatus,
  isExpiredPushSubscription,
  migrateLegacyPushSubscription,
  normalizeStoredPushSubscriptionRecord,
  normalizeTimezoneOffset,
} from "./pushNotificationService.js";
import {
  recordNotificationHistorySafely,
} from "./notificationHistory.js";
import {
  academicProfileContext,
  withAcademicProfileWriteFence,
} from "./profileDataScope.js";
import { normalizeLearningState } from "../src/utils/learningMastery.js";
import { isPlannerTaskPending } from "../src/utils/plannerScheduleProgress.js";

export const SCHEDULED_REMINDER_LOOKBACK_MS = 24 * 60 * 60 * 1000;
export const SCHEDULED_REMINDER_DELIVERY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const SCHEDULED_REMINDER_PUSH_TTL_SECONDS = 24 * 60 * 60;
export const MAX_SCHEDULED_REMINDERS_PER_DEVICE = 5;
export const PLANNER_INCOMPLETE_ALERT_HOUR = 18;
export const GOAL_DUE_ALERT_HOUR = 9;
export const LEARNING_TOPIC_UNSTARTED_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
export const LEARNING_TOPIC_ALERT_WINDOW_MS = 4 * 24 * 60 * 60 * 1000;
export const AI_CREDIT_RESET_ALERT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

const LEARNING_NOTEBOOKS_COLLECTION = "learningNotebooks";
const PLACEMENT_WORKSPACE_ARTIFACT_KIND = "placement-workspace";

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function validDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function safeText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function scheduledAtForDevice(reminder, timezoneOffset) {
  const dateMatch = LOCAL_DATE_PATTERN.exec(String(reminder?.date || ""));
  if (!dateMatch) return null;
  const timeMatch = LOCAL_TIME_PATTERN.exec(String(reminder?.time || "00:00"));
  if (!timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const localWallClock = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (
    localWallClock.getUTCFullYear() !== year
    || localWallClock.getUTCMonth() !== month - 1
    || localWallClock.getUTCDate() !== day
  ) {
    return null;
  }

  return new Date(localWallClock.getTime() + normalizeTimezoneOffset(timezoneOffset) * 60 * 1000);
}

function localDateKey(now, timezoneOffset) {
  const localTime = new Date(now.getTime() - normalizeTimezoneOffset(timezoneOffset) * 60 * 1000);
  return `${localTime.getUTCFullYear()}-${String(localTime.getUTCMonth() + 1).padStart(2, "0")}-${String(localTime.getUTCDate()).padStart(2, "0")}`;
}

function dateKeyFromValue(value) {
  const directMatch = LOCAL_DATE_PATTERN.exec(String(value || "").slice(0, 10));
  if (directMatch) {
    const year = Number(directMatch[1]);
    const month = Number(directMatch[2]);
    const day = Number(directMatch[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() === year
      && parsed.getUTCMonth() === month - 1
      && parsed.getUTCDate() === day
    ) {
      return directMatch[0];
    }
    return "";
  }
  const date = validDate(value);
  if (!date) return "";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function dateKeyDayNumber(value) {
  const validKey = dateKeyFromValue(value);
  const match = LOCAL_DATE_PATTERN.exec(validKey);
  if (!match) return null;
  const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(timestamp) ? timestamp / (24 * 60 * 60 * 1000) : null;
}

function dateKeyFromDayNumber(value) {
  if (!Number.isFinite(value)) return "";
  const date = new Date(value * 24 * 60 * 60 * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function plannerScheduleDateKey(day, index, startDayNumber) {
  const explicitDate = dateKeyFromValue(day?.date);
  if (explicitDate) return explicitDate;
  if (startDayNumber === null) return "";
  const suppliedDayNumber = Number.parseInt(day?.day, 10);
  const dayOffset = Number.isInteger(suppliedDayNumber) && suppliedDayNumber > 0
    ? suppliedDayNumber - 1
    : index;
  return dateKeyFromDayNumber(startDayNumber + dayOffset);
}

function boundedLookbackAllows(effectiveAt, now, lookbackMs) {
  const age = now.getTime() - effectiveAt.getTime();
  return age >= 0 && age <= Math.max(0, Number(lookbackMs) || 0);
}

function buildAlertOccurrence({
  alertType,
  id,
  title,
  notes = "",
  effectiveAt,
  logicalKey,
  priority = "medium",
  metadata = {},
}) {
  const occurrenceKey = createHash("sha256")
    .update(`${alertType}\0${logicalKey}\0${effectiveAt.toISOString()}`)
    .digest("hex");
  const logicalEventKey = createHash("sha256")
    .update(`${alertType}\0${logicalKey}`)
    .digest("hex");
  return {
    alertType,
    occurrenceKey,
    logicalEventKey,
    effectiveAt,
    reminder: {
      id: safeText(id, 120),
      title: safeText(title, 120),
      notes: safeText(notes, 800),
      priority: ["low", "medium", "high"].includes(priority) ? priority : "medium",
    },
    metadata,
  };
}

export function getDueScheduledReminderOccurrences(
  reminders,
  {
    now = new Date(),
    timezoneOffset = 0,
    lookbackMs = SCHEDULED_REMINDER_LOOKBACK_MS,
  } = {},
) {
  const sweepNow = validDate(now);
  if (!sweepNow) throw new TypeError("A valid reminder sweep time is required.");
  const oldestAllowed = sweepNow.getTime() - Math.max(0, Number(lookbackMs) || 0);

  return (Array.isArray(reminders) ? reminders : [])
    .map((reminder) => {
      if (!reminder || reminder.completed) return null;
      const id = safeText(reminder.id, 120);
      const title = safeText(reminder.title, 120);
      if (!id || !title) return null;

      const scheduledAt = scheduledAtForDevice(reminder, timezoneOffset);
      if (!scheduledAt) return null;
      const snoozedUntil = validDate(reminder.snoozedUntil);
      const effectiveAt = new Date(Math.max(scheduledAt.getTime(), snoozedUntil?.getTime() || 0));
      if (effectiveAt.getTime() > sweepNow.getTime() || effectiveAt.getTime() < oldestAllowed) return null;

      const occurrenceKey = createHash("sha256")
        .update(`${id}\0${effectiveAt.toISOString()}`)
        .digest("hex");
      const logicalEventKey = createHash("sha256")
        .update(`${id}\0${safeText(reminder.date, 10)}\0${safeText(reminder.time || "00:00", 5)}\0${snoozedUntil?.toISOString() || ""}`)
        .digest("hex");
      return {
        occurrenceKey,
        logicalEventKey,
        effectiveAt,
        reminder: {
          id,
          title,
          notes: safeText(reminder.notes, 800),
          priority: ["low", "medium", "high"].includes(reminder.priority) ? reminder.priority : "medium",
        },
      };
    })
    .filter(Boolean)
    .sort((left, right) => (
      left.effectiveAt - right.effectiveAt
      || left.reminder.id.localeCompare(right.reminder.id)
    ));
}

export function getDueGoalAlertOccurrences(
  goals,
  {
    now = new Date(),
    timezoneOffset = 0,
    lookbackMs = SCHEDULED_REMINDER_LOOKBACK_MS,
  } = {},
) {
  const sweepNow = validDate(now);
  if (!sweepNow) throw new TypeError("A valid goal alert sweep time is required.");

  return (Array.isArray(goals) ? goals : [])
    .map((goal) => {
      if (!goal || goal.completed) return null;
      const id = safeText(goal.id, 120);
      const title = safeText(goal.title, 120);
      const targetDate = safeText(goal.targetDate, 10);
      if (!id || !title || !LOCAL_DATE_PATTERN.test(targetDate)) return null;
      const effectiveAt = scheduledAtForDevice({
        date: targetDate,
        time: `${String(GOAL_DUE_ALERT_HOUR).padStart(2, "0")}:00`,
      }, timezoneOffset);
      if (!effectiveAt || !boundedLookbackAllows(effectiveAt, sweepNow, lookbackMs)) return null;

      return buildAlertOccurrence({
        alertType: "goal-due",
        id,
        title,
        notes: goal.notes,
        effectiveAt,
        logicalKey: `${id}\0${targetDate}`,
        priority: goal.priority,
        metadata: { targetDate },
      });
    })
    .filter(Boolean)
    .sort((left, right) => left.effectiveAt - right.effectiveAt || left.reminder.id.localeCompare(right.reminder.id));
}

export function getPlannerIncompleteAlertOccurrence(
  workspace,
  {
    now = new Date(),
    timezoneOffset = 0,
    lookbackMs = SCHEDULED_REMINDER_LOOKBACK_MS,
  } = {},
) {
  const sweepNow = validDate(now);
  if (!sweepNow) throw new TypeError("A valid planner alert sweep time is required.");
  const schedule = Array.isArray(workspace?.schedule) ? workspace.schedule : [];
  const scheduleStartDate = dateKeyFromValue(workspace?.scheduleStartDate);
  const currentLocalDate = localDateKey(sweepNow, timezoneOffset);
  const startDayNumber = dateKeyDayNumber(scheduleStartDate);
  if (!schedule.length) return null;
  const dayIndex = schedule.findIndex((day, index) => (
    plannerScheduleDateKey(day, index, startDayNumber) === currentLocalDate
  ));
  if (dayIndex < 0) return null;
  const daySchedule = schedule[dayIndex];
  const suppliedPlannerDay = Number.parseInt(daySchedule?.day, 10);
  const plannerDay = Number.isInteger(suppliedPlannerDay) && suppliedPlannerDay > 0
    ? suppliedPlannerDay
    : dayIndex + 1;
  const tasks = Array.isArray(daySchedule?.tasks)
    ? daySchedule.tasks.filter((task) => safeText(task?.task, 300))
    : [];
  if (!tasks.length) return null;
  const completed = Array.isArray(workspace?.completed) ? workspace.completed : [];
  const pendingTasks = tasks.filter((task) => isPlannerTaskPending(task, completed));
  if (!pendingTasks.length) return null;

  const effectiveAt = scheduledAtForDevice({
    date: currentLocalDate,
    time: `${String(PLANNER_INCOMPLETE_ALERT_HOUR).padStart(2, "0")}:00`,
  }, timezoneOffset);
  if (!effectiveAt || !boundedLookbackAllows(effectiveAt, sweepNow, lookbackMs)) return null;

  return buildAlertOccurrence({
    alertType: "planner-incomplete",
    id: `planner-day-${plannerDay}`,
    title: "Planner schedule incomplete",
    effectiveAt,
    logicalKey: `${scheduleStartDate}\0${currentLocalDate}\0${plannerDay}\0${dayIndex}`,
    priority: "high",
    metadata: {
      plannerDay,
      pendingCount: pendingTasks.length,
      totalCount: tasks.length,
    },
  });
}

export function getStaleLearningTopicAlertOccurrences(
  notebooks,
  {
    now = new Date(),
    unstartedAfterMs = LEARNING_TOPIC_UNSTARTED_AFTER_MS,
    alertWindowMs = LEARNING_TOPIC_ALERT_WINDOW_MS,
  } = {},
) {
  const sweepNow = validDate(now);
  if (!sweepNow) throw new TypeError("A valid learning alert sweep time is required.");

  return (Array.isArray(notebooks) ? notebooks : [])
    .map((notebook) => {
      if (!notebook || notebook.artifactKind === PLACEMENT_WORKSPACE_ARTIFACT_KIND) return null;
      const id = safeText(notebook._id ?? notebook.id, 120);
      const createdAt = validDate(notebook.createdAt);
      if (!id || !createdAt) return null;
      const effectiveAt = new Date(createdAt.getTime() + Math.max(0, Number(unstartedAfterMs) || 0));
      if (!boundedLookbackAllows(effectiveAt, sweepNow, alertWindowMs)) return null;

      const learningState = normalizeLearningState(notebook.learningState, {
        notebook,
        now: sweepNow,
      });
      const unstartedTopics = Object.values(learningState.nodes).filter((node) => (
        node.nodeType === "topic"
        && ["new", "ready"].includes(node.status)
        && !node.startedAt
        && !node.lastStudiedAt
        && !node.learnedAt
        && (!Array.isArray(node.attempts) || node.attempts.length === 0)
      ));
      if (!unstartedTopics.length) return null;
      const firstTopic = unstartedTopics[0];
      const notebookTitle = safeText(notebook.title || notebook.subjectName, 120) || "Learning notebook";

      return buildAlertOccurrence({
        alertType: "learning-topic-unstarted",
        id: `learning-${id}`,
        title: firstTopic.title,
        effectiveAt,
        logicalKey: `${id}\0${createdAt.toISOString()}`,
        metadata: {
          notebookTitle,
          topicTitle: safeText(firstTopic.title, 180),
          unstartedCount: unstartedTopics.length,
        },
      });
    })
    .filter(Boolean)
    .sort((left, right) => left.effectiveAt - right.effectiveAt || left.reminder.id.localeCompare(right.reminder.id));
}

export function getAiCreditResetAlertOccurrence(
  quota,
  {
    now = new Date(),
    alertWindowMs = AI_CREDIT_RESET_ALERT_WINDOW_MS,
  } = {},
) {
  const sweepNow = validDate(now);
  if (!sweepNow) throw new TypeError("A valid AI credit alert sweep time is required.");
  const periodStart = validDate(quota?.periodStart);
  const limit = Number(quota?.limit);
  const remaining = Number(quota?.remaining);
  const used = Number(quota?.used);
  const reserved = Number(quota?.reserved);
  if (
    !periodStart
    || !Number.isFinite(limit)
    || limit <= 0
    || remaining !== limit
    || used !== 0
    || reserved !== 0
    || !boundedLookbackAllows(periodStart, sweepNow, alertWindowMs)
  ) {
    return null;
  }

  return buildAlertOccurrence({
    alertType: "ai-credit-reset",
    id: `ai-credit-reset-${periodStart.toISOString().slice(0, 10)}`,
    title: "AI credits reset",
    effectiveAt: periodStart,
    logicalKey: periodStart.toISOString(),
    metadata: { limit },
  });
}

export function buildNotificationAlertPayload(occurrence) {
  const title = safeText(occurrence?.reminder?.title, 120) || "Scheduled reminder";
  const notes = safeText(occurrence?.reminder?.notes, 220);
  const occurrenceKey = String(occurrence?.occurrenceKey || "");
  const alertType = safeText(occurrence?.alertType, 80) || "scheduled-reminder";
  let notification;

  if (alertType === "planner-incomplete") {
    const pendingCount = Math.max(1, Number.parseInt(occurrence?.metadata?.pendingCount, 10) || 1);
    notification = {
      title: "Planner schedule incomplete",
      body: `${pendingCount} task${pendingCount === 1 ? " is" : "s are"} still incomplete in today's schedule.`,
      url: "/planner/schedule",
      tag: `prepmatrix-planner-alert-${occurrenceKey.slice(0, 40)}`,
      kind: alertType,
    };
  } else if (alertType === "goal-due") {
    notification = {
      title: "Goal needs attention",
      body: notes
        ? `${title}: ${notes}`.slice(0, 320)
        : `${title} has reached its target date and is still incomplete.`,
      url: "/dashboard#goals-reminders",
      tag: `prepmatrix-goal-alert-${occurrenceKey.slice(0, 40)}`,
      kind: alertType,
      goalId: occurrence?.reminder?.id || "",
    };
  } else if (alertType === "learning-topic-unstarted") {
    const topicTitle = safeText(occurrence?.metadata?.topicTitle || title, 160) || "A learning topic";
    const notebookTitle = safeText(occurrence?.metadata?.notebookTitle, 140) || "your learning notebook";
    const unstartedCount = Math.max(1, Number.parseInt(occurrence?.metadata?.unstartedCount, 10) || 1);
    const topicSummary = unstartedCount === 1
      ? topicTitle
      : `${topicTitle} and ${unstartedCount - 1} more topic${unstartedCount === 2 ? "" : "s"}`;
    notification = {
      title: "Topic waiting in Start Learning",
      body: `${topicSummary} in ${notebookTitle} ${unstartedCount === 1 ? "has" : "have"} not been started after three days.`.slice(0, 320),
      url: "/learn",
      tag: `prepmatrix-learning-alert-${occurrenceKey.slice(0, 40)}`,
      kind: alertType,
    };
  } else if (alertType === "ai-credit-reset") {
    const limit = Math.max(1, Number.parseInt(occurrence?.metadata?.limit, 10) || 100);
    notification = {
      title: "AI credits reset",
      body: `Your monthly AI credits are back to 100% (${limit} credits available).`,
      url: "/about",
      tag: `prepmatrix-credit-alert-${occurrenceKey.slice(0, 40)}`,
      kind: alertType,
    };
  } else {
    notification = {
      title: "PrepMatrix Reminder",
      body: notes ? `${title}: ${notes}`.slice(0, 320) : `${title} is due now.`,
      url: `/dashboard?reminder=${encodeURIComponent(occurrence?.reminder?.id || "")}`,
      tag: `prepmatrix-reminder-${occurrenceKey.slice(0, 40)}`,
      kind: "scheduled-reminder",
      reminderId: occurrence?.reminder?.id || "",
    };
  }

  return JSON.stringify(notification);
}

export function buildScheduledReminderPayload(occurrence) {
  const payload = buildNotificationAlertPayload({
    ...occurrence,
    alertType: "scheduled-reminder",
  });
  return payload;
}

export function buildScheduledReminderDeliveryId({
  userId,
  academicProfileId,
  deviceId,
  occurrenceKey,
}) {
  return createHash("sha256")
    .update(
      `${String(userId)}\0${String(academicProfileId)}\0${String(deviceId)}\0${String(occurrenceKey)}`,
    )
    .digest("hex");
}

export async function claimScheduledReminderDelivery({
  collection,
  userId,
  academicProfileId,
  deviceId,
  occurrence,
  now = new Date(),
  claimIdFactory = randomUUID,
}) {
  const claimedAt = validDate(now);
  if (!claimedAt) throw new TypeError("A valid reminder claim time is required.");
  const claimId = claimIdFactory();
  const deliveryId = buildScheduledReminderDeliveryId({
    userId,
    academicProfileId,
    deviceId,
    occurrenceKey: occurrence.occurrenceKey,
  });
  const expiresAt = new Date(claimedAt.getTime() + SCHEDULED_REMINDER_DELIVERY_RETENTION_MS);
  const document = {
    _id: deliveryId,
    userId,
    academicProfileId,
    deviceId,
    reminderId: occurrence.reminder.id,
    alertKind: occurrence.alertType || "scheduled-reminder",
    occurrenceKey: occurrence.occurrenceKey,
    dueAt: occurrence.effectiveAt,
    claimId,
    claimedAt,
    expiresAt,
  };

  try {
    await collection.insertOne(document);
    return { claimed: true, claimId, deliveryId };
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }

  const staleBefore = new Date(claimedAt.getTime() - REMINDER_CLAIM_TTL_MS);
  const reclaimed = await collection.updateOne(
    {
      _id: deliveryId,
      userId,
      academicProfileId,
      sentAt: { $exists: false },
      claimedAt: { $lte: staleBefore },
    },
    {
      $set: { claimId, claimedAt, expiresAt },
    },
  );
  return { claimed: reclaimed.modifiedCount === 1, claimId, deliveryId };
}

async function clearScheduledReminderClaim(collection, deliveryId, claimId) {
  return collection.deleteOne({ _id: deliveryId, claimId, sentAt: { $exists: false } });
}

async function markScheduledReminderSent(collection, deliveryId, claimId, now) {
  return collection.updateOne(
    { _id: deliveryId, claimId, sentAt: { $exists: false } },
    {
      $set: {
        sentAt: now,
        expiresAt: new Date(now.getTime() + SCHEDULED_REMINDER_DELIVERY_RETENTION_MS),
      },
      $unset: { claimId: "", claimedAt: "" },
    },
  );
}

export async function runScheduledReminderPushSweep({
  db,
  ensureVapidConfigured,
  sendNotification,
  getAiQuotaStatus,
  additionalHosts = [],
  now = new Date(),
  logger = console,
  claimIdFactory = randomUUID,
  legacyDeviceIdFactory = randomUUID,
  withProfileWriteFence = withAcademicProfileWriteFence,
}) {
  await ensureVapidConfigured();
  const sweepNow = validDate(now);
  if (!sweepNow) throw new TypeError("A valid reminder sweep time is required.");
  const usersCollection = db.collection("users");
  const workspacesCollection = db.collection("workspaces");
  const learningNotebooksCollection = db.collection(LEARNING_NOTEBOOKS_COLLECTION);
  const deliveriesCollection = db.collection("scheduledReminderDeliveries");
  const users = await usersCollection.find({
    $or: [
      { "pushSubscriptions.0": { $exists: true } },
      { pushSubscription: { $exists: true, $ne: null } },
    ],
  }).toArray();
  const summary = {
    usersExamined: users.length,
    devicesExamined: 0,
    goalsExamined: 0,
    learningNotebooksExamined: 0,
    eligible: 0,
    sent: 0,
    expired: 0,
    failed: 0,
    skipped: 0,
    raced: 0,
    deferred: 0,
  };

  for (const user of users) {
    let records = Array.isArray(user.pushSubscriptions) ? user.pushSubscriptions : [];
    if (user.pushSubscription) {
      try {
        const migration = await migrateLegacyPushSubscription({
          usersCollection,
          user,
          additionalHosts,
          now: sweepNow,
          deviceIdFactory: legacyDeviceIdFactory,
        });
        records = migration.records;
        if (migration.raced) summary.raced += 1;
      } catch (error) {
        summary.failed += 1;
        logger.error(`[Web Push] Legacy subscription migration failed for user ${user._id}`, {
          statusCode: getPushDeliveryStatus(error),
        });
      }
    }

    const devices = [];
    for (const record of records) {
      try {
        devices.push(normalizeStoredPushSubscriptionRecord(record, { additionalHosts }));
      } catch {
        summary.skipped += 1;
      }
    }
    summary.devicesExamined += devices.length;
    if (devices.length === 0) continue;
    let profileContext;
    try {
      profileContext = academicProfileContext(user);
    } catch {
      summary.skipped += devices.length;
      continue;
    }
    const profileWriteRequest = {
      user: { _id: user._id },
      academicProfileId: profileContext.academicProfileId,
    };

    const workspace = await workspacesCollection.findOne({
      userId: user._id,
      academicProfileId: profileContext.academicProfileId,
    });
    const storedGoals = Array.isArray(workspace?.goalReminderData?.goals)
      ? workspace.goalReminderData.goals
      : [];
    summary.goalsExamined += storedGoals.length;
    const learningNotebooks = await learningNotebooksCollection.find({
      userId: user._id,
      academicProfileId: profileContext.academicProfileId,
      artifactKind: { $ne: PLACEMENT_WORKSPACE_ARTIFACT_KIND },
    }).toArray();
    summary.learningNotebooksExamined += learningNotebooks.length;
    const learningAlerts = getStaleLearningTopicAlertOccurrences(learningNotebooks, {
      now: sweepNow,
    });
    let creditResetAlert = null;
    if (typeof getAiQuotaStatus === "function") {
      try {
        const quota = await getAiQuotaStatus(user._id);
        creditResetAlert = getAiCreditResetAlertOccurrence(quota, { now: sweepNow });
      } catch (error) {
        summary.failed += 1;
        logger.warn(`[Web Push] AI credit reset alert check failed for user ${user._id}`, {
          error: error instanceof Error ? error.name : "UnknownError",
        });
      }
    }

    for (const device of devices) {
      const plannerAlert = getPlannerIncompleteAlertOccurrence(workspace, {
        now: sweepNow,
        timezoneOffset: device.timezoneOffset,
      });
      const due = [
        ...getDueGoalAlertOccurrences(storedGoals, {
          now: sweepNow,
          timezoneOffset: device.timezoneOffset,
        }),
        ...learningAlerts,
        ...(plannerAlert ? [plannerAlert] : []),
        ...(creditResetAlert ? [creditResetAlert] : []),
      ].sort((left, right) => (
        left.effectiveAt - right.effectiveAt
        || left.reminder.id.localeCompare(right.reminder.id)
      ));
      summary.eligible += due.length;
      let claimedThisSweep = 0;

      for (const occurrence of due) {
        if (claimedThisSweep >= MAX_SCHEDULED_REMINDERS_PER_DEVICE) {
          summary.deferred += 1;
          continue;
        }
        let deliveryId = "";
        let claimId = "";
        try {
          const claim = await withProfileWriteFence(
            db,
            profileWriteRequest,
            () => claimScheduledReminderDelivery({
              collection: deliveriesCollection,
              userId: user._id,
              academicProfileId: profileContext.academicProfileId,
              deviceId: device.deviceId,
              occurrence,
              now: sweepNow,
              claimIdFactory,
            }),
          );
          if (!claim.claimed) {
            summary.skipped += 1;
            continue;
          }
          deliveryId = claim.deliveryId;
          claimId = claim.claimId;
          claimedThisSweep += 1;

          const serializedPayload = buildNotificationAlertPayload(occurrence);
          const notification = JSON.parse(serializedPayload);
          await withProfileWriteFence(
            db,
            profileWriteRequest,
            () => undefined,
          );
          try {
            await sendNotification(
              { endpoint: device.endpoint, expirationTime: device.expirationTime, keys: device.keys },
              serializedPayload,
              { TTL: SCHEDULED_REMINDER_PUSH_TTL_SECONDS, timeout: PUSH_DELIVERY_TIMEOUT_MS },
            );
          } catch (error) {
            const statusCode = getPushDeliveryStatus(error);
            if (isExpiredPushSubscription(error)) {
              const removal = buildPushSubscriptionRemovalOperation({
                userId: user._id,
                deviceId: device.deviceId,
                subscriptionVersion: device.subscriptionVersion,
              });
              const removed = await usersCollection.updateOne(removal.filter, removal.update);
              if (removed.modifiedCount !== 1) summary.raced += 1;
              summary.expired += 1;
            } else {
              summary.failed += 1;
            }
            await clearScheduledReminderClaim(deliveriesCollection, deliveryId, claimId);
            deliveryId = "";
            claimId = "";
            logger.warn(`[Web Push] Notification alert delivery failed for user ${user._id}`, { statusCode });
            if (isExpiredPushSubscription(error)) break;
            continue;
          }

          const marked = await withProfileWriteFence(
            db,
            profileWriteRequest,
            async () => {
              const result = await markScheduledReminderSent(deliveriesCollection, deliveryId, claimId, sweepNow);
              await recordNotificationHistorySafely({
                db,
                userId: user._id,
                academicProfileId: profileContext.academicProfileId,
                eventKey: `${notification.kind}:${occurrence.logicalEventKey}`,
                kind: notification.kind,
                title: notification.title,
                body: notification.body,
                url: notification.url,
                createdAt: sweepNow,
              }, logger);
              return result;
            },
          );
          if (marked.modifiedCount === 1) summary.sent += 1;
          else summary.raced += 1;
          deliveryId = "";
          claimId = "";
        } catch (error) {
          if (deliveryId && claimId) {
            await clearScheduledReminderClaim(deliveriesCollection, deliveryId, claimId).catch(() => {});
          }
          summary.failed += 1;
          logger.error(`[Web Push] Notification alert processing failed for user ${user._id}`, {
            statusCode: getPushDeliveryStatus(error),
          });
        }
      }
    }
  }

  return summary;
}

export const runNotificationAlertPushSweep = runScheduledReminderPushSweep;
