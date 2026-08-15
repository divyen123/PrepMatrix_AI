import assert from "node:assert/strict";
import test from "node:test";
import {
  ACADEMIC_PROFILE_LOCKS_COLLECTION,
  acquireAcademicProfileMutationLock,
} from "./academicProfileRestore.js";

test("serializes academic mutations with an owner-fenced per-user lock", async () => {
  const calls = [];
  const collection = {
    async updateOne(filter, update, options) {
      calls.push({ filter, update, options });
      return { upsertedCount: 1, modifiedCount: 0 };
    },
    async deleteOne(filter) {
      calls.push({ deleteFilter: filter });
      return { deletedCount: 1 };
    },
  };
  const db = {
    collection(name) {
      assert.equal(name, ACADEMIC_PROFILE_LOCKS_COLLECTION);
      return collection;
    },
  };

  const lock = await acquireAcademicProfileMutationLock(db, "user-1", {
    now: new Date("2026-08-14T10:00:00.000Z"),
    ttlMs: 15_000,
  });
  assert.ok(lock?.ownerToken);
  assert.equal(calls[0].options.upsert, true);
  assert.equal(calls[0].update.$set.expiresAt.toISOString(), "2026-08-14T10:00:15.000Z");
  await lock.release();
  await lock.release();
  assert.equal(calls.filter((call) => call.deleteFilter).length, 1);
  assert.equal(calls[1].deleteFilter.ownerToken, lock.ownerToken);
});

test("reports a busy academic profile instead of bypassing an active lock", async () => {
  const db = {
    collection() {
      return {
        async updateOne() {
          const error = new Error("duplicate lock");
          error.code = 11000;
          throw error;
        },
      };
    },
  };
  assert.equal(await acquireAcademicProfileMutationLock(db, "user-1"), null);
});
