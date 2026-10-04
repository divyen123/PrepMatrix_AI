import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { createPlannerHistoryEntry, getPreviousPlannerAnalytics } from '../utils/plannerHistory.js';

test('analytics renders one isolated previous schedule with plan and subject details, and restores current actions', async () => {
  const archive = createPlannerHistoryEntry({
    subjects: [{ id: 'networks', name: 'Networks', chapters: 2 }],
    schedule: [{ date: '2026-03-01', tasks: [
      { id: 'tcp', task: 'Networks - TCP', subjectName: 'Networks' },
      { id: 'udp', task: 'Networks - UDP', subjectName: 'Networks' },
    ] }],
    completed: ['tcp', 'udp'],
    learningInsights: { notebookCount: 1, learnedTopicCount: 7, masteredTopicCount: 3, studyMinutes: 90, accuracy: 81 },
  }, { id: 'past-plan', now: '2026-03-02' });
  const snapshot = getPreviousPlannerAnalytics([archive]);
  const savedMomentum = {
    schedule: { totalXp: 70, breakdown: { study: 20, exam: 40, quiz: 10, battle: 0 } },
    global: { totalXp: 170, level: 2, levelProgress: 70, breakdown: { study: 100, exam: 40, quiz: 30, battle: 0, coding: 0 } },
    battleStats: { played: 0, wins: 0, losses: 0, draws: 0, badges: [] },
    history: [],
  };
  const vite = await createServer({
    appType: 'custom', logLevel: 'silent', server: { middlewareMode: true },
    plugins: [{
      name: 'analytics-history-page-fixtures', enforce: 'pre',
      load(id) {
        const path = id.replaceAll('\\', '/');
        if (path.endsWith('/src/hooks/useAnalyticsHistory.js')) return `
          import { getPreviousPlannerAnalytics } from '../utils/plannerHistory.js';
          let view = { historical: false, phase: 'idle', snapshot: null, momentum: null, error: '' };
          export const setView = (value) => { view = value; };
          export default function useAnalyticsHistory(profileId, plannerHistory) {
            return { previous: getPreviousPlannerAnalytics(plannerHistory), switchView() {}, busy: view.phase !== 'idle', ...view };
          }
        `;
        if (path.endsWith('/src/hooks/useLearningInsights.js')) return `
          export default function useLearningInsights() {
            return { insights: { notebookCount: 1, learnedTopicCount: 999, masteredTopicCount: 999, studyMinutes: 999 }, loading: false, error: '', reload() {} };
          }
        `;
        if (path.endsWith('/src/hooks/useQuizBattleStats.js')) return `
          export default function useQuizBattleStats() {
            return { stats: { played: 999 }, loading: false, error: '', reload() {} };
          }
        `;
        if (path.endsWith('/src/hooks/useMomentum.js')) return `
          export default function useMomentum() {
            return { data: { schedule: { totalXp: 9999, breakdown: { study: 20, exam: 9000, quiz: 900, battle: 79 } }, global: { totalXp: 9999, breakdown: { study: 9999 } }, history: [] }, loading: false, error: '', reload() {} };
          }
        `;
        return null;
      },
    }],
  });
  try {
    const [{ default: AnalyticsPage }, history] = await Promise.all([
      vite.ssrLoadModule('/src/pages/AnalyticsPage.jsx'),
      vite.ssrLoadModule('/src/hooks/useAnalyticsHistory.js'),
    ]);
    const current = {
      academicProfileDataId: 'academic-profile-a',
      subjects: [{ id: 'physics', name: 'Physics', chapters: 1 }],
      schedule: [{ date: '2026-10-01', tasks: [{ task: 'Physics - Mechanics', subjectName: 'Physics' }] }],
      completed: ['Physics - Mechanics'],
      plannerHistory: [archive],
    };
    const render = () => renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ['/analytics'] },
      React.createElement(AnalyticsPage, current)));
    history.setView({ historical: true, phase: 'idle', snapshot, momentum: savedMomentum, error: '' });
    const markup = render();
    assert.match(markup, />View current analytics<\/span>/u);
    assert.match(markup, />View plan<\/span>/u);
    assert.match(markup, /aria-label="Open Networks progress details"/u);
    assert.match(markup, /role="button" tabindex="0"/u);
    assert.match(markup, /aria-label="Study momentum XP"[^>]*aria-valuetext="70 XP"/u);
    assert.match(markup, /aria-label="Global momentum XP"[^>]*aria-valuetext="170 GLOBAL XP"/u);
    assert.match(markup, /Notebook progress at the time of this schedule/u);
    assert.match(markup, /<strong>7<\/strong><span>Topics learned<\/span>/u);
    assert.match(markup, /<strong>1h 30m<\/strong><span>Study time<\/span>/u);
    assert.match(markup, /<strong>—<\/strong><span>Learning coverage<\/span>/u);
    assert.doesNotMatch(markup, /Physics|999|Attend Exam|Attend quiz|Create schedule|Suggested material|Open notebook preparation|Start learning|href="\/(?:exam|quiz|planner)/u);

    history.setView({ historical: true, phase: 'idle', snapshot: { ...snapshot, learningInsights: null }, momentum: savedMomentum, error: '' });
    const missingEvidence = render();
    assert.match(missingEvidence, /Learning evidence was not saved with this previous schedule/u);
    assert.doesNotMatch(missingEvidence, /999|Notebook preparation progress/u);

    history.setView({ historical: false, phase: 'idle', snapshot: null, momentum: null, error: '' });
    const restored = render();
    assert.match(restored, />Load previous analytics<\/span>/u);
    assert.match(restored, /aria-label="Open Physics progress details"/u);
    assert.match(restored, /Attend Exam/u);
    assert.match(restored, /Attend quiz/u);
    assert.match(restored, /Notebook preparation progress/u);
    assert.match(restored, /<strong>999<\/strong><span>Topics learned<\/span>/u);
    assert.doesNotMatch(restored, /Open Networks progress details|Previous schedule · saved XP/u);

    for (const plannerHistory of [[], [{ id: 'invalid-history', archivedAt: '2026-10-01', tasks: [] }]]) {
      current.plannerHistory = plannerHistory;
      const withoutArchive = render();
      assert.match(withoutArchive, />View report<\/span>/u);
      assert.doesNotMatch(withoutArchive, /Load previous analytics|analytics-history-toggle|No previous schedule has been saved yet/u);
      assert.match(withoutArchive, /aria-label="Open Physics progress details"/u);
    }

    history.setView({ historical: true, phase: 'idle', snapshot, momentum: savedMomentum, error: '' });
    assert.match(render(), />View current analytics<\/span>/u, 'historical view always retains its return-to-current action');
  } finally { await vite.close(); }
});

