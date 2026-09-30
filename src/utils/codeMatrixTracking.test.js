import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { clearAcademicProfileBrowserData } from './academicProfileScope.js';
import {
  classifyCodeMatrixOutcome, codeMatrixInsightsOutbox, createCodeMatrixAttemptTracker,
  createCodingActivityCoordinator, createCodingActivityTracker, flushCodeMatrixInsights,
} from './codeMatrixTracking.js';

const START = Date.parse('2026-09-29T08:00:00.000Z');
const metadata = { language: 'python', surface: 'page', context: 'manual', enabled: true };

function memoryStorage() {
  const rows = new Map();
  return { get length() { return rows.size; }, key: (index) => [...rows.keys()][index], getItem: (key) => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, value), removeItem: (key) => rows.delete(key) };
}

function activityRow(overrides = {}) {
  return { sessionId: randomUUID(), activityId: randomUUID(), language: 'python', surface: 'page', context: 'manual', startedAt: new Date(START).toISOString(), activeSeconds: 12.5, ...overrides };
}

test('attempt metadata is captured at start, source stays private and duplicate completions are ignored', async () => {
  const rows = [];
  let activeMetadata = metadata;
  const tracker = createCodeMatrixAttemptTracker({ metadata: () => activeMetadata, emit: (kind, row) => rows.push({ kind, row }), now: () => START });
  const token = tracker.begin({ language: 'python', code: 'print("private source")' });
  assert.deepEqual(token, {});
  activeMetadata = { ...metadata, language: 'java', surface: 'popup', context: 'chat' };
  const completion = tracker.finish(token, { status: 'success', stdout: 'private output', durationMs: 86 });
  assert.equal(await tracker.finish(token, { status: 'stopped' }), false);
  assert.equal(await completion, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].row.language, 'python');
  assert.equal(rows[0].row.surface, 'page');
  assert.equal(rows[0].row.context, 'manual');
  assert.equal(rows[0].row.durationMs, 86);
  assert.match(rows[0].row.revisionHash, /^[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(rows).includes('private'), false);
  assert.equal(tracker.begin({ language: 'python', code: '\n ' }), null);
  assert.equal(await tracker.finish(null, { status: 'success' }), false);
});

test('revision hashes group identical programs and distinguish changes to terminal input', async () => {
  const rows = [];
  const tracker = createCodeMatrixAttemptTracker({ metadata: () => metadata, emit: (_, row) => rows.push(row) });
  for (const input of ['one', 'one', 'two']) {
    const token = tracker.begin({ language: 'python', code: 'print(input())' });
    tracker.recordInput(token, input);
    await tracker.finish(token, { status: 'success' });
  }
  assert.equal(rows[0].revisionHash, rows[1].revisionHash);
  assert.notEqual(rows[0].revisionHash, rows[2].revisionHash);
  assert.equal(new Set(rows.map((row) => row.attemptId)).size, 3);
  assert.equal(new Set(rows.map((row) => row.sessionId)).size, 1);
});

test('web preview launch and later error share one attempt with monotonic versions', async () => {
  const rows = [];
  const tracker = createCodeMatrixAttemptTracker({ metadata: () => ({ ...metadata, surface: 'popup' }), emit: (_, row) => rows.push(row) });
  const token = tracker.begin({ language: 'html', files: { html: '<button>Speak</button>', css: '', javascript: '' } });
  await tracker.finish(token, { status: 'preview' });
  await tracker.previewError(token, { stderr: 'ReferenceError: speak is not defined' });
  assert.equal(await tracker.previewError(token, { stderr: 'ReferenceError: another' }), false);
  assert.equal(await tracker.finish(token, { status: 'stopped' }), false);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].attemptId, rows[1].attemptId);
  assert.equal(rows[0].revisionHash, rows[1].revisionHash);
  assert.deepEqual(rows.map((row) => [row.language, row.status, row.version, row.errorCategory]), [
    ['web', 'preview', 1, 'none'], ['web', 'preview_error', 2, 'reference'],
  ]);
  assert.equal(tracker.begin({ language: 'css', files: { html: '', css: '', javascript: '' } }), null);
});

test('late completions wait for hashing and hashing failure never blocks execution or persists source', async () => {
  const rows = [];
  let resolveHash;
  const tracker = createCodeMatrixAttemptTracker({ metadata: () => metadata, emit: (_, row) => rows.push(row), hash: () => new Promise((resolve) => { resolveHash = resolve; }) });
  const token = tracker.begin({ language: 'java', code: 'class Main {}' });
  const completion = tracker.finish(token, { status: 'stopped' });
  await Promise.resolve();
  assert.equal(rows.length, 0);
  resolveHash('a'.repeat(64));
  await completion;
  assert.equal(rows[0].status, 'stopped');
  const broken = createCodeMatrixAttemptTracker({ metadata: () => metadata, emit: () => assert.fail('must not save'), hash: () => { throw new Error('unavailable'); } });
  assert.equal(await broken.finish(broken.begin({ language: 'python', code: 'print(1)' }), { status: 'success' }), false);
});

