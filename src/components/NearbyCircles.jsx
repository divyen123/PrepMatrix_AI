import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, CalendarPlus, Check, Clock3, Flag, MapPin, Plus, RefreshCw, UsersRound } from "lucide-react";
import api from "../utils/apiClient";
import { buildDirectionsUrl } from "../utils/nearby";
import NearbyDialog from "./NearbyDialog";

function CircleForm({ origin, radius, subject, chapter, profile, onClose, onCreated }) {
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true); setError("");
    const params = new URLSearchParams({ ...origin, radius, category: "spots" });
    api.get(`/api/nearby/places?${params}`, { timeoutMs: 45000 }).then((data) => { if (live) setVenues(data.places || []); }).catch((failure) => { if (live) setError(failure.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [origin, radius, retry]);
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const venue = venues.find((entry) => entry.id === form.get("venue"));
    const startsAt = new Date(form.get("startsAt"));
    if (!venue || !Number.isFinite(startsAt.getTime()) || startsAt <= new Date()) { setError("Choose a listed public venue and a future session time."); return; }
    setBusy(true); setError("");
    try {
      const data = await api.post("/api/nearby/circles", {
        title: form.get("title"), subject: form.get("subject"), chapter: form.get("chapter"),
        board: form.get("board"), language: form.get("language"), agenda: form.get("agenda"),
        startsAt: startsAt.toISOString(), durationMinutes: Number(form.get("duration")), capacity: Number(form.get("capacity")),
        venue, publicVenueConfirmed: form.get("permission") === "on",
      }, { timeoutMs: 45000 });
      onCreated(data.circle); onClose();
    } catch (failure) { setError(failure.message || "Could not create the session."); }
    finally { setBusy(false); }
  }
  return <NearbyDialog title="Host a revision circle" onClose={() => { if (!busy) onClose(); }}>
    <p className="nearby-muted">Bring a small group together at a listed study venue. Confirm the venue permits group discussions before publishing.</p>
    <form className="nearby-form-grid" onSubmit={submit}>
      <label className="nearby-wide">Session title<input name="title" required minLength={4} maxLength={100} placeholder="e.g. Integration revision together" /></label>
      <label>Subject<input name="subject" required minLength={2} maxLength={100} defaultValue={subject} placeholder="Mathematics" /></label>
      <label>Chapter / topic<input name="chapter" required minLength={2} maxLength={140} defaultValue={chapter} placeholder="Integration" /></label>
      <label>Syllabus / course<input name="board" maxLength={120} defaultValue={profile.board} placeholder="e.g. CBSE Class 12" /></label>
      <label>Language<input name="language" maxLength={80} placeholder="e.g. English, Tamil" /></label>
      <label className="nearby-wide">Public study venue<select name="venue" required disabled={loading || !venues.length}><option value="">{loading ? "Finding study venues…" : "Choose a venue"}</option>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}{venue.address ? ` — ${venue.address}` : ""}</option>)}</select></label>
      {!loading && !venues.length && <p className="nearby-muted nearby-wide">No venues found. Try a wider search radius before hosting.</p>}
      <label>Date & time<input type="datetime-local" name="startsAt" required /></label>
      <label>Duration<select name="duration" defaultValue="90">{[30, 60, 90, 120, 180, 240].map((value) => <option value={value} key={value}>{value} minutes</option>)}</select></label>
      <label>Group size, including you<input type="number" name="capacity" min={2} max={20} defaultValue={6} required /></label>
      <label className="nearby-wide">Revision agenda<textarea name="agenda" rows={3} maxLength={1200} placeholder="Topics to cover, exercises to try and what to bring." /></label>
      <label className="nearby-checkbox nearby-wide"><input type="checkbox" name="permission" required />I have confirmed that this venue permits our study group.</label>
      {error && <p className="nearby-notice nearby-wide" data-tone="error" role="alert">{error}{!venues.length && <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry venues</button>}</p>}
      <div className="nearby-dialog-actions nearby-wide"><button type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="nearby-primary" type="submit" disabled={busy || loading || !venues.length}>{busy ? "Publishing…" : "Publish circle"}</button></div>
    </form>
  </NearbyDialog>;
}

