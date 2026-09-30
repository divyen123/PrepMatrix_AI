import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

test('CodeMatrix exposes Insights only on the full page and tracks both editor surfaces', async () => {
  const vite = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    plugins: [{
      name: 'code-matrix-insights-test-fixtures',
      enforce: 'pre',
      load(id) {
        const path = id.replaceAll('\\', '/');
        if (path.endsWith('/src/hooks/useCodeMatrixWorkspace.js')) return `
          import { normalizeCodeMatrixWorkspace } from '../utils/codeMatrixWorkspace.js';
          export default function useCodeMatrixWorkspace() {
            return {
              workspace: normalizeCodeMatrixWorkspace({ setupDismissed: true, language: 'python' }),
              ready: true, syncState: 'saved', setup: null,
              update() {}, flush() {}, retry() {},
            };
          }
        `;
        if (path.endsWith('/src/hooks/useCodeMatrixTracking.js')) return `
          export const captured = [];
          export default function useCodeMatrixTracking(options) {
            captured.push(options);
            return { begin() {}, finish() {}, previewError() {}, recordInput() {}, markActivity() {}, pauseActivity() {}, flush() {} };
          }
        `;
        return null;
      },
    }],
  });
  try {
    const { default: CodeMatrixPage } = await vite.ssrLoadModule('/src/pages/CodeMatrixPage.jsx');
    const { captured } = await vite.ssrLoadModule('/src/hooks/useCodeMatrixTracking.js');
    const profileId = 'academic-profile:insights-test';
    const render = (embedded) => renderToStaticMarkup(React.createElement(MemoryRouter, {
      initialEntries: ['/learn/code-matrix'],
    }, React.createElement(CodeMatrixPage, { academicProfileDataId: profileId, embedded, subjects: [{ name: 'Python' }] })));

    const page = render(false);
    const popup = render(true);
    assert.match(page, /aria-label="Open CodeMatrix Insights"/u);
    assert.doesNotMatch(popup, /Open CodeMatrix Insights/u);
    for (const markup of [page, popup]) {
      assert.match(markup, /aria-label="Source code"/u);
      assert.match(markup, /aria-label="Execution results"/u);
    }
    assert.deepEqual(captured.map(({ academicProfileDataId, embedded, language, enabled }) => ({ academicProfileDataId, embedded, language, enabled })), [
      { academicProfileDataId: profileId, embedded: false, language: 'python', enabled: true },
      { academicProfileDataId: profileId, embedded: true, language: 'python', enabled: true },
    ]);
  } finally {
    await vite.close();
  }
});
