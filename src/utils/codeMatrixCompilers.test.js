import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { prepareCodeMatrixCompiler } from './codeMatrixCompilers.js';

test('Java compiles once and prepares fresh JVMs, files and stdin for every test case', { timeout: 120_000 }, async () => {
  const previous = { fetch: globalThis.fetch, BrowserFS: globalThis.BrowserFS, Doppio: globalThis.Doppio };
  const fetched = [];
  let lines = [];
  let output = '';
  let diagnostics = '';
  globalThis.fetch = async (path) => {
    const name = path.replace('https://runtime.invalid/', '');
    fetched.push(name);
    return new Response(await readFile(new URL(`../../public/code-matrix/runtime/${name}`, import.meta.url)));
  };
  try {
    const factory = await prepareCodeMatrixCompiler({ reusable: true, assets: 'https://runtime.invalid/',
      job: { language: 'java', code: `
import java.io.*;
import java.util.Scanner;
public class Main {
    static class Helper { static int count = 0; }
    public static void main(String[] args) throws Exception {
        Scanner scanner = new Scanner(System.in);
        System.out.println(++Helper.count + ":" + scanner.nextInt() + ":" + new File("/work/leak").exists() + ":" + new File("/tmp/leak").exists());
        new File("/work/leak").createNewFile();
        new File("/tmp/leak").createNewFile();
        new FileOutputStream("/work/Main$Helper.class").write(0);
        if (scanner.nextInt() == 1) System.out.println(scanner.hasNext());
    }
}` }, append: (stream, text) => { if (stream === 'stdout') output += text; else diagnostics += text; },
      readLine: async () => lines.shift() ?? null,
    });
    const original = globalThis.Doppio.VM.JVM.prototype.runClass;
    const executions = [];
    globalThis.Doppio.VM.JVM.prototype.runClass = function (name, args, callback) {
      executions.push(name);
      return original.call(this, name, args, callback);
    };
    for (const [input, expected] of [
      [['7 0', 'unused'], '1:7:false:false\n'],
      [['9 1'], '1:9:false:false\nfalse\n'],
      [['-2 1'], '1:-2:false:false\nfalse\n'],
    ]) {
      lines = [...input]; output = ''; diagnostics = '';
      const execute = await factory();
      await execute();
      assert.equal(output, expected, diagnostics);
    }
    assert.deepEqual(executions, ['Main', 'Main', 'Main']);
    assert.deepEqual(fetched, ['doppio/browserfs.min.js', 'doppio/doppio.js', 'doppio/java-home.zip']);
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.BrowserFS === undefined) delete globalThis.BrowserFS; else globalThis.BrowserFS = previous.BrowserFS;
    if (previous.Doppio === undefined) delete globalThis.Doppio; else globalThis.Doppio = previous.Doppio;
  }
});

function wasiFixture() {
  const state = { compiled: 0, instantiated: 0, compilerRuns: [], fetched: [], inputs: [], output: [], reads: 0 };
  const context = vm.createContext({ Uint8Array, DataView, TextEncoder, TextDecoder, Promise, Date,
    crypto: { getRandomValues: (bytes) => bytes.fill(1) },
    fetch: async (path) => {
      state.fetched.push(path);
      const source = `class API {
        constructor() { this.ready = Promise.resolve(); this.clangCommonArgs = []; this.memfs = { addFile() {}, getFileContents: () => new Uint8Array([0]) }; }
        async getModule(name) { return name; }
        async run(...args) { globalThis.recordCompilerRun(args); }
      }`;
      return { ok: true, arrayBuffer: async () => new TextEncoder().encode(source).buffer };
    },
    recordCompilerRun: (args) => state.compilerRuns.push(args),
    WebAssembly: {
      Suspending: function (callback) { return callback; }, promising: (callback) => callback,
      compile: async () => { state.compiled++; return {}; },
      Module: { imports: () => [] },
      instantiate: async (_module, imports) => {
        state.instantiated++;
        const memory = { buffer: new ArrayBuffer(65_536) };
        const wasi = imports.wasi_snapshot_preview1;
        return { exports: { memory, fflush() {}, async _start() {
          const view = new DataView(memory.buffer);
          assert.equal(view.getUint32(1000, true), 0, 'fresh WASM memory on every execution');
          view.setUint32(1000, 77, true);
          view.setUint32(16, 64, true); view.setUint32(20, 32, true);
          await wasi.fd_read(0, 16, 1, 8);
          const size = view.getUint32(8, true);
          view.setUint32(20, size, true);
          wasi.fd_write(1, 16, 1, 12);
          view.setUint32(20, 32, true);
          await wasi.fd_read(0, 16, 1, 8);
          assert.equal(view.getUint32(8, true), 0, 'each execution reaches its own EOF');
          wasi.proc_exit(0);
        } } };
      },
    },
  });
  const prepare = vm.runInContext(`(${prepareCodeMatrixCompiler.toString()})`, context);
  return { state, prepare, options: {
    job: { language: 'c', code: 'int main(void) { return 0; }' }, assets: 'https://runtime.invalid/',
    append: (_stream, text) => state.output.push(text),
    readLine: async () => { state.reads++; return state.inputs.shift() ?? null; },
  } };
}

