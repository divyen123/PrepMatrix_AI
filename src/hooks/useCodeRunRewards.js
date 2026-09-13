import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { Code2 } from 'lucide-react';
import { createElement } from 'react';
import api, { getApiAcademicProfileScope } from '../utils/apiClient';
import { codeRewardOutbox } from '../utils/codeRewardOutbox';

export default function useCodeRunRewards(academicProfileDataId) {
  const pending = useRef([]);
  const sending = useRef(false);
  const alive = useRef(true);
  const outbox = useRef(null);
  if (!outbox.current) {
    let storage;
    try { storage = window.localStorage; } catch { /* Use the live queue. */ }
    outbox.current = codeRewardOutbox(academicProfileDataId, storage);
    pending.current = outbox.current.read();
  }
  const flush = useCallback(async () => {
    if (sending.current || !alive.current || !pending.current.length || academicProfileDataId !== getApiAcademicProfileScope()) return;
    sending.current = true;
    try {
      while (alive.current && pending.current.length && academicProfileDataId === getApiAcademicProfileScope()) {
        const run = pending.current[0];
        let response;
        try { response = await api.post('/api/momentum/code-runs', run, { academicProfileId: academicProfileDataId }); }
        catch (error) {
          if (error.status === 400) { pending.current.shift(); outbox.current.remove(run.runId); continue; }
          break; // Retain the same ID for a connection or periodic retry.
        }
        pending.current.shift();
        outbox.current.remove(run.runId);
        window.dispatchEvent(new CustomEvent('prepmatrix:momentum-updated', { detail: { academicProfileId: academicProfileDataId } }));
        if (alive.current && response.awardedXp > 0 && academicProfileDataId === getApiAcademicProfileScope()) {
          toast.success(createElement('div', { className: 'cmx-xp-notification' },
            createElement('div', null, createElement('strong', null, `+${response.awardedXp} XP`), createElement('span', null, 'Four successful runs · Global momentum')),
            createElement('div', { className: 'cmx-xp-notification-bar' }, createElement('i'))),
          { toastId: `code-xp-${run.runId}`, autoClose: 4000, pauseOnHover: false, pauseOnFocusLoss: false, hideProgressBar: true, icon: createElement(Code2, { size: 20 }) });
        }
      }
    } finally { sending.current = false; }
  }, [academicProfileDataId]);
  useEffect(() => {
    alive.current = true;
    void flush();
    window.addEventListener('online', flush);
    const retryTimer = window.setInterval(flush, 30000);
    return () => { alive.current = false; window.removeEventListener('online', flush); window.clearInterval(retryTimer); };
  }, [flush]);
  return useCallback((runId, language) => { const run = { runId, language }; outbox.current.add(run); pending.current.push(run); void flush(); }, [flush]);
}
