import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const componentSource = readFileSync(new URL('./WarmTooltip.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./WarmTooltip.css', import.meta.url), 'utf8');

test('WarmTooltip keeps the trigger accessible without replacing its handlers', async () => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  try {
    const { default: WarmTooltip, WarmTooltipGroup } = await vite.ssrLoadModule('/src/components/WarmTooltip.jsx');
    const markup = renderToStaticMarkup(React.createElement(WarmTooltipGroup, null,
      React.createElement(WarmTooltip, { content: 'Bold', shortcut: 'Ctrl+B', showFuse: true },
        React.createElement('button', {
          type: 'button',
          'aria-label': 'Bold',
          'aria-describedby': 'existing-description',
        }, 'B')),
    ));

    assert.match(markup, /class="warm-tooltip-trigger"/u);
    assert.match(markup, /aria-label="Bold"/u);
    assert.match(markup, /aria-describedby="existing-description"/u);
    assert.match(markup, /class="warm-tooltip-trigger__fuse"/u);
    assert.doesNotMatch(markup, /role="tooltip"/u);
  } finally {
    await vite.close();
  }
});

test('WarmTooltip retains grouped motion, keyboard dismissal, and reduced-motion handling', () => {
  assert.match(componentSource, /export const WarmTooltipGroup = forwardRef/u);
  assert.match(componentSource, /travel = 320, lean = 0, onWarmChange/u);
  assert.match(componentSource, /useImperativeHandle\(ref, \(\) => \(\{ reset:/u);
  assert.match(componentSource, /useVelocity\(ax\)/u);
  assert.match(componentSource, /useReducedMotion\(\)/u);
  assert.match(componentSource, /if \(event\.key === 'Escape'\) hide\(true\)/u);
  assert.match(componentSource, /document\.addEventListener\('pointerdown', onOutside, true\)/u);
  assert.match(componentSource, /role="tooltip"/u);
  assert.match(componentSource, /createPortal\(/u);
  assert.match(styles, /\.warm-tooltip__surface/u);
  assert.match(styles, /\.warm-tooltip-trigger__fuse\[data-fuse='arming'\]/u);
  assert.match(styles, /prefers-reduced-motion: reduce/u);
});
