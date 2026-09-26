import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, ArrowUpRight, Bookmark, CalendarPlus, Check, Clock3, Compass,
  Copy, GraduationCap, Library, List, LocateFixed, Map, MapPin, Phone,
  Search, SlidersHorizontal, UsersRound, X,
} from "lucide-react";
import api from "../utils/apiClient";
import {
  buildDirectionsUrl, buildMapSearchUrl, buildPhoneHref, filterNearbyPlaces,
  getNearbyProfileContext, getNearbyStorageKey, normalizeCoordinates,
  readNearbyPreferences, writeNearbyPreferences,
} from "../utils/nearby";
import { createPlannerId, getLocalDateKey, normalizePlannerData } from "../utils/goalReminderStore";
import NearbyCircles from "../components/NearbyCircles";
import NearbyDialog from "../components/NearbyDialog";
import "./NearbyPage.css";

const TABS = [
  { id: "tuitions", label: "Tuitions & Institutions", short: "Learn with the right people", icon: GraduationCap, title: "A better fit for your next chapter", description: "Explore local teaching centres and compare the batch details they provide." },
  { id: "spots", label: "Study Spots", short: "Find your place to focus", icon: Library, title: "Make room for a little focus", description: "Discover libraries and study spaces. Check facilities and entry rules before you go." },
  { id: "circles", label: "Revision Circles", short: "Make progress together", icon: UsersRound, title: "Same topic. Shared momentum.", description: "Join a hosted revision session at a public study venue near you." },
  { id: "rescue", label: "Chapter Rescue", short: "A little help, a phone call away", icon: Phone, title: "Get unstuck, one call at a time", description: "Find published teaching contacts and tutors offering phone support for your chapter." },
];
const ACTIVITIES = [ ["", "Any study activity"], ["quiet", "Quiet reading & revision"], ["coding", "Coding & laptop work"], ["online", "Online classes"], ["group", "Group discussion"] ];

function safeUrl(value) {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; }
}
function words(value) { return Array.isArray(value) ? value.join(", ") : String(value || ""); }
function browserStorage() { try { return window.localStorage; } catch { return null; } }
function updatedLabel(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "Not provided";
}

function PlaceFacts({ place }) {
  return <dl className="nearby-facts">
    <div><dt>Address</dt><dd>{place.address || "See location on map"}</dd></div>
    <div><dt>Opening / call hours</dt><dd>{place.callHours || place.hours || "Contact to confirm"}</dd></div>
    <div><dt>Fees</dt><dd>{place.fees || "Not provided"}</dd></div>
    {place.board && <div><dt>Syllabus</dt><dd>{place.board}</dd></div>}
    {place.language && <div><dt>Language</dt><dd>{words(place.language)}</dd></div>}
    {place.subjects?.length > 0 && <div><dt>Subjects</dt><dd>{words(place.subjects)}</dd></div>}
    {place.facilities?.length > 0 && <div><dt>Facilities</dt><dd>{words(place.facilities)}</dd></div>}
    {place.access && <div><dt>Access</dt><dd>{place.access}</dd></div>}
  </dl>;
}

