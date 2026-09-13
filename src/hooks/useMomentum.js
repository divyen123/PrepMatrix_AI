import { useCallback, useEffect, useState } from 'react';
import api from '../utils/apiClient';

export default function useMomentum(academicProfileDataId, refreshKey = '') {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    setState((current) => ({ data: current.profileId === academicProfileDataId ? current.data : null, profileId: academicProfileDataId, loading: true, error: '' }));
    api.get('/api/momentum', { academicProfileId: academicProfileDataId }).then((payload) => {
      if (active) setState({ data: payload.momentum, profileId: academicProfileDataId, loading: false, error: '' });
    }).catch(() => { if (active) setState((current) => ({ ...current, loading: false, error: 'XP history could not be refreshed.' })); });
    return () => { active = false; };
  }, [academicProfileDataId, refreshKey, revision]);
  useEffect(() => {
    const onUpdate = (event) => { if (event.detail?.academicProfileId === academicProfileDataId) reload(); };
    window.addEventListener('focus', reload);
    window.addEventListener('prepmatrix:momentum-updated', onUpdate);
    return () => { window.removeEventListener('focus', reload); window.removeEventListener('prepmatrix:momentum-updated', onUpdate); };
  }, [academicProfileDataId, reload]);
  return { ...state, reload };
}
