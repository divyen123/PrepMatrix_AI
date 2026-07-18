import { ObjectId } from "mongodb";

export const NOTIFICATION_HISTORY_COLLECTION = "notificationHistory";
export const NOTIFICATION_HISTORY_LIMIT = 100;

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

function safeText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function safeInternalUrl(value) {
  const url = safeText(value, 500);
  if (!url.startsWith("/") || url.startsWith("//") || url.includes("\\") || /[\r\n]/.test(url)) return "/";
  return url;
}

function validDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function parseNotificationHistoryId(value) {
  const id = typeof value === "string" ? value.trim() : "";
  return OBJECT_ID_PATTERN.test(id) ? new ObjectId(id) : null;
}

export function publicNotificationHistoryRecord(document) {
  return {
    id: document._id.toString(),
    kind: safeText(document.kind, 80),
    title: safeText(document.title, 160),
    body: safeText(document.body, 500),
    url: safeInternalUrl(document.url),
    createdAt: validDate(document.createdAt)?.toISOString() || new Date(0).toISOString(),
    readAt: validDate(document.readAt)?.toISOString() || null,
  };
}

export async function pruneNotificationHistory(collection, userId) {
  const staleDocuments = await collection
    .find({ userId })
    .sort({ createdAt: -1, _id: -1 })
    .skip(NOTIFICATION_HISTORY_LIMIT)
    .project({ _id: 1 })
    .toArray();
  if (staleDocuments.length === 0) return 0;

  const result = await collection.deleteMany({
    userId,
    _id: { $in: staleDocuments.map((document) => document._id) },
  });
  return result.deletedCount || 0;
}

export async function recordNotificationHistory({
  collection,
  userId,
  eventKey = "",
  kind,
  title,
  body,
  url = "/",
  createdAt = new Date(),
}) {
  const normalizedCreatedAt = validDate(createdAt);
  const document = {
    userId,
    kind: safeText(kind, 80) || "notification",
    title: safeText(title, 160) || "PrepMatrix AI",
    body: safeText(body, 500),
    url: safeInternalUrl(url),
    createdAt: normalizedCreatedAt || new Date(),
  };
  const normalizedEventKey = safeText(eventKey, 240);

  if (!normalizedEventKey) {
    const result = await collection.insertOne(document);
    await pruneNotificationHistory(collection, userId);
    return { inserted: true, id: result.insertedId };
  }

  const result = await collection.updateOne(
    { userId, eventKey: normalizedEventKey },
    {
      $setOnInsert: {
        ...document,
        eventKey: normalizedEventKey,
      },
    },
    { upsert: true },
  );
  const inserted = result.upsertedCount === 1;
  if (inserted) await pruneNotificationHistory(collection, userId);
  return {
    inserted,
    id: result.upsertedId || null,
  };
}

export async function recordNotificationHistorySafely(options, logger = console) {
  try {
    const collection = options?.collection || options?.db?.collection(NOTIFICATION_HISTORY_COLLECTION);
    if (!collection) throw new TypeError("A notification history collection is required.");
    return await recordNotificationHistory({
      ...options,
      collection,
    });
  } catch (error) {
    try {
      logger?.error?.("[Notification History] Failed to save a delivered notification.", {
        kind: safeText(options?.kind, 80),
        error: error instanceof Error ? error.name : "UnknownError",
      });
    } catch {
      // History persistence and logging are both best-effort after push delivery.
    }
    return { inserted: false, failed: true, id: null };
  }
}

function invalidIdResponse(res) {
  return res.status(400).json({
    error: "The notification ID is invalid.",
    code: "INVALID_NOTIFICATION_ID",
  });
}

export function registerNotificationHistoryRoutes(app, {
  getDb,
  mutationSecurity,
  requireAuth,
  now = () => new Date(),
}) {
  app.get("/api/notifications/history", requireAuth(async (req, res) => {
    const db = await getDb();
    const collection = db.collection(NOTIFICATION_HISTORY_COLLECTION);
    const filter = { userId: req.user._id };
    const unreadFilter = {
      userId: req.user._id,
      $or: [
        { readAt: { $exists: false } },
        { readAt: null },
      ],
    };
    const [documents, unreadCount] = await Promise.all([
      collection
        .find(filter)
        .project({ userId: 0, eventKey: 0 })
        .sort({ createdAt: -1, _id: -1 })
        .limit(NOTIFICATION_HISTORY_LIMIT)
        .toArray(),
      collection.countDocuments(unreadFilter),
    ]);

    res.set("Cache-Control", "no-store");
    return res.json({
      notifications: documents.map(publicNotificationHistoryRecord),
      unreadCount,
    });
  }));

  app.patch(
    "/api/notifications/history/:id/read",
    mutationSecurity,
    requireAuth(async (req, res) => {
      res.set("Cache-Control", "no-store");
      const notificationId = parseNotificationHistoryId(req.params.id);
      if (!notificationId) return invalidIdResponse(res);

      const db = await getDb();
      const collection = db.collection(NOTIFICATION_HISTORY_COLLECTION);
      const filter = { _id: notificationId, userId: req.user._id };
      const existing = await collection.findOne(filter);
      if (!existing) {
        return res.status(404).json({ error: "Notification not found." });
      }

      if (!validDate(existing.readAt)) {
        const readAt = validDate(now()) || new Date();
        await collection.updateOne(
          {
            ...filter,
            $or: [
              { readAt: { $exists: false } },
              { readAt: null },
            ],
          },
          { $set: { readAt } },
        );
        existing.readAt = readAt;
      }

      return res.json({
        notification: publicNotificationHistoryRecord(existing),
      });
    }),
  );

  app.delete(
    "/api/notifications/history",
    mutationSecurity,
    requireAuth(async (req, res) => {
      res.set("Cache-Control", "no-store");
      const db = await getDb();
      const result = await db.collection(NOTIFICATION_HISTORY_COLLECTION).deleteMany({
        userId: req.user._id,
      });
      return res.json({
        success: true,
        deletedCount: result.deletedCount || 0,
      });
    }),
  );

  app.delete(
    "/api/notifications/history/:id",
    mutationSecurity,
    requireAuth(async (req, res) => {
      res.set("Cache-Control", "no-store");
      const notificationId = parseNotificationHistoryId(req.params.id);
      if (!notificationId) return invalidIdResponse(res);

      const db = await getDb();
      const result = await db.collection(NOTIFICATION_HISTORY_COLLECTION).deleteOne({
        _id: notificationId,
        userId: req.user._id,
      });
      if (result.deletedCount !== 1) {
        return res.status(404).json({ error: "Notification not found." });
      }
      return res.json({ success: true, id: notificationId.toString() });
    }),
  );
}
