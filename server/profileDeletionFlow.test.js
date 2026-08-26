import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./index.js", import.meta.url), "utf8");

test("profile deletion marks pending, purges exact data, verifies, then finalizes", () => {
  const start = source.indexOf("async function deleteAcademicProfileData");
  const end = source.indexOf("async function requireYoungKidsScheduleAccess", start);
  const flow = source.slice(start, end);
  const contextAt = flow.indexOf("academicProfileId: requestedDataId");
  const beginAt = flow.indexOf("beginAcademicProfileDeletion(");
  const pendingWriteAt = flow.indexOf("const pendingUpdate = await");
  const purgeAt = flow.indexOf("await purgeAcademicProfileData(");
  const finalizeAt = flow.indexOf("finalizeAcademicProfileDeletionState(");
  const finalWriteAt = flow.indexOf("const finalizedUpdate = await");

  assert.ok(start >= 0 && end > start);
  assert.ok(contextAt >= 0 && contextAt < beginAt);
  assert.ok(beginAt >= 0 && beginAt < pendingWriteAt);
  assert.ok(pendingWriteAt < purgeAt);
  assert.ok(purgeAt < finalizeAt);
  assert.ok(finalizeAt < finalWriteAt);
  assert.match(flow, /deleteAcademicProfileDataId/);
});

test("whole-account deletion removes profile housekeeping and the global battle reward ledger", () => {
  const start = source.indexOf('app.delete("/api/auth/account"');
  const end = source.indexOf('app.get("/api/auth/me"', start);
  const flow = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(flow, /KIDS_PROFILE_SETTINGS_COLLECTION/);
  assert.match(flow, /ACADEMIC_PROFILE_DELETION_TOMBSTONES_COLLECTION/);
  assert.match(flow, /collection\("quizBattleRewardLedger"\)\.deleteMany\(\{ userId \}\)/);
});

test("incomplete profile deletion remains retryable and successful responses load remaining workspace context", () => {
  assert.match(source, /error instanceof AcademicProfileDataPurgeError[\s\S]*?Retry-After[\s\S]*?res\.status\(error\.status\)/);
  assert.match(source, /user: sanitizeUser\(deleted\.user\)[\s\S]*?workspace: normalizeWorkspace\(deleted\.workspace, deleted\.user\)[\s\S]*?profileContext: deleted\.profileContext/);
  assert.match(source, /completedRetry[\s\S]*?ensureActiveProfileWorkspace\(db, updatedUser\)/);
});

test("a completed deletion retry cannot recreate profile rows after whole-account deletion starts", () => {
  const flowStart = source.indexOf("async function deleteAcademicProfileData");
  const retryStart = source.indexOf("if (completedRetry)", flowStart);
  const retryEnd = source.indexOf("let finalLock", retryStart);
  const retryFlow = source.slice(retryStart, retryEnd);
  const lockAt = retryFlow.indexOf("acquireAcademicProfileLockOrThrow(db, currentUser._id)");
  const reloadAt = retryFlow.indexOf('db.collection("users").findOne({');
  const nonDeletingAt = retryFlow.indexOf("deletingAt: { $exists: false }", reloadAt);
  const ensureAt = retryFlow.indexOf("ensureActiveProfileWorkspace(db, updatedUser)");
  const releaseAt = retryFlow.indexOf("retryFinalLock.release()", ensureAt);

  assert.ok(flowStart >= 0 && retryStart > flowStart && retryEnd > retryStart);
  assert.ok(lockAt >= 0 && lockAt < reloadAt);
  assert.ok(reloadAt < nonDeletingAt && nonDeletingAt < ensureAt);
  assert.ok(ensureAt < releaseAt);
  assert.match(retryFlow, /ACCOUNT_DELETION_IN_PROGRESS/);
});