export default function NearbyCircles({ origin, radius, subject, chapter, profile, onPlan }) {
  const [circles, setCircles] = useState([]);
  const [canParticipate, setCanParticipate] = useState(false);
  const [requiresParentAccess, setRequiresParentAccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [manageId, setManageId] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [reporting, setReporting] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [mine, setMine] = useState(false);
  const requestGeneration = useRef(0);
  useEffect(() => {
    const generation = ++requestGeneration.current;
    if (!origin && !mine) return;
    setLoading(true); setError(""); setCircles([]); setCanParticipate(false);
    const params = new URLSearchParams({ ...(origin || {}), radius, ...(mine ? { mine: "true" } : {}) });
    api.get(`/api/nearby/circles?${params}`).then((data) => {
      if (generation !== requestGeneration.current) return;
      setCircles(data.circles || []); setCanParticipate(data.canParticipate === true); setRequiresParentAccess(data.requiresParentAccess === true);
    }).catch((failure) => { if (generation === requestGeneration.current) setError(failure.message); }).finally(() => { if (generation === requestGeneration.current) setLoading(false); });
    return () => { requestGeneration.current += 1; };
  }, [origin, radius, refresh, mine]);
  const visible = useMemo(() => circles.filter((circle) => {
    if (mine && !circle.isHost && !circle.myStatus) return false;
    return (!subject || circle.subject.toLowerCase().includes(subject.toLowerCase())) && (!chapter || circle.chapter.toLowerCase().includes(chapter.toLowerCase()));
  }), [circles, subject, chapter, mine]);
  const managed = circles.find((circle) => circle.id === manageId);
  function replace(circle) { setCircles((current) => current.some((entry) => entry.id === circle.id) ? current.map((entry) => entry.id === circle.id ? circle : entry) : [circle, ...current]); }
  async function action(circle, path, body = {}) {
    const generation = requestGeneration.current;
    setBusy(circle.id); setError(""); setMessage("");
    try {
      const data = await api.post(`/api/nearby/circles/${encodeURIComponent(circle.id)}/${path}`, body);
      if (generation !== requestGeneration.current) return;
      if (data.circle) replace(data.circle);
      setMessage(path === "join" ? "Join request sent. The host will review it." : path === "report" ? "Report submitted for review. This circle is now hidden from your discovery results." : "Circle updated.");
      if (path === "report") setCircles((current) => current.filter((entry) => entry.id !== circle.id));
      setConfirmation(null); setReporting(null);
    } catch (failure) { if (generation === requestGeneration.current) setError(failure.message || "Could not update this circle."); }
    finally { setBusy(""); }
  }
  if (!origin && !mine) return <div className="nearby-empty"><span className="nearby-empty-icon"><UsersRound size={30} /></span><h3>Find your revision people.</h3><p>Choose an area above to discover sessions at nearby libraries and study venues.</p><button type="button" onClick={() => setMine(true)}>My circles & requests</button></div>;
  return <div className="nearby-circles" aria-busy={loading}>
    <div className="nearby-result-meta"><button type="button" aria-pressed={mine} onClick={() => setMine((value) => !value)}>{mine ? "Show all circles" : "My circles & requests"}</button><div className="nearby-actions"><button type="button" onClick={() => setRefresh((value) => value + 1)} disabled={loading || Boolean(busy)}><RefreshCw size={14} />Refresh</button><button type="button" className="nearby-primary" disabled={!canParticipate || loading || !origin} onClick={() => setCreating(true)}><Plus size={16} />Host a circle</button></div></div>
    {requiresParentAccess && !canParticipate && <p className="nearby-notice">School profiles can explore circles. Creating or joining requires an eligible parent-unlocked session; independent participation is unavailable for this profile.</p>}
    {error && <p className="nearby-notice" data-tone="error" role="alert">{error}</p>}
    {message && <p className="nearby-notice" data-tone="success" role="status">{message}</p>}
    {loading ? <div className="nearby-loading" role="status"><span className="nearby-spinner" />Finding revision circles…</div> : !visible.length ? <div className="nearby-empty"><span className="nearby-empty-icon"><UsersRound size={30} /></span><h3>{mine ? "No matching sessions or requests." : "The next circle could start with you."}</h3><p>{mine ? "Your hosted sessions and join requests appear here across all locations." : "No sessions match this area and topic yet. Try a wider radius, or host a session at a listed study venue."}</p></div> : <div className="nearby-card-grid">{visible.map((circle) => <article className="nearby-card" key={circle.id}>
      <div className="nearby-card-heading"><span className="nearby-place-icon"><UsersRound size={21} /></span><div><h3>{circle.title}</h3><p className="nearby-subtitle">Hosted by {circle.isHost ? "you" : circle.hostName} · {circle.joinedCount}/{circle.capacity} participants</p></div></div>
      <div className="nearby-badges"><span>{circle.subject}</span><span>{circle.chapter}</span>{circle.board && <span>{circle.board}</span>}{circle.status === "cancelled" ? <span>Cancelled</span> : new Date(circle.startsAt) <= new Date() ? <span>Session started / past</span> : null}{circle.myStatus && <span>{circle.myStatus === "pending" ? "Awaiting host approval" : circle.myStatus === "approved" ? "You’re confirmed" : "Request declined"}</span>}</div>
      <p className="nearby-card-description"><MapPin size={15} />{circle.venue.name}</p><p className="nearby-card-description"><Clock3 size={15} />{new Date(circle.startsAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · {circle.durationMinutes} min</p>
      {circle.agenda && <p className="nearby-circle-agenda">{circle.agenda}</p>}
      <div className="nearby-card-actions">
        {circle.status === "active" && new Date(circle.startsAt) > new Date() && circle.isHost ? <button type="button" className="nearby-primary" onClick={() => setManageId(circle.id)}>Manage requests{circle.requests?.filter((request) => request.status === "pending").length ? ` (${circle.requests.filter((request) => request.status === "pending").length})` : ""}</button> : circle.status === "active" && new Date(circle.startsAt) > new Date() && !circle.myStatus ? <button type="button" className="nearby-primary" disabled={!canParticipate || Boolean(busy) || !circle.remainingSeats} onClick={() => action(circle, "join")}>{busy === circle.id ? "Sending…" : circle.remainingSeats ? "Request to join" : "Circle full"}</button> : null}
        {circle.status === "active" && new Date(circle.startsAt) > new Date() && (circle.isHost || circle.myStatus === "approved") && <button type="button" onClick={() => onPlan(circle)}><CalendarPlus size={15} />Add reminder</button>}
        <a href={buildDirectionsUrl(circle.venue)} target="_blank" rel="noopener noreferrer">Venue<ArrowUpRight size={14} /></a>
        {circle.status === "active" && new Date(circle.startsAt) > new Date() && circle.myStatus && <button type="button" disabled={Boolean(busy)} onClick={() => setConfirmation({ circle, path: "leave" })}>{circle.myStatus === "pending" ? "Withdraw request" : "Leave"}</button>}
        {!circle.isHost && <button className="nearby-icon-button" type="button" aria-label={`Report ${circle.title}`} disabled={Boolean(busy)} onClick={() => setReporting(circle)}><Flag size={15} /></button>}
      </div>
    </article>)}</div>}
    {creating && <CircleForm origin={origin} radius={radius} subject={subject} chapter={chapter} profile={profile} onClose={() => setCreating(false)} onCreated={(circle) => { replace(circle); setMessage("Your revision circle is published. You can review join requests here."); }} />}
    {managed && <NearbyDialog title={`Manage ${managed.title}`} onClose={() => setManageId("")}><p className="nearby-muted">{managed.joinedCount} of {managed.capacity} spaces confirmed, including you.</p>{error && <p role="alert" className="nearby-notice" data-tone="error">{error}</p>}<div className="nearby-circle-members">{!managed.requests?.length ? <p>No join requests yet. Use Refresh to check for new requests.</p> : managed.requests.map((request) => <div key={request.id}><span><strong>{request.name}</strong><small>{request.status}</small></span>{request.status === "pending" && <div className="nearby-actions"><button type="button" disabled={Boolean(busy) || !managed.remainingSeats} onClick={() => action(managed, `requests/${encodeURIComponent(request.id)}`, { action: "approve" })}><Check size={14} />Approve</button><button type="button" disabled={Boolean(busy)} onClick={() => action(managed, `requests/${encodeURIComponent(request.id)}`, { action: "decline" })}>Decline</button></div>}</div>)}</div><div className="nearby-dialog-actions"><button type="button" disabled={Boolean(busy)} onClick={() => { setManageId(""); setConfirmation({ circle: managed, path: "cancel" }); }}>Cancel session</button></div></NearbyDialog>}
    {confirmation && <NearbyDialog title={confirmation.path === "cancel" ? "Cancel this revision circle?" : "Leave this revision circle?"} onClose={() => { if (!busy) setConfirmation(null); }}><p>{confirmation.path === "cancel" ? "The session will be marked cancelled for all participants." : "Your place or pending request will be removed."}</p>{error && <p className="nearby-notice" data-tone="error" role="alert">{error}</p>}<div className="nearby-dialog-actions"><button type="button" disabled={Boolean(busy)} onClick={() => setConfirmation(null)}>Keep it</button><button type="button" disabled={Boolean(busy)} onClick={() => action(confirmation.circle, confirmation.path)}>{busy ? "Updating…" : "Confirm"}</button></div></NearbyDialog>}
    {reporting && <NearbyDialog title="Report a revision circle" onClose={() => { if (!busy) setReporting(null); }}><form onSubmit={(event) => { event.preventDefault(); action(reporting, "report", { reason: new FormData(event.currentTarget).get("reason") }); }}><label>What should we review?<textarea name="reason" required minLength={10} maxLength={1000} rows={4} placeholder="Describe the problem with this listing or session." /></label>{error && <p className="nearby-notice" data-tone="error" role="alert">{error}</p>}<div className="nearby-dialog-actions"><button type="submit" disabled={Boolean(busy)}>{busy ? "Submitting…" : "Submit report"}</button></div></form></NearbyDialog>}
  </div>;
}
