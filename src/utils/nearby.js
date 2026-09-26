import { isSchoolAcademicLevel, normalizeAcademicProfile } from "./academicProfile.js";
import { academicProfileStorageKey } from "./academicProfileScope.js";

export const NEARBY_TABS = Object.freeze([
  { id: "tuitions", label: "Tuitions & Institutions" },
  { id: "spots", label: "Study Spots" },
  { id: "circles", label: "Revision Circles" },
  { id: "rescue", label: "Chapter Rescue" },
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

const CATEGORIES = Object.freeze({
  tuitions: new Set(["tuitions", "tuition", "institution", "institutions", "tutor", "tutors", "school", "college", "university", "coaching", "training"]),
  spots: new Set(["spots", "spot", "library", "reading_room", "reading room", "study_space", "study space", "study_spot", "coworking"]),
  circles: new Set(["circles", "circle", "revision_circle", "revision circle"]),
});

function subjectKey(value) {
  return normalized(value).replace(/\b(?:maths?|mathematics)\b/gu, "mathematics").replace(/\s+/gu, " ");
}

function subjectMatch(value, wanted) {
  const offered = subjectKey(value);
  const selected = subjectKey(wanted);
  return offered === selected || offered.startsWith(`${selected} `) || selected.startsWith(`${offered} `);
}

function phraseContains(value, wanted) {
  const tokens = (text) => normalized(text).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const selected = tokens(wanted);
  return Boolean(selected) && ` ${tokens(value)} `.includes(` ${selected} `);
}

function detailMatches(actual, wanted, field) {
  if (field === "grade") {
    const classNumber = (value) => normalized(value).match(/\b(?:class|grade|standard|std)\s*(1[0-2]|[1-9])\b/u)?.[1]
      || normalized(value).match(/^(1[0-2]|[1-9])$/u)?.[1];
    const offeredClass = classNumber(actual);
    const wantedClass = classNumber(wanted);
    if (offeredClass && wantedClass) return offeredClass === wantedClass;
  }
  return phraseContains(actual, wanted);
}

function placeSubjects(place) {
  const batches = Array.isArray(place.batches) ? place.batches : [];
  return uniqueStrings([
    ...strings(place.subjects),
    clean(place.subject),
    ...batches.flatMap((batch) => [clean(batch?.subject), ...strings(batch?.subjects)]),
  ].filter(Boolean));
}

function knownFee(place) {
  if (place.fees === 0 || normalized(place.fees) === "free") return 0;
  if (typeof place.fees === "number") return place.fees >= 0 ? place.fees : null;
  if (typeof place.fees === "object" && place.fees !== null) {
    const amount = numeric(place.fees.amount ?? place.fees.min);
    return amount !== null && amount >= 0 ? amount : null;
  }
  // Avoid comparing currencies or billing periods inferred from free-form descriptions.
  return null;
}

const ACTIVITIES = Object.freeze({
  quiet: [/quiet|silent|individual reading/u],
  reading: [/quiet|silent|individual reading/u],
  revision: [/quiet|silent|individual reading/u],
  coding: [/wi[ -]?fi|internet/u, /charg|power|socket|computer/u],
  laptop: [/charg|power|socket/u],
  online: [/wi[ -]?fi|internet/u, /call|online class|meeting room/u],
  group: [/discussion|group|meeting/u],
});

/** Filter only on supplied facts. Unknown subject data stays visible for enquiries. */
export function filterNearbyPlaces(places, options = {}) {
  if (!Array.isArray(places)) return [];
  const { query = "", subject = "", chapter = "", board = "", level = "", language = "", timing = "", activity = "", budget = "all", savedOnly = false, savedIds = [], origin, radius, category } = options;
  const selectedSubject = normalized(subject) === "all" ? "" : clean(subject);
  const searchWords = normalized(query).split(/\s+/u).filter(Boolean);
  const saved = new Set(Array.isArray(savedIds) ? savedIds.map(String) : savedIds instanceof Set ? [...savedIds].map(String) : []);
  const limit = numeric(radius);
  const requestedCategory = normalized(category);
  const activities = ACTIVITIES[normalized(activity)];
  const budgetKey = normalized(budget);
  return places.flatMap((place, index) => {
    if (!place || typeof place !== "object" || !clean(place.name)) return [];
    const placeCategory = normalized(place.category);
    if (requestedCategory === "rescue") {
      if (!buildPhoneHref(place.phone)) return [];
    } else if (CATEGORIES[requestedCategory] && !CATEGORIES[requestedCategory].has(placeCategory)) return [];
    if (savedOnly && !saved.has(String(place.id))) return [];
    const subjects = placeSubjects(place);
    const batches = Array.isArray(place.batches) ? place.batches : [];
    const searchable = normalized([
      place.name, place.address, place.description, place.board, place.language,
      ...subjects, ...strings(place.facilities),
      ...batches.flatMap((batch) => [batch?.name, batch?.chapter, batch?.currentChapter, batch?.board]),
    ].filter(Boolean).join(" "));
    if (searchWords.some((word) => !searchable.includes(word))) return [];
    const distance = distanceKm(origin, place);
    if (distance !== null && limit !== null && limit > 0 && distance > limit) return [];
    const matchReasons = [];
    let score = 0;
    if (requestedCategory === "rescue" && place.phoneSupport === true) {
      score += 20;
      matchReasons.push("Phone doubt support offered");
    }
    if (selectedSubject && requestedCategory !== "spots" && subjects.length
      && !subjects.some((offered) => subjectMatch(offered, selectedSubject))) return [];
    if (requestedCategory !== "spots") {
      // Compare all criteria against the same batch so unrelated batches cannot
      // combine into a false syllabus/chapter match. Missing fields stay unknown.
      const offerings = batches.length ? batches : [place];
      const compatible = offerings.flatMap((offering) => {
        const offeredSubjects = batches.length
          ? uniqueStrings([clean(offering.subject), ...strings(offering.subjects)].filter(Boolean))
          : subjects;
        const subjectMatches = offeredSubjects.some((offered) => subjectMatch(offered, selectedSubject));
        if (selectedSubject && offeredSubjects.length && !subjectMatches) return [];
        const offeredChapters = uniqueStrings([offering.chapter, offering.currentChapter, ...strings(offering.chapters)].map((value) => clean(value)).filter(Boolean));
        const details = {
          board: offering.board || place.board,
          grade: offering.grade || offering.level || place.grade || place.level,
          language: offering.language || place.language,
          schedule: offering.schedule || place.schedule,
          chapter: offeredChapters.length ? offeredChapters : strings(place.chapters),
        };
        const criteria = [
          [board, "board", "Syllabus matches your profile", 3, true],
          [level, "grade", "Matches your study level", 3, true],
          [language, "language", "Teaching language matches", 3, true],
          [timing, "schedule", "Listed timing matches", 3, false],
          [chapter, "chapter", "Your chapter is listed", 10, requestedCategory === "rescue"],
        ];
        const reasons = [];
        let offeringScore = 0;
        if (selectedSubject) {
          if (subjectMatches) { offeringScore += 8; reasons.push(`${selectedSubject} is listed`); }
          else reasons.push("Subject details not provided; contact to confirm");
        }
        for (const [wanted, field, label, weight, excludeMismatch] of criteria) {
          if (!clean(wanted)) continue;
          const values = Array.isArray(details[field]) ? details[field] : [details[field]];
          const known = values.map((value) => clean(value)).filter(Boolean);
          const matches = known.some((actual) => detailMatches(actual, wanted, field));
          if (excludeMismatch && known.length && !matches) return [];
          if (matches) { offeringScore += weight; reasons.push(label); }
          else if (field === "chapter") reasons.push("Confirm support for your chapter");
        }
        return [{ score: offeringScore, reasons }];
      });
      if (!compatible.length) return [];
      const best = compatible.reduce((current, offering) => offering.score > current.score ? offering : current);
      score += best.score;
      matchReasons.push(...best.reasons);
    }
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
    const fee = knownFee(place);
    if (budgetKey === "free" && fee !== 0) return [];
    if (budgetKey === "paid" && !(fee > 0)) return [];
    const maxFee = numeric(budget);
    if (maxFee !== null && maxFee >= 0 && (fee === null || fee > maxFee)) return [];
    if (distance !== null) matchReasons.push(`${distance < 0.1 ? "Under 0.1" : distance.toFixed(1)} km away`);
    if (requestedCategory === "rescue" && place.phoneSupport !== true) matchReasons.push("General enquiry; ask about phone support");
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

export function buildPhoneHref(phone) {
  if (typeof phone !== "string" || phone.length > 40 || !/^\+?[\d ().-]+$/u.test(phone.trim())) return "";
  const compact = phone.trim().replace(/[\s().-]/gu, "");
  return /^\+?\d{7,15}$/u.test(compact) ? `tel:${compact}` : "";
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
    radius: radius !== null && radius >= 1 && radius <= 50 ? radius : 5,
    subject: clean(source.subject, 120),
    activity: clean(source.activity, 40),
    budget: clean(source.budget, 40) || "all",
    activeTab: NEARBY_TABS.some((tab) => tab.id === source.activeTab) ? source.activeTab : "tuitions",
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
