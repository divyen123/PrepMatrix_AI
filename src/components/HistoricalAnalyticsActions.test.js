import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

const subjects = [{ id: 'networks', name: 'Networks', chapters: 2 }];
const schedule = [{ date: '2026-03-01', tasks: [
  { id: 'tcp', task: 'Networks - TCP', subjectName: 'Networks', topic: 'TCP', time: 'Morning' },
  { id: 'udp', task: 'Networks - UDP', subjectName: 'Networks', topic: 'UDP', time: 'Evening' },
] }];
const render = (Component, props) => renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ['/analytics'] },
  React.createElement(Component, props)));

async function fixture({ openPlan = false } = {}) {
  const originalDocument = globalThis.document;
  globalThis.document = { body: {} };
  const vite = await createServer({
    appType: 'custom', logLevel: 'silent', server: { middlewareMode: true },
    plugins: [{
      name: 'historical-analytics-actions-fixtures', enforce: 'pre',
      transform(source, id) {
        const path = id.replaceAll('\\', '/');
        if (path.endsWith('/src/components/SubjectProgressModal.jsx') || path.endsWith('/src/components/StudyPlanPreviewDialog.jsx')) {
          return source.replace('import { createPortal } from "react-dom";', 'const createPortal = (content) => content;');
        }
        if (openPlan && path.endsWith('/src/components/Prediction.jsx')) {
          return source.replace('import { useState } from "react";', 'const useState = () => [true, () => {}];');
        }
        return null;
      },
    }],
  });
  return {
    vite,
    async close() {
      globalThis.document = originalDocument;
      await vite.close();
    },
  };
}

test('previous subject details describe archived completions and remaining work without study actions', async () => {
  const context = await fixture();
  try {
    const { default: SubjectProgressModal } = await context.vite.ssrLoadModule('/src/components/SubjectProgressModal.jsx');
    const historical = render(SubjectProgressModal, { subject: 'Networks', schedule, completed: ['Networks - TCP'], historical: true, onClose() {} });
    assert.match(historical, /Previously completed/u);
    assert.match(historical, /1 of 2 chapters (?:previously )?completed/u);
    assert.match(historical, /class="subject-task-status done">Previously completed<\/span>/u);
    assert.match(historical, /class="subject-task-status pending">(?:Not completed|Remaining|Previously pending)<\/span>/u);
    assert.doesNotMatch(historical, /Upcoming|Recommended next step|Run a revision quiz|Take a quiz|Ask AI|Attend exam|Refer material|subject-modal-actions|href=/u);
    assert.match(historical, /aria-label="Close subject progress"/u);

    const completedHistorical = render(SubjectProgressModal, {
      subject: 'Networks', schedule, completed: ['Networks - TCP', 'Networks - UDP'], historical: true, onClose() {},
    });
    assert.match(completedHistorical, /Previously completed/u);
    assert.doesNotMatch(completedHistorical, /Recommended next step|Run a revision quiz|Take a quiz|Ask AI|Attend exam|Refer material/u);

    const current = render(SubjectProgressModal, { subject: 'Networks', schedule, completed: ['Networks - TCP'], onClose() {} });
    assert.match(current, /Refer material/u);
    assert.match(current, /Take a quiz/u);
    assert.match(current, /Ask AI/u);
    assert.match(current, /Upcoming/u);
    assert.match(current, /Recommended next step/u);

    const completedCurrent = render(SubjectProgressModal, {
      subject: 'Networks', schedule, completed: ['Networks - TCP', 'Networks - UDP'], onClose() {},
    });
    assert.match(completedCurrent, /Attend exam/u);
    assert.match(completedCurrent, /Run a revision quiz/u);
  } finally { await context.close(); }
});

test('previous plan preview labels archived statuses and keeps all saved plan tasks', async () => {
  const context = await fixture();
  try {
    const { StudyPlanPreviewContent } = await context.vite.ssrLoadModule('/src/components/StudyPlanPreviewDialog.jsx');
    const historical = render(StudyPlanPreviewContent, { schedule, completed: ['tcp'], historical: true });
    assert.match(historical, /Previous (?:study schedule|study plan|plan)/u);
    assert.match(historical, /1 of 2 tasks (?:previously )?complete(?:d)?/u);
    assert.match(historical, /aria-label="Previously completed"/u);
    assert.match(historical, /aria-label="(?:Not completed|Remaining|Previously pending)"/u);
    assert.match(historical, /Networks - TCP/u);
    assert.match(historical, /Networks - UDP/u);
    assert.match(historical, /Morning/u);
    assert.match(historical, /Evening/u);
    assert.doesNotMatch(historical, /href=|Attend exam|Take a quiz|Create schedule/u);
    const current = render(StudyPlanPreviewContent, { schedule, completed: ['tcp'] });
    assert.match(current, />Study schedule<\/h2>/u);
    assert.match(current, /aria-label="Completed"/u);
    assert.match(current, /aria-label="Pending"/u);
  } finally { await context.close(); }
});

test('historical predictions and readiness show archived progress without current planner or exam destinations', async () => {
  const context = await fixture({ openPlan: true });
  try {
    const [{ default: Prediction }, { default: Readiness }] = await Promise.all([
      context.vite.ssrLoadModule('/src/components/Prediction.jsx'),
      context.vite.ssrLoadModule('/src/components/Readiness.jsx'),
    ]);
    const prediction = render(Prediction, {
      historical: true, subjects, schedule, completed: ['Networks - TCP'], scheduleStartDate: '2026-03-01',
    });
    assert.match(prediction, />View plan<\/span>/u);
    assert.match(prediction, /aria-expanded="true"/u);
    assert.match(prediction, /id="study-plan-preview-dialog"/u);
    assert.match(prediction, /Previous (?:study schedule|study plan|plan)/u);
    assert.match(prediction, /aria-label="Previously completed"/u);
    assert.match(prediction, /Networks - UDP/u);
    assert.doesNotMatch(prediction, /href=|Create plan|Finish Networks/u);
    const empty = render(Prediction, { historical: true });
    assert.doesNotMatch(empty, /href=|Create plan|Add a subject/u);
    const readiness = render(Readiness, {
      historical: true, schedule, completed: ['Networks - TCP', 'Networks - UDP'],
    });
    assert.match(readiness, /100%/u);
    assert.doesNotMatch(readiness, /Attend Exam|eligible to attend the exam|unlock exam mode/u);
    const current = render(Readiness, { schedule, completed: ['Networks - TCP', 'Networks - UDP'] });
    assert.match(current, /Attend Exam/u);
  } finally { await context.close(); }
});
