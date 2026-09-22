import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const momentumViewsStyles = readFileSync(
  new URL('./MomentumViews.css', import.meta.url),
  'utf8',
);

test('GlobalMomentumCard does not render gamification-orb and overrides yellow glow in styles', async () => {
  const vite = await createServer({
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  try {
    const { default: GlobalMomentumCard } = await vite.ssrLoadModule(
      '/src/components/GlobalMomentumCard.jsx',
    );

    const markup = renderToStaticMarkup(
      React.createElement(GlobalMomentumCard, {
        momentum: {
          successfulCodeRuns: 8,
          global: { breakdown: { coding: 50 } },
        },
      }),
    );

    // Does not render gamification-orb
    assert.doesNotMatch(markup, /gamification-orb/u);
    assert.match(markup, /class="battle-insights-trigger"/u);
    assert.match(markup, /View CodeMatrix rewards/u);

    // Stylesheet overrides yellow background glow and hides orb
    assert.match(
      momentumViewsStyles,
      /\.global-momentum-card\s*\{[\s\S]*?var\(--surface\)\s*!important;/u,
    );
    assert.doesNotMatch(
      momentumViewsStyles,
      /\.global-momentum-card\s*\{[\s\S]*?rgba\(245,\s*184,\s*71/u,
    );
    assert.match(
      momentumViewsStyles,
      /\.global-momentum-card > \.gamification-orb\s*\{[\s\S]*?display:\s*none\s*!important;/u,
    );
  } finally {
    await vite.close();
  }
});
