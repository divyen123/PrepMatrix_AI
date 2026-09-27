import { createElement, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft, ArrowUpRight, Bookmark, CalendarPlus, Clock3,
  Library, List, LocateFixed, Map, MapPin,
  Search, UsersRound, X,
} from "lucide-react";
import api from "../utils/apiClient";
import {
  buildDirectionsUrl, buildMapSearchUrl, filterNearbyPlaces,
  getNearbyProfileContext, getNearbyStorageKey, normalizeCoordinates,
  readNearbyPreferences, writeNearbyPreferences,
} from "../utils/nearby";
import { createPlannerId, getLocalDateKey, normalizePlannerData } from "../utils/goalReminderStore";
import { INITIAL_NEARBY_SEARCH, currentNearbySearch, nearbyRetrySeconds, nearbySearchKey, nearbySearchReducer } from "../utils/nearbySearchState";
import NearbyCircles from "../components/NearbyCircles";
import NearbyDialog from "../components/NearbyDialog";
import "./NearbyPage.css";

const NEARBY_DESTINATIONS = [
  { id: "spots", label: "Study Spots", icon: Library, path: "/nearby/spots" },
  { id: "circles", label: "Revision Circles", icon: UsersRound, path: "/nearby/circles" },
];
const ACTIVITIES = [ ["", "Any study activity"], ["quiet", "Quiet reading & revision"], ["coding", "Coding & laptop work"], ["online", "Online classes"], ["group", "Group discussion"] ];

function safeUrl(value) {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; }
}
function words(value) { return Array.isArray(value) ? value.join(", ") : String(value || ""); }
function browserStorage() { try { return window.localStorage; } catch { return null; } }
function updatedLabel(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
}

function PlaceFacts({ place }) {
  return <dl className="nearby-facts">
    <div><dt>Address</dt><dd>{place.address || "See location on map"}</dd></div>
    <div><dt>Opening hours</dt><dd>{place.hours || "Contact to confirm"}</dd></div>
    <div><dt>Fees</dt><dd>{place.fees || "Not provided"}</dd></div>
    {place.facilities?.length > 0 && <div><dt>Facilities</dt><dd>{words(place.facilities)}</dd></div>}
    {place.access && <div><dt>Access</dt><dd>{place.access}</dd></div>}
  </dl>;
}

