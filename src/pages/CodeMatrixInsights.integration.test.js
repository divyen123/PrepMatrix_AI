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

test('Finish setup keeps completed cards visible and leaves unfinished actions available', async () => {
  const vite = await createServer({
    logLevel: 'silent',
    server: { middlewareMode: true },
    plugins: [{
      name: 'code-matrix-setup-test-fixtures',
      enforce: 'pre',
      load(id) {
        if (id.replaceAll('\\', '/').endsWith('/src/hooks/useCodeMatrixWorkspace.js')) return `
          import { normalizeCodeMatrixWorkspace } from '../utils/codeMatrixWorkspace.js';
          let completedSteps = [];
          export function setCompletedSteps(value) { completedSteps = value; }
          export default function useCodeMatrixWorkspace() {
            return {
              workspace: normalizeCodeMatrixWorkspace({ language: 'python', completedSteps }),
              ready: true, syncState: 'saved', setup: null,
              update() {}, flush() {}, retry() {},
            };
          }
        `;
        return null;
      },
    }],
  });
  try {
    const { default: CodeMatrixPage } = await vite.ssrLoadModule('/src/pages/CodeMatrixPage.jsx');
    const { setCompletedSteps } = await vite.ssrLoadModule('/src/hooks/useCodeMatrixWorkspace.js');
    for (const completedCount of [0, 1, 2]) {
      setCompletedSteps(completedCount === 2 ? ['notebook'] : []);
      const markup = renderToStaticMarkup(React.createElement(MemoryRouter, {
        initialEntries: ['/learn/code-matrix'],
      }, React.createElement(CodeMatrixPage, {
        academicProfileDataId: 'academic-profile:setup-test',
        userProfile: { academicLevel: "Undergraduate / Bachelor's", department: 'Computer Science' },
        subjects: completedCount ? [{ name: 'Python' }] : [],
      })));
      assert.equal((markup.match(/class="cmx-setup-card /gu) || []).length, 3);
      assert.equal((markup.match(/class="cmx-button cmx-setup-done" role="status"/gu) || []).length, completedCount);
      assert.match(markup, /Add your subjects/u);
      assert.match(markup, /Prepare your first notebook/u);
      assert.match(markup, /Plan your study schedule/u);
      assert.match(markup, />Create plan</u);
      assert.doesNotMatch(markup, /YOUR WORKSPACE, YOUR WAY|of 3 ready|Add your subjects, prepare a notebook|You can also start coding right away/u);
      if (completedCount) assert.doesNotMatch(markup, />Add subject</u);
      else assert.match(markup, />Add subject</u);
      if (completedCount === 2) assert.doesNotMatch(markup, />Start learning</u);
      else assert.match(markup, />Start learning</u);
    }
  } finally {
    await vite.close();
  }
});
