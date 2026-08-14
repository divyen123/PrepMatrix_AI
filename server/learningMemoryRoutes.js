import { ObjectId } from "mongodb";
import { normalizeLearningNotebook } from "../src/utils/learningNotebook.js";
import { applyPredictiveMemoryQuizResult } from "../src/utils/learningMemoryResults.js";

const LEARNING_NOTEBOOKS_COLLECTION = "learningNotebooks";
const MAX_COMPLETION_RETRIES = 3;

function cleanText(value, maximum = 180) {
  return String(value ?? "")
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maximum);
}

function boundedNumber(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function memoryError(res, status, code, error) {
  res.set("Cache-Control", "no-store");
  return res.status(status).json({ code, error });
}

function notebookIdFromParam(value) {
  const text = cleanText(value, 64);
  return ObjectId.isValid(text) ? new ObjectId(text) : null;
}

function revisionFilter(document) {
  if (Object.prototype.hasOwnProperty.call(document, "updatedAt")) {
    return { updatedAt: document.updatedAt };
  }
  return { updatedAt: { $exists: false } };
}

function normalizeQuizId(value) {
  const quizId = cleanText(value, 180);
  if (
    quizId.length < 8
    || !/^[a-zA-Z0-9._:-]+$/u.test(quizId)
    || ["__proto__", "constructor", "prototype"].includes(quizId)
  ) {
    return "";
  }
  return quizId;
}

export function normalizeLearningMemoryQuizSubmission(value = {}) {
  const nodeId = cleanText(value.nodeId ?? value.sourceLearningNodeId, 180);
  const score = boundedNumber(value.score ?? value.percentage, 0, 100, null);
  const confidence = boundedNumber(value.confidence, 1, 5, 3);
  const durationMinutes = boundedNumber(value.durationMinutes, 0.25, 10, 3);
  if (!nodeId || score === null) return null;
  return {
    nodeId,
    score: Math.round(score),
    confidence: Math.round(confidence),
    durationMinutes: Math.round(durationMinutes * 100) / 100,
  };
}

function publicNotebook(document, user, at) {
  return normalizeLearningNotebook(document, {
    id: String(document._id ?? document.id),
    profile: user,
    sources: document.sources,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt ?? at,
    model: document.model,
    preserveLegacyMedicalCareer: true,
    now: at,
  });
}
export function registerLearningMemoryRoutes(app, {
  getDb,
  requireAuth,
  mutationSecurity = (_req, _res, next) => next(),
  now = () => new Date(),
} = {}) {
  if (!app?.post) throw new TypeError("An Express app is required.");
  if (typeof getDb !== "function") throw new TypeError("A database provider is required.");
  if (typeof requireAuth !== "function") throw new TypeError("Authentication middleware is required.");

  app.post(
    "/api/learning-notebooks/:id/memory-quizzes/:quizId/complete",
    mutationSecurity,
    requireAuth(async (req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        const notebookId = notebookIdFromParam(req.params.id);
        const quizId = normalizeQuizId(req.params.quizId);
        const submission = normalizeLearningMemoryQuizSubmission(req.body);
        if (!notebookId) {
          return memoryError(res, 400, "LEARNING_NOTEBOOK_ID_INVALID", "The learning notebook identifier is invalid.");
        }
        if (!quizId) {
          return memoryError(res, 400, "MEMORY_QUIZ_ID_INVALID", "The memory quiz identifier is invalid.");
        }
        if (!submission) {
          return memoryError(res, 400, "MEMORY_QUIZ_RESULT_INVALID", "A valid concept and score are required.");
        }

        const db = await getDb();
        const collection = db.collection(LEARNING_NOTEBOOKS_COLLECTION);
        const completedAt = now();

        for (let attempt = 0; attempt < MAX_COMPLETION_RETRIES; attempt += 1) {
          const existing = await collection.findOne({
            _id: notebookId,
            userId: req.user._id,
          });
          if (!existing) {
            return memoryError(res, 404, "LEARNING_NOTEBOOK_NOT_FOUND", "Learning notebook not found.");
          }

          const notebook = publicNotebook(existing, req.user, completedAt);
          const applied = applyPredictiveMemoryQuizResult(notebook, {
            ...submission,
            quizId,
            completedAt: completedAt.toISOString(),
          }, { now: completedAt });
          if (!applied) {
            return memoryError(
              res,
              409,
              "MEMORY_QUIZ_CONCEPT_UNAVAILABLE",
              "This concept is not available for a predictive memory review.",
            );
          }

          if (applied.duplicate) {
            return res.json({
              notebook,
              result: {
                quizId,
                nodeId: submission.nodeId,
                score: applied.attempt?.score ?? applied.record.lastScore,
                dueAt: applied.record.dueAt,
                duplicate: true,
              },
            });
          }

          const update = await collection.updateOne(
            {
              _id: notebookId,
              userId: req.user._id,
              ...revisionFilter(existing),
            },
            {
              $set: {
                learningState: applied.learningState,
                memoryDecayState: applied.memoryDecayState,
                updatedAt: completedAt,
              },
            },
          );
          if (update.matchedCount !== 1) continue;

          const saved = publicNotebook({
            ...existing,
            learningState: applied.learningState,
            memoryDecayState: applied.memoryDecayState,
            updatedAt: completedAt,
          }, req.user, completedAt);
          return res.json({
            notebook: saved,
            result: {
              quizId,
              nodeId: submission.nodeId,
              score: applied.record.lastScore,
              dueAt: applied.record.dueAt,
              predictedRecall: 1,
              duplicate: false,
            },
          });
        }

        return memoryError(
          res,
          409,
          "MEMORY_QUIZ_SAVE_CONFLICT",
          "Learning progress changed while this review was being saved. Please retry.",
        );
      } catch (error) {
        console.error("Predictive memory result save failed:", error instanceof Error ? error.name : "UnknownError");
        return memoryError(
          res,
          500,
          "MEMORY_QUIZ_SAVE_FAILED",
          "The memory review could not be saved.",
        );
      }
    }),
  );
}

export default registerLearningMemoryRoutes;
