import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('Insights keeps result panels scrollable and lifetime runs visible with sparse or long activity', async () => {
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
    languages: [],
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
    assert.match(markup, /Historical XP records preserve successful runs/u);
    assert.match(markup, /class="cmxi-xp-total">30 <span>XP/u);
    assert.match(markup, /<dt>Solved questions<\/dt><dd>1<\/dd>/u);
    assert.match(markup, /<dt>Practice XP<\/dt><dd>10 XP<\/dd>/u);
    assert.match(markup, /class="cmxi-solved-list cmxi-panel-scroll"[\s\S]*?Sum of two numbers[\s\S]*?\+10 XP/u);
    assert.match(markup, /class="cmxi-panel-scroll" tabindex="0" aria-labelledby="cmxi-next-title"/u);
    assert.match(markup, /class="cmxi-history-languages cmxi-panel-scroll" tabindex="0" role="list"/u);
    assert.match(markup, /\+10 XP for each newly solved question\./u);
    assert.doesNotMatch(markup, /<details/u);
    const { setTestData } = await vite.ssrLoadModule('/src/hooks/useCodeMatrixInsights.js');
    setTestData({ ...data, recent: recent.slice(0, 1) });
    const sparse = renderToStaticMarkup(React.createElement(CodeMatrixInsights, { academicProfileDataId: 'test', onBack() {} }));
    assert.match(sparse, /class="cmxi-recent cmxi-panel-scroll" tabindex="0"/u, 'a short list uses the same panel body as a long one');
  } finally {
    await vite.close();
  }
});