test('reusable C compilation instantiates fresh memory and resets stdin and EOF for each test', async () => {
  const { state, prepare, options } = wasiFixture();
  const factory = await prepare({ ...options, reusable: true });
  for (const input of ['7', '9', '-2']) {
    state.inputs = [input];
    await (await factory())();
  }
  assert.equal(state.compiled, 1);
  assert.equal(state.instantiated, 3);
  assert.equal(state.compilerRuns.length, 2, 'clang and linker execute once');
  assert.equal(state.fetched.length, 1, 'compiler API is loaded once');
  assert.equal(state.reads, 6);
  assert.equal(state.output.join(''), '7\n9\n-2\n');
});

test('default compiler preparation still returns the existing single-run execution function', async () => {
  const { state, prepare, options } = wasiFixture();
  state.inputs = ['5'];
  const execute = await prepare(options);
  assert.equal(state.instantiated, 1, 'preparation instantiates before the execution timer starts');
  await execute();
  assert.equal(state.instantiated, 1);
  assert.equal(state.output.join(''), '5\n');
});

test('bundled C and C++ compile once and pass five parity cases with fresh static memory', {
  skip: typeof WebAssembly.Suspending !== 'function' || typeof WebAssembly.promising !== 'function', timeout: 120_000,
}, async () => {
  const previousFetch = globalThis.fetch;
  const fetched = [];
  globalThis.fetch = async (path) => {
    const name = path.replace('https://runtime.invalid/', '');
    fetched.push(name);
    return new Response(await readFile(new URL(`../../public/code-matrix/runtime/${name}`, import.meta.url)));
  };
  try {
    for (const [language, code] of [
      ['c', '#include <stdio.h>\nstatic int runs;\nint main(void) { long long n; scanf("%lld", &n); printf("%d:%s\\n", ++runs, n % 2 == 0 ? "Even" : "Odd"); return 0; }'],
      ['cpp', '#include <iostream>\nstatic int runs;\nint main() { long long n; std::cin >> n; std::cout << ++runs << ":" << (n % 2 == 0 ? "Even" : "Odd") << "\\n"; return 0; }'],
    ]) {
      let lines = [];
      let output = '';
      let diagnostics = '';
      const factory = await prepareCodeMatrixCompiler({ reusable: true,
        job: { language, code }, assets: 'https://runtime.invalid/',
        readLine: async () => lines.shift() ?? null,
        append: (stream, text) => { if (stream === 'stdout') output += text; else diagnostics += text; },
      });
      for (const input of [0, 1, 2, -3, -10]) {
        lines = [String(input)]; output = ''; diagnostics = '';
        await (await factory())();
        assert.equal(output, `1:${input % 2 === 0 ? 'Even' : 'Odd'}\n`, `${language}: ${diagnostics}`);
      }
    }
    for (const name of ['clang/shared.js', 'clang/memfs', 'clang/sysroot.tar', 'clang/clang', 'clang/lld']) {
      assert.equal(fetched.filter((item) => item === name).length, 2, `${name} loads once per language, rather than per case`);
    }
  } finally { globalThis.fetch = previousFetch; }
});
