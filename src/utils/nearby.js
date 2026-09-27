import { isSchoolAcademicLevel, normalizeAcademicProfile } from "./academicProfile.js";
import { academicProfileStorageKey } from "./academicProfileScope.js";

export const NEARBY_TABS = Object.freeze([
  { id: "spots", label: "Study Spots" },
  { id: "circles", label: "Revision Circles" },
]);

function clean(value, limit = 240) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, limit);
}

function normalized(value) {
  return clean(value).toLocaleLowerCase().normalize("NFKC");
}

function numeric(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeCoordinates(lat, lon) {
  const latitude = numeric(lat);
  const longitude = numeric(lon);
  return latitude !== null && longitude !== null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    ? { lat: latitude, lon: longitude }
    : null;
}

function coordinates(value) {
  return normalizeCoordinates(value?.lat ?? value?.latitude, value?.lon ?? value?.lng ?? value?.longitude);
}

export function distanceKm(origin, place) {
  const start = coordinates(origin);
  const finish = coordinates(place);
  if (!start || !finish) return null;
  const radians = Math.PI / 180;
  const deltaLat = (finish.lat - start.lat) * radians;
  const deltaLon = (finish.lon - start.lon) * radians;
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(start.lat * radians) * Math.cos(finish.lat * radians) * Math.sin(deltaLon / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine))));
}

function strings(values) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => clean(typeof value === "object" ? value?.name : value)).filter(Boolean);
}