test("legacy data is backfilled on login and authenticated-session loading", () => {
  const calls = source.match(/backfillLegacyAcademicProfileData\(db, storedUser/g) || [];
  assert.equal(calls.length, 2);
  assert.match(source, /await migrateProfileScopedUniqueIndexes\(db\);/);
});

test("profile rename forwards its complete contract without reloading the active workspace", () => {
  const start = source.indexOf('app.put("/api/auth/profile"');
  const end = source.indexOf('app.put("/api/workspace"', start);
  const flow = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(
    flow,
    /const hasRenameAction = Object\.prototype\.hasOwnProperty\.call\(requestedProfile, "renameAcademicProfileId"\)[\s\S]*?Object\.prototype\.hasOwnProperty\.call\(requestedProfile, "academicProfileDisplayName"\)/u,
  );
  assert.match(
    flow,
    /const hasAcademicProfileMutation = hasAcademicMutation \|\| hasRenameAction/u,
  );
  assert.match(flow, /if \(hasAcademicProfileMutation\) \{/u);
  assert.match(
    flow,
    /renameAcademicProfileId: hasRenameAction[\s\S]*?requestedProfile\.renameAcademicProfileId[\s\S]*?renameAcademicProfileDataId: requestedProfile\.renameAcademicProfileDataId[\s\S]*?academicProfileDisplayName: requestedProfile\.academicProfileDisplayName/u,
  );
  assert.match(
    flow,
    /update\.academicProfiles = academicTransition\.academicProfiles;[\s\S]*?update\.activeAcademicProfileId = academicTransition\.activeAcademicProfileId;/u,
  );

  const workspaceDecision = flow.match(
    /const activeProfileData = ([\s\S]*?);\s*\n\s*if \(password\)/u,
  );
  assert.ok(workspaceDecision, "profile update route should have one workspace-loading decision");
  assert.match(
    workspaceDecision[1],
    /hasAcademicMutation[\s\S]*?ensureActiveProfileWorkspace\(db, updatedUser\)[\s\S]*?: null/u,
  );
  assert.doesNotMatch(workspaceDecision[1], /hasAcademicProfileMutation/u);
});

test("inline quiz and chat AI replay calls carry active profile identity", () => {
  const calls = [...source.matchAll(/aiQuota\.(?:lookup|reserve)\(\{([\s\S]*?)\n\s*\}\);/g)]
    .map((match) => match[1])
    .filter((body) => /feature: "(?:quiz|chat)"/.test(body));
  assert.equal(calls.length, 4);
  for (const body of calls) assert.match(body, /academicProfileId: req\.academicProfileId/);
});

test("inline quiz and chat fence the final persistence boundary against profile deletion", () => {
  const quizStart = source.indexOf('app.post("/api/quizzes/generate"');
  const quizEnd = source.indexOf('app.post("/api/quizzes"', quizStart + 1);
  const quizFlow = source.slice(quizStart, quizEnd);
  const quizFence = quizFlow.lastIndexOf("withAcademicProfileWriteFence(db, req");
  const quizCommit = quizFlow.lastIndexOf("aiQuota.commit({");
  assert.ok(quizStart >= 0 && quizEnd > quizStart);
  assert.ok(quizFence >= 0 && quizFence < quizCommit);

  const chatStart = source.indexOf('app.post("/api/study-assistant/chat"');
  const chatEnd = source.indexOf('app.get("/{*splat}"', chatStart);
  const chatFlow = source.slice(chatStart, chatEnd);
  const chatFence = chatFlow.lastIndexOf("withAcademicProfileWriteFence(db, req");
  const chatPersistence = chatFlow.indexOf("const insertResult = await chatSessions.insertOne", chatFence);
  const chatCommit = chatFlow.lastIndexOf("await aiQuota.commit(");
  assert.ok(chatStart >= 0 && chatEnd > chatStart);
  assert.ok(chatFence >= 0 && chatFence < chatPersistence);
  assert.ok(chatPersistence < chatCommit);
});
