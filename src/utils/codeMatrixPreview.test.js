import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { buildCodeMatrixPreview, instrumentCodeMatrixPreview } from './codeMatrixRuntime.js';

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
test('web preview keeps source data inside its bootstrap and disables external resources', () => {
  const preview = buildCodeMatrixPreview({ html: '<h1>Page</h1>', css: '</script><script>attack()</script>', javascript: 'console.log("</script>")', channel: 'test' });
  assert.match(preview, /connect-src 'none'/);
  assert.match(preview, /frame-src 'none'/);
  assert.match(preview, /script-src 'nonce-/);
  assert.doesNotMatch(preview, /<script>attack/);
  assert.equal((preview.match(/<script /g) || []).length, 1);
});
test('syntax failures become visible preview diagnostics', () => {
  assert.match(buildCodeMatrixPreview({ javascript: 'const = ;', channel: 'test' }), /JavaScript syntax error/);
});
