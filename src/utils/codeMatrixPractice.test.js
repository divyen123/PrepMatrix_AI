import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {
  CODE_MATRIX_PRACTICE_LANGUAGES,
  CODE_MATRIX_PRACTICE_QUESTIONS,
  getCodeMatrixPracticeQuestion,
  isSuccessfulPracticeResult,
  normalizeCodeMatrixPracticeState,
  normalizePracticeOutput,
  practiceResultMatchesDraft,
  readCodeMatrixPracticeState,
  writeCodeMatrixPracticeState,
} from './codeMatrixPractice.js';
import { academicProfileStorageKey } from './academicProfileScope.js';
import { CODE_MATRIX_MAX_CODE } from './codeMatrixWorkspace.js';

test('curated catalog provides ten fully specified easy questions and five distinct cases each', () => {
  assert.equal(CODE_MATRIX_PRACTICE_QUESTIONS.length, 10);
  assert.equal(new Set(CODE_MATRIX_PRACTICE_QUESTIONS.map((item) => item.id)).size, 10);
  for (const question of CODE_MATRIX_PRACTICE_QUESTIONS) {
    assert.equal(getCodeMatrixPracticeQuestion(question.id), question);
    assert.equal(question.version, 1);
    assert.equal(question.difficulty, 'Easy');
    for (const field of ['title', 'statement', 'inputFormat', 'outputFormat']) assert.ok(question[field].length > 8);
    assert.ok(question.constraints.length > 0);
    assert.deepEqual(question.supportedLanguages, CODE_MATRIX_PRACTICE_LANGUAGES);
    assert.equal(question.testCases.length, 5);
    assert.equal(new Set(question.testCases.map((item) => item.id)).size, 5);
    assert.equal(new Set(question.testCases.map((item) => item.input)).size, 5);
    assert.deepEqual(question.examples, question.testCases.slice(0, 2));
    assert.ok(Object.isFrozen(question));
    assert.ok(Object.isFrozen(question.testCases));
  }
  assert.equal(getCodeMatrixPracticeQuestion('__proto__'), null);
});

test('all curated expected outputs agree with independent reference solvers including boundary cases', () => {
  const solvers = {
    'sum-two-numbers': (text) => text.trim().split(/\s+/u).map(Number).reduce((sum, value) => sum + value, 0),
    'even-or-odd': (text) => Number(text) % 2 === 0 ? 'EVEN' : 'ODD',
    'largest-of-three': (text) => Math.max(...text.trim().split(/\s+/u).map(Number)),
    'sum-first-n': (text) => Array.from({ length: Number(text) }, (_, index) => index + 1).reduce((sum, value) => sum + value, 0),
    factorial: (text) => Array.from({ length: Number(text) }, (_, index) => index + 1).reduce((product, value) => product * value, 1),
    'reverse-word': (text) => [...text.trim()].reverse().join(''),
    palindrome: (text) => text.trim() === [...text.trim()].reverse().join('') ? 'YES' : 'NO',
    'count-vowels': (text) => [...text.trim()].filter((letter) => 'aeiou'.includes(letter.toLowerCase())).length,
    'sum-digits': (text) => [...text.trim()].reduce((sum, digit) => sum + Number(digit), 0),
    'array-sum': (text) => text.trim().split(/\s+/u).slice(1).map(Number).reduce((sum, value) => sum + value, 0),
  };
  for (const question of CODE_MATRIX_PRACTICE_QUESTIONS) {
    for (const testCase of question.testCases) {
      assert.equal(String(solvers[question.id](testCase.input)), normalizePracticeOutput(testCase.expectedOutput), testCase.id);
    }
  }
});