test('the analytics loading phase displays only centered status content without the analytics panels', async () => {
  const vite = await createServer({
    appType: 'custom', logLevel: 'silent', server: { middlewareMode: true },
    plugins: [{
      name: 'analytics-loading-page-fixtures', enforce: 'pre',
      load(id) {
        const path = id.replaceAll('\\', '/');
        if (path.endsWith('/src/hooks/useAnalyticsHistory.js')) return `
          let targetHistorical = true;
          export const setTargetHistorical = (value) => { targetHistorical = value; };
          export default () => ({ phase: 'loading', historical: !targetHistorical, snapshot: { id: 'past' }, previous: { id: 'past' }, targetHistorical, busy: true, switchView() {} });
        `;
        if (path.endsWith('/src/hooks/useLearningInsights.js') || path.endsWith('/src/hooks/useQuizBattleStats.js') || path.endsWith('/src/hooks/useMomentum.js')) return 'export default () => ({});';
        return null;
      },
    }],
  });
  try {
    const [{ default: AnalyticsPage }, history] = await Promise.all([
      vite.ssrLoadModule('/src/pages/AnalyticsPage.jsx'),
      vite.ssrLoadModule('/src/hooks/useAnalyticsHistory.js'),
    ]);
    const render = () => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(AnalyticsPage)));
    const previous = render();
    assert.match(previous, /aria-live="polite" class="analytics-view-loading" role="status"/u);
    assert.match(previous, /Loading previous analytics…/u);
    assert.doesNotMatch(previous, /Study momentum|Subject landscape|Topic progress lanes|analytics-view-content|class="card/u);
    history.setTargetHistorical(false);
    const current = render();
    assert.match(current, /Loading current analytics…/u);
    assert.doesNotMatch(current, /Loading previous analytics…|Study momentum|class="card/u);
  } finally { await vite.close(); }
});
