// Runs only inside the opaque-origin worker. QuickJS Asyncify lets synchronous
// prompt()/readLine() suspend without changing the student's JavaScript.
export async function prepareCodeMatrixJavaScript({ assets, code, append, readLine }) {
  const importModule = new Function('url', 'return import(url)');
  const [{ newQuickJSAsyncWASMModuleFromVariant }, { QuickJSAsyncFFI }, { default: loader }] = await Promise.all([
    importModule(assets + 'javascript/quickjs.mjs'), importModule(assets + 'javascript/ffi.mjs'), importModule(assets + 'javascript/module.mjs'),
  ]);
  const module = await newQuickJSAsyncWASMModuleFromVariant({ type: 'async', importFFI: async () => QuickJSAsyncFFI,
    importModuleLoader: async () => (options) => loader({ ...options, locateFile: () => assets + 'javascript/emscripten-module.wasm' }),
  });
  const vm = module.newContext();
  const runtime = vm.runtime;
  runtime.setMemoryLimit(64 * 1024 * 1024);
  runtime.setMaxStackSize(512 * 1024);
  const timers = new Map();
  let timerId = 0;
  const register = (name, fn) => fn.consume((handle) => vm.setProp(vm.global, name, handle));
  register('__cmWrite', vm.newFunction('__cmWrite', (stream, text) => { append(vm.getString(stream) === 'stderr' ? 'stderr' : 'stdout', vm.getString(text).slice(0, 65536)); }));
  for (const name of ['prompt', 'readLine']) register(name, vm.newAsyncifiedFunction(name, async (message) => {
    if (message && vm.typeof(message) !== 'undefined') append('stdout', String(vm.dump(message)).slice(0, 65536));
    const line = await readLine();
    return line === null ? vm.null : vm.newString(line);
  }));
  register('setTimeout', vm.newFunction('setTimeout', (callback, delay) => {
    const id = ++timerId;
    vm.setProp(vm.global, `__cmTimer${id}`, callback);
    timers.set(id, performance.now() + Math.min(10000, Math.max(0, vm.getNumber(delay)) || 0));
    return vm.newNumber(id);
  }));
  register('clearTimeout', vm.newFunction('clearTimeout', (id) => { timers.delete(vm.getNumber(id)); }));
  vm.unwrapResult(vm.evalCode(`
    (() => {
      const write = __cmWrite;
      function format(value, depth=0, seen=new Set()) {
        if (typeof value === 'string') return value.slice(0, 65536);
        if (value === null || typeof value !== 'object') return String(value).slice(0, 1024);
        if (seen.has(value)) return '[Circular]';
        if (depth > 1) return Array.isArray(value) ? '[Array]' : '[Object]';
        seen.add(value);
        const entries = Object.keys(value).slice(0, 20).map(key => {
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          const item = 'value' in descriptor ? format(descriptor.value, depth+1, seen) : '[Getter]';
          return Array.isArray(value) ? item : key.slice(0,128) + ': ' + item;
        });
        seen.delete(value);
        return (Array.isArray(value) ? '[' + entries.join(', ') + ']' : '{' + entries.join(', ') + '}').slice(0,65536);
      }
      globalThis.console = {};
      for (const level of ['log','info','debug','warn','error','dir','table']) {
        console[level] = (...args) => write(['warn','error'].includes(level) ? 'stderr' : 'stdout', args.slice(0,40).map(value => format(value)).join(' ') + '\\n');
      }
      console.assert = (value,...args) => { if (!value) console.error('Assertion failed:',...args); };
      console.clear = () => {};
      globalThis.print = console.log;
    })();
  `)).dispose();

  // The pinned release FFI omits cwrap's async option for this export (#239).
  // Bind it explicitly: otherwise it returns before stdin resumes and callers
  // free pointers that the suspended job still owns.
  // https://github.com/justjake/quickjs-emscripten/issues/239
  const executePending = vm.module.cwrap('QTS_ExecutePendingJob', 'number', ['number', 'number', 'number'], { async: true });
  const executeJob = async () => {
    const ptr = runtime.memory.newMutablePointerArray(1);
    const result = await executePending(runtime.rt.value, 1, ptr.value.ptr);
    // A job can grow Wasm memory, invalidating the previously captured view.
    const context = new DataView(vm.module.HEAPU8.buffer).getUint32(ptr.value.ptr, true);
    ptr.dispose();
    if (!context) { runtime.ffi.QTS_FreeValuePointerRuntime(runtime.rt.value, result); return; }
    const handle = vm.getMemory(runtime.rt.value).heapValueHandle(result);
    try { if (vm.typeof(handle) !== 'number') { const error = vm.dump(handle); throw new Error(`${error?.message || error}\n${error?.stack || ''}`); } }
    finally { handle.dispose(); }
  };
  return async () => {
    let value;
    try {
      value = vm.unwrapResult(await vm.evalCodeAsync(`(async function(){\n${code}\n})()`, 'script.js'));
      let outcome = vm.getPromiseState(value);
      while (outcome.type === 'pending') {
        if (runtime.hasPendingJob()) await executeJob();
        else if (timers.size) {
          const [id, at] = [...timers].sort((a, b) => a[1] - b[1])[0];
          await new Promise((resolve) => setTimeout(resolve, Math.max(0, at - performance.now())));
          if (timers.delete(id)) vm.unwrapResult(await vm.evalCodeAsync(`__cmTimer${id}(); delete globalThis.__cmTimer${id};`)).dispose();
        } else await new Promise((resolve) => setTimeout(resolve, 20));
        outcome = vm.getPromiseState(value);
      }
      if (outcome.type === 'rejected') {
        const error = vm.dump(outcome.error); outcome.error.dispose();
        throw new Error(`${error?.name || 'Error'}: ${error?.message || String(error)}\n${error?.stack || ''}`);
      }
      if (outcome.type === 'fulfilled') {
        if (vm.typeof(outcome.value) !== 'undefined') append('stdout', String(vm.dump(outcome.value)) + '\n');
        if (!outcome.notAPromise) outcome.value.dispose();
      }
    } catch (error) {
      // The async wrapper adds one source line. Keep editor error locations
      // aligned with the student's file, including errors after an await.
      const details = String(error?.cause?.stack || error?.message || error);
      throw new Error(details.replace(/script\.js:(\d+)/g, (_match, line) => `script.js:${Math.max(1, Number(line) - 1)}`));
    } finally {
      value?.dispose();
      timers.clear();
      vm.dispose();
    }
  };
}
