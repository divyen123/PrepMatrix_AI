import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCodeMatrixWorkspace, reconcileCodeMatrixDraft, readCodeMatrixDraft, writeCodeMatrixDraft, getCodeMatrixDiagnostics, codeMatrixSetupNavigation } from './codeMatrixWorkspace.js';

test('draft checkpoints isolate profiles and preserve intentionally empty files', () => {
  const values = new Map();
  const storage = { setItem: (key, value) => values.set(key, value), getItem: (key) => values.get(key) };
  const draft = normalizeCodeMatrixWorkspace({ language: 'java', drafts: { java: '' }, setupDismissed: true });
  assert.equal(writeCodeMatrixDraft('profile-a', draft, storage), true);
  assert.equal(readCodeMatrixDraft('profile-a', storage).drafts.java, '');
  assert.equal(readCodeMatrixDraft('profile-b', storage), null);
  assert.equal(writeCodeMatrixDraft('', draft, storage), false);
  assert.equal(readCodeMatrixDraft('profile-a', { getItem() { throw Error('blocked'); } }), null);
  assert.equal(writeCodeMatrixDraft('profile-a', draft, { setItem() { throw Error('full'); } }), false);
});
test('newer device drafts survive sync while setup progress is merged', () => {
  const local = { drafts: { c: 'local' }, updatedAt: '2026-09-09T10:00:00Z', completedSteps: ['subjects'], setupDismissed: true };
  const remote = { drafts: { c: 'remote' }, updatedAt: '2026-09-09T09:00:00Z', completedSteps: ['plan'] };
  const restored = reconcileCodeMatrixDraft(remote, local, 'c');
  assert.equal(restored.drafts.c, 'local');
  assert.equal(restored.setupDismissed, true);
  assert.deepEqual(restored.completedSteps, ['plan', 'subjects']);
  assert.equal(reconcileCodeMatrixDraft({ ...remote, updatedAt: '2026-09-10T10:00:00Z' }, local).drafts.c, 'remote');
});
test('setup links carry encoded subject names to real destinations', () => {
  const link = codeMatrixSetupNavigation('notebook', 'C++ & Web');
  const url = new URL(link, 'http://localhost');
  assert.equal(url.pathname, '/learn');
  assert.equal(url.hash, '#notebook-preparation');
  assert.equal(url.searchParams.get('subject'), 'C++ & Web');
  assert.match(codeMatrixSetupNavigation('subjects'), /^\/subjects\?.*#add-subject$/);
  assert.match(codeMatrixSetupNavigation('plan'), /^\/planner\/schedule\?/);
});
test('diagnostics map actual student lines for Python, Java, C++ and wrapped JavaScript', () => {
  assert.equal(getCodeMatrixDiagnostics('File "<code-matrix>", line 2\nFile "<code-matrix>", line 8\nValueError: bad', 'python')[0].line, 8);
  assert.equal(getCodeMatrixDiagnostics('Main.java:7: error: missing semicolon', 'java')[0].line, 7);
  assert.equal(getCodeMatrixDiagnostics('main.cpp:4:2: error: unknown identifier', 'cpp')[0].line, 4);
  assert.equal(getCodeMatrixDiagnostics('Error: oops\n at eval (<anonymous>:6:7)', 'javascript')[0].line, 3);
  assert.deepEqual(getCodeMatrixDiagnostics(''), []);
});
