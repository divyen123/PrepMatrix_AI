// Only serialize this module's worker entry point; never invoke it in the app.
export const CODE_MATRIX_LIMITS = Object.freeze({
  bootMs: 45_000,
  runMs: 10_000,
  sourceChars: 256_000,
  inputChars: 64_000,
  outputChars: 65_536, // Per stream, including the truncation marker (UTF-16).
  tables: 8,
  rows: 200, // Per table.
  columns: 40,
  cellChars: 1024,
  tableChars: 262_144, // Across all column names and string cells.
  cells: 8000, // Across all tables.
  statements: 100,
  traceEntries: 200,
  locals: 20,
  localChars: 512,
});

export const CODE_MATRIX_RUNTIMES = Object.freeze({
  pyodide: 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/',
  sql: 'https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/',
});

export function createCodeMatrixLineReader(input) {
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  // A terminal newline terminates the previous line; it is not another input.
  if (lines.at(-1) === '') lines.pop();
  let index = 0;
  return () => index < lines.length ? lines[index++] : null;
}

export function boundCodeMatrixText(value, limit) {
  const text = typeof value === 'string' ? value : '';
  const marker = '\n[truncated]';
  return text.length <= limit ? text : text.slice(0, Math.max(0, limit - marker.length)) + marker.slice(0, limit);
}

// Also applied in the parent: messages from the sandbox are untrusted data.
export function normalizeCodeMatrixResult(raw, limits = CODE_MATRIX_LIMITS, boundText = boundCodeMatrixText) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const result = {
    stdout: boundText(value.stdout, limits.outputChars),
    stderr: boundText(value.stderr, limits.outputChars),
    status: ['success', 'error', 'timeout', 'stopped'].includes(value.status) ? value.status : 'error',
    durationMs: Number.isFinite(value.durationMs) ? Math.max(0, value.durationMs) : 0,
  };
  if (Array.isArray(value.tables)) {
    let chars = limits.tableChars;
    let cells = limits.cells;
    const text = (item) => {
      const bounded = boundText(typeof item === 'string' ? item : '', Math.min(chars, limits.cellChars));
      chars -= bounded.length;
      return bounded;
    };
    result.tables = [];
    for (const table of value.tables.slice(0, limits.tables)) {
      if (!table || !Array.isArray(table.columns) || !Array.isArray(table.values) || !cells || !chars) continue;
      const columns = table.columns.slice(0, limits.columns).map(text);
      if (!columns.length) continue;
      const values = [];
      for (const row of table.values.slice(0, limits.rows)) {
        if (!Array.isArray(row) || cells < columns.length || !chars) break;
        values.push(columns.map((_, index) => {
          const cell = row[index];
          cells -= 1;
          return cell == null ? null : typeof cell === 'number' && Number.isFinite(cell) ? cell : text(cell);
        }));
      }
      result.tables.push({ columns, values });
    }
  }
  if (Array.isArray(value.trace)) {
    result.trace = [];
    for (const entry of value.trace.slice(0, limits.traceEntries)) {
      if (!entry || !Number.isInteger(entry.line) || entry.line < 1) continue;
      const locals = Object.create(null);
      if (entry.locals && typeof entry.locals === 'object' && !Array.isArray(entry.locals)) {
        let count = 0;
        for (const name in entry.locals) {
          if (!Object.hasOwn(entry.locals, name)) continue;
          if (count++ >= limits.locals) break;
          locals[boundText(name, 128)] = boundText(entry.locals[name], limits.localChars);
        }
      }
      result.trace.push({ line: entry.line, locals });
    }
  }
  return result;
}

