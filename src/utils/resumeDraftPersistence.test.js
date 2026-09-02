import assert from "node:assert/strict";
import test from "node:test";
import {
  RESUME_DRAFT_CHECKPOINT_VERSION,
  clearResumeDraftCheckpoint,
  createResumeDraftCheckpoint,
  getResumeDraftStorageKey,
  readResumeDraftCheckpoint,
  reconcileResumeDraftCheckpoint,
  writeResumeDraftCheckpoint,
} from "./resumeDraftPersistence.js";

function memoryStorage(initial = []) {
  const entries = new Map(initial);
  return {
    get length() {
      return entries.size;
    },
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    key(index) {
      return [...entries.keys()][index] ?? null;
    },
    removeItem(key) {
      entries.delete(key);
    },
    setItem(key, value) {
      entries.set(key, String(value));
    },
  };
}

function builder(name, updatedAt, extra = {}) {
  return {
    draft: {
      personal: {
        fullName: name,
        headline: "Engineer",
        email: "learner@example.com",
      },
      summary: "Builds dependable products.",
      skills: ["JavaScript"],
      tools: ["VS Code", "GitHub"],
      education: [],
    },
    layout: { template: "classic", accent: "#5b7cfa" },
    updatedAt,
    ...extra,
  };
}

test("uses profile-scoped storage keys", () => {
  const first = getResumeDraftStorageKey("academic-profile:first");
  const second = getResumeDraftStorageKey("academic-profile:second");
  assert.match(first, /^prepmatrix-profile:academic-profile%3Afirst:resume-draft-v1$/u);
  assert.notEqual(first, second);
  assert.equal(getResumeDraftStorageKey(""), "");
});

test("writes and reads editable draft data without copying generation quota", () => {
  const storage = memoryStorage();
  const state = builder("  Learner Name  ", "2026-08-31T10:00:00.000Z", {
    generationTimestamps: ["2026-08-30T10:00:00.000Z"],
    lastGeneratedAt: "2026-08-30T10:00:00.000Z",
  });
  const written = writeResumeDraftCheckpoint("academic-profile:test", state, {
    now: "2026-08-31T10:00:01.000Z",
    storage,
  });

  assert.equal(written.version, RESUME_DRAFT_CHECKPOINT_VERSION);
  assert.equal(written.draft.personal.fullName, "  Learner Name  ");
  assert.equal(written.layout.template, "classic");
  assert.deepEqual(written.draft.tools, ["VS Code", "GitHub"]);
  assert.equal("generationTimestamps" in written, false);
  assert.equal("lastGeneratedAt" in written, false);

  const restored = readResumeDraftCheckpoint("academic-profile:test", { storage });
  assert.deepEqual(restored, written);
  assert.deepEqual(restored.draft.tools, ["VS Code", "GitHub"]);
  const raw = storage.getItem(getResumeDraftStorageKey("academic-profile:test"));
  assert.doesNotMatch(raw, /generationTimestamps|lastGeneratedAt/u);
});

test("creates a valid checkpoint timestamp when an editor state has none", () => {
  const checkpoint = createResumeDraftCheckpoint(builder("Learner", null), {
    now: "2026-08-31T11:30:00.000Z",
  });
  assert.equal(checkpoint.savedAt, "2026-08-31T11:30:00.000Z");
  assert.equal(checkpoint.updatedAt, checkpoint.savedAt);
});

test("keeps checkpoints isolated across academic profiles", () => {
  const storage = memoryStorage();
  writeResumeDraftCheckpoint(
    "academic-profile:first",
    builder("First", "2026-08-31T10:00:00.000Z"),
    { storage },
  );
  writeResumeDraftCheckpoint(
    "academic-profile:second",
    builder("Second", "2026-08-31T10:01:00.000Z"),
    { storage },
  );

  assert.equal(
    readResumeDraftCheckpoint("academic-profile:first", { storage }).draft.personal.fullName,
    "First",
  );
  assert.equal(
    readResumeDraftCheckpoint("academic-profile:second", { storage }).draft.personal.fullName,
    "Second",
  );
});

