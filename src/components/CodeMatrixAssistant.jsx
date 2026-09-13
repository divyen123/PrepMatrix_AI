import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, CheckCheck, ChevronDown, Coins, Lightbulb, LoaderCircle, MapPin, RotateCcw, Sparkles, TriangleAlert } from 'lucide-react';
import { useAiQuota } from '../utils/aiQuota';
import { CODE_REVIEW_FEATURE } from '../utils/codeMatrixReview';
import './CodeMatrixAssistant.css';

export default function CodeMatrixAssistant({ snapshot, session, stale, availability, onRetryAvailability, onGoToLine, onRun }) {
  const { getCost, quota, isKnown, hasInsufficientCredits, refresh, loading: creditsLoading } = useAiQuota();
  const [open, setOpen] = useState(true);
  const [review, setReview] = useState(() => session.peek(snapshot));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retryPending, setRetryPending] = useState(false);
  const alive = useRef(true);
  const inFlight = useRef(false);
  const bodyId = useId();
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const cost = getCost(CODE_REVIEW_FEATURE);
  const insufficient = hasInsufficientCredits(CODE_REVIEW_FEATURE);
  const requestReview = async () => {
    if (inFlight.current || stale || ((!isKnown || insufficient) && !retryPending)) return;
    inFlight.current = true;
    setLoading(true);
    setError('');
    try {
      const result = await session.request(snapshot);
      if (alive.current) { setReview(result); setRetryPending(false); }
    } catch (failure) {
      if (!alive.current) return;
      const uncertain = !failure.status || ['AI_QUOTA_UNAVAILABLE', 'AI_REQUEST_IN_PROGRESS'].includes(failure.code);
      setRetryPending(uncertain);
      setError(failure.code === 'AI_USER_QUOTA_EXHAUSTED'
        ? 'You have used your available AI credits. Your monthly allowance will reset automatically.'
        : uncertain
          ? 'The review has not been confirmed yet. Retry to retrieve it without a duplicate charge.'
          : `${failure.message || 'The review could not be completed.'}${failure.details?.creditsRefunded ? ' Your AI credit was returned.' : ''}`);
    } finally {
      inFlight.current = false;
      if (alive.current) setLoading(false);
    }
  };
  return (
    <section className="cmx-assistant" aria-label="AI Code Assistant">
      <button className="cmx-assistant-heading" type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
        <span className="cmx-assistant-mark"><Sparkles size={17} aria-hidden="true" /></span>
        <span className="cmx-assistant-title"><strong>AI Code Assistant</strong><small>{loading ? 'Reviewing your run…' : review ? 'Your debugging guide' : 'A hint for your next step'}</small></span>
        <ChevronDown size={17} className={open ? 'is-open' : ''} aria-hidden="true" />
      </button>
      <div id={bodyId} hidden={!open} className="cmx-assistant-body">
        {stale && <p className="cmx-assistant-stale"><RotateCcw size={14} aria-hidden="true" />From your previous run. Run the edited code to get a fresh review.</p>}
        {review ? <div className="cmx-assistant-review">
          <p className="cmx-assistant-summary" role="status">{review.summary}</p>
          <div className="cmx-assistant-step is-location"><h3><MapPin size={14} aria-hidden="true" />Where to look</h3><p>{review.where}</p>
            {review.line && <button type="button" className="cmx-assistant-line" disabled={stale} onClick={() => onGoToLine(review.line)}>Go to line {review.line}<ArrowRight size={13} aria-hidden="true" /></button>}
          </div>
          <div className="cmx-assistant-step is-hint"><h3><Lightbulb size={14} aria-hidden="true" />Try next</h3><ul>{review.tryNext.map((hint, i) => <li key={i}>{hint}</li>)}</ul></div>
          <div className="cmx-assistant-step is-avoid"><h3><TriangleAlert size={14} aria-hidden="true" />What to avoid</h3><ul>{review.avoid.map((hint, i) => <li key={i}>{hint}</li>)}</ul></div>
          <div className="cmx-assistant-step is-check"><h3><CheckCheck size={14} aria-hidden="true" />Check your fix</h3><p>{review.check}</p></div>
          <div className="cmx-assistant-footer"><span>You make the fix. Run it when ready.</span><button type="button" onClick={onRun}>Run again<ArrowRight size={14} aria-hidden="true" /></button></div>
        </div> : <>
          <p className="cmx-assistant-intro">Understand the error, find where to look, and work out the fix yourself.</p>
          {loading ? <div className="cmx-assistant-loading" role="status"><LoaderCircle size={17} className="cmx-spin" aria-hidden="true" /><span>Finding a useful hint<span className="cmx-assistant-loading-detail">Your code stays editable while we review this run.</span></span></div> : <>
            {availability === 'unavailable' && <p className="cmx-assistant-info">The assistant is not available yet. You can keep editing and running your code. No credits used.</p>}
            {availability === 'error' && <p className="cmx-assistant-info">Could not connect to the assistant. <button type="button" onClick={onRetryAvailability}>Try connecting again</button></p>}
            {error && <p className="cmx-assistant-error" role="alert">{error}</p>}
            {!isKnown && availability === 'available' && !retryPending && <p className="cmx-assistant-info">{creditsLoading ? 'Checking your AI credits…' : <>Your AI credit balance is not available. <button type="button" onClick={() => void refresh()}>Check credits again</button></>}</p>}
            {insufficient && !retryPending && !error && <p className="cmx-assistant-info">Not enough AI credits for a new review.{quota?.resetAt && ` Resets ${new Date(quota.resetAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}.`}</p>}
            <div className="cmx-assistant-actions">
              <button className="cmx-assistant-primary" type="button" disabled={stale || (!retryPending && (!isKnown || insufficient || availability !== 'available'))} onClick={requestReview}>
                <Sparkles size={14} aria-hidden="true" />{retryPending ? 'Retrieve review' : availability === 'loading' ? 'Connecting…' : error ? 'Try review again' : 'Review this error'}
                {!retryPending && isKnown && <span><Coins size={12} aria-hidden="true" />{cost} credit{cost === 1 ? '' : 's'}</span>}
              </button>
              {isKnown && <small>{quota.remaining} credits left</small>}
            </div>
            <p className="cmx-assistant-privacy">Only this run’s code and error are sent for review.</p>
          </>}
        </>}
      </div>
    </section>
  );
}
