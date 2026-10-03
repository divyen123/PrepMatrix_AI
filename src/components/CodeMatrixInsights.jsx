import { createElement, useEffect, useId, useRef, useState } from 'react';
import { Activity, ArrowLeft, ArrowUpRight, CalendarDays, CheckCheck, Clock3, Code2, Info, Lightbulb, LoaderCircle, RefreshCw, Target, Trophy, TrendingUp } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import useCodeMatrixInsights from '../hooks/useCodeMatrixInsights';
import CodeMatrixLanguageTick from './CodeMatrixLanguageTick';
import CodeMatrixLanguageIcon from './CodeMatrixLanguageIcon';
import './CodeMatrixInsights.css';

const LANGUAGES = { python: 'Python', c: 'C', cpp: 'C++', java: 'Java', javascript: 'JavaScript', sql: 'SQL', web: 'Web preview', html: 'HTML', css: 'CSS' };
const STATUS = {
  success: ['Ran without errors', 'success'], error: ['Coding error', 'error'], timeout: ['Time limit reached', 'error'],
  stopped: ['Stopped', 'neutral'], environment: ['Runtime unavailable', 'neutral'], preview: ['Preview opened', 'neutral'], preview_error: ['Preview error', 'error'],
};
const ERRORS = { syntax: 'Syntax', type: 'Type', reference: 'Reference', runtime: 'Runtime', timeout: 'Time limit', other: 'Execution' };
const RANGES = [['7d', '7 days'], ['30d', '30 days'], ['all', 'All time']];
const formatNumber = (value) => Number(value || 0).toLocaleString();
const formatTime = (seconds = 0) => {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  if (value < 60) return `${value}s`;
  if (value < 3600) return `${Math.floor(value / 60)}m${value % 60 ? ` ${value % 60}s` : ''}`;
  return `${Math.floor(value / 3600)}h ${Math.floor((value % 3600) / 60)}m`;
};
const formatDate = (value, options = {}) => {
  // Date-only chart keys already name a day in the viewer's time zone.
  const date = new Date(value?.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...options });
};
const rate = (value) => value === null || value === undefined ? '—' : `${Math.round(value)}%`;

function MetricSwitch({ label, value, options, onChange }) {
  return <div className="cmxi-switch" role="group" aria-label={label}>
    {options.map(([id, name]) => <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>{name}</button>)}
  </div>;
}

function ChartTooltip({ active, payload, label, mode, daily = false }) {
  if (!active || !payload?.length) return null;
  return <div className="cmxi-tooltip">
    <strong>{daily ? formatDate(label) : label}</strong>
    <span>{mode === 'time' ? formatTime(payload[0].value) : `${formatNumber(payload[0].value)} ${mode === 'xp' ? 'XP earned' : 'attempts'}`}</span>
  </div>;
}

function ChartEmpty({ children }) {
  return <div className="cmxi-chart-empty"><Activity size={25} aria-hidden="true" /><p>{children}</p></div>;
}

function DailyChart({ trend, mode, id }) {
  const dataKey = mode === 'time' ? 'activeSeconds' : mode === 'xp' ? 'xp' : 'attempts';
  const hasData = trend.some((day) => day[dataKey] > 0);
  if (!hasData) return <ChartEmpty>{mode === 'time' ? 'Active coding time will appear as you work in the editor.' : mode === 'xp' ? 'Your next CodeMatrix XP reward will appear here.' : 'Run or preview your code to start your activity chart.'}</ChartEmpty>;
  return <div className="cmxi-chart" aria-label={mode === 'time' ? 'Daily active coding time' : mode === 'xp' ? 'Daily CodeMatrix XP earned' : 'Daily coding attempts'}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <AreaChart data={trend} margin={{ top: 12, right: 14, left: 0, bottom: 0 }} accessibilityLayer>
        <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--cmxi-accent)" stopOpacity={0.25} /><stop offset="100%" stopColor="var(--cmxi-accent)" stopOpacity={0.015} /></linearGradient></defs>
        <CartesianGrid vertical={false} stroke="var(--cmxi-border)" strokeDasharray="3 5" />
        <XAxis dataKey="date" tickFormatter={formatDate} minTickGap={36} tick={{ fill: 'var(--cmxi-muted)' }} axisLine={false} tickLine={false} dy={7} />
        <YAxis width={46} tickFormatter={mode === 'time' ? (value) => formatTime(value) : formatNumber} allowDecimals={false} tick={{ fill: 'var(--cmxi-muted)' }} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip mode={mode} daily />} cursor={{ stroke: 'var(--cmxi-accent)', strokeDasharray: '3 3' }} />
        <Area type="monotone" dataKey={dataKey} stroke="var(--cmxi-accent)" strokeWidth={2.5} fill={`url(#${id})`} activeDot={{ r: 5, stroke: 'var(--cmxi-surface)', strokeWidth: 3 }} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  </div>;
}

