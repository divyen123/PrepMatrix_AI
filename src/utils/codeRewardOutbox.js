import { academicProfileStorageKey } from './academicProfileScope.js';

export function normalizeCodeRewardRecord(run) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(run?.runId || '')
    || !['python', 'c', 'cpp', 'java', 'javascript', 'sql'].includes(run?.language)) return null;
  const record = { runId: run.runId, language: run.language };
  if (run.practice !== undefined) {
    const practice = run.practice;
    if (!practice || typeof practice.questionId !== 'string' || !/^[a-z0-9-]{1,80}$/u.test(practice.questionId)
      || !Number.isSafeInteger(practice.version) || practice.version < 1
      || !Array.isArray(practice.results) || !practice.results.length || practice.results.length > 20) return null;
    const results = [];
    const ids = new Set();
    for (const result of practice.results) {
      if (!result || typeof result.id !== 'string' || !result.id || result.id.length > 80 || ids.has(result.id)
        || result.status !== 'success' || typeof result.stdout !== 'string' || result.stdout.length > 8192) return null;
      ids.add(result.id);
      results.push({ id: result.id, status: result.status, stdout: result.stdout });
    }
    record.practice = { questionId: practice.questionId, version: practice.version, results };
  }
  return record;
}

export function codeRewardOutbox(profileId, storage) {
  const scopeKey = academicProfileStorageKey(profileId, 'code-reward');
  const prefix = scopeKey ? scopeKey + ':' : '';
  return {
    add(run) { const record = normalizeCodeRewardRecord(run); if (!prefix || !record) return; try { storage?.setItem(prefix + record.runId, JSON.stringify(record)); } catch { /* The live queue still works if storage is full. */ } },
    remove(runId) { if (!prefix) return; try { storage?.removeItem(prefix + runId); } catch { /* Retrying the same ID is harmless. */ } },
    read() {
      const rows = [];
      if (!prefix) return rows;
      try {
        for (let index = 0; index < (storage?.length || 0); index += 1) {
          const key = storage.key(index);
          if (!key?.startsWith(prefix)) continue;
          try { const run = normalizeCodeRewardRecord(JSON.parse(storage.getItem(key))); if (run && key === prefix + run.runId) rows.push(run); } catch { /* Ignore corrupt local records. */ }
        }
      } catch { /* Storage may be blocked. */ }
      return rows;
    },
  };
}