function PlaceCard({ place, saved, onSave, onDetails, onMap, onPlan }) {
  const updated = updatedLabel(place.updatedAt);
  return <article className="nearby-card">
    <div className="nearby-card-heading">
      <span className="nearby-place-icon"><Library size={21} /></span>
      <div><h3>{place.name}</h3><p className="nearby-subtitle">{Number.isFinite(place.distanceKm) ? `${place.distanceKm.toFixed(1)} km away` : "Nearby listing"}{place.type ? ` · ${place.type.replaceAll("_", " ")}` : ""}</p></div>
      <button className="nearby-icon-button" type="button" aria-label={`${saved ? "Unsave" : "Save"} ${place.name}`} aria-pressed={saved} data-active={saved} onClick={() => onSave(place.id)}><Bookmark size={18} fill={saved ? "currentColor" : "none"} /></button>
    </div>
    <p className="nearby-card-description"><MapPin size={14} />{place.address || "Address details not provided; view the map location."}</p>
    <div className="nearby-card-summary">
      <span><Clock3 size={14} />{place.hours || "Hours: contact to confirm"}</span>
      <span>{words(place.facilities) || "Facilities: contact to confirm"}</span>
    </div>
    <div className="nearby-card-actions">
      <button className="nearby-primary" type="button" onClick={() => onDetails(place)}>View details<ArrowUpRight size={15} /></button>
      <button type="button" onClick={() => onMap(place)}><Map size={15} />Map</button>
      <button type="button" onClick={() => onPlan(place)}><CalendarPlus size={15} />Plan session</button>
    </div>
    <p className="nearby-source">{safeUrl(place.sourceUrl) ? <a href={safeUrl(place.sourceUrl)} target="_blank" rel="noopener noreferrer">{place.source || "Listing source"}<ArrowUpRight size={11} /></a> : place.source || "Provider listing"}{updated && ` · Updated ${updated}`}</p>
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

export default function NearbyPage({ academicProfile = {}, academicProfileDataId = "", userProfile = {}, subjects = [], schedule = [], homeRoute = "/dashboard", onPlannerDataChange }) {
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const pathname = routeLocation.pathname.replace(/\/+$/, "") || "/";
  const nearbyView = pathname === "/nearby" ? "hub" : pathname === "/nearby/spots" ? "spots" : pathname === "/nearby/circles" ? "circles" : null;
  const tab = nearbyView === "circles" ? "circles" : "spots";
  const profile = useMemo(() => getNearbyProfileContext(academicProfile, subjects), [academicProfile, subjects]);
  const storageKey = getNearbyStorageKey(userProfile.id || userProfile._id || userProfile.email, academicProfileDataId);
  const [prefs, setPrefs] = useState(() => readNearbyPreferences(browserStorage(), storageKey));
  const [locality, setLocality] = useState(prefs.locality || "");
  const [origin, setOrigin] = useState(null);
  const [locationLabel, setLocationLabel] = useState("");
  const [locations, setLocations] = useState([]);
  const [locating, setLocating] = useState(false);
  const [searchState, dispatchSearch] = useReducer(nearbySearchReducer, INITIAL_NEARBY_SEARCH);
  const [locationError, setLocationError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [chapter, setChapter] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const [view, setView] = useState("list");
  const [mapPlace, setMapPlace] = useState(null);
  const [details, setDetails] = useState(null);
  const [planning, setPlanning] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [retryNow, setRetryNow] = useState(0);
  const locationRequest = useRef(0);
  const placesRequest = useRef(0);
  const active = NEARBY_DESTINATIONS.find((item) => item.id === tab);
  const subject = prefs.subject || "";
  const radius = Number(prefs.radius) || 5;
  const searchKey = nearbySearchKey(origin, radius, tab);
  const { loading: requestLoading, hasResult, places, notice, error: placesError, retryAt } = currentNearbySearch(searchState, searchKey);
  const loading = requestLoading || Boolean(searchKey && searchState.key !== searchKey);
  const retrySeconds = nearbyRetrySeconds(retryAt, retryNow);
  const retryDisabled = loading || retrySeconds > 0;
  const savedIds = useMemo(() => prefs.savedIds || [], [prefs.savedIds]);
  const resultMapRef = useRef(null);

  useEffect(() => { writeNearbyPreferences(browserStorage(), storageKey, prefs); }, [prefs, storageKey]);
  useEffect(() => () => { locationRequest.current += 1; }, []);
  useEffect(() => { setQuery(""); setMapPlace(null); setMessage(""); setDetails(null); setPlanning(null); }, [nearbyView]);
  useEffect(() => {
    if (!retryAt) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      setRetryNow(now);
      if (now >= retryAt) window.clearInterval(interval);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [retryAt]);
  useEffect(() => {
    if (!origin || nearbyView !== "spots") { dispatchSearch({ type: "reset" }); return; }
    let current = true;
    const requestId = ++placesRequest.current;
    dispatchSearch({ type: "start", key: searchKey, requestId });
    setMapPlace(null);
    const params = new URLSearchParams({ lat: origin.lat, lon: origin.lon, radius, category: tab });
    api.get(`/api/nearby/places?${params}`, { timeoutMs: 55000 }).then((data) => {
      if (!current) return;
      const receivedAt = Date.now();
      setRetryNow(receivedAt);
      dispatchSearch({ type: "success", key: searchKey, requestId, data, receivedAt });
    }).catch((failure) => {
      if (!current) return;
      const error = failure.name === "AbortError"
        ? "The nearby search timed out. Please retry or search a smaller area."
        : failure.message || "Could not load nearby places. Please try again.";
      const receivedAt = Date.now();
      setRetryNow(receivedAt);
      dispatchSearch({ type: "failure", key: searchKey, requestId, error, receivedAt, retryAfterSeconds: failure.details?.retryAfterSeconds });
    });
    return () => { current = false; };
  }, [origin, radius, tab, refresh, searchKey, nearbyView]);

  const visible = useMemo(() => filterNearbyPlaces(places, { query, activity: prefs.activity, savedOnly, savedIds, origin, radius, category: "spots" }), [places, query, prefs.activity, savedOnly, savedIds, origin, radius]);
  const today = getLocalDateKey(new Date());
  const todayTasks = schedule.find((day) => day.date === today)?.tasks || [];
  function preference(key, value) { setPrefs((current) => ({ ...current, [key]: value })); }
  function selectLocation(location) {
    const point = normalizeCoordinates(location.lat, location.lon);
    if (!point) { setLocationError("That location could not be used. Try another area."); return; }
    setLocality(location.label === "Your current location" ? "" : location.label);
    setOrigin(point); setLocationLabel(location.label); setLocations([]); setMapPlace(null); setLocationError("");
  }
  async function searchLocation(event) {
    event.preventDefault();
    if (locality.trim().length < 3) return;
    const request = ++locationRequest.current;
    setLocating(true); setLocationError(""); setLocations([]);
    preference("locality", locality.trim());
    try {
      const data = await api.get(`/api/nearby/geocode?q=${encodeURIComponent(locality.trim())}`, { timeoutMs: 20000 });
      if (request !== locationRequest.current) return;
      if (data.locations?.length === 1) selectLocation(data.locations[0]);
      else if (data.locations?.length) setLocations(data.locations);
      else setLocationError("No matching area found. Include a city or try a nearby pincode.");
    } catch (failure) { if (request === locationRequest.current) setLocationError(failure.message || "Location search is unavailable. Try again."); }
    finally { if (request === locationRequest.current) setLocating(false); }
  }
  function useCurrentLocation() {
    if (!navigator.geolocation) { setLocationError("Location access is unavailable in this browser. Enter an area instead."); return; }
    const request = ++locationRequest.current;
    setLocating(true); setLocationError(""); setLocations([]);
    navigator.geolocation.getCurrentPosition((position) => {
      if (request !== locationRequest.current) return;
      selectLocation({ lat: position.coords.latitude, lon: position.coords.longitude, label: "Your current location" }); setLocating(false);
    }, (failure) => {
      if (request !== locationRequest.current) return;
      setLocationError(failure.code === 1 ? "Location permission was declined. Enter an area or pincode to continue." : "Could not get your location. Try entering an area or pincode."); setLocating(false);
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 120000 });
  }
  function toggleSave(id) { setPrefs((current) => ({ ...current, savedIds: current.savedIds?.includes(id) ? current.savedIds.filter((value) => value !== id) : [...(current.savedIds || []), id] })); }
  function showMap(place) { setMapPlace(place); setView("map"); setTimeout(() => resultMapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); }
  function retryPlaces() { if (!loading && nearbyRetrySeconds(retryAt, Date.now()) === 0) setRefresh((value) => value + 1); }

  if (!nearbyView) return <Navigate replace to="/nearby" />;

  return <section className="nearby-page page-stack">
    <header className="nearby-header">
      {nearbyView === "hub" && <button className="page-back-control nearby-back" type="button" aria-label="Back to home" onClick={() => navigate(homeRoute)}><ArrowLeft size={18} /></button>}
      <div><h1>PrepMatrix <span>Nearby</span></h1></div>
    </header>
    {nearbyView === "hub" ? <nav className="nearby-hub" aria-label="Nearby workspaces">{NEARBY_DESTINATIONS.map(({ id, label, icon, path }) => <Link key={id} className={`nearby-hub-card nearby-hub-card--${id}`} to={path} aria-label={`Open ${label}`}><span className="nearby-hub-card-icon" aria-hidden="true">{createElement(icon, { size: 24 })}</span><strong className="nearby-hub-card-title">{label}</strong><ArrowUpRight className="nearby-hub-card-arrow" size={20} aria-hidden="true" /></Link>)}</nav> : <>
    <div className="nearby-subpage-header">
      <div className="nearby-subpage-title-row"><Link className="nearby-subpage-back page-back-control" to="/nearby" aria-label="Back to Nearby workspaces"><ArrowLeft size={19} /></Link><h2 className="nearby-subpage-title">{active.label}</h2></div>
      <div className="nearby-subpage-tools">
        <div className="nearby-location-controls">
          <form className="nearby-location-form" onSubmit={searchLocation} role="search" aria-busy={locating}>
            <label className="nearby-visually-hidden" htmlFor="nearby-locality">Area, city or pincode</label>
            <div className="nearby-search-input">
              <MapPin size={17} aria-hidden="true" />
              <input id="nearby-locality" value={locality} onChange={(event) => setLocality(event.target.value)} placeholder={locationLabel || "Area, city or pincode"} minLength={3} maxLength={160} required autoComplete="off" />
              <button type="submit" disabled={locating} aria-label="Explore this location" title="Explore this location"><Search size={17} aria-hidden="true" /></button>
            </div>
          </form>
          <button type="button" className="nearby-current-location-button" disabled={locating} onClick={useCurrentLocation} aria-label="Use my location" title="Use my location"><LocateFixed size={18} aria-hidden="true" /></button>
          {(locations.length > 0 || locationError) && <div className="nearby-location-feedback">
            {locations.length > 0 && <div className="nearby-location-options" aria-label="Choose your location">{locations.map((location, index) => <button type="button" key={`${location.lat}-${location.lon}-${index}`} onClick={() => selectLocation(location)}><MapPin size={15} />{location.label}<ArrowUpRight size={14} /></button>)}</div>}
            {locationError && <p className="nearby-location-error" role="alert">{locationError}</p>}
          </div>}
          {origin && <span className="nearby-visually-hidden" role="status">Searching near {locationLabel}</span>}
        </div>
        {tab === "spots" && <div className="nearby-view-toggle" aria-label="Result view"><button type="button" aria-pressed={view === "list"} data-active={view === "list"} onClick={() => setView("list")}><List size={16} />List</button><button type="button" aria-pressed={view === "map"} data-active={view === "map"} onClick={() => setView("map")}><Map size={16} />Map</button></div>}
      </div>
    </div>
    {placesError && visible.length > 0 && <div className="nearby-notice" data-tone="error" role="alert"><span>{placesError} Showing results from your previous successful search.</span><button className="nearby-retry-action" type="button" disabled={retryDisabled} onClick={retryPlaces}>{retrySeconds > 0 ? `Retry in ${retrySeconds}s` : "Retry search"}</button></div>}
    {message && <div className="nearby-notice" data-tone="success" role="status">{message}<button className="nearby-icon-button" aria-label="Dismiss notification" type="button" onClick={() => setMessage("")}><X size={16} /></button></div>}
    <div className="nearby-workspace">
      <div className="nearby-filters">
        <label>Search radius<select value={radius} onChange={(event) => preference("radius", Number(event.target.value))}>{[2, 5, 10, 20].map((value) => <option key={value} value={value}>Within {value} km</option>)}</select></label>
        {tab !== "spots" ? <label>Subject<input list="nearby-subjects" value={subject} onChange={(event) => preference("subject", event.target.value)} placeholder="Any subject" maxLength={100} /><datalist id="nearby-subjects">{profile.subjectOptions.map((value) => <option key={value} value={value} />)}</datalist></label> : <label>Today’s activity<select value={prefs.activity || ""} onChange={(event) => preference("activity", event.target.value)}>{ACTIVITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        {tab === "circles" ? <label>Chapter / topic<input value={chapter} onChange={(event) => setChapter(event.target.value)} placeholder="e.g. Integration" maxLength={120} /></label> : <label>Search results<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Place name or facility" maxLength={100} /></label>}
        {tab !== "circles" && <button type="button" className="nearby-saved-filter" aria-pressed={savedOnly} data-active={savedOnly} onClick={() => setSavedOnly((value) => !value)}><Bookmark size={16} />Saved places</button>}
      </div>
      {tab === "spots" && todayTasks.length > 0 && <div className="nearby-today"><CalendarPlus size={16} /><span>On your plan today: {todayTasks.slice(0, 2).map((task) => task.task || task.title || task.subject || "Study session").join(" · ")}</span></div>}
      {tab === "circles" ? <NearbyCircles origin={origin} radius={radius} subject={subject} chapter={chapter} profile={profile} onPlan={setPlanning} /> : !origin ? <div className="nearby-empty"><span className="nearby-empty-icon"><active.icon size={30} /></span><h3>Choose a location to find study spots.</h3></div> : <div className="nearby-results" aria-busy={loading}>
        {notice && <div className="nearby-notice" role="status"><span>{notice}</span><button className="nearby-retry-action" type="button" disabled={retryDisabled} onClick={retryPlaces}>{retrySeconds > 0 ? `Retry in ${retrySeconds}s` : "Retry live search"}</button></div>}
        {loading && <div className="nearby-loading" role="status"><span className="nearby-spinner" />{hasResult ? "Refreshing nearby places…" : "Finding places around you…"}<small>{hasResult ? "Your previous results stay available while the search refreshes." : "Local map searches can take a few moments."}</small></div>}
        {(!loading || (hasResult && visible.length > 0)) && <>
          {(!placesError || visible.length > 0) && <div className="nearby-result-meta"><span>{visible.length} {visible.length === 1 ? "place" : "places"}{placesError || loading ? " from your previous search" : " in this search"}{savedOnly ? " · saved only" : ""}</span></div>}
          {view === "map" && <div ref={resultMapRef}><LocalMap origin={origin} places={visible} selected={visible.find((place) => place.id === mapPlace?.id)} onSelect={setMapPlace} radius={radius} /></div>}
          {visible.length === 0 ? placesError ? <div className="nearby-empty" role="alert"><span className="nearby-empty-icon"><Search size={28} /></span><h3>The nearby search is temporarily unavailable.</h3><p>{placesError}</p><p>{radius > 5 ? "Retry the search or try a smaller area. You can also explore this location on Google Maps." : "Retry the search or explore this location on Google Maps while the service recovers."}</p><div className="nearby-actions"><button className="nearby-retry-action" type="button" disabled={retryDisabled} onClick={retryPlaces}>{retrySeconds > 0 ? `Retry in ${retrySeconds}s` : "Retry search"}</button>{radius > 5 && <button type="button" disabled={loading} onClick={() => preference("radius", 5)}>Search within 5 km</button>}<a href={buildMapSearchUrl("libraries study rooms", origin)} target="_blank" rel="noopener noreferrer">Search on Google Maps<ArrowUpRight size={14} /></a></div></div> : <div className="nearby-empty"><span className="nearby-empty-icon"><Search size={28} /></span><h3>{savedOnly ? "No saved places in this search." : "No matching places found here."}</h3><p>{savedOnly ? "Save a result using its bookmark button, or show all places." : "Try a wider radius or fewer filters. Local listing coverage varies by area."}</p><div className="nearby-actions"><button type="button" onClick={() => { setQuery(""); preference("activity", ""); setSavedOnly(false); }}>Clear filters</button><a href={buildMapSearchUrl("libraries study rooms", origin)} target="_blank" rel="noopener noreferrer">Search on Google Maps<ArrowUpRight size={14} /></a></div></div> : <div className="nearby-card-grid">{visible.map((place) => <PlaceCard key={place.id} place={place} saved={savedIds.includes(place.id)} onSave={toggleSave} onDetails={setDetails} onMap={showMap} onPlan={setPlanning} />)}</div>}
        </>}
      </div>}
    </div>
    </>}
    {nearbyView !== "hub" && <footer className="nearby-footer"><span>Place data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>. Confirm changing details with the venue.</span></footer>}
    {nearbyView !== "hub" && details && <NearbyDialog title={details.name} onClose={() => setDetails(null)}><PlaceFacts place={details} />
      <div className="nearby-dialog-actions"><a href={buildDirectionsUrl(details)} target="_blank" rel="noopener noreferrer">Directions<ArrowUpRight size={14} /></a>{safeUrl(details.website) && <a href={safeUrl(details.website)} target="_blank" rel="noopener noreferrer">Website<ArrowUpRight size={14} /></a>}<button type="button" onClick={() => { setPlanning(details); setDetails(null); }}><CalendarPlus size={15} />Plan session</button></div>
    </NearbyDialog>}
    {nearbyView !== "hub" && planning && <PlanSession place={planning} onClose={() => setPlanning(null)} onPlannerDataChange={onPlannerDataChange} onSuccess={setMessage} />}
  </section>;
}