function uniqueStrings(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = normalized(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getNearbyProfileContext(academicProfile = {}, subjects = []) {
  const profile = normalizeAcademicProfile(academicProfile);
  const isSchoolLearner = isSchoolAcademicLevel(profile);
  const level = profile.grade || profile.degree || profile.academicLevel;
  const board = profile.academicTrack === "General" ? "" : profile.academicTrack;
  return {
    label: [level, board].filter(Boolean).join(" · "),
    subjectOptions: uniqueStrings(strings(subjects)),
    board,
    level,
    isSchoolLearner,
  };
}

const STUDY_SPOT_CATEGORIES = new Set([
  "spots", "spot", "library", "reading_room", "reading room", "study_space", "study space", "study_spot", "coworking",
]);

const ACTIVITIES = Object.freeze({
  quiet: [/quiet|silent|individual reading/u],
  reading: [/quiet|silent|individual reading/u],
  revision: [/quiet|silent|individual reading/u],
  coding: [/wi[ -]?fi|internet/u, /charg|power|socket|computer/u],
  laptop: [/charg|power|socket/u],
  online: [/wi[ -]?fi|internet/u, /call|online class|meeting room/u],
  group: [/discussion|group|meeting/u],
});

/** Rank study spots using listed facilities; unknown facilities stay visible. */
export function filterNearbyPlaces(places, options = {}) {
  if (!Array.isArray(places) || (options.category && normalized(options.category) !== "spots")) return [];
  const { query = "", activity = "", savedOnly = false, savedIds = [], origin, radius } = options;
  const searchWords = normalized(query).split(/\s+/u).filter(Boolean);
  const saved = new Set(Array.isArray(savedIds) ? savedIds.map(String) : savedIds instanceof Set ? [...savedIds].map(String) : []);
  const limit = numeric(radius);
  const activities = ACTIVITIES[normalized(activity)];
  return places.flatMap((place, index) => {
    if (!place || typeof place !== "object" || !clean(place.name)) return [];
    if (!STUDY_SPOT_CATEGORIES.has(normalized(place.category))) return [];
    if (savedOnly && !saved.has(String(place.id))) return [];
    const searchable = normalized([
      place.name, place.address, place.description, ...strings(place.facilities),
    ].filter(Boolean).join(" "));
    if (searchWords.some((word) => !searchable.includes(word))) return [];
    const distance = distanceKm(origin, place);
    if (distance !== null && limit !== null && limit > 0 && distance > limit) return [];
    const matchReasons = [];
    let score = 0;
    if (activities) {
      const facilities = strings(place.facilities).map(normalized);
      const positives = facilities.filter((facility) => !/\b(?:no|not|without|unavailable|prohibited)\b/u.test(facility));
      if (activities.every((requirement) => positives.some((facility) => requirement.test(facility)))) {
        score += 4;
        matchReasons.push("Facilities listed for your study activity");
      } else {
        const explicitlyUnavailable = facilities.some((facility) => /\b(?:no|not|without|unavailable|prohibited)\b/u.test(facility)
          && activities.some((requirement) => requirement.test(facility)));
        if (explicitlyUnavailable) return [];
        matchReasons.push("Confirm facilities for your study activity");
      }
    }
    if (distance !== null) matchReasons.push(`${distance < 0.1 ? "Under 0.1" : distance.toFixed(1)} km away`);
    return [{ place: { ...place, distanceKm: distance, matchReasons }, score, index }];
  }).sort((left, right) => right.score - left.score
    || (left.place.distanceKm ?? Infinity) - (right.place.distanceKm ?? Infinity)
    || left.index - right.index)
    .map(({ place }) => place);
}

export function buildMapSearchUrl(query, location = "") {
  const point = coordinates(location);
  const locality = point ? `${point.lat},${point.lon}` : clean(location);
  const search = [clean(query), locality].filter(Boolean).join(" ");
  if (!search) return "";
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", search);
  return url.toString();
}

export function buildDirectionsUrl(place) {
  if (!place || typeof place !== "object") return "";
  const point = coordinates(place);
  const destination = point ? `${point.lat},${point.lon}` : [clean(place.name), clean(place.address)].filter(Boolean).join(", ");
  if (!destination) return "";
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("destination", destination);
  return url.toString();
}

export function getNearbyStorageKey(ownerId, profileId) {
  const owner = clean(ownerId, 240);
  const profile = clean(profileId, 160);
  return owner && profile ? academicProfileStorageKey(profile, "nearby", owner) : "";
}

function preferences(data) {
  const source = data && typeof data === "object" ? data : {};
  const radius = numeric(source.radius);
  return {
    locality: clean(source.locality, 160),
    radius: [2, 5, 10, 20].includes(radius) ? radius : 5,
    subject: clean(source.subject, 120),
    activity: clean(source.activity, 40),
    activeTab: NEARBY_TABS.some((tab) => tab.id === source.activeTab) ? source.activeTab : "spots",
    savedIds: uniqueStrings(strings(source.savedIds)).slice(0, 200),
  };
}

export function readNearbyPreferences(storage, key) {
  if (!storage || !key) return preferences(null);
  try { return preferences(JSON.parse(storage.getItem(key))); }
  catch { return preferences(null); }
}

export function writeNearbyPreferences(storage, key, data) {
  if (!storage || !key) return false;
  try {
    storage.setItem(key, JSON.stringify(preferences(data)));
    return true;
  } catch { return false; }
}

function calendarText(value) {
  return [...String(value ?? "").slice(0, 4000)]
    .filter((character) => character === "\n" || character === "\r" || character === "\t" || (character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127))
    .join("").replace(/\\/gu, "\\\\").replace(/\r\n|\r|\n/gu, "\\n").replace(/;/gu, "\\;").replace(/,/gu, "\\,");
}

function calendarDate(value) {
  if (!(value instanceof Date) && typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function dateStamp(date) {
  return date.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}/u, "");
}

function foldCalendarLine(line) {
  const encoder = new TextEncoder();
  const lines = [];
  let part = "";
  let bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {
      lines.push(part);
      part = " ";
      bytes = 1;
    }
    part += character;
    bytes += size;
  }
  lines.push(part);
  return lines.join("\r\n");
}

export function buildNearbyCalendarEvent({ title, start, end, location = "", description = "" } = {}) {
  const begins = calendarDate(start);
  const ends = calendarDate(end);
  if (!clean(title) || !begins || !ends || ends <= begins) return "";
  let hash = 2166136261;
  for (const character of `${title}|${begins.toISOString()}|${location}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PrepMatrix//Nearby//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", `UID:nearby-${(hash >>> 0).toString(16)}-${begins.getTime()}@prepmatrix`,
    `DTSTAMP:${dateStamp(new Date())}`, `DTSTART:${dateStamp(begins)}`, `DTEND:${dateStamp(ends)}`,
    `SUMMARY:${calendarText(title)}`, `LOCATION:${calendarText(location)}`, `DESCRIPTION:${calendarText(description)}`,
    "END:VEVENT", "END:VCALENDAR", "",
  ].map(foldCalendarLine).join("\r\n");
}
