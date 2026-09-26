import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { createNearbyService, distanceKm, osmPlace, parseNearbyArea } from './nearbyService.js';
import { cleanupNearbyProfileData, normalizeCircleInput, publicCircle, publicNearbyListing, registerNearbyRoutes } from './nearbyRoutes.js';

test('nearby rejects malformed or excessive location searches before any provider request', async () => {
  for (const query of [{}, { lat: '', lon: '' }, { lat: 91, lon: 0 }, { lat: 0, lon: Infinity }, { lat: 0, lon: 0, radius: 26 }, { lat: 0, lon: 0, radius: 0 }]) {
    assert.throws(() => parseNearbyArea(query), { status: 400 });
  }
  const service = createNearbyService({ fetchImpl: () => { throw new Error('Provider must not be called'); } });
  await assert.rejects(service.geocode('ab'), { status: 400 });
  assert.ok(distanceKm({ lat: 12, lon: 80 }, { lat: 12, lon: 80 }) < 0.001);
});

test('Photon searches deduplicate concurrent lookups and cache real location results', async () => {
  let calls = 0;
  const service = createNearbyService({ gapMs: 0, fetchImpl: async (url) => {
    calls += 1;
    assert.equal(url.searchParams.get('q'), 'Chennai');
    return { ok: true, json: async () => ({ features: [{ geometry: { coordinates: [80.27, 13.08] }, properties: { name: 'Chennai', city: 'Chennai', state: 'Tamil Nadu', country: 'India' } }] }) };
  } });
  const [first, second] = await Promise.all([service.geocode('Chennai'), service.geocode('Chennai')]);
  assert.deepEqual(first, second);
  assert.equal(first.locations[0].label, 'Chennai, Tamil Nadu, India');
  assert.equal(first.locations[0].lat, 13.08);
  await service.geocode('Chennai');
  assert.equal(calls, 1);
});

test('OSM records never fabricate tutor consent, batch details, quiet areas or seats', () => {
  const place = osmPlace({ type: 'node', id: 123, lat: 13, lon: 80, tags: {
    name: 'Test institution', amenity: 'school', phone: '+91 1234567890', internet_access: 'wlan', website: 'javascript:alert(1)',
  } }, 'tuitions');
  assert.equal(place.phoneSupport, false);
  assert.equal(place.website, '');
  assert.equal(place.updatedAt, null);
  assert.deepEqual(place.batches, []);
  assert.deepEqual(place.facilities, ['Wi-Fi']);
  assert.deepEqual(place.subjects, []);
  assert.equal(place.sourceUrl, 'https://www.openstreetmap.org/node/123');
});

test('Overpass discovery reuses tuition lookup for phone enquiries and filters by radius', async () => {
  let calls = 0;
  const service = createNearbyService({ gapMs: 0, fetchImpl: async (_url, options) => {
    calls += 1;
    assert.match(new URLSearchParams(options.body).get('data'), /around:5000,13,80/);
    return { ok: true, json: async () => ({ elements: [
      { type: 'node', id: 1, lat: 13.001, lon: 80, tags: { name: 'With phone', phone: '1234567890' } },
      { type: 'node', id: 2, lat: 13.002, lon: 80, tags: { name: 'No phone' } },
      { type: 'node', id: 3, lat: 16, lon: 80, tags: { name: 'Far away', phone: '1234567890' } },
    ] }) };
  } });
  assert.equal((await service.places({ lat: 13, lon: 80, radius: 5, category: 'tuitions' })).length, 2);
  const rescue = await service.places({ lat: 13, lon: 80, radius: 5, category: 'rescue' });
  assert.equal(rescue.length, 1);
  assert.equal(rescue[0].phoneSupport, false);
  assert.equal(calls, 1);
});

test('provider outages are explicit, never converted to an empty success', async () => {
  const service = createNearbyService({ gapMs: 0, fetchImpl: async () => ({ ok: false }) });
  await assert.rejects(service.geocode('Chennai'), { status: 503 });
  await assert.rejects(service.places({ lat: 13, lon: 80 }), { status: 503 });
});

test('reviewed listing only exposes a phone with publication consent and marks support separately', () => {
  const input = { _id: 'provider', name: 'Tutor', lat: 13, lon: 80, phone: '1234567890', phoneSupport: true };
  assert.equal(publicNearbyListing(input, 'rescue').phone, '');
  assert.equal(publicNearbyListing(input, 'rescue').phoneSupport, false);
  const approved = publicNearbyListing({ ...input, phonePublishedConsent: true, phoneSupportConsent: true }, 'rescue');
  assert.equal(approved.phone, '1234567890');
  assert.equal(approved.phoneSupport, true);
});

