import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const focusLandscapeSource = readFileSync(new URL('./FocusLandscape.jsx', import.meta.url), 'utf8');
const goalTrackerSource = readFileSync(new URL('./GoalTracker.jsx', import.meta.url), 'utf8');
const topicTimelineSource = readFileSync(new URL('./TopicTimeline.jsx', import.meta.url), 'utf8');
const appStyles = readFileSync(new URL('../App.css', import.meta.url), 'utf8');

test('removes badges Goal focus, Timeline map, and Focus Map from analytics components', () => {
  assert.doesNotMatch(goalTrackerSource, /<span className="section-tag">Goal focus<\/span>/u);
  assert.doesNotMatch(topicTimelineSource, /<span className="section-tag">Timeline map<\/span>/u);
  assert.doesNotMatch(focusLandscapeSource, /<span className="section-tag">Focus Map<\/span>/u);
  assert.match(focusLandscapeSource, /<h2>Subject landscape<\/h2>/u);
});

test('subject landscape uses real planner data and suggests a compact subject resource', async () => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  try {
    const { default: FocusLandscape } = await vite.ssrLoadModule('/src/components/FocusLandscape.jsx');
    
    // Check source contracts
    assert.doesNotMatch(focusLandscapeSource, /Difficulty balance/u);
    assert.match(focusLandscapeSource, /landscape-panel-label/u);
    assert.match(focusLandscapeSource, /Suggested material/u);
    assert.match(focusLandscapeSource, /landscape-panel--suggestion/u);
    assert.match(focusLandscapeSource, /className="subject-pie-svg"/u);
    assert.match(focusLandscapeSource, /className="subject-pie-legend"/u);
    assert.match(focusLandscapeSource, /item\.pieValue \/ totalValue/u);
    assert.doesNotMatch(focusLandscapeSource, /custom-bar-chart|custom-bar-row|custom-bar-fill/u);

    // Render with mock data
    const schedule = [{
      date: '2026-09-23',
      tasks: [
        { id: 't1', subjectName: 'Data analytics', task: 'Analytics regression' },
        { id: 't2', subjectName: 'Data analytics', task: 'Analytics trees' },
        { id: 't3', subjectName: 'Quantum computing', task: 'Quantum gates' },
      ],
    }];
    const subjects = [
      { name: 'Data analytics', chapters: 2, difficulty: 'medium' },
      { name: 'Quantum computing', chapters: 2, difficulty: 'hard' },
    ];
    const markup = renderToStaticMarkup(
      React.createElement(FocusLandscape, {
        subjects,
        schedule,
        completed: ['t1'],
      })
    );

    assert.match(markup, /class="subject-pie-chart/u);
    assert.match(markup, /class="subject-pie-svg" role="img"/u);
    assert.match(markup, /Subject workload distribution/u);
    assert.match(markup, /Subject completion legend/u);
    assert.match(markup, /1\/2 tasks/u);
    assert.match(markup, />50%<\/span>/u);
    assert.match(markup, /Top priority/u);
    assert.match(markup, /Suggested material/u);
    assert.doesNotMatch(markup, /Difficulty balance/u);
    assert.doesNotMatch(markup, /legend-dot/u);
    assert.doesNotMatch(markup, /custom-bar-chart|custom-bar-row/u);
    assert.match(markup, /Concept lesson · Quantum computing/u);
    assert.match(markup, /Refer/u);
    assert.match(markup, /youtube\.com\/results/u);
    assert.doesNotMatch(markup, /Close out|Deep focus|full coverage/u);
  } finally {
    await vite.close();
  }
});

