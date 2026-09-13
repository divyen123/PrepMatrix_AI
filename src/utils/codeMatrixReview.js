export const CODE_REVIEW_FEATURE = 'code_review';
export const CODE_REVIEW_LANGUAGES = ['python', 'javascript', 'java', 'c', 'cpp', 'sql'];
export const CODE_REVIEW_LIMITS = Object.freeze({ code: 50 * 1024, error: 8000, request: 180 * 1024 });

// These are environment failures, not exercises for the student to debug.
const RUNTIME_FAILURE = /failed to fetch|networkerror|network request failed|load failed|could not load|failed to load|loading or compilation exceeded|no terminal input was received|runtime worker failed|runtime message could not be decoded|browser blocked|isolated (?:browser )?(?:runtime|worker)|importscripts|dynamically imported module|runtime limit|webassembly\.compile|out of memory while loading|requires? (?:webassembly|JSPI)|not supported in this browser/i;

export function normalizeCodeReviewError(stderr) {
  // A worker gets a fresh blob URL each run. It must not change the identity of
  // an otherwise identical error; keep the source locations and error itself.
  return stderr.replace(/\r\n/g, '\n').replace(
    /\bblob:(?:null|https?:\/\/[^\s/]+)\/[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}/gi,
    'blob:browser-runtime',
  ).trim();
}

export function isCodeReviewable(result) {
  return Boolean(result && CODE_REVIEW_LANGUAGES.includes(result.language)
    && ['error', 'timeout'].includes(result.status) && result.code?.trim()
    && result.stderr?.trim() && result.errorOrigin !== 'environment'
    && !RUNTIME_FAILURE.test(result.stderr));
}

export function codeReviewSnapshot(result) {
  if (!isCodeReviewable(result)) return null;
  return {
    language: result.language,
    code: result.code,
    status: result.status,
    stderr: normalizeCodeReviewError(result.stderr).slice(-CODE_REVIEW_LIMITS.error),
    ...(result.files ? { files: { html: result.files.html, css: result.files.css } } : {}),
  };
}

export function codeReviewMatchesDraft(snapshot, drafts) {
  return Boolean(snapshot && drafts?.[snapshot.language] === snapshot.code
    && (!snapshot.files || (snapshot.files.html === drafts.html && snapshot.files.css === drafts.css)));
}

// One page session: changing runs never loses a pending request or charges again
// for reopening an identical review. Only the mounted card displays its result.
export function createCodeReviewSession(send, makeId = () => crypto.randomUUID()) {
  const entries = new Map();
  const keyFor = (snapshot) => JSON.stringify(snapshot);
  return {
    peek(snapshot) { return entries.get(keyFor(snapshot))?.review || null; },
    request(snapshot) {
      const key = keyFor(snapshot);
      let entry = entries.get(key);
      if (entry?.review) return Promise.resolve(entry.review);
      if (entry?.promise) return entry.promise;
      if (!entry) { entry = { requestId: makeId() }; entries.set(key, entry); }
      entry.promise = Promise.resolve().then(() => send(snapshot, entry.requestId)).then((payload) => {
        entry.review = payload.review;
        return entry.review;
      }).finally(() => { entry.promise = null; });
      // Retain active requests, but bound old in-memory code snapshots.
      for (const [oldKey, old] of entries) {
        if (entries.size <= 12) break;
        if (oldKey !== key && !old.promise) entries.delete(oldKey);
      }
      return entry.promise;
    },
  };
}
