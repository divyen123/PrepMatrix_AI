import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const source = readFileSync(new URL('./SloshGauge.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./SloshGauge.css', import.meta.url), 'utf8');

test('SloshGauge exposes a themed, horizontal and accessible slider', async () => {
  const vite = await createServer({
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  try {
    const { default: SloshGauge } = await vite.ssrLoadModule('/src/components/SloshGauge.jsx');
    const markup = renderToStaticMarkup(
      React.createElement(SloshGauge, {
        value: 37.5,
        interactive: true,
        ariaLabel: 'Background Image Blur',
        ariaValueText: (percentage) => `${percentage / 5} pixels of blur`,
        showValue: false,
        ticks: 0,
      }),
    );

    assert.match(markup, /role="slider"/u);
    assert.match(markup, /aria-orientation="horizontal"/u);
    assert.match(markup, /aria-label="Background Image Blur"/u);
    assert.match(markup, /aria-valuenow="37\.5"/u);
    assert.match(markup, /aria-valuetext="7\.5 pixels of blur"/u);
    assert.match(markup, /tabindex="0"/u);
    assert.match(markup, /--sg-w:100%/u);
    assert.match(markup, /--sg-h:42px/u);
    assert.doesNotMatch(markup, /slosh-gauge__value/u);
    assert.doesNotMatch(markup, /slosh-gauge__ticks/u);

    const disabled = renderToStaticMarkup(
      React.createElement(SloshGauge, { interactive: true, disabled: true }),
    );
    assert.match(disabled, /aria-disabled="true"/u);
    assert.doesNotMatch(disabled, /tabindex="0"/u);
    assert.match(styles, /width: var\(--sg-w\);[\s\S]*?height: var\(--sg-h\);/u);
    assert.match(styles, /var\(--accent, currentColor\)/u);
  } finally {
    await vite.close();
  }
});

test('SloshGauge maps pointer and keyboard input across the horizontal track', () => {
  assert.match(source, /clientX - rectangle\.left/u);
  assert.match(source, /aria-orientation=\{interactive \? 'horizontal'/u);
  assert.match(source, /ArrowRight: current \+ delta/u);
  assert.match(source, /ArrowLeft: current - delta/u);
  assert.match(source, /snapToStep\(clamp\(fraction \* 100/u);
  assert.match(source, /prefers-reduced-motion: reduce/u);
  assert.match(source, /cancelAnimationFrame\(current\.frame\)/u);
});
