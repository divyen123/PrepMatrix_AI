import { useEffect, useMemo } from 'react';
import api, { getApiAcademicProfileScope } from '../utils/apiClient';
import {
  CODE_INSIGHTS_UPDATED_EVENT, codeMatrixInsightsOutbox, createCodeMatrixAttemptTracker,
  createCodingActivityCoordinator, createCodingActivityTracker, flushCodeMatrixInsights,
} from '../utils/codeMatrixTracking.js';

const activityCoordinator = createCodingActivityCoordinator();
const sending = new Map();

function createTrackingController(academicProfileDataId) {
    let storage;
    try { storage = window.localStorage; } catch { /* Use the shared live queue. */ }
    const outbox = codeMatrixInsightsOutbox(academicProfileDataId, storage);
    let metadata = {};
    const sendQueued = () => {
      if (sending.has(academicProfileDataId)) return sending.get(academicProfileDataId);
      const promise = flushCodeMatrixInsights({
        outbox, profileId: academicProfileDataId, getScope: getApiAcademicProfileScope,
        send: (kind, payload, profileId) => api.post(`/api/code-matrix/insights/${kind}`, payload, { academicProfileId: profileId }),
        onSent: (profileId) => window.dispatchEvent(new CustomEvent(CODE_INSIGHTS_UPDATED_EVENT, { detail: { academicProfileId: profileId } })),
      }).finally(() => sending.delete(academicProfileDataId));
      sending.set(academicProfileDataId, promise);
      return promise;
    };
    const emit = (kind, payload) => { if (outbox.add(kind, payload)) void sendQueued(); };
    const attempt = createCodeMatrixAttemptTracker({ metadata: () => metadata, emit });
    const activity = createCodingActivityTracker({
      sessionId: attempt.sessionId, emit, coordinator: activityCoordinator,
      isForeground: () => document.visibilityState === 'visible' && document.hasFocus(),
    });
    return {
      configure(next) { metadata = next; activity.configure(next); },
      begin: (options) => metadata.enabled ? attempt.begin(options) : null,
      finish: attempt.finish,
      previewError: attempt.previewError,
      recordInput: attempt.recordInput,
      markActivity: () => activity.mark(),
      pauseActivity: () => activity.pause(),
      flush: () => { activity.flush(); return sendQueued(); },
    };
}

export default function useCodeMatrixTracking({ academicProfileDataId, embedded, context = 'manual', language, enabled = true }) {
  const controller = useMemo(() => createTrackingController(academicProfileDataId), [academicProfileDataId]);

  useEffect(() => {
    controller.configure({ language, surface: embedded ? 'popup' : 'page', context, enabled: Boolean(enabled && academicProfileDataId) });
  }, [controller, language, embedded, context, enabled, academicProfileDataId]);

  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState !== 'visible') controller.pauseActivity(); };
    const onStorage = () => { void controller.flush(); };
    void controller.flush();
    const timer = window.setInterval(controller.flush, 30_000);
    window.addEventListener('blur', controller.pauseActivity);
    window.addEventListener('pagehide', controller.pauseActivity);
    window.addEventListener('online', controller.flush);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      controller.pauseActivity();
      window.clearInterval(timer);
      window.removeEventListener('blur', controller.pauseActivity);
      window.removeEventListener('pagehide', controller.pauseActivity);
      window.removeEventListener('online', controller.flush);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [controller]);

  return controller;
}
