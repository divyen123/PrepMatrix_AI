import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./index.js", import.meta.url), "utf8");

test("chat history projects pinned state and sorts pinned conversations first", () => {
  const start = source.indexOf('app.get("/api/chat-sessions"');
  const end = source.indexOf('app.get("/api/chat-sessions/:id"', start);
  const listRoute = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(listRoute, /\.project\(\{[^}]*pinned: 1[^}]*\}\)/u);
  assert.match(listRoute, /\.sort\(\{ pinned: -1, updatedAt: -1, _id: -1 \}\)/u);
  assert.match(
    source,
    /collection\("chatSessions"\)\.createIndex\(\{ userId: 1, academicProfileId: 1, pinned: -1, updatedAt: -1 \}\)/u,
  );
});

test("pinning is profile scoped, supports unpinning, and does not change chat updatedAt", () => {
  const start = source.indexOf('app.patch("/api/chat-sessions/:id/pin"');
  const end = source.indexOf('app.delete("/api/chat-sessions"', start);
  const pinRoute = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(pinRoute, /typeof pinned !== "boolean"/u);
  assert.match(pinRoute, /assertAcademicProfileWritable\(db, req\)/u);
  assert.match(pinRoute, /academicProfileFilter\(req, \{ _id: new ObjectId\(req\.params\.id\) \}\)/u);
  assert.match(pinRoute, /\{ \$set: \{ pinned: true \} \}/u);
  assert.match(pinRoute, /\{ \$unset: \{ pinned: "" \} \}/u);
  assert.equal(pinRoute.includes("updatedAt"), false);
});
