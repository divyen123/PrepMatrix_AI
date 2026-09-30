import { academicProfileStorageKey } from './academicProfileScope.js';

const claimedThisSession = new Set();

export function claimPlannerScheduleSuggestion(storage, profileId, schedule, completion) {
  if (!profileId || !completion?.complete || !completion.key) return false;

  const storageKey = academicProfileStorageKey(profileId, 'planner-next-schedule-suggestion');
  const scheduleKey = JSON.stringify([schedule?.[0]?.momentumToken || '', completion.key]);
  const claimKey = `${storageKey}:${scheduleKey}`;
  if (claimedThisSession.has(claimKey)) return false;
  try {
    if (storage.getItem(storageKey) === scheduleKey) return false;
    storage.setItem(storageKey, scheduleKey);
  } catch {
    // Keep the one-time behavior for this session when browser storage is unavailable.
  }
  claimedThisSession.add(claimKey);
  return true;
}
