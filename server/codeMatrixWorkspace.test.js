import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeCodeMatrixWorkspace, validateCodeMatrixWorkspacePatch, publicCodeMatrixWorkspace } from './codeMatrixWorkspace.js';

const now = new Date('2026-09-09T10:00:00Z');
test('workspace patches preserve other languages, empty drafts and sticky dismissal', () => {
  const first = mergeCodeMatrixWorkspace(null, { drafts: { c: 'int main() {}', python: 'print(1)' }, setupDismissed: true }, now, ['subjects']);
  const next = mergeCodeMatrixWorkspace(first, { drafts: { python: '' }, setupDismissed: false, completedSteps: ['plan'] }, now);
  assert.equal(next.drafts.c, 'int main() {}');
  assert.equal(next.drafts.python, '');
  assert.equal(next.setupDismissed, true);
  assert.deepEqual(next.completedSteps, ['subjects']);
  assert.equal(next.revision, 2);
});
test('workspace rejects forged ownership, unsupported fields and invalid UTF-8', () => {
  for (const patch of [{ userId: 'victim' }, { drafts: { bash: 'ls' } }, { inputs: { python: 12 } }, { drafts: { c: '\ud800' } }, { setupDismissed: 'true' }]) {
    assert.throws(() => validateCodeMatrixWorkspacePatch(patch), { status: 400 });
  }
  assert.throws(() => validateCodeMatrixWorkspacePatch({ drafts: { python: 'அ'.repeat(23000) } }), { status: 413 });
});
test('workspace detects stale revisions and never publishes ownership', () => {
  const current = mergeCodeMatrixWorkspace(null, { drafts: { java: 'class Main {}' } }, now);
  assert.throws(() => mergeCodeMatrixWorkspace(current, { language: 'java', revision: 0 }, now), { status: 409 });
  assert.equal(publicCodeMatrixWorkspace({ ...current, userId: 'private', academicProfileId: 'private' }).userId, undefined);
  assert.equal(publicCodeMatrixWorkspace({ ...current, hasWorkspace: false }), null);
});
