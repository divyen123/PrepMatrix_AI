import test from "node:test";
import assert from "node:assert/strict";
import {
  NEARBY_TABS, normalizeCoordinates, distanceKm, getNearbyProfileContext, filterNearbyPlaces,
  buildMapSearchUrl, buildDirectionsUrl, buildPhoneHref, getNearbyStorageKey,
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
  assert.deepEqual(NEARBY_TABS.map(({ id }) => id), ["tuitions", "spots", "circles", "rescue"]);
});

test("subject match ranks known offerings first and keeps unknown institutions for enquiries", () => {
  const places = [
    { id: "unknown", name: "Institution", category: "institution", lat: 0, lon: 0.005 },
    { id: "physics", name: "Physics tuition", category: "tuition", subjects: ["Physics"], lat: 0, lon: 0.003 },
    { id: "batch", name: "Batch centre", category: "tuition", batches: [{ subject: "Mathematics" }], lat: 0, lon: 0.01 },
    { id: "too-far", name: "Distant tuition", category: "tuition", subjects: ["Maths"], lat: 0, lon: 1 },
  ];
  const snapshot = JSON.stringify(places);
  const filtered = filterNearbyPlaces(places, { category: "tuitions", subject: "Maths", origin: { lat: 0, lon: 0 }, radius: 5 });
  assert.deepEqual(filtered.map(({ id }) => id), ["batch", "unknown"]);
  assert.match(filtered[0].matchReasons[0], /Maths is listed/u);
  assert.match(filtered[1].matchReasons[0], /not provided/u);
  assert.equal(JSON.stringify(places), snapshot);
});

test("rescue ranks opted-in support ahead of clearly labelled general enquiry numbers", () => {
  const places = [
    { id: "opted-in", name: "Tutor", phoneSupport: true, phone: "+91 98765 43210", subjects: ["Physics"] },
    { id: "enquiry", name: "Centre", phone: "9876543210", subjects: ["Physics"] },
    { id: "no-number", name: "Tutor", phoneSupport: true },
  ];
  const results = filterNearbyPlaces(places, { category: "rescue", subject: "Physics" });
  assert.deepEqual(results.map(({ id }) => id), ["opted-in", "enquiry"]);
  assert.ok(results[0].matchReasons.includes("Phone doubt support offered"));
  assert.ok(!results[1].matchReasons.includes("Phone doubt support offered"));
  assert.ok(results[1].matchReasons.includes("General enquiry; ask about phone support"));
});

test("batch compatibility cannot combine a subject from one batch and a board from another", () => {
  const places = [{ id: "wrong", name: "Mixed centre", category: "tuitions", batches: [{ subject: "Maths", board: "ICSE", chapter: "Integration" }, { subject: "Physics", board: "CBSE" }] }, { id: "right", name: "Suitable centre", category: "tuitions", batches: [{ subject: "Maths", board: "CBSE", grade: "Class 12", chapter: "Integration" }] }, { id: "unknown", name: "Unknown centre", category: "tuitions" }];
  const results = filterNearbyPlaces(places, { category: "tuitions", subject: "Maths", board: "CBSE", level: "Class 12", chapter: "Integration" });
  assert.deepEqual(results.map((entry) => entry.id), ["right", "unknown"]);
  assert.ok(results[0].matchReasons.includes("Your chapter is listed"));
  assert.ok(!results[1].matchReasons.includes("Your chapter is listed"));
});

test("a multi-subject tutor remains eligible for any of their listed subjects", () => {
  const results = filterNearbyPlaces([{ name: "Tutor", category: "tuitions", subjects: ["Physics", "Chemistry"] }], { category: "tuitions", subject: "Chemistry" });
  assert.equal(results.length, 1);
  assert.ok(results[0].matchReasons.includes("Chemistry is listed"));
});

test("school-level matching distinguishes Class 1 from Class 12 and accepts equivalent grade labels", () => {
  const places = ["Class 1", "Class 12", "Grade 1", "1"].map((grade) => ({ name: grade, category: "tuitions", batches: [{ grade }] }));
  assert.deepEqual(filterNearbyPlaces(places, { category: "tuitions", level: "Class 1" }).map(({ name }) => name), ["Class 1", "Grade 1", "1"]);
  assert.deepEqual(filterNearbyPlaces(places, { category: "tuitions", level: "Class 12" }).map(({ name }) => name), ["Class 12"]);
});

