import { createElement, useCallback, useEffect, useMemo } from 'react';
import { toast } from '../utils/toast';
import { Code2 } from 'lucide-react';
import api, { getApiAcademicProfileScope } from '../utils/apiClient';
import { codeRewardOutbox, normalizeCodeRewardRecord } from '../utils/codeRewardOutbox';

export default function useCodeRunRewards(academicProfileDataId) {
  const queue = useMemo(() => {
    let storage;
    try { storage = window.localStorage; } catch { /* Use the live queue. */ }
    const outbox = codeRewardOutbox(academicProfileDataId, storage);
    return { outbox, pending: outbox.read(), sending: false, alive: false };
  }, [academicProfileDataId]);
  const flush = useCallback(async () => {
    if (queue.sending || !queue.alive || !queue.pending.length || academicProfileDataId !== getApiAcademicProfileScope()) return;
    queue.sending = true;
    try {
      while (queue.alive && queue.pending.length && academicProfileDataId === getApiAcademicProfileScope()) {
        const run = queue.pending[0];
        let response;
        try { response = await api.post('/api/momentum/code-runs', run, { academicProfileId: academicProfileDataId }); }
        catch (error) {
          if (error.status === 400) { queue.pending.shift(); queue.outbox.remove(run.runId); continue; }
          break; // Keep the same ID until the server confirms the reward.
        }
        queue.pending.shift();
        queue.outbox.remove(run.runId);
        window.dispatchEvent(new CustomEvent('prepmatrix:momentum-updated', { detail: { academicProfileId: academicProfileDataId } }));
        window.dispatchEvent(new CustomEvent('prepmatrix:code-reward-recorded', { detail: {
          academicProfileId: academicProfileDataId, runId: run.runId,
          questionId: response.questionId, version: response.version,
          awardedXp: response.awardedXp, duplicate: response.duplicate,
        } }));
        if (queue.alive && response.awardedXp > 0 && !response.duplicate && academicProfileDataId === getApiAcademicProfileScope()) {
          toast.success(createElement('div', { className: 'cmx-xp-notification' },
            createElement('div', null, createElement('strong', null, `+${response.awardedXp} XP`),
              createElement('span', null, response.source === 'practice' ? response.title : 'Four successful runs')),
            createElement('div', { className: 'cmx-xp-notification-bar' }, createElement('i'))),
          { toastId: `code-xp-${run.runId}`, position: 'bottom-right', autoClose: 4000, pauseOnHover: false, pauseOnFocusLoss: false, hideProgressBar: true, icon: createElement(Code2, { size: 20 }) });
        }
      }
    } finally { queue.sending = false; }
  }, [academicProfileDataId, queue]);
  useEffect(() => {
    queue.alive = true;
    void flush();
    window.addEventListener('online', flush);
    const retryTimer = window.setInterval(flush, 30000);
    return () => { queue.alive = false; window.removeEventListener('online', flush); window.clearInterval(retryTimer); };
  }, [flush, queue]);
  return useCallback((runId, language, practice) => {
    const run = normalizeCodeRewardRecord({ runId, language, ...(practice === undefined ? {} : { practice }) });
    if (!run || queue.pending.some((item) => item.runId === run.runId)) return;
    queue.outbox.add(run);
    queue.pending.push(run);
    void flush();
  }, [flush, queue]);
}
