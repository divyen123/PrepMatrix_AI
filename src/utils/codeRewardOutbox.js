import { academicProfileStorageKey } from './academicProfileScope.js';

export function codeRewardOutbox(profileId, storage) {
  const scopeKey = academicProfileStorageKey(profileId, 'code-reward');
  const prefix = scopeKey ? scopeKey + ':' : '';
  const valid = (run) => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(run?.runId || '') && ['python', 'c', 'cpp', 'java', 'javascript', 'sql'].includes(run?.language);
  return {
    add(run) { if (!prefix || !valid(run)) return; try { storage?.setItem(prefix + run.runId, JSON.stringify({ runId: run.runId, language: run.language })); } catch { /* The live queue still works if storage is full. */ } },
    remove(runId) { if (!prefix) return; try { storage?.removeItem(prefix + runId); } catch { /* Retrying the same ID is harmless. */ } },
    read() {
      const rows = [];
      if (!prefix) return rows;
      try {
        for (let index = 0; index < (storage?.length || 0); index += 1) {
          const key = storage.key(index);
          if (!key?.startsWith(prefix)) continue;
          try { const run = JSON.parse(storage.getItem(key)); if (valid(run) && key === prefix + run.runId) rows.push({ runId: run.runId, language: run.language }); } catch { /* Ignore corrupt local records. */ }
        }
      } catch { /* Storage may be blocked. */ }
      return rows;
    },
  };
}
