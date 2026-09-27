import test from "node:test";
import assert from "node:assert/strict";
import {
  NEARBY_TABS, normalizeCoordinates, distanceKm, getNearbyProfileContext, filterNearbyPlaces,
  buildMapSearchUrl, buildDirectionsUrl, getNearbyStorageKey,
  readNearbyPreferences, writeNearbyPreferences, buildNearbyCalendarEvent,
} from "./nearby.js";

test("coordinates reject absent/invalid values and preserve valid zeroes", () => {
  assert.deepEqual(normalizeCoordinates("0", 0), { lat: 0, lon: 0 });
  for (const pair of [[null, 1], ["", 1], [true, 1], [91, 1], [1, 181], [Infinity, 0]]) {
    assert.equal(normalizeCoordinates(...pair), null);
  }
  assert.equal(distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 0 }), 0);
  assert.ok(Math.abs(distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) - 111.195) < 0.01);
  assert.equal(distanceKm(null, { lat: 0, lon: 0 }), null);
});

test("profile context keeps class and board and derives only existing subjects", () => {
  assert.deepEqual(getNearbyProfileContext({ grade: "12", academicTrack: "CBSE" }, [
    { name: "Physics" }, { name: " physics " }, "Chemistry", {},
  ]), {
    label: "Class 12 · CBSE", level: "Class 12", board: "CBSE", isSchoolLearner: true,
    subjectOptions: ["Physics", "Chemistry"],
  });
  assert.deepEqual(NEARBY_TABS.map(({ id }) => id), ["spots", "circles"]);
});

test("study spots stay within the requested radius and preserve their source data", () => {
  const places = [
    { id: "near", name: "Near library", category: "library", lat: 0, lon: 0.003 },
    { id: "far", name: "Far library", category: "library", lat: 0, lon: 1 },
    { id: "unrelated", name: "Study centre", category: "tuitions", lat: 0, lon: 0.001 },
  ];
  const snapshot = JSON.stringify(places);
  const filtered = filterNearbyPlaces(places, { category: "spots", origin: { lat: 0, lon: 0 }, radius: 5 });
  assert.deepEqual(filtered.map(({ id }) => id), ["near"]);
  assert.ok(filtered[0].matchReasons.includes("0.3 km away"));
  assert.equal(JSON.stringify(places), snapshot);
  assert.deepEqual(filterNearbyPlaces(places, { category: "tuitions" }), []);
  assert.deepEqual(filterNearbyPlaces(places, { category: "rescue" }), []);
});

test("study activities rank supplied facilities and do not infer them from a venue name", () => {
  const places = [
    { id: "unknown", name: "Quiet coding library", category: "library" },
    { id: "known", name: "Study room", category: "study_space", facilities: ["Wi-Fi", "Charging points"] },
    { id: "unavailable", name: "Reading room", category: "library", facilities: ["No Wi-Fi", "Charging points"] },
  ];
  const matches = filterNearbyPlaces(places, { category: "spots", activity: "coding" });
  assert.deepEqual(matches.map(({ id }) => id), ["known", "unknown"]);
  assert.match(matches[1].matchReasons[0], /Confirm facilities/u);
});

test("query and saved filters only select matching study spots", () => {
  const places = [
    { id: "library", name: "Town Library", category: "library" },
    { id: "space", name: "Town Study Space", category: "study_space" },
    { id: "missing-category", name: "Town Study Hall" },
  ];
  assert.deepEqual(filterNearbyPlaces(places, { category: "spots", query: "town study", savedOnly: true, savedIds: ["space"] }).map(({ id }) => id), ["space"]);
  assert.deepEqual(filterNearbyPlaces(places, { savedOnly: true }), []);
});

test("map queries encode untrusted text without changing the URL destination", () => {
  const query = 'Library & x=<script> #?';
  const url = new URL(buildMapSearchUrl(query, "Chennai"));
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.searchParams.get("query"), `${query} Chennai`);
  assert.equal(new URL(buildDirectionsUrl({ lat: 0, lon: 1, name: "Other" })).searchParams.get("destination"), "0,1");
  assert.equal(buildMapSearchUrl("", ""), "");
  assert.equal(buildDirectionsUrl({}), "");
});

test("preferences isolate owners and profiles and never persist exact GPS", () => {
  const entries = new Map();
  const storage = { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
  const first = getNearbyStorageKey("owner-a", "profile-a");
  const otherProfile = getNearbyStorageKey("owner-a", "profile-b");
  const otherOwner = getNearbyStorageKey("owner-b", "profile-a");
  assert.notEqual(first, otherProfile);
  assert.notEqual(first, otherOwner);
  assert.equal(getNearbyStorageKey("", "profile-a"), "");
  writeNearbyPreferences(storage, first, { locality: "Chennai", savedIds: ["one", "one"], radius: 10, origin: { lat: 1, lon: 2 }, lat: 1, lon: 2 });
  assert.equal(readNearbyPreferences(storage, first).locality, "Chennai");
  assert.deepEqual(readNearbyPreferences(storage, first).savedIds, ["one"]);
  assert.deepEqual(readNearbyPreferences(storage, otherProfile).savedIds, []);
  assert.deepEqual(readNearbyPreferences(storage, otherOwner).savedIds, []);
  assert.equal(entries.get(first).includes('"lat"'), false);
  assert.equal(entries.get(first).includes('"origin"'), false);
  storage.setItem(first, JSON.stringify({ activeTab: "tuitions", locality: "Chennai" }));
  assert.equal(readNearbyPreferences(storage, first).activeTab, "spots");
  storage.setItem(first, JSON.stringify({ activeTab: "rescue" }));
  assert.equal(readNearbyPreferences(storage, first).activeTab, "spots");
  storage.setItem(first, JSON.stringify({ activeTab: "circles" }));
  assert.equal(readNearbyPreferences(storage, first).activeTab, "circles");
  storage.setItem(first, JSON.stringify({ radius: 50 }));
  assert.equal(readNearbyPreferences(storage, first).radius, 5);
  storage.setItem(first, "bad json");
  assert.equal(readNearbyPreferences(storage, first).radius, 5);
  assert.equal(writeNearbyPreferences({ setItem() { throw new Error("Full"); } }, first, {}), false);
});

test("calendar export escapes text, folds UTF-8 lines and validates date order", () => {
  const options = { title: "Revision, chapter; 2\nBEGIN:VEVENT", start: "2026-09-27T10:00:00+05:30", end: "2026-09-27T11:00:00+05:30", description: "தமிழ் ".repeat(30), location: "Library\\Room" };
  const ics = buildNearbyCalendarEvent(options);
  assert.match(ics, /DTSTART:20260927T043000Z/u);
  assert.ok(ics.includes("SUMMARY:Revision\\, chapter\\; 2\\nBEGIN:VEVENT"));
  assert.ok(ics.includes("LOCATION:Library\\\\Room"));
  assert.equal(ics.split("\r\n").filter((line) => line === "BEGIN:VEVENT").length, 1);
  assert.ok(ics.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75));
  assert.equal(buildNearbyCalendarEvent({ ...options, end: options.start }), "");
  assert.equal(buildNearbyCalendarEvent({ ...options, start: "invalid" }), "");
});
