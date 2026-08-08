import assert from "node:assert/strict";
import test from "node:test";
import {
  appendLearningNote,
  registerLearningNoteRoutes,
} from "./learningNoteRoutes.js";

class MemoryNotesCollection {
  constructor() {
    this.document = null;
  }

  async findOne(query) {
    if (!this.document || this.document.userId !== query.userId) return null;
    const sourceKey = query["notes.sourceKey"];
    if (sourceKey && !this.document.notes.some((note) => note.sourceKey === sourceKey)) return null;
    return structuredClone(this.document);
  }

  async updateOne(query, update) {
    if (!this.document || this.document.userId !== query.userId) return { modifiedCount: 0 };
    const excludedSourceKey = query["notes.sourceKey"]?.$ne;
    if (this.document.notes.some((note) => note.sourceKey === excludedSourceKey)) {
      return { modifiedCount: 0 };
    }
    this.document.notes.unshift(structuredClone(update.$push.notes.$each[0]));
    this.document.updatedAt = update.$set.updatedAt;
    return { modifiedCount: 1 };
  }

  async insertOne(document) {
    if (this.document?.userId === document.userId) throw new Error("duplicate user notes document");
    this.document = structuredClone(document);
    return { insertedId: "notes-document" };
  }
}

function topicNote(overrides = {}) {
  return {
    id: "learning-note-1",
    topic: "AVL Trees · Data Structures",
    details: "Balanced tree notes.",
    learningContext: {
      chapter: "Trees",
      subject: "Data Structures",
      topic: "AVL Trees",
    },
    ...overrides,
  };
}

test("atomically prepends a learning note and returns the existing note on repeat", async () => {
  const collection = new MemoryNotesCollection();
  const first = await appendLearningNote(collection, "user-1", topicNote());
  const repeated = await appendLearningNote(
    collection,
    "user-1",
    topicNote({ id: "different-client-id" }),
  );

  assert.equal(first.created, true);
  assert.equal(repeated.created, false);
  assert.equal(repeated.note.id, "learning-note-1");
  assert.equal(collection.document.notes.length, 1);
});

test("registers POST /api/notes and reports created versus already saved", async () => {
  const collection = new MemoryNotesCollection();
  let route = null;
  const app = {
    post(path, handler) {
      route = { handler, path };
    },
  };
  registerLearningNoteRoutes(app, {
    getDb: async () => ({ collection: () => collection }),
    requireAuth: (handler) => handler,
  });
  assert.equal(route.path, "/api/notes");

  const response = {
    body: null,
    statusCode: 200,
    json(body) {
      this.body = body;
      return this;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
  };
  await route.handler({ body: { note: topicNote() }, user: { _id: "user-1" } }, response);
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.created, true);

  await route.handler({ body: { note: topicNote() }, user: { _id: "user-1" } }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.created, false);
});
