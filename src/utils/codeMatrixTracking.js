import { academicProfileStorageKey, onAcademicProfileBrowserDataCleared } from './academicProfileScope.js';
import { isCodeMatrixEnvironmentFailure } from './codeMatrixReview.js';

export const CODE_INSIGHTS_UPDATED_EVENT = 'prepmatrix:code-insights-updated';
const LANGUAGES = new Set(['python', 'c', 'cpp', 'java', 'javascript', 'sql', 'web']);
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
const attempts = new WeakMap();
const memoryQueues = new Map();

onAcademicProfileBrowserDataCleared((profileId) => {
  const key = academicProfileStorageKey(profileId, 'code-insights');
  const queue = memoryQueues.get(key);
  if (queue) { queue.entries.clear(); queue.retired = true; }
  memoryQueues.delete(key);
});

export function trackingLanguage(language) {
  return ['html', 'css', 'web'].includes(language) ? 'web' : LANGUAGES.has(language) ? language : null;
}

function contextMetadata({ language, surface, context } = {}) {
  return {
    language: trackingLanguage(language),
    surface: surface === 'popup' ? 'popup' : 'page',
    context: ['chat', 'placement'].includes(context) ? context : 'manual',
  };
}

export function classifyCodeMatrixOutcome(outcome = {}, web = false) {
  const error = String(outcome.stderr || outcome.message || '');
  const originalStatus = outcome.status;
  if (originalStatus === 'stopped') return { status: 'stopped', errorCategory: 'none' };
  if (originalStatus === 'environment' || isCodeMatrixEnvironmentFailure(outcome)) return { status: 'environment', errorCategory: 'none' };
  if (web && ['preview', 'success'].includes(originalStatus)) return { status: 'preview', errorCategory: 'none' };
  if (originalStatus === 'success') return { status: 'success', errorCategory: 'none' };
  if (!['error', 'timeout', 'preview_error'].includes(originalStatus)) return null;
  const status = web ? 'preview_error' : originalStatus;
  const errorCategory = originalStatus === 'timeout' ? 'timeout'
    : /syntaxerror|syntax error|indentationerror|unexpected (?:token|indent|end)|expected ['";:)]|parse error|unterminated/i.test(error) ? 'syntax'
      : /typeerror|type error|incompatible types|cannot convert|invalid conversion|unsupported operand/i.test(error) ? 'type'
        : /referenceerror|nameerror|not defined|undefined (?:variable|reference)|cannot find symbol|undeclared|no such (?:table|column)/i.test(error) ? 'reference'
          : /zerodivision|division by zero|indexerror|keyerror|valueerror|nullpointer|outofbounds|segmentation fault|stack overflow|rangeerror|runtimeerror|runtime error/i.test(error) ? 'runtime' : 'other';
  return { status, errorCategory };
}

async function fingerprint(value) {
  // Source and input are transient; only the digest enters the outbox or API.
  const bytes = new TextEncoder().encode(value);
  const result = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sourceSnapshot(language, code, files) {
  const normalize = (value) => String(value || '').replace(/\r\n/g, '\n');
  if (language === 'web') {
    const values = ['html', 'css', 'javascript'].map((key) => normalize(files?.[key]));
    if (!values.some((value) => value.trim())) return null;
    return JSON.stringify([language, ...values]);
  }
  if (!String(code || '').trim()) return null;
  return JSON.stringify([language, normalize(code)]);
}

async function emitAttempt(token, outcome, version) {
  const state = attempts.get(token);
  if (!state || state.version >= version) return false;
  const classification = classifyCodeMatrixOutcome(outcome, state.metadata.language === 'web');
  if (!classification || (version === 2 && classification.status !== 'preview_error')) return false;
  state.version = version;
  const hashPromise = state.hash;
  const revisionHash = await hashPromise;
  if (!revisionHash) return false;
  const duration = Number(outcome.durationMs);
  const row = {
    ...state.metadata,
    attemptId: state.attemptId,
    sessionId: state.sessionId,
    startedAt: state.startedAt,
    revisionHash,
    ...classification,
    durationMs: outcome.durationMs != null && Number.isFinite(duration) && duration >= 0 ? Math.min(duration, 86_400_000) : null,
    version,
  };
  state.emit('attempts', row);
  return true;
}

export function createCodeMatrixAttemptTracker({ metadata, emit, now = Date.now, makeId = () => crypto.randomUUID(), hash = fingerprint }) {
  const sessionId = makeId();
  return {
    sessionId,
    begin({ language, code, files } = {}) {
      const currentMetadata = metadata();
      const captured = contextMetadata({ ...currentMetadata, language: language || currentMetadata.language });
      if (!captured.language) return null;
      const source = sourceSnapshot(captured.language, code, files);
      if (!source) return null;
      const token = {};
      attempts.set(token, {
        metadata: captured, emit, sessionId, version: 0,
        attemptId: makeId(), startedAt: new Date(now()).toISOString(),
        hash: Promise.resolve().then(() => hash(source)).catch(() => null), hashFunction: hash,
      });
      return token;
    },
    finish: (token, outcome) => emitAttempt(token, outcome, 1),
    previewError: (token, outcome) => emitAttempt(token, { ...outcome, status: 'preview_error' }, 2),
    recordInput(token, input) {
      const state = attempts.get(token);
      if (!state || state.version) return;
      state.hash = state.hash.then((previous) => previous ? state.hashFunction(JSON.stringify([previous, String(input)])) : null).catch(() => null);
    },
  };
}

export function createCodingActivityCoordinator() {
  let current = null;
  return {
    claim(owner) { if (current && current !== owner) current.pause(); current = owner; },
    release(owner) { if (current === owner) current = null; },
  };
}

export function createCodingActivityTracker({ sessionId, emit, now = Date.now, makeId = () => crypto.randomUUID(), isForeground = () => true, coordinator }) {
  let metadata = contextMetadata();
  let enabled = false;
  let previous = null;
  let startedAt = null;
  let milliseconds = 0;
  const flush = () => {
    if (milliseconds >= 1 && metadata.language) {
      emit('activity', {
        ...metadata, sessionId, activityId: makeId(),
        startedAt: new Date(startedAt).toISOString(),
        activeSeconds: Math.round(milliseconds) / 1000,
      });
    }
    milliseconds = 0;
    startedAt = null;
  };
  const addInterval = (start, end) => {
    // Keep daily charts accurate when practice straddles the user's midnight.
    const midnight = new Date(start);
    midnight.setHours(24, 0, 0, 0);
    const boundary = Math.min(end, midnight.getTime());
    if (startedAt === null) startedAt = start;
    milliseconds += boundary - start;
    if (boundary < end) { flush(); addInterval(boundary, end); }
    else if (milliseconds >= 30_000 || boundary === midnight.getTime()) flush();
  };
  const tracker = {
    configure(next) {
      const nextMetadata = contextMetadata(next);
      if (JSON.stringify(metadata) !== JSON.stringify(nextMetadata) || enabled !== Boolean(next.enabled)) tracker.pause();
      metadata = nextMetadata;
      enabled = Boolean(next.enabled);
    },
    mark() {
      if (!enabled || !metadata.language || !isForeground()) { tracker.pause(); return; }
      coordinator?.claim(tracker);
      const current = now();
      if (previous !== null) {
        const interval = current - previous;
        // An isolated key press, idle tail, or open tab contributes no time.
        if (interval > 0 && interval <= 30_000) {
          addInterval(previous, current);
        } else if (interval > 30_000 || interval < 0) flush();
      }
      previous = current;
    },
    pause() { previous = null; flush(); coordinator?.release(tracker); },
    flush,
  };
  return tracker;
}

function sanitizeEvent(kind, value) {
  if (!value || !UUID.test(value.sessionId || '') || !LANGUAGES.has(value.language) || !['page', 'popup'].includes(value.surface)
    || !['manual', 'chat', 'placement'].includes(value.context) || !Number.isFinite(Date.parse(value.startedAt))) return null;
  const shared = Object.fromEntries(['sessionId', 'language', 'surface', 'context', 'startedAt'].map((key) => [key, value[key]]));
  if (kind === 'activity') {
    if (!UUID.test(value.activityId || '') || !Number.isFinite(value.activeSeconds) || value.activeSeconds <= 0 || value.activeSeconds > 300) return null;
    return { ...shared, activityId: value.activityId, activeSeconds: value.activeSeconds };
  }
  if (kind !== 'attempts' || !UUID.test(value.attemptId || '') || !/^[a-f0-9]{64}$/u.test(value.revisionHash || '') || ![1, 2].includes(value.version)
    || !['success', 'error', 'timeout', 'stopped', 'environment', 'preview', 'preview_error'].includes(value.status)
    || !['none', 'syntax', 'type', 'reference', 'runtime', 'timeout', 'other'].includes(value.errorCategory)
    || !(value.durationMs === null || (Number.isFinite(value.durationMs) && value.durationMs >= 0))) return null;
  return { ...shared, ...Object.fromEntries(['attemptId', 'revisionHash', 'status', 'errorCategory', 'durationMs', 'version'].map((key) => [key, value[key]])) };
}

export function codeMatrixInsightsOutbox(profileId, storage) {
  const scope = academicProfileStorageKey(profileId, 'code-insights');
  const prefix = scope ? `${scope}:` : '';
  if (!memoryQueues.has(scope)) memoryQueues.set(scope, { entries: new Map(), retired: false });
  const queue = memoryQueues.get(scope);
  const memory = queue.entries;
  const keyFor = (kind, payload) => `${prefix}${kind}:${payload.attemptId || payload.activityId}:${payload.version || 1}`;
  return {
    add(kind, value) {
      const payload = sanitizeEvent(kind, value);
      if (!prefix || !payload || queue.retired) return false;
      const key = keyFor(kind, payload);
      const entry = { key, kind, payload };
      memory.set(key, entry);
      try { storage?.setItem(key, JSON.stringify({ kind, payload })); } catch { /* The shared live queue remains available. */ }
      return true;
    },
    remove(key) {
      if (!prefix || !key?.startsWith(prefix)) return;
      memory.delete(key);
      try { storage?.removeItem(key); } catch { /* Replaying a persisted ID is safe. */ }
    },
    read() {
      if (!prefix || queue.retired) return [];
      const rows = new Map(memory);
      try {
        for (let index = 0; index < (storage?.length || 0); index += 1) {
          const key = storage.key(index);
          if (!key?.startsWith(prefix)) continue;
          try {
            const parsed = JSON.parse(storage.getItem(key));
            const payload = sanitizeEvent(parsed?.kind, parsed?.payload);
            if (payload && keyFor(parsed.kind, payload) === key) rows.set(key, { key, kind: parsed.kind, payload });
          } catch { /* Ignore corrupt local entries. */ }
        }
      } catch { /* Use the in-memory queue when storage is blocked. */ }
      return [...rows.values()].sort((a, b) => a.payload.startedAt.localeCompare(b.payload.startedAt) || (a.payload.version || 0) - (b.payload.version || 0));
    },
  };
}

export async function flushCodeMatrixInsights({ outbox, profileId, getScope, send, onSent }) {
  while (profileId && profileId === getScope()) {
    const entry = outbox.read()[0];
    if (!entry) break;
    try {
      await send(entry.kind, entry.payload, profileId);
      outbox.remove(entry.key);
      onSent?.(profileId);
    } catch (error) {
      if ([400, 413, 422].includes(error?.status)) { outbox.remove(entry.key); continue; }
      break;
    }
  }
}