test("rescue excludes known incompatible chapters while keeping unknown contacts for enquiry", () => {
  const places = [
    { name: "Suitable tutor", phone: "9876543210", chapters: ["Integration"] },
    { name: "Other chapter", phone: "9876543210", chapters: ["Differentiation"] },
    { name: "Different subject topic", phone: "9876543210", chapters: ["Disintegration"] },
    { name: "Unknown contact", phone: "9876543210" },
  ];
  const results = filterNearbyPlaces(places, { category: "rescue", chapter: "Integration" });
  assert.deepEqual(results.map(({ name }) => name), ["Suitable tutor", "Unknown contact"]);
  assert.ok(results[0].matchReasons.includes("Your chapter is listed"));
  assert.ok(results[1].matchReasons.includes("Confirm support for your chapter"));
});

test("matching reasons and score come from one batch instead of merging partial matches", () => {
  const places = [{ name: "Partial choices", category: "tuitions", batches: [
    { subject: "Maths", board: "CBSE", chapter: "Differentiation", schedule: "Saturday" },
    { subject: "Maths", chapter: "Integration" },
  ] }];
  const [result] = filterNearbyPlaces(places, { category: "tuitions", subject: "Maths", board: "CBSE", chapter: "Integration", timing: "Saturday" });
  assert.ok(result.matchReasons.includes("Your chapter is listed"));
  assert.ok(!result.matchReasons.includes("Syllabus matches your profile"));
  assert.ok(!result.matchReasons.includes("Listed timing matches"));
  const [unknownSubject] = filterNearbyPlaces([{ name: "Unknown subject batch", category: "tuitions", batches: [{ subject: "Maths", board: "ICSE" }, { board: "CBSE" }] }], { category: "tuitions", subject: "Maths", board: "CBSE" });
  assert.ok(!unknownSubject.matchReasons.includes("Maths is listed"));
  assert.ok(unknownSubject.matchReasons.includes("Subject details not provided; contact to confirm"));
});

test("study activities rank supplied facilities and do not infer them from a venue name", () => {
  const places = [
    { id: "unknown", name: "Quiet coding library", category: "library" },
    { id: "known", name: "Study room", category: "study_space", facilities: ["Wi-Fi", "Charging points"] },
    { id: "unavailable", name: "Reading room", category: "library", facilities: ["No Wi-Fi", "Charging points"] },
  ];
  const matches = filterNearbyPlaces(places, { category: "spots", activity: "coding", subject: "Physics" });
  assert.deepEqual(matches.map(({ id }) => id), ["known", "unknown"]);
  assert.match(matches[1].matchReasons[0], /Confirm facilities/u);
});

test("query, saved and fee filters avoid treating missing prices as free", () => {
  const places = [
    { id: "free", name: "Town Library", category: "library", fees: "Free" },
    { id: "unknown", name: "Town Library", category: "library" },
    { id: "paid", name: "Town Study Space", category: "study_space", fees: 50 },
  ];
  assert.deepEqual(filterNearbyPlaces(places, { budget: "free" }).map(({ id }) => id), ["free"]);
  assert.deepEqual(filterNearbyPlaces(places, { budget: 50 }).map(({ id }) => id), ["free", "paid"]);
  assert.deepEqual(filterNearbyPlaces(places, { query: "town study", savedOnly: true, savedIds: ["paid"] }).map(({ id }) => id), ["paid"]);
  assert.deepEqual(filterNearbyPlaces(places, { savedOnly: true }), []);
});

test("map queries encode untrusted text without changing the URL destination", () => {
  const query = 'Tuition & x=<script> #?';
  const url = new URL(buildMapSearchUrl(query, "Chennai"));
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.searchParams.get("query"), `${query} Chennai`);
  assert.equal(new URL(buildDirectionsUrl({ lat: 0, lon: 1, name: "Other" })).searchParams.get("destination"), "0,1");
  assert.equal(buildMapSearchUrl("", ""), "");
  assert.equal(buildDirectionsUrl({}), "");
});

test("phone links allow bounded phone numbers and reject scheme/control injection", () => {
  assert.equal(buildPhoneHref("+91 (98765) 43210"), "tel:+919876543210");
  for (const value of ["tel:+123456789", "javascript:alert(1)", "1234567;ext=42", "1234567\r\nX: y", "+123", "+" + "1".repeat(16), 123456789]) {
    assert.equal(buildPhoneHref(value), "");
  }
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
