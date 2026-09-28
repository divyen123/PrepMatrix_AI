import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';
import { parse as parseHtml } from 'parse5';
import { buildCodeMatrixPreview, instrumentCodeMatrixPreview } from './codeMatrixRuntime.js';

function descendants(node, name) {
  return [node, ...(node.childNodes || []).flatMap((child) => descendants(child, name))]
    .filter((child) => child.nodeName === name);
}

function attribute(node, name) {
  return node.attrs?.find((attr) => attr.name === name)?.value;
}

function scriptText(node) {
  return (node.childNodes || []).map((child) => child.value || '').join('');
}

test('web instrumentation preserves nested functions, loop control and source lines', () => {
  const source = 'let n=0;\nfor(let i=0;i<3;i++) for(let j=0;j<2;j++) n++;\nconst f = x => y => ({sum:x+y+n});\nf(1)(2).sum;';
  let checks = 0;
  const transformed = instrumentCodeMatrixPreview(source, 'guard');
  assert.equal(transformed.split('\n').length, source.split('\n').length);
  assert.equal(vm.runInNewContext(transformed, { guard: () => { checks++; } }), 9);
  assert.ok(checks >= 11);
});
test('web loop and recursion guards terminate runaway student code', () => {
  for (const source of ['while(true) {}', 'for(;;);', 'do {} while(true);', 'function recurse(){recurse()} recurse();']) {
    let checks = 0;
    assert.throws(() => vm.runInNewContext(instrumentCodeMatrixPreview(source, 'guard'), { guard() { if (++checks > 100) throw Error('budget'); } }, { timeout: 500 }), /budget/);
  }
});
test('web preview keeps source data inside its bootstrap and disables external resources', async () => {
  const preview = await buildCodeMatrixPreview({ html: '<!-- <head> --><h1>Page</h1><script src="https://example.test/steal.js"></script>', css: '</script><script>attack()</script>', javascript: 'console.log("</script>")', channel: 'test' });
  assert.match(preview, /connect-src 'none'/);
  assert.match(preview, /frame-src 'none'/);
  assert.match(preview, /script-src 'sha256-/);
  assert.match(preview, /script-src-attr 'none'/);
  assert.doesNotMatch(preview, /<script>attack/);
  const document = parseHtml(preview);
  assert.equal(descendants(document, 'script').length, 2);
  const head = descendants(document, 'head')[0];
  assert.equal(attribute(head.childNodes[2], 'http-equiv'), 'Content-Security-Policy');
  assert.match(attribute(head.childNodes[2], 'content'), /script-src 'sha256-/);
  assert.doesNotMatch(attribute(head.childNodes[2], 'content'), /https:\/\/example\.test/);
});
test('syntax failures become visible preview diagnostics', async () => {
  assert.match(await buildCodeMatrixPreview({ javascript: 'const = ;', channel: 'test' }), /JavaScript syntax error/);
});

test('HTML example can invoke speech synthesis from a guarded inline button handler', async () => {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Code with Divyen!</title></head>
<body><div class="box"><input type="text" id="text" placeholder="Enter something">
<button onclick="speak()">Speak</button>
<script>function speak() { speechSynthesis.speak(new SpeechSynthesisUtterance(text.value)); }</script>
</div></body></html>`;
  const preview = await buildCodeMatrixPreview({ html, javascript: '', channel: 'speech-example' });
  const document = parseHtml(preview);
  const csp = attribute(descendants(document, 'meta').find((node) => attribute(node, 'http-equiv') === 'Content-Security-Policy'), 'content');
  const handler = attribute(descendants(document, 'button')[0], 'onclick');
  const [bootstrap, inline] = descendants(document, 'script').map(scriptText);
  assert.match(csp, /default-src 'none';.*connect-src 'none';.*script-src-attr 'unsafe-hashes'/);
  assert.ok(csp.includes(`'sha256-${createHash('sha256').update(handler).digest('base64')}'`));
  assert.ok(csp.includes(`'sha256-${createHash('sha256').update(inline).digest('base64')}'`));
  assert.match(handler, /cmGuard_[a-f0-9]+\(\);speak\(\)/);
  assert.match(inline, /cmGuard_[a-f0-9]+\(\);/);
  const spoken = [];
  const listeners = new Map();
  const context = { parent: { postMessage() {} }, console: {}, performance: { now: () => 0 },
    setTimeout: () => 1, text: { value: 'Divyen' },
    speechSynthesis: { speak: (utterance) => spoken.push(utterance.text) },
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    window: { addEventListener: (type, listener) => listeners.set(type, listener) },
  };
  vm.runInNewContext(`${bootstrap}\n${inline}\n${handler}`, context);
  assert.deepEqual(spoken, ['Divyen']);
  assert.equal(listeners.has('DOMContentLoaded'), true);
});
