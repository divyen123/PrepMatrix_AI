import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createPlannerHistoryEntry } from '../utils/plannerHistory.js';

test('cleared landscape shows completed history; a new plan still shows real pending tasks', async () => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  try {
    const { default: FocusLandscape } = await vite.ssrLoadModule('/src/components/FocusLandscape.jsx');
    const task = { id: 'tcp', task: 'Networks - TCP/IP', subjectName: 'Networks', topic: 'TCP/IP', chapterTitle: 'Network models', sourceNoteId: 'n1' };
    const schedule = [{ date: '2026-09-10', tasks: [task] }];
    const history = [createPlannerHistoryEntry({ schedule, completed: ['tcp'] }, { id: 'record', now: '2026-09-13' })];
    const cleared = renderToStaticMarkup(React.createElement(FocusLandscape, { history, subjects: [{ name: 'Networks', chapters: 9 }] }));
    assert.match(cleared, /Already completed/);
    assert.doesNotMatch(cleared, /View history|landscape-history-button|study-history-dialog/);
    assert.match(cleared, /Your completed work remains included in this landscape/);
    assert.match(cleared, /1 completed previously/);
    assert.doesNotMatch(cleared, /unfinished chapters|0\/0/);
    const active = renderToStaticMarkup(React.createElement(FocusLandscape, { history, schedule, completed: [] }));
    assert.match(active, /1 task remains in your current schedule/);
    assert.doesNotMatch(active, /Already completed —/);
    assert.doesNotMatch(active, /View history|landscape-history-button|study-history-dialog/);
  } finally { await vite.close(); }
});