function PlaceCard({ place, tab, saved, compared, onSave, onDetails, onCompare, onMap, onPlan, onCopy }) {
  const Icon = tab === "spots" ? Library : tab === "rescue" ? Phone : GraduationCap;
  const phoneHref = buildPhoneHref(place.phone);
  return <article className="nearby-card">
    <div className="nearby-card-heading">
      <span className="nearby-place-icon"><Icon size={21} /></span>
      <div><h3>{place.name}</h3><p className="nearby-subtitle">{Number.isFinite(place.distanceKm) ? `${place.distanceKm.toFixed(1)} km away` : "Nearby listing"}{place.type ? ` · ${place.type.replaceAll("_", " ")}` : ""}</p></div>
      <button className="nearby-icon-button" type="button" aria-label={`${saved ? "Unsave" : "Save"} ${place.name}`} aria-pressed={saved} data-active={saved} onClick={() => onSave(place.id)}><Bookmark size={18} fill={saved ? "currentColor" : "none"} /></button>
    </div>
    <p className="nearby-card-description"><MapPin size={14} />{place.address || "Address details not provided; view the map location."}</p>
    <div className="nearby-badges">{place.matchReasons?.slice(0, 3).map((reason) => <span key={reason}>{reason}</span>)}{tab === "rescue" && <span>{place.phoneSupport ? "Phone doubt support" : "General teaching enquiry"}</span>}</div>
    <div className="nearby-card-summary">
      <span><Clock3 size={14} />{place.callHours || place.hours || "Hours: contact to confirm"}</span>
      <span>{tab === "tuitions" ? place.batches?.length ? `${place.batches.length} listed batch${place.batches.length === 1 ? "" : "es"}` : "Batch details: contact to confirm" : tab === "spots" ? words(place.facilities) || "Facilities: contact to confirm" : place.phoneSupport ? `Support fee: ${place.fees || "ask before your call"}` : "Ask whether chapter help is available"}</span>
    </div>
    {tab === "rescue" && phoneHref && <div className="nearby-phone"><a href={phoneHref}>{place.phone}</a><button className="nearby-icon-button" aria-label={`Copy phone number for ${place.name}`} type="button" onClick={() => onCopy(place.phone)}><Copy size={15} /></button></div>}
    <div className="nearby-card-actions">
      {tab === "rescue" && phoneHref ? <a className="nearby-primary" href={phoneHref}><Phone size={15} />{place.phoneSupport ? "Call tutor" : "Call to enquire"}</a> : <button className="nearby-primary" type="button" onClick={() => onDetails(place)}>View details<ArrowUpRight size={15} /></button>}
      {tab !== "rescue" && <button type="button" onClick={() => onMap(place)}><Map size={15} />Map</button>}
      {tab === "tuitions" && <button type="button" aria-pressed={compared} onClick={() => onCompare(place)}>{compared ? <Check size={14} /> : null}Compare</button>}
      {tab === "spots" && <button type="button" onClick={() => onPlan(place)}><CalendarPlus size={15} />Plan session</button>}
      {tab === "rescue" && <button type="button" onClick={() => onDetails(place)}>Details</button>}
    </div>
    <p className="nearby-source">{safeUrl(place.sourceUrl) ? <a href={safeUrl(place.sourceUrl)} target="_blank" rel="noopener noreferrer">{place.source || "Listing source"}<ArrowUpRight size={11} /></a> : place.source || "Provider listing"} · Updated {updatedLabel(place.updatedAt)}</p>
  </article>;
}

function LocalMap({ origin, places, selected, onSelect, radius }) {
  const point = normalizeCoordinates(selected?.lat, selected?.lon) || origin;
  if (!point) return null;
  const delta = selected ? .008 : Math.max(.008, radius / 111);
  const longitudeDelta = delta / Math.max(.15, Math.cos(point.lat * Math.PI / 180));
  const bbox = [Math.max(-180, point.lon - longitudeDelta), Math.max(-85, point.lat - delta), Math.min(180, point.lon + longitudeDelta), Math.min(85, point.lat + delta)].join(",");
  const params = new URLSearchParams({ bbox, layer: "mapnik", ...(selected ? { marker: `${point.lat},${point.lon}` } : {}) });
  return <div className="nearby-map-panel">
    <label className="nearby-map-select">Show on map<select value={selected?.id || ""} onChange={(event) => onSelect(places.find((place) => place.id === event.target.value) || null)}><option value="">Search area</option>{places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}</select></label>
    <iframe title={selected ? `Map of ${selected.name}` : "Map of your search area"} src={`https://www.openstreetmap.org/export/embed.html?${params}`} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
    <div className="nearby-map-caption"><span>{selected ? selected.name : "Choose a result to see its location pin."}</span>{selected && <a href={buildDirectionsUrl(selected)} target="_blank" rel="noopener noreferrer">Get directions<ArrowUpRight size={14} /></a>}</div>
  </div>;
}