test('environment failures and input waiting do not become coding weaknesses', () => {
  for (const stderr of ['Failed to fetch runtime module', 'No terminal input was received', 'Runtime worker failed', 'Runtime result could not be decoded.', 'Runtime connection failed.']) {
    assert.deepEqual(classifyCodeMatrixOutcome({ status: 'error', stderr }), { status: 'environment', errorCategory: 'none' });
  }
  assert.deepEqual(classifyCodeMatrixOutcome({ status: 'error', errorOrigin: 'environment', stderr: 'failed' }), { status: 'environment', errorCategory: 'none' });
  assert.equal(classifyCodeMatrixOutcome({ status: 'waiting' }), null);
  assert.deepEqual(classifyCodeMatrixOutcome({ status: 'timeout' }), { status: 'timeout', errorCategory: 'timeout' });
  assert.deepEqual(classifyCodeMatrixOutcome({ status: 'error', stderr: 'SyntaxError: expected colon' }), { status: 'error', errorCategory: 'syntax' });
  assert.deepEqual(classifyCodeMatrixOutcome({ status: 'error', stderr: 'TypeError: unsupported operand types' }), { status: 'error', errorCategory: 'type' });
  assert.deepEqual(classifyCodeMatrixOutcome({ status: 'error', stderr: 'IndexError: list index out of range' }), { status: 'error', errorCategory: 'runtime' });
});

test('coding time counts only foreground interaction intervals, excluding idle gaps and idle tails', () => {
  let time = START;
  let foreground = true;
  const rows = [];
  const tracker = createCodingActivityTracker({ sessionId: randomUUID(), emit: (_, row) => rows.push(row), now: () => time, isForeground: () => foreground });
  tracker.configure(metadata);
  tracker.mark();
  time += 10_000;
  tracker.flush();
  assert.equal(rows.length, 0, 'one action followed by an open tab is not coding time');
  tracker.mark();
  time += 15_000;
  tracker.mark();
  time += 40_000;
  tracker.mark();
  assert.equal(rows[0].activeSeconds, 25);
  assert.equal(rows[0].startedAt, new Date(START).toISOString());
  time += 5_000;
  foreground = false;
  tracker.mark();
  foreground = true;
  time += 5_000;
  tracker.mark();
  time += 5_000;
  tracker.mark();
  tracker.pause();
  assert.equal(rows[1].activeSeconds, 5);
  assert.equal(rows.reduce((sum, row) => sum + row.activeSeconds, 0), 30);
});

test('language changes, blur pauses and disabling tracking keep coding time in the correct context', () => {
  let time = START;
  const rows = [];
  const tracker = createCodingActivityTracker({ sessionId: randomUUID(), emit: (_, row) => rows.push(row), now: () => time });
  tracker.configure(metadata);
  tracker.mark();
  time += 4_000;
  tracker.mark();
  tracker.configure({ ...metadata, language: 'java', surface: 'popup', context: 'chat' });
  time += 8_000;
  tracker.mark();
  time += 3_000;
  tracker.mark();
  tracker.pause();
  time += 2_000;
  tracker.mark();
  time += 4_000;
  tracker.mark();
  tracker.configure({ ...metadata, enabled: false });
  time += 5_000;
  tracker.mark();
  tracker.flush();
  assert.deepEqual(rows.map((row) => [row.language, row.surface, row.context, row.activeSeconds]), [
    ['python', 'page', 'manual', 4], ['java', 'popup', 'chat', 3], ['java', 'popup', 'chat', 4],
  ]);
});

test('coding activity crossing local midnight splits across the correct days', () => {
  let time = new Date(2026, 8, 29, 23, 59, 55).getTime();
  const rows = [];
  const tracker = createCodingActivityTracker({ sessionId: randomUUID(), emit: (_, row) => rows.push(row), now: () => time });
  tracker.configure(metadata);
  tracker.mark();
  time += 10_000;
  tracker.mark();
  tracker.pause();
  assert.deepEqual(rows.map((row) => row.activeSeconds), [5, 5]);
  assert.deepEqual(rows.map((row) => new Date(row.startedAt).getDate()), [29, 30]);
});

test('long continuous practice is emitted in small immutable chunks and popup/page never overlap', () => {
  let time = START;
  const coordinator = createCodingActivityCoordinator();
  const rows = [];
  const options = { sessionId: randomUUID(), emit: (_, row) => rows.push(row), now: () => time, coordinator };
  const page = createCodingActivityTracker(options);
  const popup = createCodingActivityTracker(options);
  page.configure(metadata);
  popup.configure({ ...metadata, surface: 'popup' });
  page.mark();
  for (let index = 0; index < 20; index += 1) { time += 20_000; page.mark(); }
  popup.mark();
  time += 10_000;
  popup.mark();
  page.mark();
  time += 5_000;
  page.mark();
  page.pause();
  popup.pause();
  assert.equal(rows.reduce((sum, row) => sum + row.activeSeconds, 0), 415);
  assert.equal(rows.filter((row) => row.surface === 'popup').reduce((sum, row) => sum + row.activeSeconds, 0), 10);
  assert.equal(rows.every((row) => row.activeSeconds <= 300), true);
  assert.equal(new Set(rows.map((row) => row.activityId)).size, rows.length);
});

