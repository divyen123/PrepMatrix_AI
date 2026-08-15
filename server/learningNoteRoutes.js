import { normalizeLearningTopicNote } from "../src/utils/learningNoteIntegration.js";
import {
  getRequestAcademicProfileId,
  withAcademicProfileWriteFence,
} from "./profileDataScope.js";

async function findNoteBySourceKey(collection, userId, academicProfileId, sourceKey) {
  const document = await collection.findOne(
    { userId, academicProfileId, "notes.sourceKey": sourceKey },
    { projection: { notes: 1 } },
  );
  return Array.isArray(document?.notes)
    ? document.notes.find((note) => note?.sourceKey === sourceKey) || null
    : null;
}

export async function appendLearningNote(
  collection,
  userId,
  academicProfileId,
  input,
  options = {},
) {
  const {
    beforeWrite = null,
    ...normalizationOptions
  } = options || {};
  const assertWritable = typeof beforeWrite === "function" ? beforeWrite : async () => undefined;
  const note = normalizeLearningTopicNote(input, normalizationOptions);
  const existing = await findNoteBySourceKey(collection, userId, academicProfileId, note.sourceKey);
  if (existing) return { created: false, note: existing };

  const update = {
    $push: { notes: { $each: [note], $position: 0 } },
    $set: { updatedAt: new Date() },
  };
  const filter = { userId, academicProfileId, "notes.sourceKey": { $ne: note.sourceKey } };
  await assertWritable();
  const updateResult = await collection.updateOne(filter, update);
  if (updateResult.modifiedCount > 0) return { created: true, note };

  const concurrentExisting = await findNoteBySourceKey(
    collection,
    userId,
    academicProfileId,
    note.sourceKey,
  );
  if (concurrentExisting) return { created: false, note: concurrentExisting };

  try {
    await assertWritable();
    await collection.insertOne({
      userId,
      academicProfileId,
      notes: [note],
      updatedAt: new Date(),
    });
    return { created: true, note };
  } catch (error) {
    // A concurrent first note can create the user's document between update and insert.
    await assertWritable();
    const retryResult = await collection.updateOne(filter, update);
    if (retryResult.modifiedCount > 0) return { created: true, note };

    const retryExisting = await findNoteBySourceKey(
      collection,
      userId,
      academicProfileId,
      note.sourceKey,
    );
    if (retryExisting) return { created: false, note: retryExisting };
    throw error;
  }
}

export function registerLearningNoteRoutes(app, {
  getDb,
  withProfileWriteFence = withAcademicProfileWriteFence,
  requireAuth,
}) {
  app.post("/api/notes", requireAuth(async (req, res) => {
    try {
      const db = await getDb();
      const academicProfileId = getRequestAcademicProfileId(req);
      const result = await withProfileWriteFence(
        db,
        req,
        () => appendLearningNote(
          db.collection("notes"),
          req.user._id,
          academicProfileId,
          req.body?.note,
        ),
      );
      return res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save this learning topic.";
      const isInputError = /required|topic/iu.test(message);
      const status = Number(error?.status) || (isInputError ? 400 : 500);
      return res.status(status).json({
        error: message,
        ...(error?.code ? { code: error.code } : {}),
      });
    }
  }));
}
