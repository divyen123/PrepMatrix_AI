import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

const schedule = [
  { date: '2026-03-01', tasks: [{ id: 'network-one', subjectName: 'Networks', task: 'Networks - TCP' }] },
  { date: '2026-03-02', tasks: [{ id: 'network-two', subjectName: 'Networks', task: 'Networks - UDP' }] },
  { date: '2026-03-03', tasks: [{ id: 'network-three', subjectName: 'Networks', task: 'Networks - DNS' }] },
];
const completed = ['network-one', 'network-two', 'network-three'];
const subjects = [{ name: 'Networks', chapters: 3, difficulty: 'medium' }];

test('previous Study momentum uses saved XP and its final scheduled day without live actions or battle data', async () => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  try {
    const { default: Gamification } = await vite.ssrLoadModule('/src/components/Gamification.jsx');
    const render = (props) => renderToStaticMarkup(React.createElement(MemoryRouter, null,
      React.createElement(Gamification, { schedule, completed, subjects, ...props })));
    const historical = render({
      historical: true,
      battleStats: { played: 999, wins: 999 },
      battleStatsLoading: true,
      battleStatsError: 'Live battle refresh failed',
      momentumError: 'Live XP refresh failed',
      momentum: {
        schedule: { totalXp: 245, breakdown: { study: 30, exam: 160, quiz: 30, battle: 25 } },
        battleStats: { played: 2, wins: 1, draws: 1, losses: 0, badges: [] },
      },
    });
    assert.match(historical, /Previous schedule · saved XP and progress/u);
    assert.match(historical, /aria-valuenow="245" aria-valuetext="245 XP"/u);
    assert.match(historical, /<span>Level<\/span><strong>3<\/strong>/u);
    assert.match(historical, /<span>Streak<\/span><strong>3d<\/strong>/u);
    assert.match(historical, /Previous schedule reference day: 1 of 1 completed \(100%\)/u);
    assert.match(historical, /<span>Final day<\/span><strong>100%<\/strong>/u);
    assert.match(historical, /<span>Planner XP<\/span><strong>30<\/strong>/u);
    assert.match(historical, /<span>Battle XP<\/span><strong>25<\/strong>/u);
    assert.match(historical, /<span>Battles played<\/span><strong>2<\/strong>/u);
    assert.doesNotMatch(historical, /Attend Exam|Attend quiz|Open Quiz Battles|momentum-action-grid|999|Loading…|could not be refreshed|href="\/(?:exam|quiz|planner)/u);

    const current = render({
      battleStats: { played: 999 },
      momentum: { schedule: { totalXp: 245, breakdown: { study: 30, exam: 160, quiz: 30, battle: 25 } } },
    });
    assert.match(current, /Current schedule · tasks, exams and quizzes/u);
    assert.match(current, /<span>Today<\/span>/u);
    assert.match(current, /<span>Battles played<\/span><strong>999<\/strong>/u);
    assert.match(current, /Attend Exam/u);
    assert.match(current, /Attend quiz/u);
  } finally {
    await vite.close();
  }
});

test('legacy archived Study momentum derives XP and reference-day progress without borrowing current battles', async () => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  try {
    const { default: Gamification } = await vite.ssrLoadModule('/src/components/Gamification.jsx');
    const markup = renderToStaticMarkup(React.createElement(MemoryRouter, null,
      React.createElement(Gamification, {
        historical: true,
        schedule,
        completed,
        subjects,
        battleStats: { played: 777 },
      })));
    assert.match(markup, /aria-valuenow="30" aria-valuetext="30 XP"/u);
    assert.match(markup, /<span>Streak<\/span><strong>3d<\/strong>/u);
    assert.match(markup, /<span>Battles played<\/span><strong>0<\/strong>/u);
    assert.doesNotMatch(markup, /777|Attend Exam|Attend quiz/u);
  } finally {
    await vite.close();
  }
});

test('previous landscape uses only its archived schedule and offers no material or schedule actions', async () => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  try {
    const { default: FocusLandscape } = await vite.ssrLoadModule('/src/components/FocusLandscape.jsx');
    const markup = renderToStaticMarkup(React.createElement(FocusLandscape, {
      historical: true,
      schedule,
      completed: ['network-one', 'network-two'],
      subjects,
      history: [{
        id: 'unrelated-plan', archivedAt: '2026-02-01T00:00:00Z', totalTasks: 1, fullyCompleted: true,
        tasks: [{ id: 'unrelated-task', subjectName: 'Physics', label: 'Physics - Waves' }],
      }],
    }));
    assert.match(markup, /Previous schedule subject workload distribution\. 2 of 3 scheduled tasks are complete/u);
    assert.match(markup, /2\/3 tasks · previously completed/u);
    assert.match(markup, /2 of 3 tasks were completed in this previous schedule/u);
    assert.match(markup, /1 task was remaining when this schedule was saved/u);
    assert.doesNotMatch(markup, /Physics|Top priority|Suggested material|Create schedule|href=|current schedule/u);

    const empty = renderToStaticMarkup(React.createElement(FocusLandscape, { historical: true, subjects }));
    assert.doesNotMatch(empty, /Create schedule|href=|Suggested material/u);
  } finally {
    await vite.close();
  }
});
