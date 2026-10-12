import { readFile, writeFile } from 'node:fs/promises';
import { CODE_MATRIX_RUNTIMES } from '../../src/utils/codeMatrixWorkerSource.js';

const mode = process.argv[2] || '--check';
if (!['--build', '--check'].includes(mode) || process.argv.length > 3) {
  throw new Error('Use --build or --check.');
}

const runtime = new URL(CODE_MATRIX_RUNTIMES.pyodide);
const version = runtime.pathname.match(/^\/pyodide\/v(\d+\.\d+\.\d+)\/full\/$/)?.[1];
if (!version || runtime.protocol !== 'https:' || runtime.search || runtime.hash || runtime.username || runtime.password) {
  throw new Error('The Python runtime must use a pinned HTTPS Pyodide release URL.');
}

const lockUrl = new URL('pyodide-lock.json', runtime);
const response = await fetch(lockUrl, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`Could not load Pyodide package lock (${response.status}).`);
const lock = await response.json();
if (lock.info?.version !== version) {
  throw new Error(`Pyodide package lock version ${lock.info?.version} does not match runtime ${version}.`);
}
if (!lock.packages || typeof lock.packages !== 'object' || Array.isArray(lock.packages)) {
  throw new Error('The Pyodide package lock has no package entries.');
}

const filenames = Object.values(lock.packages).map((entry) => {
  const filename = entry?.file_name;
  // Test archives are also exact lockfile assets; never accept paths or URLs.
  if (typeof filename !== 'string' || filename.includes('..')
    || !/^[A-Za-z0-9_][A-Za-z0-9_.+-]*(?:\.(?:whl|zip)|-tests\.tar)$/.test(filename)) {
    throw new Error(`Unsafe Pyodide package filename: ${String(filename)}`);
  }
  return filename;
});
if (!filenames.length) throw new Error('The Pyodide package lock is empty.');
const files = [...new Set(filenames)].sort();
const importRoots = Object.values(lock.packages)
  .filter((entry) => entry.file_name.endsWith('.whl'))
  .flatMap((entry) => {
    if (!Array.isArray(entry.imports) || entry.imports.some((name) => typeof name !== 'string')) {
      throw new Error(`Invalid Pyodide package imports: ${entry.name}`);
    }
    // Some upstream entries use distribution names containing hyphens. They
    // cannot appear in Python import statements and are excluded from warmup.
    return entry.imports
      .filter((name) => /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(name))
      .map((name) => name.split('.')[0]);
  });
const imports = [...new Set(importRoots)].sort();
const source = `// Generated from ${lockUrl.href}\n`
  + '// Refresh: node scripts/code-matrix/python-packages.mjs --build\n'
  + '// Verify against the pinned upstream lock: node scripts/code-matrix/python-packages.mjs --check\n'
  + `export const CODE_MATRIX_PYTHON_PACKAGE_VERSION = '${version}';\n\n`
  + 'export const CODE_MATRIX_PYTHON_PACKAGE_FILES = Object.freeze([\n'
  + files.map((filename) => `  '${filename}',`).join('\n')
  + '\n]);\n\n'
  + '// Valid root module names for warming installed bundled imports before execution.\n'
  + 'export const CODE_MATRIX_PYTHON_PACKAGE_IMPORTS = Object.freeze([\n'
  + imports.map((name) => `  '${name}',`).join('\n')
  + '\n]);\n';
const output = new URL('../../src/utils/codeMatrixPythonPackages.js', import.meta.url);
if (mode === '--build') {
  await writeFile(output, source);
  console.log(`Generated ${files.length} exact Pyodide ${version} package asset filenames and ${imports.length} import roots.`);
} else {
  const saved = await readFile(output, 'utf8');
  if (saved.replace(/\r\n/g, '\n') !== source) {
    throw new Error('Pyodide package asset filenames are stale. Run node scripts/code-matrix/python-packages.mjs --build.');
  }
  console.log(`Verified ${files.length} exact Pyodide ${version} package asset filenames and ${imports.length} import roots.`);
}