// Executed only by the opaque-origin iframe's blob Worker. Keep dependencies
// explicit so bundlers cannot accidentally move execution into the app realm.
function codeMatrixWorkerMain(limits, runtimes, readLines, bound, normalize) {
  const scope = globalThis;
  const now = performance.now.bind(performance);
  let connected = false;
  scope.onmessage = async (event) => {
    if (connected || event.data?.type !== 'connect' || !event.ports[0]) return;
    connected = true;
    scope.onmessage = null;
    const port = event.ports[0];
    const send = port.postMessage.bind(port);
    const job = event.data.job;
    const readLine = readLines(job.input);
    const state = { stdout: '', stderr: '', status: 'success', durationMs: 0 };
    let started = 0;
    let lastSnapshot = -Infinity;
    let complete = false;
    const snapshot = () => {
      if (complete || now() - lastSnapshot < 100) return;
      lastSnapshot = now();
      send({ type: 'snapshot', result: normalize(state, limits, bound) });
    };
    const append = (stream, text) => {
      if (complete || state[stream].length >= limits.outputChars) return;
      state[stream] = bound(state[stream] + text, limits.outputChars);
      snapshot();
    };
    // Do not JSON.stringify arbitrary objects: huge/cyclic graphs and toJSON
    // hooks are common in student programs. Inspect a small, shallow preview.
    const format = (value, depth = 0, seen = new Set()) => {
      if (typeof value === 'string') return bound(value, limits.outputChars);
      if (value === null) return 'null';
      if (typeof value !== 'object') return bound(String(value), limits.cellChars);
      if (seen.has(value)) return '[Circular]';
      if (depth >= 2) return Array.isArray(value) ? '[Array]' : '[Object]';
      seen.add(value);
      const parts = [];
      let count = 0;
      try {
        for (const key in value) {
          if (!Object.hasOwn(value, key)) continue;
          if (count++ >= 20) { parts.push('…'); break; }
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          const item = descriptor && 'value' in descriptor ? format(descriptor.value, depth + 1, seen) : '[Getter]';
          parts.push(Array.isArray(value) ? item : `${bound(key, 128)}: ${item}`);
        }
      } catch { return '[Uninspectable]'; }
      seen.delete(value);
      return bound(Array.isArray(value) ? `[${parts.join(', ')}]` : `{${parts.join(', ')}}`, limits.outputChars);
    };
    const log = (stream, args) => append(stream, args.slice(0, 40).map((item) => format(item)).join(' ') + '\n');
    const console = Object.freeze({
      log: (...args) => log('stdout', args),
      info: (...args) => log('stdout', args),
      debug: (...args) => log('stdout', args),
      warn: (...args) => log('stderr', args),
      error: (...args) => log('stderr', args),
      dir: (...args) => log('stdout', args),
      table: (...args) => log('stdout', args),
      assert: (condition, ...args) => { if (!condition) log('stderr', ['Assertion failed:', ...args]); },
      clear: () => {},
    });
    scope.console = console;
    scope.print = console.log;
    scope.readLine = readLine;
    scope.prompt = (message) => {
      if (message != null) append('stdout', format(message));
      return readLine();
    };
    const finish = (error) => {
      if (complete) return;
      if (error !== undefined) {
        state.status = 'error';
        append('stderr', bound(String(error?.stack || error?.message || error), limits.outputChars) + '\n');
      }
      state.durationMs = started ? now() - started : 0;
      complete = true;
      send({ type: 'result', result: normalize(state, limits, bound) });
      port.close();
    };
    scope.addEventListener('error', (event) => {
      event.preventDefault();
      finish(event.error || new Error(event.message || 'Worker execution failed.'));
    });
    scope.addEventListener('unhandledrejection', (event) => {
      event.preventDefault();
      finish(event.reason ?? new Error('Unhandled promise rejection.'));
    });

    let python;
    let SQL;
    try {
      if (job.language === 'python') {
        // Pinned API: https://pyodide.org/en/0.27.7/usage/api/js-api.html
        // Streams/EOF: https://pyodide.org/en/0.27.7/usage/streams.html
        scope.importScripts(runtimes.pyodide + 'pyodide.js');
        python = await scope.loadPyodide({
          indexURL: runtimes.pyodide,
          stdin: readLine,
          stdout: (line) => append('stdout', line + '\n'),
          stderr: (line) => append('stderr', line + '\n'),
        });
        // write receives bytes and preserves partial lines/input prompts.
        const outDecoder = new TextDecoder();
        const errDecoder = new TextDecoder();
        python.setStdout({ write: (bytes) => { append('stdout', outDecoder.decode(bytes, { stream: true })); return bytes.length; } });
        python.setStderr({ write: (bytes) => { append('stderr', errDecoder.decode(bytes, { stream: true })); return bytes.length; } });
      } else if (job.language === 'sql') {
        scope.importScripts(runtimes.sql + 'sql-wasm.js');
        SQL = await scope.initSqlJs({ locateFile: () => runtimes.sql + 'sql-wasm.wasm' });
      }
      send({ type: 'ready' });
    } catch (error) { finish(error); return; }

    port.onmessage = async (event) => {
      if (event.data?.type !== 'run' || started || complete) return;
      started = now();
      port.onmessage = null;
      try {
        if (job.language === 'javascript') {
          const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
          const run = new AsyncFunction('console', 'print', 'readLine', 'prompt', 'input', '"use strict";\n' + job.code);
          const returned = await run(console, scope.print, readLine, scope.prompt, job.input);
          if (returned !== undefined) log('stdout', [returned]);
        } else if (job.language === 'python') {
          // Compile the original source with a stable filename: trace line
          // numbers are real Python lines, without instrumentation offsets.
          python.globals.set('_cm_source', job.code);
          python.globals.set('_cm_debug', job.debug);
          python.globals.set('_cm_trace_limit', limits.traceEntries);
          python.globals.set('_cm_locals_limit', limits.locals);
          python.globals.set('_cm_local_chars', limits.localChars);
          python.globals.set('_cm_capture', (line, json) => {
            if (!state.trace) state.trace = [];
            if (state.trace.length < limits.traceEntries) state.trace.push({ line, locals: JSON.parse(json) });
            snapshot();
          });
          await python.runPythonAsync(`
import sys as _cm_sys, json as _cm_json, reprlib as _cm_reprlib
def _cm_execute(source, debug, capture, limit, local_limit, local_chars):
    import ast
    namespace = {"__name__": "__main__"}
    count = 0
    represent = _cm_reprlib.Repr()
    represent.maxstring = local_chars
    represent.maxother = local_chars
    represent.maxlist = represent.maxtuple = represent.maxdict = 8
    def trace(frame, event, arg):
        nonlocal count
        if frame.f_code.co_filename != "<code-matrix>":
            return None
        if event == "line" and count < limit:
            values = {}
            for name, value in frame.f_locals.items():
                if name.startswith("__"):
                    continue
                if len(values) >= local_limit:
                    break
                try:
                    values[name[:128]] = represent.repr(value)[:local_chars]
                except BaseException:
                    values[name[:128]] = "<unavailable>"
            capture(frame.f_lineno, _cm_json.dumps(values))
            count += 1
            if count >= limit:
                _cm_sys.settrace(None)
                return None
        return trace
    async def execute():
        previous = _cm_sys.gettrace()
        streams = (_cm_sys.stdout, _cm_sys.stderr)
        try:
            compiled = compile(source, "<code-matrix>", "exec", flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)
            if debug:
                _cm_sys.settrace(trace)
            # This evaluates only the user's compiled program, never AI output.
            result = eval(compiled, namespace, namespace)
            if compiled.co_flags & 128:
                await result
        finally:
            _cm_sys.settrace(previous)
            for stream in streams:
                try:
                    stream.flush()
                except BaseException:
                    pass
    return execute()
await _cm_execute(_cm_source, _cm_debug, _cm_capture, _cm_trace_limit, _cm_locals_limit, _cm_local_chars)
`);
          if (job.debug && !state.trace) state.trace = [];
        } else if (job.language === 'sql') {
          const db = new SQL.Database();
          state.tables = [];
          let cells = 0;
          let chars = 0;
          let statements = 0;
          let truncated = false;
          try {
            db.run(`CREATE TABLE students (id INTEGER PRIMARY KEY, name TEXT, age INTEGER, grade TEXT, marks INTEGER);
              INSERT INTO students VALUES (1, 'Aarav', 18, 'A', 92), (2, 'Diya', 19, 'B', 84),
              (3, 'Kabir', 18, 'A', 95), (4, 'Meera', 20, 'C', 73), (5, 'Rohan', 19, 'B', 88);`);
            // iterateStatements handles quoted semicolons and frees the previous
            // statement. Never db.exec(userCode): it materializes every row.
            for (const statement of db.iterateStatements(job.code)) {
              if (++statements > limits.statements) { truncated = true; break; }
              try {
                const names = statement.getColumnNames();
                if (names.length > limits.columns || (names.length && state.tables.length >= limits.tables)) {
                  truncated = true; break;
                }
                const table = { columns: names.map((name) => bound(name, limits.cellChars)), values: [] };
                chars += table.columns.reduce((sum, name) => sum + name.length, 0);
                if (chars > limits.tableChars) { truncated = true; break; }
                if (names.length) state.tables.push(table);
                // Stop fetching as soon as a bound is reached. Later statements
                // are intentionally skipped; no incomplete result is hidden.
                while (statement.step()) {
                  if (table.values.length >= limits.rows || cells + names.length > limits.cells) { truncated = true; break; }
                  const row = statement.get().map((value) => {
                    if (value instanceof Uint8Array) {
                      const hex = Array.from(value.subarray(0, 128), (byte) => byte.toString(16).padStart(2, '0')).join('');
                      value = `0x${hex}${value.length > 128 ? '…' : ''}`;
                    }
                    if (typeof value === 'string') {
                      const short = bound(value, limits.cellChars);
                      if (short !== value) truncated = true;
                      chars += short.length;
                      return short;
                    }
                    return value;
                  });
                  if (chars > limits.tableChars) { truncated = true; break; }
                  cells += names.length;
                  table.values.push(row);
                }
                snapshot();
              } finally { statement.free(); }
              if (truncated) break;
            }
            if (truncated) append('stderr', '[Result limit reached; values may be truncated and later SQL statements may be skipped.]\n');
            append('stdout', `Executed ${Math.min(statements, limits.statements)} SQL statement(s).\n`);
          } finally { db.close(); }
        } else { throw new Error('Unsupported language.'); }
        finish();
      } catch (error) { finish(error); }
    };
    port.start();
  };
}

export function buildCodeMatrixWorkerSource() {
  return `(${codeMatrixWorkerMain.toString()})(${JSON.stringify(CODE_MATRIX_LIMITS)},${JSON.stringify(CODE_MATRIX_RUNTIMES)},${createCodeMatrixLineReader.toString()},${boundCodeMatrixText.toString()},${normalizeCodeMatrixResult.toString()});`;
}
