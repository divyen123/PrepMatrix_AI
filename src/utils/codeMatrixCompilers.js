// Serialized into the isolated worker. All source and generated programs stay
// there; the app receives only bounded output and input requests.
export async function prepareCodeMatrixCompiler({ job, assets, append, readLine }) {
  const bytes = async (name) => {
    const response = await fetch(assets + name, { credentials: 'omit' });
    if (!response.ok) throw new Error(`Could not load the compiler (${name}). Please retry.`);
    return new Uint8Array(await response.arrayBuffer());
  };
  const text = async (name) => new TextDecoder().decode(await bytes(name));
  const hasJspi = typeof WebAssembly.Suspending === 'function' && typeof WebAssembly.promising === 'function';
  if (job.language !== 'java' && !hasJspi) throw new Error('C and C++ need a browser with WebAssembly JSPI. Please update Chrome or Edge, or use another browser that supports JSPI.');
  let pending = new Uint8Array();
  let offset = 0;
  let eof = false;
  const fill = async () => {
    if (offset < pending.length || eof) return;
    const line = await readLine();
    eof = line === null;
    pending = new TextEncoder().encode(eof ? '' : line + '\n');
    offset = 0;
  };

  if (job.language === 'java') {
    // Fetch with CORS: classic worker importScripts uses no-cors and opaque
    // origins can be blocked by the browser's response isolation checks.
    new Function(await text('doppio/browserfs.min.js')).call(globalThis);
    new Function(await text('doppio/doppio.js')).call(globalThis);
    const BFS = globalThis.BrowserFS;
    const archive = await bytes('doppio/java-home.zip');
    const Buffer = BFS.BFSRequire('buffer').Buffer;
    const root = new BFS.FileSystem.MountableFileSystem();
    root.mount('/tmp', new BFS.FileSystem.InMemory());
    root.mount('/work', new BFS.FileSystem.InMemory());
    const zip = await new Promise((resolve) => BFS.FileSystem.ZipFS.computeIndex(new Buffer(archive), (index) => resolve(new BFS.FileSystem.ZipFS(index, 'java-home.zip'))));
    root.mount('/java_home', zip);
    BFS.initialize(root);
    const fs = BFS.BFSRequire('fs');
    const process = BFS.BFSRequire('process');
    process.initializeTTYs();
    process.stdout.on('data', (value) => append('stdout', value.toString()));
    process.stderr.on('data', (value) => append('stderr', value.toString()));
    const originalOnce = process.stdin.once.bind(process.stdin);
    let requesting = false;
    process.stdin.once = (event, listener) => {
      const value = originalOnce(event, listener);
      // Doppio subscribes only after both sized and unsized reads are empty.
      // A short buffered line must not trigger another prompt prematurely.
      if (event === 'readable' && !requesting) {
        requesting = true;
        Promise.resolve().then(readLine).then((line) => {
          requesting = false;
          process.stdin.write(line === null ? Buffer.from([0]) : Buffer.from(line + '\n'));
        });
      }
      return value;
    };
    fs.writeFileSync('/work/Main.java', Buffer.from(job.code));
    const newVm = () => new Promise((resolve, reject) => new globalThis.Doppio.VM.JVM({
      doppioHomePath: '/doppio', javaHomePath: '/java_home',
      bootstrapClasspath: ['rt.jar', 'doppio.jar', 'resources.jar', 'charsets.jar', 'jce.jar', 'jsse.jar', 'tools.jar'].map((name) => '/java_home/lib/' + name),
      classpath: ['/work'], nativeClasspath: [], tmpDir: '/tmp', responsiveness: 50,
    }, (error, vm) => error ? reject(error) : resolve(vm)));
    const compiler = await newVm();
    const exitCode = await new Promise((resolve) => compiler.runClass('com.sun.tools.javac.Main', ['-XDuseOptimizedZip=false', '-proc:none', '-g', '-encoding', 'UTF-8', '-d', '/work', '/work/Main.java'], resolve));
    if (exitCode !== 0) throw new Error('Java compilation failed. Check the errors above.');
    const program = await newVm();
    return () => new Promise((resolve, reject) => program.runClass('Main', [], (exitCode) => exitCode === 0 ? resolve() : reject(new Error('Java exited with code ' + exitCode + '.'))));
  }

  const API = new Function('console', await text('clang/shared.js') + '\nreturn API;')({ log() {} });
  const api = new API({
    readBuffer: async (name) => (await bytes('clang/' + name)).buffer,
    compileStreaming: async (name) => WebAssembly.compile(await bytes('clang/' + name)),
    hostWrite: (value) => { if (value !== '\n') append('stderr', value.replaceAll(String.fromCharCode(27), '')); },
  });
  api.hostLog = () => {};
  api.hostLogAsync = (_message, promise) => promise;
  await api.ready;
  const name = job.language === 'c' ? 'main.c' : 'main.cpp';
  api.memfs.addFile(name, new TextEncoder().encode(job.code));
  const clang = await api.getModule('clang');
  await api.run(clang, 'clang', '-cc1', '-emit-obj', ...api.clangCommonArgs.filter((arg) => arg !== '-fcolor-diagnostics'),
    '-O0', '-o', 'main.o', '-x', job.language === 'c' ? 'c' : 'c++', job.language === 'c' ? '-std=c11' : '-std=c++17', name);
  const linker = await api.getModule('lld');
  await api.run(linker, 'wasm-ld', '--no-threads', '--export=fflush', '--max-memory=268435456', '-z', 'stack-size=1048576',
    '-Llib/wasm32-wasi', 'lib/wasm32-wasi/crt1.o', 'main.o', '-lc', '-lc++', '-lc++abi', '-o', 'main.wasm');
  const module = await WebAssembly.compile(api.memfs.getFileContents('main.wasm'));
  let memory;
  let instance;
  const view = () => new DataView(memory.buffer);
  const write32 = (ptr, value) => view().setUint32(ptr, value, true);
  const decoders = [null, new TextDecoder(), new TextDecoder()];
  const wasi = {
    args_sizes_get: (count, size) => { write32(count, 0); write32(size, 0); return 0; },
    args_get: () => 0,
    environ_sizes_get: (count, size) => { write32(count, 0); write32(size, 0); return 0; },
    environ_get: () => 0,
    fd_write(fd, iovs, count, written) {
      if (fd !== 1 && fd !== 2) return 8;
      let size = 0;
      for (let i = 0; i < count; i++) {
        const ptr = view().getUint32(iovs + i * 8, true);
        const len = view().getUint32(iovs + i * 8 + 4, true);
        append(fd === 1 ? 'stdout' : 'stderr', decoders[fd].decode(new Uint8Array(memory.buffer, ptr, len), { stream: true }));
        size += len;
      }
      write32(written, size); return 0;
    },
    fd_read: new WebAssembly.Suspending(async (fd, iovs, count, read) => {
      if (fd !== 0) return 8;
      instance.exports.fflush(0);
      if (count) await fill();
      let size = 0;
      for (let i = 0; i < count && offset < pending.length; i++) {
        const ptr = view().getUint32(iovs + i * 8, true);
        const len = Math.min(view().getUint32(iovs + i * 8 + 4, true), pending.length - offset);
        new Uint8Array(memory.buffer, ptr, len).set(pending.subarray(offset, offset + len));
        offset += len; size += len;
      }
      write32(read, size); return 0;
    }),
    fd_fdstat_get(fd, ptr) { if (fd > 2) return 8; new Uint8Array(memory.buffer, ptr, 24).fill(0); view().setUint8(ptr, 2); return 0; },
    fd_prestat_get: () => 8,
    fd_prestat_dir_name: () => 8,
    fd_fdstat_set_flags: () => 0,
    fd_filestat_get: () => 52,
    path_open: () => 52,
    path_filestat_get: () => 52,
    fd_close: () => 0,
    fd_seek: () => 70,
    fd_tell: () => 70,
    clock_time_get(_id, _precision, ptr) { view().setBigUint64(ptr, BigInt(Date.now()) * 1000000n, true); return 0; },
    random_get(ptr, length) { const target = new Uint8Array(memory.buffer, ptr, length); for (let i = 0; i < length; i += 65536) crypto.getRandomValues(target.subarray(i, i + 65536)); return 0; },
    proc_exit(code) { throw Object.assign(new Error(`Program exited with code ${code}.`), { exitCode: code }); },
  };
  for (const item of WebAssembly.Module.imports(module)) {
    if (!['wasi_unstable', 'wasi_snapshot_preview1'].includes(item.module) || typeof wasi[item.name] === 'undefined') {
      throw new Error(`The browser does not support ${item.module}.${item.name}.`);
    }
  }
  instance = await WebAssembly.instantiate(module, { wasi_unstable: wasi, wasi_snapshot_preview1: wasi });
  memory = instance.exports.memory;
  return async () => {
    try { await WebAssembly.promising(instance.exports._start)(); }
    catch (error) { if (error.exitCode !== 0) throw error; }
  };
}
