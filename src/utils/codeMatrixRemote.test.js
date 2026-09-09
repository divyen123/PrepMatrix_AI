import assert from 'node:assert/strict';
import test from 'node:test';
import { createCodeMatrixRemoteRun, normalizeCodeMatrixRemoteResult } from './codeMatrixRemote.js';

test('compiler errors and timeouts stay failures with their real messages', () => {
  const error = normalizeCodeMatrixRemoteResult({ status: { id: 6 }, completed: true, success: false, compileOutput: 'Main.java:2: missing semicolon' });
  assert.equal(error.status, 'error');
  assert.match(error.stderr, /Main.java:2/);
  assert.equal(normalizeCodeMatrixRemoteResult({ status: { id: 5, description: 'Time Limit Exceeded' }, completed: true }).status, 'timeout');
});
test('remote runner submits once and polls within the chosen profile', async () => {
  let posts = 0;
  let polls = 0;
  const apiClient = {
    async post(path, body, options) { posts++; assert.equal(options.academicProfileId, 'a'); assert.equal(body.language, 'java'); return { submission: { id: 'run-id', completed: false, status: { id: 1 } } }; },
    async get(path, options) { polls++; assert.equal(path, '/api/code-matrix/submissions/run-id'); assert.equal(options.academicProfileId, 'a'); return { submission: { id: 'run-id', completed: true, success: true, status: { id: 3 }, stdout: 'hello', durationMs: 5 } }; },
  };
  const result = await createCodeMatrixRemoteRun({ language: 'java', code: 'class Main {}', academicProfileId: 'a', apiClient, pollIntervalMs: 1 }).promise;
  assert.equal(result.status, 'success');
  assert.equal(result.stdout, 'hello');
  assert.equal(posts, 1);
  assert.equal(polls, 1);
});
test('cancelling during submission returns immediately and never starts polling', async () => {
  let finish;
  let polls = 0;
  const handle = createCodeMatrixRemoteRun({ language: 'c', code: 'x', apiClient: { post: () => new Promise((resolve) => { finish = resolve; }), get: async () => { polls++; } } });
  handle.cancel();
  assert.equal((await handle.promise).status, 'stopped');
  finish({ submission: { id: 'later', completed: false } });
  await Promise.resolve();
  assert.equal(polls, 0);
});
test('ambiguous creation failures are not retried', async () => {
  let posts = 0;
  const handle = createCodeMatrixRemoteRun({ language: 'c', code: 'x', apiClient: { async post() { posts++; throw Error('Connection lost'); } } });
  await assert.rejects(handle.promise, /Connection lost/);
  assert.equal(posts, 1);
});
