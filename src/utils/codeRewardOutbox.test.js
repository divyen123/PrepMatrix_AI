import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { codeRewardOutbox, normalizeCodeRewardRecord } from './codeRewardOutbox.js';
import { clearAcademicProfileBrowserData } from './academicProfileScope.js';

function memoryStorage() {
  const rows = new Map();
  return { get length() { return rows.size; }, key: (index) => [...rows.keys()][index], getItem: (key) => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, value), removeItem: (key) => rows.delete(key) };
}

test('unsent successes survive reload, stay profile scoped and retain their replay ID', () => {
  const storage = memoryStorage();
  const run = { runId: randomUUID(), language: 'java' };
  codeRewardOutbox('profile-a', storage).add({ ...run, code: 'private source' });
  codeRewardOutbox('profile-b', storage).add(run);
  const resumed = codeRewardOutbox('profile-a', storage);
  assert.deepEqual(resumed.read(), [run]);
  resumed.remove(run.runId);
  assert.deepEqual(resumed.read(), []);
  assert.deepEqual(codeRewardOutbox('profile-b', storage).read(), [run]);
  clearAcademicProfileBrowserData('profile-b', { localStorageRef: storage, sessionStorageRef: memoryStorage() });
  assert.equal(storage.length, 0);
});

test('practice reward evidence survives retry without retaining source code or client XP', () => {
  const storage = memoryStorage();
  const run = { runId: randomUUID(), language: 'python', practice: {
    questionId: 'sum-two-numbers', version: 1,
    results: [{ id: 'basic', status: 'success', stdout: '7\n' }],
  } };
  codeRewardOutbox('profile-a', storage).add({ ...run, code: 'private source', xp: 900,
    practice: { ...run.practice, passed: true, results: [{ ...run.practice.results[0], code: 'private source', passed: true }] } });
  assert.deepEqual(codeRewardOutbox('profile-a', storage).read(), [run]);
  assert.deepEqual(codeRewardOutbox('profile-b', storage).read(), []);
  codeRewardOutbox('profile-a', storage).remove(run.runId);
  assert.equal(storage.length, 0);
});

test('invalid or oversized practice evidence cannot be downgraded into an ordinary run', () => {
  const run = { runId: randomUUID(), language: 'python', practice: {
    questionId: 'sum-two-numbers', version: 1,
    results: [{ id: 'basic', status: 'success', stdout: '7\n' }],
  } };
  const invalid = [
    { ...run, practice: null },
    { ...run, practice: { ...run.practice, questionId: '../question' } },
    { ...run, practice: { ...run.practice, version: '1' } },
    { ...run, practice: { ...run.practice, results: [] } },
    { ...run, practice: { ...run.practice, results: Array(21).fill(run.practice.results[0]) } },
    { ...run, practice: { ...run.practice, results: [{ id: 'basic', status: 'timeout', stdout: '7\n' }] } },
    { ...run, practice: { ...run.practice, results: [{ id: 'basic', status: 'success', stdout: 'x'.repeat(8193) }] } },
    { ...run, practice: { ...run.practice, results: [...run.practice.results, ...run.practice.results] } },
  ];
  for (const record of invalid) assert.equal(normalizeCodeRewardRecord(record), null);
});

test('blocked storage, missing profiles and corrupt records cannot poison the reward queue', () => {
  const storage = memoryStorage();
  const run = { runId: randomUUID(), language: 'python' };
  const outbox = codeRewardOutbox('profile-a', storage);
  codeRewardOutbox('', storage).add(run);
  assert.equal(storage.length, 0);
  storage.setItem('prepmatrix-profile:profile-a:code-reward:broken', '{');
  outbox.add({ runId: 'bad', language: 'python' });
  outbox.add(run);
  assert.deepEqual(outbox.read(), [run]);
  const blocked = { get length() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  assert.doesNotThrow(() => codeRewardOutbox('profile-a', blocked).add(run));
  assert.doesNotThrow(() => codeRewardOutbox('profile-a', blocked).remove(run.runId));
  assert.deepEqual(codeRewardOutbox('profile-a', blocked).read(), []);
});