test('circle responses hide account IDs and participant details from other learners', () => {
  const userId = new ObjectId();
  const guestId = new ObjectId();
  const circle = { _id: 'circle', userId, academicProfileId: 'host-profile', capacity: 5, requests: [{ id: 'request', userId: guestId, academicProfileId: 'guest-profile', name: 'Guest', status: 'pending' }] };
  const publicResult = publicCircle(circle, { user: { _id: guestId }, academicProfileId: 'guest-profile' });
  assert.equal(publicResult.myStatus, 'pending');
  assert.equal(publicResult.userId, undefined);
  assert.equal(publicResult.requests, undefined);
  const hostResult = publicCircle(circle, { user: { _id: userId }, academicProfileId: 'host-profile' });
  assert.equal(hostResult.isHost, true);
  assert.deepEqual(hostResult.requests, [{ id: 'request', name: 'Guest', status: 'pending' }]);
  assert.equal(publicCircle(circle, { user: { _id: guestId }, academicProfileId: 'other-profile' }).myStatus, null);
});

function matches(document, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some((item) => matches(document, item));
    const actual = document[key];
    if (value && typeof value === 'object' && !(value instanceof Date)) return Object.entries(value).every(([op, expected]) => {
      if (op === '$gte') return actual >= expected;
      if (op === '$lte') return actual <= expected;
      if (op === '$gt') return actual > expected;
      if (op === '$in') return expected.includes(actual);
      if (op === '$elemMatch') return (actual || []).some((item) => matches(item, expected));
      throw new Error(`Unsupported query ${op}`);
    });
    return actual === value;
  });
}

function memoryDb() {
  const collections = new Map();
  return { collection(name) {
    if (!collections.has(name)) collections.set(name, []);
    const documents = collections.get(name);
    return {
      createIndex: async () => 'index',
      findOne: async (filter) => structuredClone(documents.find((document) => matches(document, filter)) || null),
      find: (filter) => {
        let found = documents.filter((document) => matches(document, filter));
        const cursor = { sort: () => cursor, limit: (limit) => { found = found.slice(0, limit); return cursor; }, toArray: async () => structuredClone(found) };
        return cursor;
      },
      insertOne: async (record) => { documents.push(structuredClone(record)); return { insertedId: record._id }; },
      updateOne: async (filter, update, options = {}) => {
        let document = documents.find((entry) => matches(entry, filter));
        const matchedCount = document ? 1 : 0;
        if (!document && options.upsert) {
          document = structuredClone({ ...filter, ...update.$setOnInsert });
          documents.push(document);
        }
        if (document) Object.assign(document, structuredClone(update.$set || {}));
        return { matchedCount, upsertedCount: !matchedCount && document ? 1 : 0 };
      },
      countDocuments: async (filter) => documents.filter((document) => matches(document, filter)).length,
      replaceOne: async (filter, record) => { const index = documents.findIndex((document) => matches(document, filter)); if (index < 0) return { matchedCount: 0 }; documents[index] = structuredClone(record); return { matchedCount: 1 }; },
      deleteMany: async (filter) => { let deletedCount = 0; for (let i = documents.length - 1; i >= 0; i -= 1) if (matches(documents[i], filter)) { documents.splice(i, 1); deletedCount += 1; } return { deletedCount }; },
      updateMany: async (filter, update) => { let modifiedCount = 0; for (const document of documents) if (matches(document, filter)) { for (const [key, value] of Object.entries(update.$pull || {})) document[key] = document[key].filter((item) => !matches(item, value)); for (const [key, value] of Object.entries(update.$inc || {})) document[key] += value; modifiedCount += 1; } return { modifiedCount }; },
    };
  } };
}