test('outbox survives new consumers, isolates profiles, preserves versions and strips raw data', () => {
  const profileId = randomUUID();
  const secondId = randomUUID();
  const storage = memoryStorage();
  const first = codeMatrixInsightsOutbox(profileId, storage);
  const second = codeMatrixInsightsOutbox(profileId, storage);
  const activity = activityRow();
  first.add('activity', { ...activity, code: 'private', stdout: 'private output' });
  const attempt = { ...metadata, sessionId: randomUUID(), attemptId: randomUUID(), startedAt: new Date(START).toISOString(), revisionHash: 'b'.repeat(64), status: 'preview', language: 'web', errorCategory: 'none', durationMs: null, version: 1 };
  second.add('attempts', attempt);
  first.add('attempts', { ...attempt, status: 'preview_error', errorCategory: 'reference', version: 2 });
  codeMatrixInsightsOutbox(secondId, storage).add('activity', activity);
  assert.equal(second.read().length, 3);
  assert.equal(JSON.stringify(second.read()).includes('private'), false);
  assert.equal(codeMatrixInsightsOutbox(secondId, storage).read().length, 1);
  const version1 = first.read().find((entry) => entry.kind === 'attempts' && entry.payload.version === 1);
  second.remove(version1.key);
  assert.equal(first.read().length, 2);
  assert.equal(first.read().some((entry) => entry.payload.version === 2), true);
});

test('blocked storage retains shared in-memory retries and invalid events cannot enter the queue', () => {
  const profileId = randomUUID();
  const blocked = { get length() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  const outbox = codeMatrixInsightsOutbox(profileId, blocked);
  const row = activityRow();
  assert.equal(outbox.add('activity', row), true);
  assert.equal(codeMatrixInsightsOutbox(profileId, blocked).read().length, 1);
  assert.equal(outbox.add('activity', { ...row, activeSeconds: 900 }), false);
  assert.equal(outbox.add('activity', { ...row, activityId: 'invalid' }), false);
  assert.equal(codeMatrixInsightsOutbox('', blocked).add('activity', row), false);
  outbox.remove(outbox.read()[0].key);
  assert.equal(outbox.read().length, 0);
});

test('retry keeps the same IDs and stops sending as soon as academic profile changes', async () => {
  const profileId = randomUUID();
  let scope = profileId;
  const outbox = codeMatrixInsightsOutbox(profileId, memoryStorage());
  const first = activityRow();
  const second = activityRow({ startedAt: new Date(START + 1000).toISOString() });
  outbox.add('activity', first);
  outbox.add('activity', second);
  const delivered = [];
  const options = { outbox, profileId, getScope: () => scope };
  await flushCodeMatrixInsights({ ...options, send: async (_, row) => { delivered.push(row.activityId); throw new Error('offline'); } });
  assert.equal(outbox.read().length, 2);
  await flushCodeMatrixInsights({ ...options, send: async (_, row, requestedScope) => { assert.equal(requestedScope, profileId); delivered.push(row.activityId); scope = 'another-profile'; } });
  assert.deepEqual(delivered, [first.activityId, first.activityId]);
  assert.equal(outbox.read().length, 1);
  await flushCodeMatrixInsights({ ...options, send: async () => assert.fail('wrong profile') });
  scope = profileId;
  await flushCodeMatrixInsights({ ...options, send: async (_, row) => delivered.push(row.activityId) });
  assert.equal(outbox.read().length, 0);
  assert.equal(delivered.at(-1), second.activityId);
});

test('deleting a profile retires existing outboxes and ignores completions arriving after deletion', async () => {
  const profileId = randomUUID();
  const storage = memoryStorage();
  const first = codeMatrixInsightsOutbox(profileId, storage);
  const second = codeMatrixInsightsOutbox(profileId, storage);
  first.add('activity', activityRow());
  const tracker = createCodeMatrixAttemptTracker({ metadata: () => metadata, emit: (kind, row) => first.add(kind, row) });
  const token = tracker.begin({ code: 'print(1)' });
  assert.equal(clearAcademicProfileBrowserData(profileId, { localStorageRef: storage, sessionStorageRef: memoryStorage() }), 1);
  assert.equal(first.read().length, 0);
  assert.equal(second.read().length, 0);
  await tracker.finish(token, { status: 'success' });
  assert.equal(storage.length, 0);
  assert.equal(second.add('activity', activityRow()), false);
});
