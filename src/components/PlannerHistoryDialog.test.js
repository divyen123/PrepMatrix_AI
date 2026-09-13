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
    const { PlannerHistoryRecords, PreparedNotes } = await vite.ssrLoadModule('/src/components/PlannerHistoryDialog.jsx');
    const task = { id: 'tcp', task: 'Networks - TCP/IP', subjectName: 'Networks', topic: 'TCP/IP', chapterTitle: 'Network models', sourceNoteId: 'n1' };
    const schedule = [{ date: '2026-09-10', tasks: [task] }];
    const history = [createPlannerHistoryEntry({ schedule, completed: ['tcp'] }, { id: 'record', now: '2026-09-13' })];
    const cleared = renderToStaticMarkup(React.createElement(FocusLandscape, { history, subjects: [{ name: 'Networks', chapters: 9 }] }));
    assert.match(cleared, /Already completed/);
    assert.match(cleared, /View history/);
    assert.match(cleared, /1 completed previously/);
    assert.doesNotMatch(cleared, /unfinished chapters|0\/0/);
    const active = renderToStaticMarkup(React.createElement(FocusLandscape, { history, schedule, completed: [] }));
    assert.match(active, /1 task remains in your current schedule/);
    assert.doesNotMatch(active, /Already completed —/);
    const receipt = renderToStaticMarkup(React.createElement(PlannerHistoryRecords, { entries: history, notes: [{ id: 'n1', topic: 'TCP notes', details: 'TCP/IP explanation' }] }));
    assert.match(receipt, /100% completed/);
    assert.match(receipt, /Network models/);
    assert.match(receipt, /TCP\/IP explanation/);
    assert.match(receipt, /Archived on/);
    const hostile = renderToStaticMarkup(React.createElement(PlannerHistoryRecords, { entries: [{ ...history[0], tasks: [{ ...history[0].tasks[0], topic: '<script>bad()</script>' }] }] }));
    assert.doesNotMatch(hostile, /<script>/);
    const materials = renderToStaticMarkup(React.createElement(PreparedNotes, { notebooks: [{ title: 'Networks notebook', revisedNotes: [{ title: 'Transport revision', content: 'TCP delivers an ordered byte stream.', keyPoints: ['UDP preserves datagram boundaries.'] }], topics: [{ title: 'TCP/IP' }] }] }));
    assert.match(materials, /Transport revision/);
    assert.match(materials, /ordered byte stream/);
    assert.match(materials, /UDP preserves datagram/);
    assert.match(materials, /TCP\/IP/);
  } finally { await vite.close(); }
});