function routeHarness() {
  const db = memoryDb();
  const routes = new Map();
  const app = { get: (path, ...handlers) => routes.set(`GET ${path}`, handlers.at(-1)), post: (path, ...handlers) => routes.set(`POST ${path}`, handlers.at(-1)) };
  const venue = { id: 'osm:node:123', name: 'Public library', lat: 13, lon: 80, address: 'Main Street', category: 'spots' };
  registerNearbyRoutes(app, { getDb: async () => db, requireAuth: (handler) => handler, withProfileWriteFence: (_db, _req, action) => action(), service: { places: async () => [venue], geocode: async () => ({ locations: [] }) } });
  async function request(method, path, options = {}) {
    const userId = options.userId || 'host';
    let status = 200;
    let payload;
    const req = { user: { _id: userId, name: userId }, academicProfileId: options.profileId || `${userId}-profile`, academicProfileContext: { profile: options.school ? { academicLevel: 'Primary School', grade: 'Class 3' } : { academicLevel: "Undergraduate / Bachelor's" } }, params: options.params || {}, query: options.query || {}, body: options.body || {} };
    await routes.get(`${method} ${path}`)(req, { set: () => {}, status: (value) => { status = value; return { json: (data) => { payload = data; } }; }, json: (data) => { payload = data; } });
    return { status, ...payload };
  }
  const body = { title: 'Calculus revision', subject: 'Mathematics', chapter: 'Integration', startsAt: new Date(Date.now() + 86400000).toISOString(), durationMinutes: 60, capacity: 2, publicVenueConfirmed: true, venue };
  return { db, request, body };
}

test('circle create validates time, capacity and a real public study venue', async () => {
  const { request, body } = routeHarness();
  assert.throws(() => normalizeCircleInput({ ...body, startsAt: 'yesterday' }), { status: 400 });
  assert.throws(() => normalizeCircleInput({ ...body, capacity: 100 }), { status: 400 });
  assert.equal((await request('POST', '/api/nearby/circles', { body: { ...body, venue: { ...body.venue, id: 'home' } } })).status, 400);
  const result = await request('POST', '/api/nearby/circles', { body });
  assert.equal(result.status, 201);
  assert.equal(result.circle.venue.name, 'Public library');
  assert.equal(result.circle.isHost, true);
});

test('circle join approval is host-only, profile-scoped and cannot overbook', async () => {
  const { request, body } = routeHarness();
  const created = await request('POST', '/api/nearby/circles', { body });
  const id = created.circle.id;
  assert.equal((await request('POST', '/api/nearby/circles/:id/join', { userId: 'guest', params: { id } })).circle.myStatus, 'pending');
  await request('POST', '/api/nearby/circles/:id/join', { userId: 'second', params: { id } });
  const ownView = await request('GET', '/api/nearby/circles', { query: { lat: 13, lon: 80 } });
  const [guest, second] = ownView.circles[0].requests;
  const action = { params: { id, requestId: guest.id }, body: { action: 'approve' } };
  assert.equal((await request('POST', '/api/nearby/circles/:id/requests/:requestId', { ...action, userId: 'intruder' })).status, 403);
  assert.equal((await request('POST', '/api/nearby/circles/:id/requests/:requestId', { ...action, profileId: 'host-other-profile' })).status, 403);
  assert.equal((await request('POST', '/api/nearby/circles/:id/requests/:requestId', action)).circle.remainingSeats, 0);
  assert.equal((await request('POST', '/api/nearby/circles/:id/requests/:requestId', { params: { id, requestId: second.id }, body: { action: 'approve' } })).status, 409);
  const guestView = await request('GET', '/api/nearby/circles', { userId: 'guest', query: { lat: 13, lon: 80 } });
  assert.equal(guestView.circles[0].requests, undefined);
  assert.equal(guestView.circles[0].myStatus, 'approved');
  assert.equal((await request('POST', '/api/nearby/circles/:id/leave', { userId: 'guest', params: { id } })).circle.remainingSeats, 1);
});

test('school profiles require parent access and cannot bypass by posting directly', async () => {
  const { request, body } = routeHarness();
  const result = await request('POST', '/api/nearby/circles', { school: true, body });
  assert.equal(result.status, 403);
  assert.equal(result.code, 'NEARBY_PARENT_ACCESS_REQUIRED');
  const list = await request('GET', '/api/nearby/circles', { school: true, query: { lat: 13, lon: 80 } });
  assert.equal(list.canParticipate, false);
});

