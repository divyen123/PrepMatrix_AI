import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('Insights keeps recent activity scrollable and lifetime runs visible', async () => {
  const recent = Array.from({ length: 12 }, (_, index) => ({
    attemptId: `attempt-${index}`,
    language: 'java',
    surface: 'full',
    status: 'success',
    startedAt: new Date(Date.UTC(2026, 8, 30, 12, index)).toISOString(),
  }));
  const data = {
    summary: { attempts: 12, activeSeconds: 0 },
    xp: { total: 20, successfulRuns: 8 },
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
          return `export default function useCodeMatrixInsights() { return { data: ${JSON.stringify(data)}, loading: false, error: null, reload() {} }; }`;
        }
        return null;
      },
    }],
  });
  try {
    const { default: CodeMatrixInsights } = await vite.ssrLoadModule('/src/components/CodeMatrixInsights.jsx');
    const markup = renderToStaticMarkup(React.createElement(CodeMatrixInsights, { academicProfileDataId: 'test', onBack() {} }));
    const recentList = markup.match(/<ul class="cmxi-recent is-scrollable"[^>]*>([\s\S]*?)<\/ul>/u);
    assert.ok(recentList, 'long activity list has its own focusable scroll area');
    assert.match(markup, /class="cmxi-recent is-scrollable" tabindex="0"/u);
    assert.equal((recentList[1].match(/<li>/gu) || []).length, 12);
    assert.match(markup, /<section class="cmxi-history"[^>]*><h2[^>]*>Lifetime successful runs/u);
    assert.match(markup, /Historical XP records preserve successful runs/u);
    assert.doesNotMatch(markup, /<details/u);
  } finally {
    await vite.close();
  }
});