function PlanSession({ place, onClose, onPlannerDataChange, onSuccess }) {
  const [error, setError] = useState("");
  const circle = Boolean(place.startsAt);
  const start = circle ? new Date(place.startsAt) : new Date();
  function submit(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const when = new Date(`${fields.get("date")}T${fields.get("time")}`);
    if (!Number.isFinite(when.getTime()) || when <= new Date()) { setError("Choose a future date and time."); return; }
    const count = Number(fields.get("repeat") || 1);
    const reminders = Array.from({ length: count }, (_, index) => {
      const date = new Date(when); date.setDate(date.getDate() + index * 7);
      return { id: createPlannerId("nearby"), title: String(fields.get("title")).trim().slice(0, 120), notes: `${place.address || place.venue?.address || ""}\n${fields.get("notes") || ""}`.trim().slice(0, 800), date: getLocalDateKey(date), time: String(fields.get("time")), category: "study", createdAt: new Date().toISOString() };
    });
    onPlannerDataChange((current) => normalizePlannerData({ ...current, reminders: [...(current.reminders || []), ...reminders] }));
    onSuccess(`${count === 1 ? "Session" : "Weekly sessions"} added to your study reminders.`);
    onClose();
  }
  return <NearbyDialog title="Plan a study session" onClose={onClose}>
    <p className="nearby-muted">Save a reminder in your existing study planner. Include time for travel.</p>
    <form onSubmit={submit} className="nearby-form-grid">
      <label className="nearby-wide">Session title<input name="title" required maxLength={120} defaultValue={place.title || `Study at ${place.name}`} /></label>
      <label>Date<input type="date" name="date" required min={getLocalDateKey(new Date())} defaultValue={getLocalDateKey(start)} /></label>
      <label>Time<input type="time" name="time" required defaultValue={circle ? start.toTimeString().slice(0, 5) : "17:00"} /></label>
      {!circle && <label className="nearby-wide">Repeat<select name="repeat"><option value="1">One session</option><option value="4">Weekly for 4 weeks</option><option value="8">Weekly for 8 weeks</option></select></label>}
      <label className="nearby-wide">Study goal / travel notes<textarea name="notes" rows={3} maxLength={600} placeholder="What will you work on? When should you leave?" defaultValue={place.agenda || ""} /></label>
      {error && <p className="nearby-notice nearby-wide" data-tone="error" role="alert">{error}</p>}
      <div className="nearby-dialog-actions nearby-wide"><button type="button" onClick={onClose}>Cancel</button><button className="nearby-primary" type="submit"><CalendarPlus size={16} />Add reminder</button></div>
    </form>
  </NearbyDialog>;
}

function MapArtwork() {
  return <div className="nearby-orbit" aria-hidden="true"><svg className="nearby-map-art" viewBox="0 0 320 190" fill="none"><rect x="30" y="26" width="260" height="140" rx="24" fill="currentColor" opacity=".04"/><path d="M38 64L276 116M98 30L76 160M190 30L214 160M32 139L282 53" stroke="currentColor" strokeWidth="14" opacity=".07"/><path d="M84 126L120 93L190 108L238 60" stroke="currentColor" strokeWidth="2" strokeDasharray="5 6" opacity=".55"/><circle cx="162" cy="96" r="59" stroke="currentColor" strokeDasharray="3 7" opacity=".22"/><circle cx="162" cy="96" r="80" stroke="currentColor" opacity=".08"/>{[[84,126],[190,108],[238,60]].map(([x,y])=><g key={x}><circle cx={x} cy={y} r="13" fill="var(--surface-strong)"/><circle cx={x} cy={y} r="4" fill="currentColor"/></g>)}<path d="M143 74C143 48 180 48 180 74C180 90 162 104 162 104C162 104 143 90 143 74Z" fill="currentColor"/><circle cx="162" cy="72" r="6" fill="var(--surface-strong)"/></svg><span>Your next chapter is closer.</span></div>;
}