test('profile deletion removes only that profile membership and deletes its hosted circles', async () => {
  const { db, request, body } = routeHarness();
  const created = await request('POST', '/api/nearby/circles', { body });
  const id = created.circle.id;
  await request('POST', '/api/nearby/circles/:id/join', { userId: 'guest', params: { id } });
  await request('POST', '/api/nearby/circles/:id/join', { userId: 'guest', profileId: 'guest-second', params: { id } });
  await cleanupNearbyProfileData(db, { userId: 'guest', academicProfileId: 'guest-profile' });
  const remaining = await db.collection('nearbyCircles').findOne({ _id: id });
  assert.equal(remaining.requests.length, 1);
  assert.equal(remaining.requests[0].academicProfileId, 'guest-second');
  await cleanupNearbyProfileData(db, { userId: 'host', academicProfileId: 'host-profile' });
  assert.equal(await db.collection('nearbyCircles').findOne({ _id: id }), null);
});

test('circle reports persist once per profile and hide results only for the reporting profile', async () => {
  const { db, request, body } = routeHarness();
  const { circle } = await request('POST', '/api/nearby/circles', { body });
  const report = { userId: 'guest', params: { id: circle.id }, body: { reason: 'The venue is closed to public groups.' } };
  assert.equal((await request('POST', '/api/nearby/circles/:id/report', { ...report, body: { reason: 'bad' } })).status, 400);
  assert.equal((await request('POST', '/api/nearby/circles/:id/report', report)).reported, true);
  await request('POST', '/api/nearby/circles/:id/report', { ...report, body: { reason: 'Updated: venue staff confirmed this is not permitted.' } });
  const reports = await db.collection('nearbyReports').find({ circleId: circle.id }).toArray();
  assert.equal(reports.length, 1);
  assert.equal(reports[0].reason, 'Updated: venue staff confirmed this is not permitted.');
  assert.equal(reports[0].status, 'pending');
  const query = { lat: 13, lon: 80 };
  assert.equal((await request('GET', '/api/nearby/circles', { userId: 'guest', query })).circles.length, 0);
  assert.equal((await request('GET', '/api/nearby/circles', { userId: 'guest', profileId: 'guest-second', query })).circles.length, 1);
  assert.equal((await request('GET', '/api/nearby/circles', { query })).circles.length, 1);
});

test('cancelled circles remain visible to their host and requesters outside the discovery radius', async () => {
  const { request, body } = routeHarness();
  const { circle } = await request('POST', '/api/nearby/circles', { body });
  const params = { id: circle.id };
  await request('POST', '/api/nearby/circles/:id/join', { userId: 'guest', params });
  assert.equal((await request('POST', '/api/nearby/circles/:id/cancel', { userId: 'guest', params })).status, 403);
  assert.equal((await request('POST', '/api/nearby/circles/:id/cancel', { params })).circle.status, 'cancelled');
  const query = { lat: 16, lon: 80, radius: 2 };
  assert.equal((await request('GET', '/api/nearby/circles', { query })).circles[0].status, 'cancelled');
  assert.equal((await request('GET', '/api/nearby/circles', { userId: 'guest', query })).circles[0].status, 'cancelled');
  assert.equal((await request('GET', '/api/nearby/circles', { userId: 'outsider', query })).circles.length, 0);
  assert.equal((await request('GET', '/api/nearby/circles', { userId: 'guest', profileId: 'guest-second', query })).circles.length, 0);
  assert.equal((await request('POST', '/api/nearby/circles/:id/join', { userId: 'outsider', params })).status, 409);
});

test('my circles includes recent completed sessions and out-of-area sessions without requiring coordinates', async () => {
  const { db, request, body } = routeHarness();
  const { circle } = await request('POST', '/api/nearby/circles', { body });
  await request('POST', '/api/nearby/circles/:id/join', { userId: 'guest', params: { id: circle.id } });
  const farQuery = { lat: 16, lon: 80, radius: 2 };
  assert.equal((await request('GET', '/api/nearby/circles', { query: farQuery })).circles.length, 0);
  assert.equal((await request('GET', '/api/nearby/circles', { query: { ...farQuery, mine: 'true' } })).circles.length, 1);
  await db.collection('nearbyCircles').updateOne({ _id: circle.id }, { $set: { startsAt: new Date(Date.now() - 86400000) } });
  const mine = await request('GET', '/api/nearby/circles', { userId: 'guest', query: { mine: 'true' } });
  assert.equal(mine.circles.length, 1);
  assert.equal(mine.circles[0].status, 'completed');
  assert.equal(mine.circles[0].myStatus, 'pending');
  assert.equal((await request('GET', '/api/nearby/circles', { userId: 'outsider', query: { mine: 'true' } })).circles.length, 0);
});
