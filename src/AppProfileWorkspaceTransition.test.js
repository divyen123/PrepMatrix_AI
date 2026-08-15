import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const settingsSource = readFileSync(
  new URL("./pages/SettingsPage.jsx", import.meta.url),
  "utf8",
);

test("serializes profile transitions and active-profile workspace imports", () => {
  const transitionStart = appSource.indexOf("const runAcademicProfileTransition");
  const importStart = appSource.indexOf("const importActiveProfileWorkspace");
  const importEnd = appSource.indexOf("const updateSubjects", importStart);
  const transitionSource = appSource.slice(transitionStart, importStart);
  const importSource = appSource.slice(importStart, importEnd);

  assert.ok(transitionStart >= 0 && importStart > transitionStart && importEnd > importStart);
  assert.match(transitionSource, /if \(workspaceMutationInFlightRef\.current\)/u);
  assert.match(transitionSource, /workspaceMutationInFlightRef\.current = true/u);
  assert.match(importSource, /\|\| workspaceMutationInFlightRef\.current/u);
  assert.match(importSource, /workspaceMutationInFlightRef\.current = true/u);

  const clearPendingSave = importSource.indexOf("window.clearTimeout(saveTimeoutRef.current)");
  const drainInFlightSave = importSource.indexOf("await workspaceSavePromiseRef.current");
  const startImport = importSource.indexOf("api.importWorkspace");
  assert.ok(clearPendingSave >= 0 && clearPendingSave < drainInFlightSave);
  assert.ok(drainInFlightSave >= 0 && drainInFlightSave < startImport);
  assert.match(importSource, /workspaceSavePromiseRef\.current = importRequest\.catch/u);
});

test("rejects stale or mismatched workspace-import responses before applying them", () => {
  const importStart = appSource.indexOf("const importActiveProfileWorkspace");
  const importEnd = appSource.indexOf("const updateSubjects", importStart);
  const importSource = appSource.slice(importStart, importEnd);

  assert.match(importSource, /const requestedEpoch = workspaceScopeEpochRef\.current/u);
  assert.match(importSource, /requestedEpoch === workspaceScopeEpochRef\.current/u);
  assert.match(importSource, /requestedAcademicProfileId === getApiAcademicProfileScope\(\)/u);
  assert.match(importSource, /if \(!scopeIsCurrent\(\)\)/u);
  assert.match(importSource, /responseContext\.dataId !== requestedAcademicProfileId/u);
  assert.match(importSource, /if \(!importAccepted && scopeIsCurrent\(\)\) setWorkspaceLoaded\(true\)/u);
  assert.ok(
    importSource.indexOf("if (!scopeIsCurrent())", importSource.indexOf("await importRequest"))
      < importSource.indexOf("applyWorkspace"),
  );
});

