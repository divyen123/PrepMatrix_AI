import { useCallback, useEffect, useRef, useState } from "react";
import api from "../utils/apiClient";
import { normalizeCodeMatrixWorkspace, readCodeMatrixDraft, reconcileCodeMatrixDraft, writeCodeMatrixDraft } from "../utils/codeMatrixWorkspace.js";

// Serialise saves across route unmount/remount for each academic profile.
const saveChains = new Map();
function queueSave(profileId, workspace) {
  const previous = saveChains.get(profileId) || Promise.resolve();
  const request = previous.catch(() => {}).then(() => api.put("/api/code-matrix/workspace", workspace, { academicProfileId: profileId }));
  saveChains.set(profileId, request);
  void request.finally(() => { if (saveChains.get(profileId) === request) saveChains.delete(profileId); }).catch(() => {});
  return request;
}

export default function useCodeMatrixWorkspace(profileId, defaultLanguage) {
  const [workspace, setWorkspace] = useState(() => readCodeMatrixDraft(profileId) || normalizeCodeMatrixWorkspace({}, defaultLanguage));
  const [ready, setReady] = useState(false);
  const [syncState, setSyncState] = useState("loading");
  const [setup, setSetup] = useState(null);
  const latestRef = useRef(workspace);
  const timerRef = useRef(null);
  const dirtyRef = useRef(false);
  const mountedRef = useRef(false);
  const localStoredRef = useRef(Boolean(readCodeMatrixDraft(profileId)));
  const loadRef = useRef(null);
  const loadFailedRef = useRef(false);

  const flush = useCallback(async () => {
    clearTimeout(timerRef.current);
    if (!dirtyRef.current || !profileId) return;
    const snapshot = latestRef.current;
    dirtyRef.current = false;
    if (mountedRef.current) setSyncState("saving");
    try {
      await queueSave(profileId, snapshot);
      if (mountedRef.current && latestRef.current === snapshot) setSyncState("saved");
    } catch {
      if (latestRef.current === snapshot) dirtyRef.current = true;
      if (mountedRef.current) setSyncState(localStoredRef.current ? "local" : "unsaved");
    }
  }, [profileId]);

  useEffect(() => {
    let active = true;
    mountedRef.current = true;
    async function load() {
      try {
        await saveChains.get(profileId)?.catch(() => {});
        const payload = await api.get("/api/code-matrix/workspace", { academicProfileId: profileId });
        if (!active) return;
        const local = readCodeMatrixDraft(profileId);
        const next = reconcileCodeMatrixDraft(payload.workspace, local, defaultLanguage);
        latestRef.current = next;
        setWorkspace(next);
        setSetup(payload.setup || null);
        loadFailedRef.current = false;
        localStoredRef.current = writeCodeMatrixDraft(profileId, next);
        setSyncState("saved");
        // A local checkpoint survives a lost connection or a fast navigation.
        if (local && Date.parse(local.updatedAt) > (Date.parse(payload.workspace?.updatedAt) || 0)) {
          dirtyRef.current = true;
          void flush();
        }
      } catch {
        loadFailedRef.current = true;
        if (active) setSyncState(localStoredRef.current ? "local" : "unsaved");
      } finally {
        if (active) setReady(true);
      }
    }
    loadRef.current = load;
    void load();
    const onOnline = () => { void (loadFailedRef.current ? load() : flush()); };
    const onPageHide = () => { writeCodeMatrixDraft(profileId, latestRef.current); void flush(); };
    window.addEventListener("online", onOnline);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      active = false;
      mountedRef.current = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pagehide", onPageHide);
      void flush();
    };
  }, [defaultLanguage, flush, profileId]);

  const update = useCallback((change) => {
    const next = normalizeCodeMatrixWorkspace({
      ...latestRef.current,
      ...(typeof change === "function" ? change(latestRef.current) : change),
      updatedAt: new Date().toISOString(),
    });
    latestRef.current = next;
    setWorkspace(next);
    dirtyRef.current = true;
    const stored = writeCodeMatrixDraft(profileId, next);
    localStoredRef.current = stored;
    setSyncState(stored ? "pending" : "unsaved");
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void flush(); }, 1200);
  }, [flush, profileId]);

  const retry = useCallback(() => loadFailedRef.current ? loadRef.current?.() : flush(), [flush]);
  return { workspace, update, ready, syncState, setup, flush, retry };
}