test('starters contain input scaffolding and TODOs without printing answers or solution logic', () => {
  for (const question of CODE_MATRIX_PRACTICE_QUESTIONS) {
    for (const [language, source] of Object.entries(question.starters)) {
      assert.ok(source.includes('TODO'), `${question.id} ${language}`);
      assert.doesNotMatch(source.replace(/\/\/[^\n]*|#[^\n]*/gu, ''), /\b(?:print|printf|console\.log|System\.out\.print|std::cout)\s*[.(<]/u);
      assert.doesNotMatch(source, /Math\.max|reverse\(|factorial\(|\bEVEN\b|\bODD\b|\bYES\b|\bNO\b/u);
    }
    for (const testCase of question.testCases) {
      const lines = testCase.input.trimEnd().split('\n');
      const output = [];
      vm.runInNewContext(question.starters.javascript, {
        readLine: () => lines.shift() ?? null, console: { log: (...args) => output.push(args.join(' ')) },
      });
      assert.deepEqual(output, [], 'starter must leave the exercise unsolved');
    }
  }
});

test('output normalization tolerates line endings and trailing whitespace but preserves actual content', () => {
  assert.equal(normalizePracticeOutput('YES  \r\n\r\n'), 'YES');
  assert.equal(normalizePracticeOutput('one \r\ntwo\t\r\n'), 'one\ntwo');
  assert.notEqual(normalizePracticeOutput('yes\n'), normalizePracticeOutput('YES\n'));
  assert.notEqual(normalizePracticeOutput('12 3\n'), normalizePracticeOutput('1 23\n'));
  assert.notEqual(normalizePracticeOutput(' 5\n'), normalizePracticeOutput('5\n'));
  assert.notEqual(normalizePracticeOutput('5\nextra'), normalizePracticeOutput('5\n'));
});

function successfulResult(question, code = 'solution') {
  return { status: 'success', questionId: question.id, version: question.version, language: 'python', code,
    total: question.testCases.length, passed: question.testCases.length,
    cases: question.testCases.map((item) => ({ ...item, stdout: item.expectedOutput, status: 'success', passed: true })),
  };
}

test('success requires every canonical case and matching question version; edits cannot reuse a grade', () => {
  const question = CODE_MATRIX_PRACTICE_QUESTIONS[0];
  const result = successfulResult(question);
  assert.ok(isSuccessfulPracticeResult(result, question));
  assert.ok(practiceResultMatchesDraft(result, question, 'python', 'solution'));
  assert.equal(practiceResultMatchesDraft(result, question, 'python', 'new code'), false);
  assert.equal(practiceResultMatchesDraft(result, question, 'javascript', 'solution'), false);
  assert.equal(practiceResultMatchesDraft(result, { ...question, version: 2 }, 'python', 'solution'), false);
  assert.equal(practiceResultMatchesDraft(result, CODE_MATRIX_PRACTICE_QUESTIONS[1], 'python', 'solution'), false);
  for (const changed of [
    { ...result, status: 'error' }, { ...result, total: 0, passed: 0, cases: [] },
    { ...result, version: 2 }, { ...result, language: 'html' },
    { ...result, cases: result.cases.slice(1) },
    { ...result, cases: result.cases.map((item, index) => index ? item : { ...item, stdout: 'wrong' }) },
    { ...result, cases: result.cases.map((item, index) => index ? item : { ...item, status: 'error' }) },
    { ...result, cases: result.cases.map((item, index) => index ? item : { ...item, id: result.cases[1].id }) },
  ]) assert.equal(isSuccessfulPracticeResult(changed, question), false);
});

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values };
}

test('practice drafts and local solved history persist independently of normal drafts and other profiles', () => {
  const storage = memoryStorage();
  const question = CODE_MATRIX_PRACTICE_QUESTIONS[0];
  const key = `${question.id}:v${question.version}`;
  const value = { selectedQuestionId: question.id, selectedLanguage: 'cpp', drafts: { [key]: { python: 'attempt A', javascript: 'attempt JS', cpp: 'attempt C++' } }, solved: { [key]: true } };
  storage.setItem(academicProfileStorageKey('profile-A', 'code-matrix-v1'), 'normal compiler draft');
  assert.equal(writeCodeMatrixPracticeState('profile-A', value, storage), true);
  assert.deepEqual(readCodeMatrixPracticeState('profile-A', storage), value);
  assert.deepEqual(readCodeMatrixPracticeState('profile-B', storage), { selectedQuestionId: '', selectedLanguage: '', drafts: {}, solved: {} });
  assert.equal(storage.getItem(academicProfileStorageKey('profile-A', 'code-matrix-v1')), 'normal compiler draft');
  assert.equal(writeCodeMatrixPracticeState('', value, storage), false);
  assert.equal(storage.values.size, 2);
});

test('corrupt, obsolete, oversized or unavailable storage is bounded and cannot restore unknown questions', () => {
  const question = CODE_MATRIX_PRACTICE_QUESTIONS[0];
  const key = `${question.id}:v1`;
  const normalized = normalizeCodeMatrixPracticeState({ selectedQuestionId: 'unknown', selectedLanguage: 'html',
    drafts: { [key]: { python: 'x'.repeat(CODE_MATRIX_MAX_CODE + 20), html: 'ignored' },
      [`${question.id}:v0`]: { python: 'outdated' }, unknown: { python: 'ignored' } },
    solved: { [key]: true, [`${question.id}:v0`]: true, unknown: true },
  });
  assert.equal(normalized.selectedQuestionId, '');
  assert.equal(normalized.selectedLanguage, '');
  assert.deepEqual(Object.keys(normalized.drafts), [key]);
  assert.deepEqual(Object.keys(normalized.drafts[key]), ['python']);
  assert.equal(normalized.drafts[key].python.length, CODE_MATRIX_MAX_CODE);
  assert.deepEqual(normalized.solved, { [key]: true });
  const storage = memoryStorage();
  storage.setItem(academicProfileStorageKey('profile-A', 'code-matrix-practice-v1'), '{invalid');
  assert.deepEqual(readCodeMatrixPracticeState('profile-A', storage), { selectedQuestionId: '', selectedLanguage: '', drafts: {}, solved: {} });
  const blocked = { getItem() { throw Error('Blocked'); }, setItem() { throw Error('Full'); } };
  assert.equal(writeCodeMatrixPracticeState('profile-A', {}, blocked), false);
  assert.deepEqual(readCodeMatrixPracticeState('profile-A', blocked), { selectedQuestionId: '', selectedLanguage: '', drafts: {}, solved: {} });
});

test('resume restores the selected question and language while retaining drafts in other languages', () => {
  const storage = memoryStorage();
  const question = CODE_MATRIX_PRACTICE_QUESTIONS[0];
  const key = `${question.id}:v1`;
  const state = { selectedQuestionId: question.id, selectedLanguage: 'java',
    drafts: { [key]: { java: 'Java attempt', python: 'Python attempt' } }, solved: {},
  };
  writeCodeMatrixPracticeState('profile-A', state, storage);
  const resumed = readCodeMatrixPracticeState('profile-A', storage);
  assert.equal(resumed.selectedLanguage, 'java');
  assert.equal(resumed.drafts[key][resumed.selectedLanguage], 'Java attempt');
  assert.equal(resumed.drafts[key].python, 'Python attempt');
  for (const selectedLanguage of ['sql', 'html', 'css', '__proto__', undefined]) {
    assert.equal(normalizeCodeMatrixPracticeState({ ...state, selectedLanguage }).selectedLanguage, '');
  }
});