test("restores only a newer checkpoint and preserves server generation metadata", () => {
  const workspace = builder("Server", "2026-08-31T10:00:00.000Z", {
    generationTimestamps: ["2026-08-30T10:00:00.000Z"],
    lastGeneratedAt: "2026-08-30T10:00:00.000Z",
  });
  const checkpoint = createResumeDraftCheckpoint(
    builder("Local", "2026-08-31T10:05:00.000Z", {
      generationTimestamps: ["1999-01-01T00:00:00.000Z"],
    }),
    { now: "2026-08-31T10:05:01.000Z" },
  );
  const result = reconcileResumeDraftCheckpoint(workspace, checkpoint, {
    now: new Date("2026-08-31T12:00:00.000Z").getTime(),
  });

  assert.equal(result.restored, true);
  assert.equal(result.source, "checkpoint");
  assert.equal(result.resumeBuilder.draft.personal.fullName, "Local");
  assert.deepEqual(result.resumeBuilder.generationTimestamps, ["2026-08-30T10:00:00.000Z"]);
  assert.equal(result.resumeBuilder.lastGeneratedAt, "2026-08-30T10:00:00.000Z");
});

test("keeps an equal or newer workspace revision authoritative", () => {
  const checkpoint = createResumeDraftCheckpoint(
    builder("Local", "2026-08-31T10:00:00.000Z"),
    { now: "2026-08-31T10:00:01.000Z" },
  );
  const equal = reconcileResumeDraftCheckpoint(
    builder("Server", "2026-08-31T10:00:00.000Z"),
    checkpoint,
  );
  assert.equal(equal.restored, false);
  assert.equal(equal.resumeBuilder.draft.personal.fullName, "Server");

  const newer = reconcileResumeDraftCheckpoint(
    builder("New server", "2026-08-31T10:10:00.000Z"),
    checkpoint,
  );
  assert.equal(newer.restored, false);
  assert.equal(newer.resumeBuilder.draft.personal.fullName, "New server");
});

test("removes malformed or obsolete checkpoint payloads safely", () => {
  const profileId = "academic-profile:test";
  const key = getResumeDraftStorageKey(profileId);
  const malformedJson = memoryStorage([[key, "{broken"]]);
  assert.equal(readResumeDraftCheckpoint(profileId, { storage: malformedJson }), null);
  assert.equal(malformedJson.getItem(key), null);

  const wrongVersion = memoryStorage([[key, JSON.stringify({
    version: 999,
    updatedAt: "2026-08-31T10:00:00.000Z",
    draft: {},
    layout: {},
  })]]);
  assert.equal(readResumeDraftCheckpoint(profileId, { storage: wrongVersion }), null);
  assert.equal(wrongVersion.getItem(key), null);

  const incomplete = memoryStorage([[key, JSON.stringify({
    version: RESUME_DRAFT_CHECKPOINT_VERSION,
    updatedAt: "2026-08-31T10:00:00.000Z",
  })]]);
  assert.equal(readResumeDraftCheckpoint(profileId, { storage: incomplete }), null);
  assert.equal(incomplete.getItem(key), null);
});

test("guarded clearing never erases edits newer than an in-flight save", () => {
  const profileId = "academic-profile:test";
  const storage = memoryStorage();
  writeResumeDraftCheckpoint(
    profileId,
    builder("Newest", "2026-08-31T10:05:00.000Z"),
    { storage },
  );

  assert.equal(clearResumeDraftCheckpoint(profileId, {
    storage,
    throughUpdatedAt: "2026-08-31T10:04:59.000Z",
  }), false);
  assert.ok(readResumeDraftCheckpoint(profileId, { storage }));

  assert.equal(clearResumeDraftCheckpoint(profileId, {
    storage,
    throughUpdatedAt: "2026-08-31T10:05:00.000Z",
  }), true);
  assert.equal(readResumeDraftCheckpoint(profileId, { storage }), null);
  assert.equal(clearResumeDraftCheckpoint(profileId, { storage }), false);
});

test("storage failures and invalid profile IDs never block editing", () => {
  const brokenStorage = {
    getItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };
  const state = builder("Learner", "2026-08-31T10:00:00.000Z");
  assert.equal(writeResumeDraftCheckpoint("academic-profile:test", state, {
    storage: brokenStorage,
  }), null);
  assert.equal(readResumeDraftCheckpoint("academic-profile:test", {
    storage: brokenStorage,
  }), null);
  assert.equal(clearResumeDraftCheckpoint("academic-profile:test", {
    storage: brokenStorage,
  }), false);
  assert.equal(writeResumeDraftCheckpoint("", state, { storage: memoryStorage() }), null);
});
