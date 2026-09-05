const documentLockStates = new WeakMap();

export const DOCUMENT_SCROLL_LOCK_CLASS = "prepmatrix-scroll-locked";

function getLockTargets(targetDocument) {
  if (!targetDocument?.body || !targetDocument?.documentElement) return null;
  return [targetDocument.documentElement, targetDocument.body];
}

export function acquireDocumentScrollLock(targetDocument = globalThis.document) {
  const targets = getLockTargets(targetDocument);
  if (!targets) return () => {};

  let state = documentLockStates.get(targetDocument);
  if (!state) {
    state = { count: 0 };
    documentLockStates.set(targetDocument, state);
  }

  state.count += 1;
  if (state.count === 1) {
    targets.forEach((target) => target.classList.add(DOCUMENT_SCROLL_LOCK_CLASS));
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.count = Math.max(0, state.count - 1);

    if (state.count === 0) {
      targets.forEach((target) => target.classList.remove(DOCUMENT_SCROLL_LOCK_CLASS));
      documentLockStates.delete(targetDocument);
    }
  };
}