export default function NearbyPage({ academicProfile = {}, academicProfileDataId = "", userProfile = {}, subjects = [], schedule = [], homeRoute = "/dashboard", onPlannerDataChange }) {
  const navigate = useNavigate();
  const profile = useMemo(() => getNearbyProfileContext(academicProfile, subjects), [academicProfile, subjects]);
  const storageKey = getNearbyStorageKey(userProfile.id || userProfile._id || userProfile.email, academicProfileDataId);
  const [prefs, setPrefs] = useState(() => readNearbyPreferences(browserStorage(), storageKey));
  const [tab, setTab] = useState(() => TABS.some((item) => item.id === prefs.activeTab) ? prefs.activeTab : "tuitions");
  const [locality, setLocality] = useState(prefs.locality || "");
  const [origin, setOrigin] = useState(null);
  const [locationLabel, setLocationLabel] = useState("");
  const [locations, setLocations] = useState([]);
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [places, setPlaces] = useState([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [chapter, setChapter] = useState("");
  const [language, setLanguage] = useState("");
  const [timing, setTiming] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const [view, setView] = useState("list");
  const [mapPlace, setMapPlace] = useState(null);
  const [details, setDetails] = useState(null);
  const [comparison, setComparison] = useState([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [planning, setPlanning] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const locationRequest = useRef(0);
  const active = TABS.find((item) => item.id === tab);
  const subject = prefs.subject || "";
  const radius = Number(prefs.radius) || 5;
  const savedIds = useMemo(() => prefs.savedIds || [], [prefs.savedIds]);
  const resultMapRef = useRef(null);

  useEffect(() => { writeNearbyPreferences(browserStorage(), storageKey, { ...prefs, activeTab: tab }); }, [prefs, storageKey, tab]);
  useEffect(() => () => { locationRequest.current += 1; }, []);
  useEffect(() => {
    if (!origin || tab === "circles") return;
    let current = true;
    setLoading(true); setError(""); setNotice(""); setPlaces([]); setMapPlace(null);
    const params = new URLSearchParams({ lat: origin.lat, lon: origin.lon, radius, category: tab });
    api.get(`/api/nearby/places?${params}`, { timeoutMs: 45000 }).then((data) => {
      if (!current) return;
      setPlaces(Array.isArray(data.places) ? data.places : []); setNotice(data.notice || "");
    }).catch((failure) => { if (current) setError(failure.message || "Could not load nearby places. Please try again."); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [origin, radius, tab, refresh]);

  const visible = useMemo(() => filterNearbyPlaces(places, { query, subject, activity: tab === "spots" ? prefs.activity : "", budget: prefs.budget, savedOnly, savedIds, origin, radius, category: tab, board: profile.board, level: profile.level, chapter, language: tab === "tuitions" ? language : "", timing: tab === "tuitions" ? timing : "" }), [places, query, subject, tab, prefs.activity, prefs.budget, savedOnly, savedIds, origin, radius, profile.board, profile.level, chapter, language, timing]);
  const today = getLocalDateKey(new Date());
  const todayTasks = schedule.find((day) => day.date === today)?.tasks || [];
  function preference(key, value) { setPrefs((current) => ({ ...current, [key]: value })); }
  function selectLocation(location) {
    const point = normalizeCoordinates(location.lat, location.lon);
    if (!point) { setError("That location could not be used. Try another area."); return; }
    setOrigin(point); setLocationLabel(location.label); setLocations([]); setMapPlace(null); setComparison([]); setError("");
  }
  async function searchLocation(event) {
    event.preventDefault();
    if (locality.trim().length < 3) return;
    const request = ++locationRequest.current;
    setLocating(true); setError(""); setLocations([]);
    preference("locality", locality.trim());
    try {
      const data = await api.get(`/api/nearby/geocode?q=${encodeURIComponent(locality.trim())}`, { timeoutMs: 20000 });
      if (request !== locationRequest.current) return;
      if (data.locations?.length === 1) selectLocation(data.locations[0]);
      else if (data.locations?.length) setLocations(data.locations);
      else setError("No matching area found. Include a city or try a nearby pincode.");
    } catch (failure) { if (request === locationRequest.current) setError(failure.message || "Location search is unavailable. Try again."); }
    finally { if (request === locationRequest.current) setLocating(false); }
  }
  function useLocation() {
    if (!navigator.geolocation) { setError("Location access is unavailable in this browser. Enter an area instead."); return; }
    const request = ++locationRequest.current;
    setLocating(true); setError(""); setLocations([]);
    navigator.geolocation.getCurrentPosition((position) => {
      if (request !== locationRequest.current) return;
      selectLocation({ lat: position.coords.latitude, lon: position.coords.longitude, label: "Your current location" }); setLocating(false);
    }, (failure) => {
      if (request !== locationRequest.current) return;
      setError(failure.code === 1 ? "Location permission was declined. Enter an area or pincode to continue." : "Could not get your location. Try entering an area or pincode."); setLocating(false);
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 120000 });
  }
  function toggleSave(id) { setPrefs((current) => ({ ...current, savedIds: current.savedIds?.includes(id) ? current.savedIds.filter((value) => value !== id) : [...(current.savedIds || []), id] })); }
  function toggleCompare(place) {
    if (comparison.some((entry) => entry.id === place.id)) setComparison((current) => current.filter((entry) => entry.id !== place.id));
    else if (comparison.length < 2) setComparison((current) => [...current, place]);
    else setMessage("Choose up to two institutions to compare. Deselect one to change your selection.");
  }
  async function copyNumber(phone) {
    try { await navigator.clipboard.writeText(phone); setMessage("Phone number copied."); } catch { setMessage("Copy is unavailable. Select the displayed phone number to copy it."); }
  }
  function showMap(place) { setMapPlace(place); setView("map"); setTimeout(() => resultMapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); }
  function changeTab(id) { if (id === tab) return; setTab(id); setPlaces([]); setError(""); setNotice(""); setQuery(""); setComparison([]); setMapPlace(null); setMessage(""); }

  return <section className="nearby-page page-stack">
    <header className="nearby-header">
      <button className="page-back-control nearby-back" type="button" aria-label="Back to previous page" onClick={() => window.history.state?.idx > 0 ? navigate(-1) : navigate(homeRoute)}><ArrowLeft size={18} /></button>
      <div><span className="nearby-eyebrow"><Compass size={14} />YOUR LOCAL LEARNING COMPANION</span><h1>PrepMatrix <span>Nearby</span></h1><p>Good places. Helpful people. Your next step.</p></div>
      <div className="nearby-profile"><GraduationCap size={16} /><span>{profile.label || "Your learning profile"}</span></div>
    </header>
    <div className="nearby-hero">
      <div className="nearby-location-content"><h2>Where would you like to learn?</h2><p>Start with your neighbourhood. We’ll help you explore what’s around.</p>
        <form className="nearby-location-form" onSubmit={searchLocation}><label htmlFor="nearby-locality">Area, city or pincode</label><div className="nearby-location-row"><div className="nearby-search-input"><Search size={18} /><input id="nearby-locality" value={locality} onChange={(event) => setLocality(event.target.value)} placeholder="e.g. Anna Nagar, Chennai" minLength={3} maxLength={160} required autoComplete="off" /></div><button className="nearby-primary" disabled={locating} type="submit">{locating ? "Finding…" : "Explore"}<ArrowUpRight size={16} /></button></div></form>
        <div className="nearby-location-bottom"><button type="button" className="nearby-text-button" disabled={locating} onClick={useLocation}><LocateFixed size={15} />Use my location</button><span>Location is used only when you choose.</span></div>
        {locations.length > 0 && <div className="nearby-location-options" aria-label="Choose your location">{locations.map((location, index) => <button type="button" key={`${location.lat}-${location.lon}-${index}`} onClick={() => selectLocation(location)}><MapPin size={15} />{location.label}<ArrowUpRight size={14} /></button>)}</div>}
        {origin && <div className="nearby-location-current"><MapPin size={14} /><span>{locationLabel}</span></div>}
      </div><MapArtwork />
    </div>
    <nav className="nearby-tabs" aria-label="Nearby features">{TABS.map(({ id, label, short, icon }) => <button type="button" key={id} className="nearby-tab" data-active={tab === id} aria-current={tab === id ? "page" : undefined} onClick={() => changeTab(id)}><span className="nearby-tab-icon">{(() => { const TabIcon = icon; return <TabIcon size={21} />; })()}</span><span><strong>{label}</strong><small>{short}</small></span></button>)}</nav>
    {error && <div className="nearby-notice" data-tone="error" role="alert">{error}{origin && !locating && <button type="button" onClick={() => setRefresh((value) => value + 1)}>Retry places</button>}</div>}
    {message && <div className="nearby-notice" data-tone="success" role="status">{message}<button className="nearby-icon-button" aria-label="Dismiss notification" type="button" onClick={() => setMessage("")}><X size={16} /></button></div>}
    <div className="nearby-workspace">
      <div className="nearby-toolbar"><div><h2>{active.title}</h2><p>{active.description}</p></div>{tab !== "circles" && <div className="nearby-view-toggle" aria-label="Result view"><button type="button" aria-pressed={view === "list"} data-active={view === "list"} onClick={() => setView("list")}><List size={16} />List</button><button type="button" aria-pressed={view === "map"} data-active={view === "map"} onClick={() => setView("map")}><Map size={16} />Map</button></div>}</div>
      <div className="nearby-filters">
        <label>Search radius<select value={radius} onChange={(event) => preference("radius", Number(event.target.value))}>{[2, 5, 10, 20].map((value) => <option key={value} value={value}>Within {value} km</option>)}</select></label>
        {tab !== "spots" ? <label>Subject<input list="nearby-subjects" value={subject} onChange={(event) => preference("subject", event.target.value)} placeholder="Any subject" maxLength={100} /><datalist id="nearby-subjects">{profile.subjectOptions.map((value) => <option key={value} value={value} />)}</datalist></label> : <label>Today’s activity<select value={prefs.activity || ""} onChange={(event) => preference("activity", event.target.value)}>{ACTIVITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        {tab === "rescue" || tab === "circles" ? <label>Chapter / topic<input value={chapter} onChange={(event) => setChapter(event.target.value)} placeholder="e.g. Integration" maxLength={120} /></label> : <label>Search results<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tab === "spots" ? "Place name or facility" : "Institution or batch"} maxLength={100} /></label>}
        {tab !== "circles" && <button type="button" className="nearby-saved-filter" aria-pressed={savedOnly} data-active={savedOnly} onClick={() => setSavedOnly((value) => !value)}><Bookmark size={16} />Saved places</button>}
      </div>
      {tab === "tuitions" && <details className="nearby-match-options"><summary><SlidersHorizontal size={14} />Match to your progress & preferences</summary><div className="nearby-filters"><label>Current chapter<input value={chapter} onChange={(event) => setChapter(event.target.value)} placeholder="e.g. Integration" maxLength={120} /></label><label>Teaching language<input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="Any language" maxLength={60} /></label><label>Preferred timing<input value={timing} onChange={(event) => setTiming(event.target.value)} placeholder="e.g. Saturday or evening" maxLength={80} /></label></div><p>Uses your {profile.label || "academic profile"}. Matching details are based on listed batches; confirm fees, timings and seats with the provider.</p></details>}
      {tab === "spots" && todayTasks.length > 0 && <div className="nearby-today"><CalendarPlus size={16} /><span>On your plan today: {todayTasks.slice(0, 2).map((task) => task.task || task.title || task.subject || "Study session").join(" · ")}</span></div>}
      {tab === "rescue" && chapter && <div className="nearby-today"><Phone size={16} /><span>Before you call: “I’m studying {subject || "this subject"} and need help with {chapter}. Do you offer phone support, and is there a fee?”</span></div>}
      {tab === "circles" ? <NearbyCircles origin={origin} radius={radius} subject={subject} chapter={chapter} profile={profile} onPlan={setPlanning} /> : !origin ? <div className="nearby-empty"><span className="nearby-empty-icon"><active.icon size={30} /></span><h3>Your neighbourhood has possibilities.</h3><p>Enter an area above to discover {tab === "spots" ? "places to study" : tab === "rescue" ? "teaching contacts" : "tuitions and institutions"} near you.</p><span className="nearby-empty-hint"><MapPin size={14} />You choose the location. We find the starting points.</span></div> : <div className="nearby-results" aria-busy={loading}>
        {notice && <p className="nearby-notice">{notice}</p>}
        {loading ? <div className="nearby-loading" role="status"><span className="nearby-spinner" />Finding places around you…<small>Local map searches can take a few moments.</small></div> : <>
          <div className="nearby-result-meta"><span>{visible.length} {visible.length === 1 ? "place" : "places"} in this search{savedOnly ? " · saved only" : ""}</span>{comparison.length > 0 && <button type="button" disabled={comparison.length < 2} onClick={() => setCompareOpen(true)}>Compare selected ({comparison.length}/2)</button>}</div>
          {view === "map" && <div ref={resultMapRef}><LocalMap origin={origin} places={visible} selected={visible.find((place) => place.id === mapPlace?.id)} onSelect={setMapPlace} radius={radius} /></div>}
          {visible.length === 0 ? <div className="nearby-empty"><span className="nearby-empty-icon"><Search size={28} /></span><h3>{error ? "The search couldn’t finish." : savedOnly ? "No saved places in this search." : "No matching places found here."}</h3><p>{savedOnly ? "Save a result using its bookmark button, or show all places." : "Try a wider radius or fewer filters. Local listing coverage varies by area."}</p><div className="nearby-actions"><button type="button" onClick={() => { setQuery(""); setChapter(""); setLanguage(""); setTiming(""); setPrefs((current) => ({ ...current, subject: "", activity: "", budget: "all" })); setSavedOnly(false); }}>Clear filters</button><a href={buildMapSearchUrl(tab === "spots" ? "libraries study rooms" : `${subject} tuition centres`, origin)} target="_blank" rel="noopener noreferrer">Search on Google Maps<ArrowUpRight size={14} /></a></div></div> : <div className="nearby-card-grid">{visible.map((place) => <PlaceCard key={place.id} place={place} tab={tab} saved={savedIds.includes(place.id)} compared={comparison.some((entry) => entry.id === place.id)} onSave={toggleSave} onDetails={setDetails} onCompare={toggleCompare} onMap={showMap} onPlan={setPlanning} onCopy={copyNumber} />)}</div>}
        </>}
      </div>}
    </div>
    <footer className="nearby-footer"><span><SlidersHorizontal size={14} />Built around your learning, explored at your pace.</span><span>Place data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>. Confirm changing details with the venue.</span></footer>
    {details && <NearbyDialog title={details.name} onClose={() => setDetails(null)}><PlaceFacts place={details} />
      {details.batches?.length ? <div><h3>Listed batches</h3>{details.batches.map((batch, index) => <div className="nearby-batch" key={batch.id || index}><h4>{batch.name || batch.subject || `Batch ${index + 1}`}</h4><p>{[batch.board, batch.grade, batch.language].filter(Boolean).join(" · ")}</p><dl className="nearby-facts"><div><dt>Current chapter</dt><dd>{batch.currentChapter || batch.chapter || "Not provided"}</dd></div><div><dt>Timings</dt><dd>{words(batch.schedule || batch.timings) || "Contact to confirm"}</dd></div><div><dt>Fees / seats</dt><dd>{batch.fees || "Fees not provided"} · {batch.availableSeats ?? "Seats not provided"}</dd></div></dl></div>)}</div> : tab === "tuitions" && <p className="nearby-muted">Batch schedules, syllabus and seat availability have not been provided. Contact the institution to check your requirements.</p>}
      <div className="nearby-dialog-actions">{buildPhoneHref(details.phone) && <a className="nearby-primary" href={buildPhoneHref(details.phone)}><Phone size={15} />{details.phoneSupport ? "Call tutor" : "Call to enquire"}</a>}{tab !== "rescue" && <a href={buildDirectionsUrl(details)} target="_blank" rel="noopener noreferrer">Directions<ArrowUpRight size={14} /></a>}{safeUrl(details.website) && <a href={safeUrl(details.website)} target="_blank" rel="noopener noreferrer">Website<ArrowUpRight size={14} /></a>}{tab !== "rescue" && <button type="button" onClick={() => { setPlanning(details); setDetails(null); }}><CalendarPlus size={15} />Plan session</button>}</div>
    </NearbyDialog>}
    {compareOpen && <NearbyDialog title="Compare your options" onClose={() => setCompareOpen(false)}><div className="nearby-compare">{comparison.map((place) => <div key={place.id}><h3>{place.name}</h3><p>{place.distanceKm?.toFixed(1)} km away</p><PlaceFacts place={place} /><p>{place.batches?.length || 0} listed batches</p>{place.batches?.map((batch, index) => <div className="nearby-batch" key={batch.id || index}><h4>{batch.name || batch.subject || "Batch"}</h4><p>{[batch.board, batch.grade, batch.language].filter(Boolean).join(" · ")}</p><p>Chapter: {batch.chapter || "Not provided"}</p><p>Timings: {batch.schedule || "Not provided"}</p><p>Fees: {batch.fees || "Not provided"}</p></div>)}{buildPhoneHref(place.phone) && <a href={buildPhoneHref(place.phone)}>Call to enquire</a>}</div>)}</div></NearbyDialog>}
    {planning && <PlanSession place={planning} onClose={() => setPlanning(null)} onPlannerDataChange={onPlannerDataChange} onSuccess={setMessage} />}
  </section>;
}
