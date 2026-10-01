import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createServer } from 'vite';

let vite;
let celebrateCompletion;
let fixture;
const previousAudio = Object.getOwnPropertyDescriptor(globalThis, 'Audio');
before(async () => {
  vite = await createServer({
    configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true },
    plugins: [{
      name: 'completion-celebration-test-fixtures', enforce: 'pre',
      resolveId(id) { return id === 'virtual:celebration-confetti' ? `\0${id}` : null; },
      load(id) { return id === '\0virtual:celebration-confetti' ? `
        export const fixture = { calls: [], fail: false };
        export default function confetti(options) { fixture.calls.push(options); if (fixture.fail) throw Error('Unavailable'); }
      ` : null; },
      transform(source, id) {
        return id.replaceAll('\\', '/').endsWith('/src/utils/completionCelebration.js')
          ? source.replace("from 'canvas-confetti'", "from 'virtual:celebration-confetti'") : null;
      },
    }],
  });
  ({ celebrateCompletion } = await vite.ssrLoadModule('/src/utils/completionCelebration.js'));
  ({ fixture } = await vite.ssrLoadModule('virtual:celebration-confetti'));
});
after(async () => {
  if (previousAudio) Object.defineProperty(globalThis, 'Audio', previousAudio);
  else delete globalThis.Audio;
  await vite?.close();
});

function audioFixture(play = () => Promise.resolve()) {
  const clips = [];
  fixture.calls.length = 0;
  fixture.fail = false;
  globalThis.Audio = class {
    constructor(src) { clips.push({ src, plays: 0 }); }
    play() { clips.at(-1).plays += 1; return play(); }
  };
  return clips;
}

test('completion uses the existing planner confetti settings and success audio once per call', async () => {
  const clips = audioFixture();
  celebrateCompletion();
  celebrateCompletion({ zIndex: 14700 });
  await Promise.resolve();
  assert.deepEqual(fixture.calls, [
    { particleCount: 150, spread: 100 }, { particleCount: 150, spread: 100, zIndex: 14700 },
  ]);
  assert.equal(clips.length, 2);
  assert.ok(clips.every((clip) => /success\.mp3/u.test(clip.src) && clip.plays === 1));
});

test('a confetti failure cannot prevent success audio', () => {
  const clips = audioFixture();
  fixture.fail = true;
  assert.doesNotThrow(() => celebrateCompletion({ zIndex: 14700 }));
  assert.equal(fixture.calls.length, 1);
  assert.equal(clips[0].plays, 1);
});

test('unsupported or blocked audio cannot throw or prevent confetti', async () => {
  audioFixture();
  globalThis.Audio = class { constructor() { throw Error('No audio support'); } };
  assert.doesNotThrow(() => celebrateCompletion());
  assert.equal(fixture.calls.length, 1);
  for (const play of [() => { throw Error('Playback blocked'); }, () => Promise.reject(Error('Autoplay blocked')), () => undefined]) {
    audioFixture(play);
    assert.doesNotThrow(() => celebrateCompletion());
    await Promise.resolve();
    assert.equal(fixture.calls.length, 1);
  }
});