test('subject landscape prefers a saved material link for the suggested subject', async () => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  try {
    const { default: FocusLandscape } = await vite.ssrLoadModule('/src/components/FocusLandscape.jsx');
    const markup = renderToStaticMarkup(React.createElement(FocusLandscape, {
      subjects: [{ name: 'Data analytics', chapters: 3, difficulty: 'medium' }],
      schedule: [{ date: '2026-09-23', tasks: [{ id: 't1', subjectName: 'Data analytics', task: 'Regression' }] }],
      materialBookmarks: [{
        title: 'Regression walkthrough',
        provider: 'Course site',
        subject: 'Data analytics',
        href: 'https://example.edu/analytics/regression',
      }],
    }));

    assert.match(markup, /Regression walkthrough/u);
    assert.match(markup, /Data analytics · Course site/u);
    assert.match(markup, /href="https:\/\/example\.edu\/analytics\/regression"/u);
    assert.doesNotMatch(markup, /youtube\.com\/results/u);
  } finally {
    await vite.close();
  }
});

test('subject pie chart animates its SVG segments and remains responsive', () => {
  assert.match(appStyles, /\.subject-pie-chart\s*\{[\s\S]*?grid-template-columns:/u);
  assert.match(appStyles, /\.subject-pie-segment\s*\{[\s\S]*?stroke-dasharray 900ms/u);
  assert.match(appStyles, /\.subject-pie-center\s*\{[\s\S]*?border-radius:\s*50%;/u);
  assert.match(appStyles, /\.subject-pie-legend li:focus-visible\s*\{[\s\S]*?background:/u);
  assert.match(
    appStyles,
    /@media \(max-width: 640px\)[\s\S]*?\.subject-pie-chart\s*\{[\s\S]*?grid-template-columns:\s*1fr;/u,
  );
});

test('shows subject details from pie segments without opening them from legend rows', () => {
  const pieSegment = focusLandscapeSource.match(
    /<circle\s+aria-hidden="true"[\s\S]*?className="subject-pie-segment"[\s\S]*?\/>/u,
  )?.[0] || '';
  const legendStart = focusLandscapeSource.indexOf(
    '<li',
    focusLandscapeSource.indexOf('className="subject-pie-legend"'),
  );
  const legendEnd = focusLandscapeSource.indexOf('</li>', legendStart);
  const legendRow = legendStart >= 0 && legendEnd > legendStart
    ? focusLandscapeSource.slice(legendStart, legendEnd)
    : '';

  assert.match(pieSegment, /onMouseEnter=\{\(event\) => showTooltip\(event, item\)\}/u);
  assert.match(pieSegment, /onMouseLeave=\{\(\) => setTooltipInfo\(null\)\}/u);
  assert.ok(legendRow);
  assert.doesNotMatch(
    legendRow,
    /showTooltip|onBlur|onFocus|onMouseEnter|onMouseLeave|tabIndex/u,
  );
});

test('custom-bar-tooltip is fully opaque and matches all themes', () => {
  assert.match(appStyles, /\.custom-bar-tooltip\s*\{[\s\S]*?background:\s*#ffffff\s*!important;/u);
  assert.match(appStyles, /\.custom-bar-tooltip\s*\{[\s\S]*?opacity:\s*1\s*!important;/u);
  assert.match(appStyles, /\.custom-bar-tooltip\s*\{[\s\S]*?backdrop-filter:\s*none\s*!important;/u);
  assert.match(appStyles, /body\.dark \.custom-bar-tooltip[\s\S]*?background:\s*#101924\s*!important;/u);
  assert.match(appStyles, /body\.has-bg-image:not\(\.dark\) \.custom-bar-tooltip\s*\{[\s\S]*?background:\s*#ffffff\s*!important;/u);
});

test('landscape-panel and suggestion container are translucent with reduced opacity', () => {
  assert.match(appStyles, /\.landscape-panel-label\s*\{[\s\S]*?text-transform:\s*uppercase;/u);
  assert.match(appStyles, /\.landscape-panel\s*\{[\s\S]*?opacity:\s*0\.82;/u);
  assert.match(appStyles, /\.landscape-panel\s*\{[\s\S]*?backdrop-filter:\s*blur/u);
  assert.match(appStyles, /\.landscape-panel--suggestion\s*\{[\s\S]*?opacity:\s*0\.76;/u);
});
