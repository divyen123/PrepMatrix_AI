import test from 'node:test';
import assert from 'node:assert/strict';
import { isCodeReviewable, codeReviewSnapshot, codeReviewMatchesDraft, createCodeReviewSession } from './codeMatrixReview.js';

const run = { language: 'python', code: 'print(10 / 0)', stderr: 'ZeroDivisionError: division by zero', status: 'error' };
test('offers help for code failures, but not success, waiting, stopped or runtime downloads', () => {
  assert.equal(isCodeReviewable(run), true);
  assert.equal(isCodeReviewable({ ...run, status: 'timeout', stderr: 'Execution exceeded 10 seconds.' }), true);
  for (const status of ['success', 'waiting', 'loading', 'running', 'stopped']) assert.equal(isCodeReviewable({ ...run, status }), false);
  for (const stderr of ['Failed to fetch', 'Could not load SQLite. Please retry.', 'Compiler loading or compilation exceeded two minutes.', 'No terminal input was received for five minutes.']) {
    assert.equal(isCodeReviewable({ ...run, stderr }), false);
  }
  assert.equal(isCodeReviewable({ ...run, errorOrigin: 'environment' }), false);
  assert.equal(codeReviewSnapshot(null), null);
});
test('snapshots exclude account information and stdin, bound errors, and track web file changes', () => {
  const snapshot = codeReviewSnapshot({ ...run, input: 'private input', stdout: 'private output', userId: 'private', stderr: 'Error:'.repeat(4000) });
  assert.equal(snapshot.stderr.length, 8000);
  assert.deepEqual(Object.keys(snapshot), ['language', 'code', 'status', 'stderr']);
  assert.equal(codeReviewMatchesDraft(snapshot, { python: run.code }), true);
  assert.equal(codeReviewMatchesDraft(snapshot, { python: 'print(1)' }), false);
  const web = { ...snapshot, language: 'javascript', files: { html: '<main></main>', css: '' } };
  assert.equal(codeReviewMatchesDraft(web, { javascript: web.code, html: '<main></main>', css: '' }), true);
  assert.equal(codeReviewMatchesDraft(web, { javascript: web.code, html: '<p></p>', css: '' }), false);
});
test('concurrent clicks and reopening a completed review share a single request', async () => {
  let calls = 0;
  let finish;
  const result = { summary: 'Inspect the divisor.' };
  const session = createCodeReviewSession(() => { calls++; return new Promise((resolve) => { finish = resolve; }); }, () => 'stable');
  const first = session.request(run);
  const duplicate = session.request(run);
  assert.equal(first, duplicate);
  await Promise.resolve();
  finish({ review: result });
  assert.deepEqual(await first, result);
  assert.deepEqual(await session.request(run), result);
  assert.equal(calls, 1);
});
test('rerunning the same error with another worker URL reuses its review', async () => {
  const failure = (id) => codeReviewSnapshot({ ...run, language: 'javascript',
    stderr: `ReferenceError: missing is not defined\n at script.js:3:13\n at blob:null/${id}:792:10` });
  const first = failure('4914a27d-8bae-4211-8eee-501401b769b9');
  const second = failure('b0cb7708-6502-4ec2-9e14-1322ef869285');
  assert.deepEqual(first, second);
  assert.match(first.stderr, /script\.js:3:13/);
  let calls = 0;
  const session = createCodeReviewSession(async () => { calls++; return { review: { summary: 'Inspect the identifier.' } }; });
  await session.request(first);
  await session.request(second);
  assert.equal(calls, 1);
});
test('failed retries keep their identity and late reviews cannot replace another snapshot', async () => {
  const keys = [];
  let finish;
  let count = 0;
  const session = createCodeReviewSession(async (snapshot, key) => {
    keys.push(key);
    if (++count === 1) throw new Error('connection lost');
    if (snapshot.code === run.code) return new Promise((resolve) => { finish = resolve; });
    return { review: { summary: 'Other run' } };
  }, () => `request-${count}`);
  await assert.rejects(session.request(run));
  const old = session.request(run);
  const next = { ...run, code: 'print(missing)' };
  await session.request(next);
  finish({ review: { summary: 'First run' } });
  await old;
  assert.equal(keys[0], keys[1]);
  assert.equal(session.peek(next).summary, 'Other run');
  assert.equal(session.peek(run).summary, 'First run');
  assert.equal(createCodeReviewSession(() => {}).peek(run), null);
});
