import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { zipSync } from 'fflate';
import { build } from 'rolldown';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const runtime = resolve(root, 'public/code-matrix/runtime');
const cache = resolve(root, 'scripts/code-matrix/vendor');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifestPath = resolve(runtime, 'manifest.json');
const mode = process.argv[2] || '--check';
const sources = JSON.parse(await readFile(new URL('./sources.json', import.meta.url), 'utf8'));

function within(base, name) {
  const path = resolve(base, name);
  if (!path.startsWith(base + sep)) throw new Error(`Invalid asset path: ${name}`);
  return path;
}
async function filesIn(base) {
  const result = [];
  for (const entry of (await readdir(base, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(base, entry.name);
    if (entry.isDirectory()) result.push(...await filesIn(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}
async function verify() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  for (const item of manifest) {
    const data = await readFile(within(runtime, item.path));
    if (data.length !== item.bytes || sha256(data) !== item.sha256) throw new Error(`Runtime asset changed: ${item.path}`);
  }
  console.log(`Verified ${manifest.length} pinned CodeMatrix assets.`);
}
if (mode === '--check') {
  await verify();
} else if (mode === '--build') {
  await mkdir(cache, { recursive: true });
  for (const source of sources) {
    const file = source.path.startsWith('runtime/') ? within(runtime, source.path.slice(8)) : within(cache, source.path);
    let data;
    try { data = await readFile(file); } catch { /* First download. */ }
    if (!data || sha256(data) !== source.sha256) {
      console.log(`Downloading ${source.path}`);
      const response = await fetch(source.url);
      if (!response.ok) throw new Error(`Download failed (${response.status}): ${source.url}`);
      data = new Uint8Array(await response.arrayBuffer());
      if (sha256(data) !== source.sha256) throw new Error(`Checksum mismatch: ${source.url}`);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, data);
    }
  }
  const vendor = within(cache, 'doppio');
  for (const name of ['package.tgz', 'java_home.tar.gz']) execFileSync('tar', ['-xf', within(vendor, name), '-C', vendor]);
  const jdk = within(vendor, 'java_home');
  const entries = {};
  for (const file of await filesIn(jdk)) entries[relative(jdk, file).replaceAll('\\', '/')] = await readFile(file);
  entries['lib/doppio.jar'] = await readFile(within(vendor, 'package/dist/doppio.jar'));
  await writeFile(within(runtime, 'doppio/java-home.zip'), zipSync(entries, { level: 6, mtime: new Date('2024-01-01T00:00:00Z') }));
  for (const [from, to] of [['package/dist/release/doppio.js', 'doppio.js'], ['package/LICENSE', 'LICENSE'], ['java_home/ASSEMBLY_EXCEPTION', 'ASSEMBLY_EXCEPTION'], ['java_home/THIRD_PARTY_README', 'THIRD_PARTY_README']]) {
    await copyFile(within(vendor, from), within(runtime, 'doppio/' + to));
  }
  const quick = within(root, 'node_modules/@jitl/quickjs-wasmfile-release-asyncify');
  await mkdir(within(runtime, 'javascript'), { recursive: true });
  for (const [from, to] of [['dist/emscripten-module.browser.mjs', 'module.mjs'], ['dist/emscripten-module.wasm', 'emscripten-module.wasm'], ['LICENSE', 'LICENSE.variant']]) {
    await copyFile(within(quick, from), within(runtime, 'javascript/' + to));
  }
  await copyFile(within(root, 'node_modules/quickjs-emscripten/LICENSE'), within(runtime, 'javascript/LICENSE'));
  for (const [input, file] of [['node_modules/quickjs-emscripten-core/dist/index.mjs', 'quickjs.mjs'], ['node_modules/@jitl/quickjs-wasmfile-release-asyncify/dist/ffi.mjs', 'ffi.mjs']]) {
    await build({ input: within(root, input), platform: 'browser', output: { file: within(runtime, 'javascript/' + file), format: 'es', codeSplitting: false } });
  }
  const manifest = [];
  for (const file of await filesIn(runtime)) {
    if (file === manifestPath) continue;
    const data = await readFile(file);
    manifest.push({ path: relative(runtime, file).replaceAll('\\', '/'), bytes: data.length, sha256: sha256(data) });
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  await verify();
} else throw new Error('Use --check or --build.');