function Highlight({ icon, title, insight, empty, tone = '' }) {
  return <article className={`cmxi-highlight ${tone}`}>
    <span className="cmxi-highlight-label">{createElement(icon, { size: 16, 'aria-hidden': true })}{title}</span>
    <h3>{insight?.label || 'Learning your pattern'}</h3>
    <p>{insight?.detail || empty}</p>
  </article>;
}

export default function CodeMatrixInsights({ academicProfileDataId, onBack }) {
  const headingRef = useRef(null);
  useEffect(() => { headingRef.current?.focus(); }, []);
  const [range, setRange] = useState('30d');
  const [dailyMetric, setDailyMetric] = useState('time');
  const [languageMetric, setLanguageMetric] = useState('runs');
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const { data, loading, error, reload } = useCodeMatrixInsights(academicProfileDataId, range);
  const chartId = useId().replace(/:/g, '');
  const summary = data?.summary || {};
  const xp = data?.xp || {};
  const highlights = data?.highlights || {};
  const languages = data?.languages || [];
  const trend = data?.trend || [];
  const recent = data?.recent || [];
  const history = data?.historicalLanguages || [];
  const suggestions = data?.suggestions || [];
  const rewardRuns = xp.runsPerReward || 4;
  const practiceRewards = xp.recentPracticeRewards || [];
  const rewardProgress = Math.max(0, Math.min(rewardRuns, xp.runsIntoReward || 0));
  const languageData = [...languages].sort((a, b) => Number(b[languageMetric === 'time' ? 'activeSeconds' : 'meaningfulAttempts'] || 0) - Number(a[languageMetric === 'time' ? 'activeSeconds' : 'meaningfulAttempts'] || 0));
  const hasLanguageChart = languageData.some((item) => item[languageMetric === 'time' ? 'activeSeconds' : 'meaningfulAttempts'] > 0);
  const selected = languages.find((item) => item.id === selectedLanguage);
  const trackingDate = data?.trackingSince ? formatDate(data.trackingSince, { year: 'numeric' }) : '';

  return <div className="cmxi" aria-busy={loading}>
    <header className="cmxi-header">
      <div className="cmxi-header-main">
        <div className="cmxi-title-row">
          <button className="cmxi-back page-back-control" type="button" onClick={onBack} aria-label="Back to CodeMatrix" title="Back to CodeMatrix"><ArrowLeft size={22} aria-hidden="true" /></button>
          <h1 ref={headingRef} tabIndex={-1}>CodeMatrix <span>Insights</span></h1>
        </div>
        <p>Your practice, progress, and next steps · This academic profile</p>
      </div>
      <div className="cmxi-header-controls">
        <MetricSwitch label="Insights date range" value={range} options={RANGES} onChange={setRange} />
        <button type="button" className="cmxi-refresh" onClick={reload} disabled={loading} aria-label="Refresh coding insights" title="Refresh insights"><RefreshCw size={17} aria-hidden="true" /></button>
      </div>
    </header>

    {error && <div className="cmxi-error" role="alert"><Info size={18} aria-hidden="true" /><span>{error}</span><button type="button" onClick={reload} disabled={loading}>Try again</button></div>}
    {loading && !data && <div className="cmxi-loading" role="status"><LoaderCircle className="cmxi-spinner" size={25} aria-hidden="true" /><span>Gathering your coding insights…</span></div>}

    {data && <>
      <section className="cmxi-overview" aria-label="Coding overview">
        <article className="cmxi-xp-card">
          <div className="cmxi-xp-heading"><span className="cmxi-icon"><Trophy size={20} aria-hidden="true" /></span><span>CodeMatrix XP<span className="cmxi-lifetime">All time</span></span></div>
          <div className="cmxi-xp-total">{formatNumber(xp.total)} <span>XP</span></div>
          <dl className="cmxi-practice-rewards"><div><dt>Solved questions</dt><dd>{formatNumber(xp.solvedQuestions)}</dd></div><div><dt>Practice XP</dt><dd>{formatNumber(xp.practiceXp)} XP</dd></div></dl>
          <div className="cmxi-reward-copy"><span>Compiler reward</span><strong>+{xp.rewardXp || 10} XP</strong></div>
          <div className="cmxi-reward-progress" role="progressbar" aria-label="Successful runs toward the next XP reward" aria-valuenow={rewardProgress} aria-valuemin={0} aria-valuemax={rewardRuns}>
            {Array.from({ length: rewardRuns }, (_, index) => <span key={index} className={index < rewardProgress ? 'is-complete' : ''} />)}
          </div>
          <p>{xp.runsToNextReward || rewardRuns} more successful {Number(xp.runsToNextReward || rewardRuns) === 1 ? 'run' : 'runs'} to your next reward.</p>
        </article>
        <div className="cmxi-metrics">
          <article><span><Clock3 size={16} aria-hidden="true" />Active coding</span><strong>{formatTime(summary.activeSeconds)}</strong><small>While actively using the editor</small></article>
          <article><span><Code2 size={16} aria-hidden="true" />Meaningful attempts</span><strong>{formatNumber(summary.meaningfulAttempts)}</strong><small>Repeated unchanged runs grouped</small></article>
          <article><span><CalendarDays size={16} aria-hidden="true" />Practice days</span><strong>{formatNumber(summary.practiceDays)}</strong><small>Days you spent coding</small></article>
          <article><span><CheckCheck size={16} aria-hidden="true" />Follow-up runs</span><strong>{formatNumber(summary.errorsResolved)}</strong><small>An error followed by changed code that ran without errors</small></article>
        </div>
      </section>

      {!summary.attempts && !summary.activeSeconds && <div className="cmxi-start-note"><Code2 size={20} aria-hidden="true" /><div><strong>Your next session starts the story.</strong><p>Code on the full page or in the popup. Your activity will appear here after it syncs.</p></div><button type="button" onClick={onBack}>Start coding<ArrowUpRight size={16} aria-hidden="true" /></button></div>}

      <section className="cmxi-highlights" aria-label="Language patterns">
        <Highlight icon={Code2} title="Most used" insight={highlights.mostUsed} empty="A few distinct coding attempts will reveal your go-to language." />
        <Highlight icon={TrendingUp} title="Most consistent" insight={highlights.mostConsistent} empty="Keep practising across several days to reveal consistent execution patterns." tone="is-consistent" />
        <Highlight icon={Target} title="Needs practice" insight={highlights.needsPractice} empty="More practice history is needed before identifying recurring difficulty." tone="is-practice" />
      </section>

      <div className="cmxi-context-note"><Info size={16} aria-hidden="true" /><p>Compiler insights describe execution. Practice solutions are checked against test cases.</p></div>

      <section className="cmxi-charts-grid" aria-label="Coding activity charts">
        <article className="cmxi-card">
          <div className="cmxi-section-heading"><div><h2>Daily practice</h2><p>{range === 'all' ? `Last ${data.trendWindowDays || 90} days` : RANGES.find(([id]) => id === range)[1]} · {data.timeZone || 'Your local time'}</p></div><MetricSwitch label="Daily practice chart metric" value={dailyMetric} options={[['time', 'Time'], ['runs', 'Runs']]} onChange={setDailyMetric} /></div>
          <DailyChart trend={trend} mode={dailyMetric} id={`${chartId}-practice`} />
          <p className="cmxi-chart-note">{dailyMetric === 'time' ? 'Time pauses when the editor is hidden or you stop interacting.' : 'Includes full-page runs and popup runs, with web previews tracked separately below.'}</p>
        </article>
        <article className="cmxi-card">
          <div className="cmxi-section-heading"><div><h2>XP earned</h2><p>Rewards earned each day</p></div><span className="cmxi-chart-total">{formatNumber(trend.reduce((sum, day) => sum + Number(day.xp || 0), 0))} <small>XP</small></span></div>
          <DailyChart trend={trend} mode="xp" id={`${chartId}-xp`} />
          <p className="cmxi-chart-note">+{xp.practiceRewardXp || 10} XP for each newly solved question. +{xp.rewardXp || 10} XP every {rewardRuns} successful compiler runs.{range === 'all' ? ` Chart shows the last ${data.trendWindowDays || 90} days.` : ''}</p>
        </article>
      </section>

      <section className="cmxi-card cmxi-languages" aria-labelledby="cmxi-language-title">
        <div className="cmxi-section-heading"><div><h2 id="cmxi-language-title">Your languages</h2><p>See where your practice goes</p></div><MetricSwitch label="Language comparison metric" value={languageMetric} options={[['runs', 'Attempts'], ['time', 'Active time']]} onChange={setLanguageMetric} /></div>
        <div className="cmxi-panel-scroll cmxi-language-body" tabIndex={0} aria-label="Language practice details">
        <div className="cmxi-language-grid">
          <div className="cmxi-language-chart" aria-label={languageMetric === 'time' ? 'Active coding time by language' : 'Meaningful attempts by language'}>
            {hasLanguageChart ? <div className="cmxi-language-chart-inner">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={languageData} margin={{ top: 10, right: 14, left: 0, bottom: 0 }} accessibilityLayer>
                  <CartesianGrid vertical={false} stroke="var(--cmxi-border)" strokeDasharray="3 5" />
                  <XAxis type="category" dataKey="label" interval={0} height={38} tick={<CodeMatrixLanguageTick languages={languageData} />} axisLine={false} tickLine={false} />
                  <YAxis type="number" width={48} allowDecimals={false} tickFormatter={languageMetric === 'time' ? formatTime : formatNumber} tick={{ fill: 'var(--cmxi-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip mode={languageMetric} />} cursor={{ fill: 'var(--cmxi-soft)' }} />
                  <Bar dataKey={languageMetric === 'time' ? 'activeSeconds' : 'meaningfulAttempts'} fill="var(--cmxi-accent)" radius={[5, 5, 0, 0]} maxBarSize={38} isAnimationActive={false} onClick={(entry) => setSelectedLanguage(entry.id || entry.payload?.id || '')} cursor="pointer">
                    {languageData.map((item) => <Cell key={item.id} opacity={!selected || selected.id === item.id ? 1 : 0.3} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div> : <ChartEmpty>{languageMetric === 'time' ? 'Spend some time in the editor to compare your languages.' : 'Run code in a language to build your comparison.'}</ChartEmpty>}
          </div>
          <div className="cmxi-language-details">
            {languages.length ? <div className="cmxi-table-scroll"><table><caption className="cmxi-sr-only">Execution patterns by language. Rates exclude web previews.</caption><thead><tr><th scope="col">Language</th><th scope="col">No-error rate</th><th scope="col">Follow-up runs</th></tr></thead><tbody>{languageData.map((item) => <tr key={item.id}><th scope="row">{item.label}<small>{item.topError ? `${ERRORS[item.topError.category] || 'Execution'} errors · ${item.topError.count}` : item.id === 'web' ? 'HTML, CSS & browser scripts' : `${item.practiceDays || 0} practice days`}</small></th><td>{item.id === 'web' ? 'Preview only' : rate(item.successRate)}</td><td>{formatNumber(item.errorsResolved)}</td></tr>)}</tbody></table></div> : <p className="cmxi-muted">Your language details will appear as you practise.</p>}
            <p className="cmxi-chart-note">Meaningful attempts group repeat runs of unchanged code. No-error rate excludes stopped runs and environment failures.</p>
          </div>
        </div>
        {languages.length > 0 && <div className="cmxi-language-selector">
          <div className="cmxi-language-buttons" role="group" aria-label="Explore a language">
            {languages.map((item) => <button key={item.id} type="button" aria-pressed={selected?.id === item.id} onClick={() => setSelectedLanguage(selected?.id === item.id ? '' : item.id)}>{item.label}</button>)}
            {selected && <button className="cmxi-clear-selection" type="button" onClick={() => setSelectedLanguage('')}>Clear selection</button>}
          </div>
          {selected ? <div className="cmxi-selected-language" aria-live="polite"><strong>{selected.label}</strong><span>{formatNumber(selected.meaningfulAttempts)} meaningful attempts</span><span>{formatTime(selected.activeSeconds)} active time</span><span>{formatNumber(selected.errorsResolved)} follow-up runs</span><p>{selected.id === 'web' ? 'Preview activity shows browser practice. Opening a preview does not verify that the page works correctly.' : selected.topError ? `${ERRORS[selected.topError.category] || 'Execution'} errors occurred ${selected.topError.count} times. Try a small revision, then test it with a different input.` : 'Keep trying different inputs and checking the results against your expected output.'}</p></div> : <p className="cmxi-chart-note">Select a language above or click a bar to explore its practice details.</p>}
        </div>}
        </div>
        <div className="cmxi-source-summary"><span><strong>{formatNumber(summary.pageAttempts)}</strong> full page</span><span><strong>{formatNumber(summary.popupAttempts)}</strong> popup</span><span><strong>{formatNumber(summary.webPreviews)}</strong> web previews</span><span><strong>{rate(summary.successRate)}</strong> no-error rate</span></div>
      </section>

      <div className="cmxi-bottom-grid">
        <section className="cmxi-card" aria-labelledby="cmxi-recent-title">
          <div className="cmxi-section-heading"><div><h2 id="cmxi-recent-title">Recent activity</h2><p>Both places you code, in one view</p></div><Activity size={19} aria-hidden="true" /></div>
          {recent.length ? <ul className="cmxi-recent cmxi-panel-scroll" tabIndex={0} aria-label="Recent coding activity">{recent.map((attempt) => {
            const [label, tone] = STATUS[attempt.status] || ['Recorded', 'neutral'];
            return <li key={attempt.attemptId}><span className={`cmxi-status-dot is-${tone}`} aria-hidden="true" /><div><strong>{LANGUAGES[attempt.language] || attempt.language}<span>{attempt.surface === 'popup' ? 'Popup' : 'Full page'}</span></strong><p>{label}{ERRORS[attempt.errorCategory] && attempt.status !== 'success' ? ` · ${ERRORS[attempt.errorCategory]}` : ''}</p></div><time dateTime={attempt.startedAt} title={new Date(attempt.startedAt).toLocaleString()}>{formatDate(attempt.startedAt)}</time></li>;
          })}</ul> : <p className="cmxi-muted cmxi-empty-copy cmxi-panel-scroll">Your next run or preview will appear here after syncing.</p>}
        </section>
        <section className="cmxi-card cmxi-next-steps" aria-labelledby="cmxi-next-title">
          <div className="cmxi-section-heading"><div><h2 id="cmxi-next-title">What to practise next</h2><p>Small steps, based on your activity</p></div><Lightbulb size={20} aria-hidden="true" /></div>
          <ul className="cmxi-panel-scroll" tabIndex={0} aria-labelledby="cmxi-next-title">{(suggestions.length ? suggestions : [{ title: 'Start with a small challenge', detail: 'Choose one language, write a short program, and try it with different inputs.' }]).map((suggestion, index) => <li key={`${index}-${suggestion.title}`}><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{suggestion.title}</h3><p>{suggestion.detail}</p></div></li>)}</ul>
        </section>
      </div>

      <div className="cmxi-history-grid">
        <section className="cmxi-history" aria-labelledby="cmxi-history-title">
          <h2 id="cmxi-history-title">Lifetime successful runs <span>{formatNumber(history.reduce((sum, item) => sum + Number(item.successfulRuns || 0), 0))} recorded</span></h2>
          <p>Historical XP records preserve successful runs. They cannot tell us about past errors or active coding time.</p>
          {history.length ? <div className="cmxi-history-languages cmxi-panel-scroll" tabIndex={0} role="list" aria-label="Successful runs by language">{history.map((item) => <span key={item.id} data-language={item.id} role="listitem" title={item.label} aria-label={`${item.label}: ${formatNumber(item.successfulRuns)} successful runs`}>
            <CodeMatrixLanguageIcon language={item.id} size={30} aria-hidden="true" focusable="false" />
            <span className="cmxi-history-language-name">{item.label}</span>
            <strong>{formatNumber(item.successfulRuns)}</strong>
          </span>)}</div> : <div className="cmxi-panel-scroll cmxi-panel-empty"><p className="cmxi-muted">Your successful compiler runs will appear here.</p></div>}
        </section>
        <section className="cmxi-card cmxi-solved-card" aria-labelledby="cmxi-solved-title">
          <div className="cmxi-section-heading"><h2 id="cmxi-solved-title">Solved questions</h2></div>
          {practiceRewards.length ? <ul className="cmxi-solved-list cmxi-panel-scroll" tabIndex={0} aria-labelledby="cmxi-solved-title">{practiceRewards.map((reward) => <li key={reward.id}><CheckCheck size={17} aria-hidden="true" /><div><strong>{reward.title}</strong><span>{LANGUAGES[reward.language] || reward.language} · {formatDate(reward.occurredAt)}</span></div><b>+{formatNumber(reward.xp)} XP</b></li>)}</ul> : <div className="cmxi-panel-scroll cmxi-panel-empty"><p className="cmxi-muted">Solve a practice question to see it here.</p></div>}
        </section>
      </div>
      <footer className="cmxi-footer"><span>{trackingDate ? `Detailed activity tracked since ${trackingDate}.` : 'Detailed activity starts with your next coding session.'} Offline activity appears after syncing.</span><span>Automatic insights · No AI credits used</span></footer>
    </>}
  </div>;
}
