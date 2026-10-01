import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let vite;
let PracticePanel;
let TestResults;
before(async () => {
  vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  ({ default: PracticePanel } = await vite.ssrLoadModule('/src/components/CodeMatrixPracticePanel.jsx'));
  ({ default: TestResults } = await vite.ssrLoadModule('/src/components/CodeMatrixTestResults.jsx'));
});
after(async () => { await vite?.close(); });

const renderResults = (props) => renderToStaticMarkup(React.createElement(TestResults, props));
const renderPractice = (props) => renderToStaticMarkup(React.createElement(PracticePanel, props));
function elements(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [tree] : []),
    ...[tree.props?.children].flat(Infinity).flatMap((child) => elements(child, predicate))];
}
const textContent = (tree) => typeof tree === 'string' || typeof tree === 'number' ? String(tree)
  : tree && typeof tree === 'object' ? [tree.props?.children].flat(Infinity).map(textContent).join('') : '';
const cases = (status = 'success', passed = true) => Array.from({ length: 5 }, (_, index) => ({
  id: `test-${index + 1}`, input: '2 3\n', expectedOutput: '5\n', stdout: passed ? '5\n' : '4\n', status, passed,
}));

test('passed tests show XP only after an award is confirmed and hide it when code changes', () => {
  const result = { status: 'success', total: 5, passed: 5, cases: cases() };
  const success = renderResults({ result });
  assert.match(success, /All 5 test cases passed/u);
  assert.doesNotMatch(success, /XP earned/u);
  assert.match(success, /role="status" aria-live="polite"/u);
  assert.equal((success.match(/class="cmx-test-case is-passed"/gu) || []).length, 5);
  const pendingReward = renderResults({ result: { ...result, reward: { xp: 10, awarded: false } } });
  assert.doesNotMatch(pendingReward, /XP earned/u);
  const awarded = renderResults({ result: { ...result, reward: { xp: 10, awarded: true } } });
  assert.match(awarded, /\+10 XP earned/u);
  const stale = renderResults({ result: { ...result, reward: { xp: 10, awarded: true } }, stale: true });
  assert.match(stale, /Code changed — run again\./u);
  assert.doesNotMatch(stale, /XP earned/u);
  assert.doesNotMatch(stale, /cmx-tests-summary is-success/u);
});

