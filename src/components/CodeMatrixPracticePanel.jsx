import { ArrowRight, Check, Shuffle } from 'lucide-react';
import './CodeMatrixPracticePanel.css';

const isSolved = (ids, id) => ids instanceof Set ? ids.has(id) : ids.includes(id);

export default function CodeMatrixPracticePanel({ questions = [], question, language, solvedIds = [], showSolved = false, solvedQuestions = [], onToggleSolved, onSelect, onNext, onRefresh, disabled = false }) {
  const examples = question?.examples || question?.testCases?.slice(0, 2) || [];
  const suggested = questions.filter((item) => !language || item.supportedLanguages?.includes(language))
    .sort((a, b) => Number(isSolved(solvedIds, a.id)) - Number(isSolved(solvedIds, b.id))).slice(0, 3);
  const visibleQuestions = showSolved ? solvedQuestions.filter((item) => isSolved(solvedIds, item.id)
    && (!language || item.supportedLanguages?.includes(language))) : suggested;
  return <section className="cmx-practice" aria-label={question ? question.title : showSolved ? 'Solved practice questions' : 'Choose a practice question'}>
    <header className="cmx-practice-heading">
      <h2>{question?.title || 'Try to solve?'}</h2>
      {question && isSolved(solvedIds, question.id) && <Check size={17} className="cmx-practice-solved" aria-label="Solved" />}
      {!question && <button type="button" className="cmx-practice-solved-toggle" aria-pressed={showSolved} onClick={onToggleSolved} disabled={disabled}>Solved</button>}
    </header>

    {question ? <>
      <p className="cmx-practice-statement">{question.statement}</p>
      <div className="cmx-practice-formats">
        <section><h3>Input</h3><p>{question.inputFormat}</p></section>
        <section><h3>Output</h3><p>{question.outputFormat}</p></section>
      </div>
      {question.constraints?.length > 0 && <section className="cmx-practice-constraints"><h3>Constraints</h3><ul>{question.constraints.map((constraint) => <li key={constraint}>{constraint}</li>)}</ul></section>}
      {examples.length > 0 && <section className="cmx-practice-examples"><h3>Examples</h3>{examples.map((example, index) => <div className="cmx-practice-example" key={example.id || index}>
        <div><span>Input {examples.length > 1 ? index + 1 : ''}</span><pre>{example.input || '(empty)'}</pre></div>
        <div><span>Output</span><pre>{example.expectedOutput ?? example.output ?? ''}</pre></div>
      </div>)}</section>}
    </> : <div className="cmx-practice-questions">{visibleQuestions.map((item) => <article className="cmx-practice-question" key={item.id}>
      <div><h3>{item.title}{isSolved(solvedIds, item.id) && <Check size={15} className="cmx-practice-solved" aria-label="Solved" />}</h3>{item.topic && <p>{item.topic}</p>}</div>
      <button type="button" className="cmx-practice-button cmx-practice-try" onClick={() => onSelect(item.id)} disabled={disabled || (Boolean(language) && !item.supportedLanguages?.includes(language))}>{showSolved ? 'Try again' : 'Try it'}<ArrowRight size={14} aria-hidden="true" /></button>
    </article>)}{showSolved && visibleQuestions.length === 0 && <p className="cmx-practice-solved-empty">No solved questions yet.</p>}</div>}

    {(question || !showSolved) && <footer className="cmx-practice-actions cmx-practice-navigation">
      {question && onNext && <button type="button" className="cmx-practice-button" onClick={onNext} disabled={disabled}><Shuffle size={14} aria-hidden="true" />Try another</button>}
      {!question && onRefresh && <button type="button" className="cmx-practice-button" onClick={onRefresh} disabled={disabled}><Shuffle size={14} aria-hidden="true" />More questions</button>}
    </footer>}
  </section>;
}
