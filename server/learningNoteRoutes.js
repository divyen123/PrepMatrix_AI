import { normalizeLearningTopicNote } from "../src/utils/learningNoteIntegration.js";

async function findNoteBySourceKey(collection, userId, sourceKey) {
  const document = await collection.findOne(
    { userId, "notes.sourceKey": sourceKey },
    { projection: { notes: 1 } },
  );
  return Array.isArray(document?.notes)
    ? document.notes.find((note) => note?.sourceKey === sourceKey) || null
    : null;
}

export async function appendLearningNote(collection, userId, input, options = {}) {
  const note = normalizeLearningTopicNote(input, options);
  const existing = await findNoteBySourceKey(collection, userId, note.sourceKey);
  if (existing) return { created: false, note: existing };

  const update = {
    $push: { notes: { $each: [note], $position: 0 } },
    $set: { updatedAt: new Date() },
  };
  const filter = { userId, "notes.sourceKey": { $ne: note.sourceKey } };
  const updateResult = await collection.updateOne(filter, update);
  if (updateResult.modifiedCount > 0) return { created: true, note };

  const concurrentExisting = await findNoteBySourceKey(collection, userId, note.sourceKey);
  if (concurrentExisting) return { created: false, note: concurrentExisting };

  try {
    await collection.insertOne({ userId, notes: [note], updatedAt: new Date() });
    return { created: true, note };
  } catch (error) {
    // A concurrent first note can create the user's document between update and insert.
    const retryResult = await collection.updateOne(filter, update);
    if (retryResult.modifiedCount > 0) return { created: true, note };

    const retryExisting = await findNoteBySourceKey(collection, userId, note.sourceKey);
    if (retryExisting) return { created: false, note: retryExisting };
    throw error;
  }
}

export function registerLearningNoteRoutes(app, { getDb, requireAuth }) {
  app.post("/api/notes", requireAuth(async (req, res) => {
    try {
      const db = await getDb();
      const result = await appendLearningNote(
        db.collection("notes"),
        req.user._id,
        req.body?.note,
      );
      return res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save this learning topic.";
      const isInputError = /required|topic/iu.test(message);
      return res.status(isInputError ? 400 : 500).json({ error: message });
    }
  }));
}