test("reloads the server-selected survivor before offering an incomplete deletion retry", () => {
  const transitionStart = appSource.indexOf("const runAcademicProfileTransition");
  const transitionEnd = appSource.indexOf("const createAcademicProfile", transitionStart);
  const transitionSource = appSource.slice(transitionStart, transitionEnd);

  assert.match(transitionSource, /academicProfileDeletionRetryRef\.current = \{/u);
  assert.match(
    transitionSource,
    /recoverAcademicProfileTransitionAfterFailure/u,
  );
  assert.match(transitionSource, /applyWorkspace\(recovered\?\.workspace \|\| \{\}, recoveredUser, recoveredContext\)/u);
  assert.match(transitionSource, /setWorkspaceLoaded\(false\)/u);
});

test("uses a long delete timeout and recovers authoritatively after every deletion failure", () => {
  const transitionStart = appSource.indexOf("const runAcademicProfileTransition");
  const transitionEnd = appSource.indexOf("const createAcademicProfile", transitionStart);
  const transitionSource = appSource.slice(transitionStart, transitionEnd);

  assert.match(
    transitionSource,
    /deletedProfile \? \{ timeoutMs: ACADEMIC_PROFILE_DELETE_TIMEOUT_MS \} : \{\}/u,
  );
  assert.match(
    transitionSource,
    /\} catch \(error\) \{[\s\S]*?recoverAcademicProfileTransitionAfterFailure/u,
  );
  assert.match(transitionSource, /recoveredTarget = recoveredUser\.academicProfiles\?\.find/u);
  assert.match(transitionSource, /getAcademicProfileDataId\(profile\) === deletedProfile\.dataId/u);
  assert.match(transitionSource, /recoveredTarget\?\.deletionPending/u);
  assert.match(transitionSource, /deletionState: deletedProfile/u);
  assert.match(transitionSource, /transitionState: committed/u);
  assert.match(
    transitionSource,
    /deletedDataId,\s*deletionState:[\s\S]*?profileDataId: recoveredContext\.dataId/u,
  );
  assert.match(transitionSource, /if \(deletionCompleted\) return recovered/u);
});

test("clears deleted browser state and refreshes the active workspace across tabs", () => {
  assert.match(appSource, /window\.addEventListener\("storage", handleAcademicProfileStorageEvent\)/u);
  assert.match(appSource, /isValidAcademicProfileDataId\(deletedDataId\)/u);
  assert.match(appSource, /isValidAcademicProfileDataId\(eventProfileDataId\)/u);
  assert.match(appSource, /clearAcademicProfileBrowserData\(deletedDataId\)/u);
  assert.match(appSource, /clearOwnedLegacyAcademicProfileBrowserData\(/u);
  assert.match(appSource, /clearPendingAcademicProfileActions\(deletedDataId\)/u);
  assert.match(appSource, /workspaceScopeEpochRef\.current \+= 1/u);
  assert.match(appSource, /await api\.me\(\{ academicProfileId: null \}\)/u);
  assert.match(appSource, /applyWorkspaceRef\.current\?\.\(/u);
});

test("drops a remembered deletion retry after authoritative recovery confirms the slot is gone", () => {
  const recoveryStart = appSource.indexOf("const recoverAuthoritativeWorkspace");
  const listenerStart = appSource.indexOf("const handleAcademicProfileStorageEvent", recoveryStart);
  const recoverySource = appSource.slice(recoveryStart, listenerStart);

  assert.match(recoverySource, /const rememberedDeletion = academicProfileDeletionRetryRef\.current/u);
  assert.match(recoverySource, /!recoveredUser\.academicProfiles\?\.some/u);
  assert.match(recoverySource, /profile\?\.id === rememberedDeletion\.id/u);
  assert.match(recoverySource, /getAcademicProfileDataId\(profile\) === rememberedDeletion\.dataId/u);
  assert.match(recoverySource, /academicProfileDeletionRetryRef\.current = null/u);
});

test("keeps autosave and settings reset behind the shared workspace mutation boundary", () => {
  assert.match(
    appSource,
    /!workspaceLoaded\s*\|\| workspaceTransitioning\s*\|\| workspaceMutationInFlightRef\.current/u,
  );
  assert.match(
    settingsSource,
    /const handleResetWorkspace = async \(\) => \{[\s\S]*?await onImportActiveProfileWorkspace\(resetWorkspace\)/u,
  );
});

test("pins Settings deletion retries and open dialogs to an immutable profile incarnation", () => {
  assert.match(settingsSource, /deleteProfileSelectionDataId/u);
  assert.match(
    settingsSource,
    /profile\.id === academicProfileDeletionRetryTarget\?\.id[\s\S]*?getAcademicProfileDataId\(profile\)[\s\S]*?getAcademicProfileDataId\(academicProfileDeletionRetryTarget\)/u,
  );
  assert.match(
    settingsSource,
    /profile\.id === deleteProfileSelection[\s\S]*?getAcademicProfileDataId\(profile\) === deleteProfileSelectionDataId/u,
  );
  assert.match(settingsSource, /That profile changed in another tab/u);
});
