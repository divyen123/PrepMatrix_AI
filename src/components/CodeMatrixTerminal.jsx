import { useEffect, useRef, useState } from 'react';

export default function CodeMatrixTerminal({ output = '', error = '', waiting = false, busy = false, onInput }) {
  const [line, setLine] = useState('');
  const inputRef = useRef(null);
  const endRef = useRef(null);
  useEffect(() => {
    if (waiting) { setLine(''); inputRef.current?.focus(); }
  }, [waiting]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [output, error, waiting]);
  const submit = (event) => {
    event.preventDefault();
    if (onInput(line)) setLine('');
  };
  return <div className="cmx-terminal" onClick={() => { if (waiting) inputRef.current?.focus(); }}>
    <div className="cmx-terminal-text"><span>{output}</span>{waiting && <form className="cmx-terminal-entry" onSubmit={submit}>
      <input ref={inputRef} aria-label="Terminal input" autoComplete="off" autoCapitalize="off" spellCheck={false}
        value={line} maxLength={10000} style={{ width: `${Math.max(12, line.length + 1)}ch` }}
        onChange={(event) => setLine(event.target.value)} onKeyDown={(event) => {
          if (event.ctrlKey && event.key.toLowerCase() === 'd') { event.preventDefault(); onInput(null); }
        }} />
    </form>}</div>
    {error && <pre className="cmx-stderr">{error}</pre>}
    {waiting && <div className="cmx-terminal-hint"><span>Type here and press Enter</span><button type="button" onClick={() => onInput(null)}>End input</button></div>}
    {!busy && !output && !error && <p className="cmx-no-output">Finished with no console output.</p>}
    <span ref={endRef} />
  </div>;
}
