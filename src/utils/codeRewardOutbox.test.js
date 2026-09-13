import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { codeRewardOutbox } from './codeRewardOutbox.js';
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
