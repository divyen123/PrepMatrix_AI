import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { parseFragment } from 'parse5';

function findElements(node, predicate) {
  return [
    ...(node.tagName && predicate(node) ? [node] : []),
    ...(node.childNodes || []).flatMap((child) => findElements(child, predicate)),
  ];
}

const attribute = (node, name) => node.attrs?.find((item) => item.name === name)?.value;
const hasClass = (node, name) => attribute(node, 'class')?.split(' ').includes(name);

test('Insights keeps activity scrollable and all lifetime run cards visible with populated or empty data', async () => {
  const recent = Array.from({ length: 12 }, (_, index) => ({
    attemptId: `attempt-${index}`,
    language: 'java',
    surface: 'full',
    status: 'success',
    startedAt: new Date(Date.UTC(2026, 8, 30, 12, index)).toISOString(),
  }));
  const data = {
    summary: { attempts: 12, activeSeconds: 0 },
    xp: { total: 30, successfulRuns: 8, practiceXp: 10, solvedQuestions: 1, practiceRewardXp: 10, recentPracticeRewards: [{ id: 'solve-1', title: 'Sum of two numbers', language: 'python', xp: 10, occurredAt: '2026-09-30T12:00:00Z' }] },
    languages: ['python', 'java', 'javascript', 'web', 'cpp', 'c', 'sql', 'html', 'css'].map((id, index) => ({
      id,
      label: id === 'python' ? 'Python' : id,
      meaningfulAttempts: 18 - index,
      activeSeconds: 303,
      errorsResolved: 3,
      practiceDays: 1,
      successRate: 50,
    })),
    timeZone: 'Asia/Calcutta',
    trend: [],
    recent,
    historicalLanguages: [{ id: 'java', label: 'Java', successfulRuns: 8 }],
  };
  const vite = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    plugins: [{
      name: 'code-matrix-insights-test-data',
      enforce: 'pre',
      load(id) {
        if (id.replaceAll('\\', '/').endsWith('/src/hooks/useCodeMatrixInsights.js')) {
          return `let data = ${JSON.stringify(data)}; export function setTestData(value) { data = value; } export default function useCodeMatrixInsights() { return { data, loading: false, error: null, reload() {} }; }`;
        }
        return null;
      },
    }],
  });
  try {
    const { default: CodeMatrixInsights } = await vite.ssrLoadModule('/src/components/CodeMatrixInsights.jsx');
    const markup = renderToStaticMarkup(React.createElement(CodeMatrixInsights, { academicProfileDataId: 'test', onBack() {} }));
    const recentList = markup.match(/<ul class="cmxi-recent cmxi-panel-scroll"[^>]*>([\s\S]*?)<\/ul>/u);
    assert.ok(recentList, 'activity list has its own focusable scroll area');
    assert.match(markup, /class="cmxi-recent cmxi-panel-scroll" tabindex="0"/u);
    assert.equal((recentList[1].match(/<li>/gu) || []).length, 12);
    assert.match(markup, /<section class="cmxi-history"[^>]*><h2[^>]*>Lifetime successful runs/u);
    assert.doesNotMatch(markup, /Historical XP records preserve successful runs/u);
    assert.match(markup, /class="cmxi-xp-total">30 <span>XP/u);
    assert.match(markup, /<dt>Solved questions<\/dt><dd>1<\/dd>/u);
    assert.match(markup, /<dt>Practice XP<\/dt><dd>10 XP<\/dd>/u);
    assert.match(markup, /class="cmxi-solved-list cmxi-panel-scroll"[\s\S]*?Sum of two numbers[\s\S]*?\+10 XP/u);
    assert.match(markup, /class="cmxi-panel-scroll" tabindex="0" aria-labelledby="cmxi-next-title"/u);
    assert.match(markup, /class="cmxi-history-languages" role="list"/u);
    assert.match(markup, /\+10 XP for each newly solved question\./u);
    assert.doesNotMatch(markup, /<details/u);
    assert.match(markup, /Your practice, progress, and next steps · This academic profile/u);
    for (const text of [
      'Meaningful attempts group repeat runs of unchanged code.',
      'No-error rate excludes stopped runs and environment failures.',
      'Select a language above or click a bar to explore its practice details.',
      'Both places you code, in one view',
      'Small steps, based on your activity',
      'See where your practice goes',
      'Rewards earned each day',
      '30 days · Asia/Calcutta',
    ]) assert.ok(!markup.includes(text), `${text} is removed`);

    const tree = parseFragment(markup);
    const [body] = findElements(tree, (node) => hasClass(node, 'cmxi-language-body'));
    assert.ok(body, 'language panel keeps a separate static body');
    assert.equal(hasClass(body, 'cmxi-panel-scroll'), false, 'scrolling is confined to the detail column');
    assert.equal(attribute(body, 'tabindex'), undefined);
    const [chartColumn] = findElements(body, (node) => hasClass(node, 'cmxi-language-chart-column'));
    assert.equal(findElements(chartColumn, (node) => hasClass(node, 'cmxi-language-chart')).length, 1);
    const [selector] = findElements(chartColumn, (node) => hasClass(node, 'cmxi-language-buttons'));
    assert.ok(selector, 'language buttons stay together with the chart');
    const buttons = findElements(selector, (node) => node.tagName === 'button');
    assert.equal(buttons.length, data.languages.length);
    assert.deepEqual(buttons.map((button) => attribute(button, 'data-language')), data.languages.map((item) => item.id));
    for (const button of buttons) {
      assert.equal(attribute(button, 'aria-haspopup'), 'dialog');
      assert.equal(attribute(button, 'aria-expanded'), 'false');
    }
    const [details] = findElements(body, (node) => hasClass(node, 'cmxi-language-details'));
    assert.equal(hasClass(details, 'cmxi-panel-scroll'), true);
    assert.equal(attribute(details, 'tabindex'), '0');
    assert.equal(attribute(details, 'aria-label'), 'Language practice details');
    assert.equal(findElements(details, (node) => node.tagName === 'tbody').length, 1);
    assert.equal(findElements(details, (node) => node.tagName === 'tr').length, data.languages.length + 1);
    assert.equal(findElements(body, (node) => hasClass(node, 'cmxi-selected-language')).length, 0);
    assert.equal(findElements(tree, (node) => node.attrs?.some((item) => item.name === 'popover')).length, 0, 'details open on demand');
    const { setTestData } = await vite.ssrLoadModule('/src/hooks/useCodeMatrixInsights.js');
    setTestData({ ...data, recent: recent.slice(0, 1) });
    const sparse = renderToStaticMarkup(React.createElement(CodeMatrixInsights, { academicProfileDataId: 'test', onBack() {} }));
    assert.match(sparse, /class="cmxi-recent cmxi-panel-scroll" tabindex="0"/u, 'a short list uses the same panel body as a long one');
    for (const [hasRuns, hasQuestions] of [[false, false], [true, false], [false, true]]) {
      setTestData({
        ...data,
        historicalLanguages: hasRuns ? data.historicalLanguages : [],
        xp: { ...data.xp, recentPracticeRewards: hasQuestions ? data.xp.recentPracticeRewards : [] },
      });
      const state = renderToStaticMarkup(React.createElement(CodeMatrixInsights, { academicProfileDataId: 'test', onBack() {} }));
      const historyGrid = state.match(/<div class="cmxi-history-grid">([\s\S]*?)<footer/u)?.[1];
      assert.ok(historyGrid, 'history panels remain present when either or both datasets are empty');
      assert.equal((historyGrid.match(/<section /gu) || []).length, 2, 'both panels stay side by side');
      assert.match(historyGrid, /Lifetime successful runs/u);
      assert.match(historyGrid, /Solved questions/u);
      if (hasRuns) {
        assert.match(historyGrid, /aria-label="Java: 8 successful runs"/u);
        assert.doesNotMatch(historyGrid, /Your successful compiler runs will appear here/u);
      } else {
        assert.match(historyGrid, /0 recorded/u);
        assert.match(historyGrid, /class="cmxi-panel-empty"><p class="cmxi-muted">Your successful compiler runs will appear here\./u);
      }
      if (hasQuestions) {
        assert.match(historyGrid, /Sum of two numbers/u);
        assert.doesNotMatch(historyGrid, /Solve a practice question to see it here/u);
      } else {
        assert.match(historyGrid, /class="cmxi-panel-scroll cmxi-panel-empty"><p class="cmxi-muted">Solve a practice question to see it here\./u);
      }
    }
  } finally {
    await vite.close();
  }
});
