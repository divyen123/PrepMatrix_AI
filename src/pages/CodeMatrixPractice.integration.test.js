import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

let vite;
let CodeMatrixPage;
let practiceFixture;

before(async () => {
  vite = await createServer({
    appType: 'custom', logLevel: 'silent', server: { middlewareMode: true },
    plugins: [{
      name: 'code-matrix-practice-integration-fixtures', enforce: 'pre',
      load(id) {
        const path = id.replaceAll('\\', '/');
        if (path.endsWith('/src/hooks/useCodeMatrixWorkspace.js')) return `
          import { normalizeCodeMatrixWorkspace } from '../utils/codeMatrixWorkspace.js';
          export default function useCodeMatrixWorkspace() {
            return { workspace: normalizeCodeMatrixWorkspace({ setupDismissed: true, language: 'python',
              drafts: { python: 'print("My compiler draft")' } }), ready: true, syncState: 'saved', setup: null,
              update() {}, flush() {}, retry() {} };
          }
        `;
        if (path.endsWith('/src/hooks/useCodeMatrixPractice.js')) return `
          import { CODE_MATRIX_PRACTICE_QUESTIONS } from '../utils/codeMatrixPractice.js';
          export const fixture = { active: false };
          export default function useCodeMatrixPractice() {
            return { panelOpen: fixture.active, question: fixture.active ? CODE_MATRIX_PRACTICE_QUESTIONS[0] : null,
              draft: 'print("My practice draft")', solvedIds: [], storageAvailable: true,
              openPanel() {}, closePanel() {}, showQuestions() {}, selectQuestion() {}, exitPractice() {},
              updateDraft() {}, resetDraft() {}, markSolved() {}, setLanguage() {} };
          }
        `;
        if (path.endsWith('/src/components/CodeMatrixEditor.jsx')) return `
          import React from 'react';
          export default function CodeMatrixEditor({ value }) {
            return React.createElement('textarea', { 'aria-label': 'Code', defaultValue: value });
          }
        `;
        return null;
      },
    }],
  });
  ({ default: CodeMatrixPage } = await vite.ssrLoadModule('/src/pages/CodeMatrixPage.jsx'));
  ({ fixture: practiceFixture } = await vite.ssrLoadModule('/src/hooks/useCodeMatrixPractice.js'));
});
after(async () => { await vite?.close(); });

const render = (embedded) => renderToStaticMarkup(React.createElement(MemoryRouter,
  { initialEntries: ['/learn/code-matrix'] }, React.createElement(CodeMatrixPage, {
    academicProfileDataId: 'academic-profile:practice-integration', embedded, subjects: [{ name: 'Python' }],
  })));

test('practice and compiler share the toolbar in the full page and popup', () => {
  practiceFixture.active = false;
  for (const embedded of [false, true]) {
    const markup = render(embedded);
    assert.match(markup, /class="cmx-toolbar"[\s\S]*?Programming language[\s\S]*?Try to solve\?[\s\S]*?class="cmx-actions"/u);
    assert.match(markup, /My compiler draft/u);
    assert.doesNotMatch(markup, /My practice draft/u);
    assert.match(markup, /Run code/u);
    assert.match(markup, /<option value="sql"/u);
    assert.doesNotMatch(markup, /class="cmx-beta"/u);
    assert.equal(markup.includes('Open CodeMatrix Insights'), !embedded);
  }
});

test('selected practice uses its own draft and supported languages on both surfaces', () => {
  practiceFixture.active = true;
  for (const embedded of [false, true]) {
    const markup = render(embedded);
    assert.match(markup, /My practice draft/u);
    assert.doesNotMatch(markup, /My compiler draft/u);
    assert.match(markup, /role="tablist" aria-label="Practice views"/u);
    assert.match(markup, />Problem<\/button>/u);
    assert.match(markup, />Test results<\/button>/u);
    assert.match(markup, /\sRun<\/button>/u);
    for (const id of ['python', 'javascript', 'c', 'cpp', 'java']) assert.match(markup, new RegExp(`<option value="${id}"`, 'u'));
    for (const id of ['sql', 'html', 'css']) assert.doesNotMatch(markup, new RegExp(`<option value="${id}"`, 'u'));
  }
});
