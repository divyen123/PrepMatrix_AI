import { useCallback, useEffect, useMemo, useState } from 'react';
import api, { getApiAcademicProfileScope } from '../utils/apiClient';

export default function useCodeMatrixInsights(academicProfileDataId, range) {
  const timeZone = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
    catch { return 'UTC'; }
  }, []);
  const requestKey = `${academicProfileDataId}:${range}:${timeZone}`;
  const [state, setState] = useState({ key: '', data: null, loading: true, error: '' });
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let current = true;
    setState((previous) => ({ key: requestKey, data: previous.key === requestKey ? previous.data : null, loading: true, error: '' }));
    const query = new URLSearchParams({ range, timezone: timeZone });
    api.get(`/api/code-matrix/insights?${query}`, { academicProfileId: academicProfileDataId })
      .then((payload) => {
        if (!current || academicProfileDataId !== getApiAcademicProfileScope()) return;
        if (!payload?.insights) throw new Error('Missing insights');
        setState({ key: requestKey, data: payload.insights, loading: false, error: '' });
      })
      .catch(() => {
        if (!current) return;
        setState((previous) => ({ ...previous, loading: false, error: 'Your coding insights could not be refreshed. Please try again.' }));
      });
    return () => { current = false; };
  }, [academicProfileDataId, range, timeZone, requestKey, revision]);

  useEffect(() => {
    let timer;
    const scheduleRefresh = () => {
      window.clearTimeout(timer);
      // A queued offline session can replay many events. Refresh after the
      // burst settles so the read endpoint stays within its request limit.
      timer = window.setTimeout(reload, 1500);
    };
    const onUpdate = (event) => {
      if (event.detail?.academicProfileId === academicProfileDataId) scheduleRefresh();
    };
    window.addEventListener('prepmatrix:code-insights-updated', onUpdate);
    window.addEventListener('prepmatrix:momentum-updated', onUpdate);
    window.addEventListener('online', scheduleRefresh);
    window.addEventListener('focus', scheduleRefresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('prepmatrix:code-insights-updated', onUpdate);
      window.removeEventListener('prepmatrix:momentum-updated', onUpdate);
      window.removeEventListener('online', scheduleRefresh);
      window.removeEventListener('focus', scheduleRefresh);
    };
  }, [academicProfileDataId, reload]);

  return state.key === requestKey ? { ...state, reload } : { data: null, loading: true, error: '', reload };
}