test('wrong output, execution failures, timeouts and skipped cases remain distinct', () => {
  const records = cases();
  records[0] = { ...records[0], passed: false, stdout: '<wrong>' };
  records[1] = { ...records[1], status: 'error', passed: false, stderr: 'NameError: total is undefined' };
  records[2] = { ...records[2], status: 'timeout', passed: false, stderr: 'Execution timed out' };
  records[3] = { ...records[3], status: 'skipped', passed: false, stdout: '' };
  const failure = renderResults({ result: { status: 'error', total: 5, passed: 1, cases: records } });
  assert.match(failure, /1 of 5 test cases passed/u);
  assert.match(failure, /Wrong output/u);
  assert.match(failure, /Execution error/u);
  assert.match(failure, /Time limit reached/u);
  assert.match(failure, /Not run/u);
  assert.match(failure, /Expected output/u);
  assert.match(failure, /&lt;wrong&gt;/u);
  assert.match(failure, /NameError: total is undefined/u);
  assert.match(failure, /cmx-test-case is-failed" open=""/u);
  assert.doesNotMatch(failure, /cmx-test-case is-skipped" open=""/u);
  const setupError = renderResults({ result: { status: 'error', total: 5, passed: 0, cases: [], stderr: 'The practice runtime could not be started.' } });
  assert.match(setupError, /The practice runtime could not be started\./u);
  const stopped = renderResults({ result: { status: 'stopped', total: 5, passed: 0, cases: cases('skipped', false) } });
  assert.match(stopped, /Run stopped/u);
  assert.doesNotMatch(stopped, /Wrong output/u);
});

test('busy progress starts at test one even when every pending case is seeded', () => {
  const records = cases('pending', false);
  const initial = renderResults({ busy: true, result: { status: 'running', total: 5, passed: 0, cases: records } });
  assert.match(initial, /Checking test 1 of 5…/u);
  assert.doesNotMatch(initial, /Wrong output/u);
  records[0] = { ...records[0], status: 'success', passed: true, stdout: '5\n' };
  const next = renderResults({ busy: true, result: { status: 'running', total: 5, passed: 1, cases: records } });
  assert.match(next, /Checking test 2 of 5…/u);
  assert.doesNotMatch(next, /All 5 test cases passed/u);
});

test('chooser offers three unsolved questions in the selected language with compact actions', () => {
  const questions = Array.from({ length: 7 }, (_, index) => ({
    id: `question-${index}`, title: `Question ${index}`, topic: 'Arithmetic', supportedLanguages: ['python'],
  }));
  questions.splice(2, 0, { id: 'sql-only', title: 'SQL only question', supportedLanguages: ['sql'] });
  const markup = renderToStaticMarkup(React.createElement(PracticePanel, {
    questions, language: 'python', solvedIds: ['question-0', 'question-1'], onSelect() {}, onRefresh() {},
  }));
  assert.equal((markup.match(/class="cmx-practice-question"/gu) || []).length, 3);
  assert.match(markup, /Question 2/u);
  assert.match(markup, /Question 3/u);
  assert.match(markup, /Question 4/u);
  assert.doesNotMatch(markup, /Question [0156]/u);
  assert.doesNotMatch(markup, /SQL only question/u);
  assert.equal((markup.match(/>Try it</gu) || []).length, 3);
  assert.match(markup, /More questions/u);
  assert.doesNotMatch(markup, /Return to compiler/u);
  assert.doesNotMatch(markup, /<dialog|<h3>Easy|badge/u);
  const selected = renderToStaticMarkup(React.createElement(PracticePanel, {
    question: { ...questions[2], statement: 'Print the result.', inputFormat: 'One integer.', outputFormat: 'One integer.' },
    language: 'python', onNext() {},
  }));
  assert.match(selected, /Try another/u);
  assert.doesNotMatch(selected, /Return to compiler/u);
});

test('the picker header Solved button toggles completed questions without replacing its title', () => {
  let showSolved = false;
  let toggles = 0;
  const props = { onToggleSolved() { showSolved = !showSolved; toggles += 1; } };
  const picker = () => PracticePanel({ ...props, showSolved });
  const toggle = (tree) => elements(tree, (element) => element.type === 'button' && textContent(element) === 'Solved')[0];
  assert.equal(toggle(picker()).props.type, 'button');
  assert.equal(toggle(picker()).props['aria-pressed'], false);
  assert.doesNotMatch(renderToStaticMarkup(toggle(picker())), /<svg/u, 'Solved remains a plain text action');
  toggle(picker()).props.onClick();
  assert.equal(toggles, 1);
  assert.equal(toggle(picker()).props['aria-pressed'], true);
  assert.ok(renderPractice({ ...props, showSolved }).includes('<h2>Try to solve?</h2>'));
  toggle(picker()).props.onClick();
  assert.equal(toggles, 2);
  assert.equal(toggle(picker()).props['aria-pressed'], false);
  const selected = PracticePanel({ ...props, question: { id: 'selected', title: 'Selected problem' }, solvedIds: ['selected'] });
  assert.equal(elements(selected, (element) => element.type === 'button' && textContent(element) === 'Solved').length, 0);
});

test('completed mode lists every compatible solved question beyond three cards and reopens the selected ID', () => {
  const solvedQuestions = Array.from({ length: 6 }, (_, index) => ({
    id: `completed-${index}`, title: `Completed question ${index}`, supportedLanguages: ['python'],
  }));
  solvedQuestions.push({ id: 'sql-only', title: 'SQL only completed problem', supportedLanguages: ['sql'] });
  const selectedIds = [];
  const props = { showSolved: true, solvedQuestions, questions: [solvedQuestions[5]], language: 'python',
    solvedIds: new Set([...solvedQuestions.slice(0, 5).map((question) => question.id), 'sql-only']),
    onSelect: (id) => selectedIds.push(id), onRefresh() {}, onToggleSolved() {},
  };
  const markup = renderPractice(props);
  assert.equal((markup.match(/<article\b/gu) || []).length, 5);
  for (let index = 0; index < 5; index += 1) assert.ok(markup.includes(`Completed question ${index}`));
  assert.doesNotMatch(markup, /Completed question 5|SQL only completed problem/u);
  assert.equal((markup.match(/>Try again</gu) || []).length, 5);
  assert.doesNotMatch(markup, /More questions|<footer/u);
  for (const action of elements(PracticePanel(props), (element) => element.type === 'button' && textContent(element) === 'Try again')) {
    action.props.onClick();
  }
  assert.deepEqual(selectedIds, solvedQuestions.slice(0, 5).map((question) => question.id));
});

test('completed mode shows an empty state when no solved questions match instead of suggestions', () => {
  const questions = [{ id: 'unsolved', title: 'Suggested unsolved question', supportedLanguages: ['python'] }];
  for (const props of [
    { solvedQuestions: questions, solvedIds: [] },
    { solvedQuestions: [{ id: 'sql-only', title: 'Incompatible completed question', supportedLanguages: ['sql'] }], solvedIds: ['sql-only'] },
  ]) {
    const markup = renderPractice({ ...props, questions, showSolved: true, language: 'python', onRefresh() {} });
    assert.match(markup, /No solved questions yet/u);
    assert.doesNotMatch(markup, /<article|Suggested unsolved question|Incompatible completed question|More questions|<footer/u);
    assert.match(markup, /aria-pressed="true"/u);
  }
});
