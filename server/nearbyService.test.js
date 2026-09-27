import test from 'node:test';
import assert from 'node:assert/strict';
import { createNearbyService, nearbySearchBounds, photonPlace } from './nearbyService.js';

const area = { lat: 13.1157422, lon: 80.2249267, radius: 20, category: 'spots' };
const primary = 'https://primary.example/api/interpreter';
const backup = 'https://backup.example/api/interpreter';
const photon = 'https://photon.example/api/';
const library = { type: 'node', id: 1, lat: area.lat, lon: area.lon, tags: { name: 'Public library' } };
const photonLibrary = (lon = area.lon, lat = area.lat, properties = {}) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: { osm_id: 2, osm_type: 'N', osm_key: 'amenity', osm_value: 'library', name: 'Perambur public library', street: 'Paper Mills Road', city: 'Chennai', ...properties },
});
const response = (elements = [library]) => ({ ok: true, json: async () => ({ elements }) });
const serviceWith = (options) => createNearbyService({ gapMs: 0, overpassUrl: primary, overpassFallbackUrl: backup, onProviderFailure: () => {}, ...options });

test('provider diagnostics identify failures without disclosing searched coordinates or query text', async () => {
  const events = [];
  const service = serviceWith({ onProviderFailure: (event) => events.push(event), fetchImpl: async (url) => {
    if (url === primary) throw Object.assign(new TypeError('private query body'), { cause: { code: 'ETIMEDOUT' } });
    return response();
  } });
  assert.equal((await service.searchPlaces(area)).places.length, 1);
  assert.deepEqual(events.map(({ provider, failure, transportCode }) => ({ provider, failure, transportCode })), [
    { provider: 'primary.example', failure: 'network', transportCode: 'ETIMEDOUT' },
  ]);
  assert.doesNotMatch(JSON.stringify(events), /13\.1157422|80\.2249267|private query body|amenity/u);
  const locationEvents = [];
  const unavailableLocation = serviceWith({ onProviderFailure: (event) => locationEvents.push(event), fetchImpl: async () => { throw new DOMException('timeout', 'TimeoutError'); } });
  await assert.rejects(unavailableLocation.geocode('Periyar Nagar'), { status: 503 });
  assert.equal(locationEvents[0].provider, 'photon.komoot.io');
  assert.equal(locationEvents[0].failure, 'timeout');
  assert.doesNotMatch(JSON.stringify(locationEvents), /Periyar Nagar/u);
});

test('bounding-box discovery contains the whole search circle, including polar and date-line areas', () => {
  for (const center of [area, { lat: 0, lon: 0, radius: 25 }, { lat: 0, lon: 179.99, radius: 25 }, { lat: 80, lon: -179.99, radius: 25 }, { lat: 89.99, lon: 15, radius: 25 }, { lat: -90, lon: 0, radius: 25 }]) {
    const [south, west, north, east] = nearbySearchBounds(center);
    assert.ok(south >= -90 && north <= 90 && south < north);
    assert.ok(west >= -180 && east <= 180);
    const lat1 = center.lat * Math.PI / 180;
    const lon1 = center.lon * Math.PI / 180;
    const angle = center.radius / 6371;
    for (let degrees = 0; degrees < 360; degrees += 5) {
      const bearing = degrees * Math.PI / 180;
      const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angle) + Math.cos(lat1) * Math.sin(angle) * Math.cos(bearing));
      const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(angle) * Math.cos(lat1), Math.cos(angle) - Math.sin(lat1) * Math.sin(lat2));
      const lat = lat2 * 180 / Math.PI;
      const lon = ((lon2 * 180 / Math.PI + 540) % 360) - 180;
      assert.ok(lat >= south && lat <= north, 'the box includes a point on the radius');
      assert.ok(west <= east ? lon >= west && lon <= east : lon >= west || lon <= east, 'longitude wrapping preserves the search circle');
    }
  }
});

test('transport, timeout, server and incomplete-response failures try the backup once', async () => {
  for (const failure of [
    () => { throw new TypeError('Network unavailable'); },
    () => { throw new DOMException('Timed out', 'TimeoutError'); },
    () => ({ ok: false, status: 504 }),
    () => ({ ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); } }),
    () => ({ ok: true, json: async () => null }),
    () => ({ ok: true, json: async () => ({ elements: [null] }) }),
    () => ({ ok: true, json: async () => ({ elements: [library], remark: 'runtime error: Query timed out' }) }),
  ]) {
    const calls = [];
    const service = serviceWith({ fetchImpl: async (url) => {
      calls.push(url);
      return url === primary ? failure() : response();
    } });
    const result = await service.searchPlaces(area);
    assert.deepEqual(calls, [primary, backup]);
    assert.equal(result.places[0].name, 'Public library');
    assert.equal(result.stale, false);
    assert.equal(result.notice, undefined);
    await service.searchPlaces(area);
    assert.equal(calls.length, 2, 'the successful backup result must be cached');
  }
});

test('Photon normalizes only real named study venues with safe OSM source links', () => {
  assert.deepEqual(photonPlace(photonLibrary(), 'spots'), {
    id: 'osm:node:2', name: 'Perambur public library', category: 'spots', lat: area.lat, lon: area.lon,
    address: 'Paper Mills Road, Chennai', phone: '', website: '', hours: '',
    source: 'Photon / OpenStreetMap', sourceUrl: 'https://www.openstreetmap.org/node/2',
    updatedAt: null, fees: '', facilities: [], type: 'library', access: '',
  });
  assert.equal(photonPlace(photonLibrary(area.lon, area.lat, { osm_key: 'place', osm_value: 'suburb' }), 'spots'), null);
  assert.equal(photonPlace(photonLibrary(area.lon, area.lat, { name: '' }), 'spots'), null);
  assert.equal(photonPlace(photonLibrary(area.lon, area.lat, { osm_id: '../bad' }), 'spots'), null);
});

test('Overpass timeouts fall back to geographically bounded Photon place search', async () => {
  const calls = [];
  const service = serviceWith({ placeSearchUrl: photon, fetchImpl: async (url) => {
    calls.push(url);
    if (String(url).startsWith(photon)) return { ok: true, json: async () => ({ features: [
      photonLibrary(), photonLibrary(),
      photonLibrary(area.lon + 1, area.lat, { osm_id: 3, name: 'Distant library' }),
      photonLibrary(area.lon + 0.002, area.lat, { osm_id: 4, osm_key: 'office', osm_value: 'coworking', name: 'Study coworking' }),
    ] }) };
    throw new DOMException('Timed out', 'TimeoutError');
  } });
  const result = await service.searchPlaces({ ...area, radius: 5 });
  assert.deepEqual(calls.slice(0, 2), [primary, backup]);
  const photonUrl = new URL(calls[2]);
  assert.equal(photonUrl.origin, new URL(photon).origin);
  assert.equal(photonUrl.searchParams.get('include'), 'osm.amenity.library,osm.office.coworking');
  assert.equal(photonUrl.searchParams.get('lat'), String(area.lat));
  assert.equal(photonUrl.searchParams.get('lon'), String(area.lon));
  assert.ok(photonUrl.searchParams.get('bbox'));
  assert.equal(photonUrl.searchParams.get('q'), null);
  assert.deepEqual(result.places.map((place) => place.name), ['Perambur public library', 'Study coworking']);
  assert.equal(result.places[0].sourceUrl, 'https://www.openstreetmap.org/node/2');
  assert.equal(result.source, 'Photon / OpenStreetMap');
  assert.match(result.notice, /Live map search is unavailable.*online location search/u);
  assert.equal(result.stale, false);
  assert.equal(result.retryAfterSeconds, 60);
});

test('a successful empty map result can use Photon without claiming a map outage', async () => {
  const calls = [];
  const service = serviceWith({ placeSearchUrl: photon, fetchImpl: async (url) => {
    calls.push(url);
    return String(url).startsWith(photon)
      ? { ok: true, json: async () => ({ features: [photonLibrary()] }) }
      : response([]);
  } });
  const result = await service.searchPlaces(area);
  assert.equal(result.places.length, 1);
  assert.match(result.notice, /^Showing nearby places from online location search/u);
  assert.equal(calls.length, 2);
});

test('an empty or failed Photon lookup never turns an Overpass outage into empty success', async () => {
  for (const photonResult of [
    { ok: true, json: async () => ({ features: [] }) },
    { ok: false, status: 503 },
  ]) {
    const service = serviceWith({ placeSearchUrl: photon, fetchImpl: async (url) => {
      if (String(url).startsWith(photon)) return photonResult;
      throw new TypeError('Overpass offline');
    } });
    await assert.rejects(service.searchPlaces(area), { status: 503 });
  }
});

test('Overpass throttling does not trigger Photon fallback and custom providers remain private', async () => {
  const calls = [];
  const service = serviceWith({ placeSearchUrl: photon, fetchImpl: async (url) => {
    calls.push(url);
    return { ok: false, status: 429, headers: { get: () => '120' } };
  } });
  await assert.rejects(service.searchPlaces(area), { status: 503 });
  assert.deepEqual(calls, [primary]);
});

test('Photon fallback is cached briefly and retries Overpass after its cache expires', async () => {
  let time = 1000000;
  let primaryReady = false;
  const calls = [];
  const service = serviceWith({ now: () => time, placeSearchUrl: photon, fetchImpl: async (url) => {
    calls.push(url);
    if (String(url).startsWith(photon)) return { ok: true, json: async () => ({ features: [photonLibrary()] }) };
    if (primaryReady) return response();
    throw new TypeError('Offline');
  } });
  assert.equal((await service.searchPlaces(area)).source, 'Photon / OpenStreetMap');
  assert.equal(calls.length, 3);
  time += 59000;
  assert.equal((await service.searchPlaces(area)).source, 'Photon / OpenStreetMap');
  assert.equal(calls.length, 3);
  time += 2000;
  primaryReady = true;
  assert.equal((await service.searchPlaces(area)).source, 'OpenStreetMap');
  assert.equal(calls.length, 4);
});

test('Photon Retry-After is respected across searches after a fallback rate limit', async () => {
  let time = 1000000;
  const calls = [];
  const service = serviceWith({ now: () => time, placeSearchUrl: photon, fetchImpl: async (url) => {
    calls.push(url);
    if (String(url).startsWith(photon)) return { ok: false, status: 429, headers: { get: () => '120' } };
    throw new TypeError('Overpass offline');
  } });
  await assert.rejects(service.searchPlaces(area), (error) => error.status === 503 && error.retryAfterSeconds === 120);
  time += 31000;
  await assert.rejects(service.searchPlaces({ ...area, lat: area.lat + 0.001 }), (error) => error.status === 503 && error.retryAfterSeconds >= 89);
  assert.equal(calls.filter((url) => String(url).startsWith(photon)).length, 1);
});

test('a timed-out fetch is aborted before trying the backup', async () => {
  let aborted = false;
  // Keep the event loop alive while AbortSignal.timeout uses its unref timer.
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const service = serviceWith({ placeTimeoutMs: 10, fetchImpl: (url, options) => {
      if (url === backup) return Promise.resolve(response());
      return new Promise((_, reject) => options.signal.addEventListener('abort', () => {
        aborted = true;
        reject(options.signal.reason);
      }, { once: true }));
    } });
    assert.equal((await service.searchPlaces(area)).places.length, 1);
    assert.equal(aborted, true);
  } finally { clearTimeout(keepAlive); }
});

test('provider throttling respects Retry-After and never evades refusal using a backup', async () => {
  let time = 1000000;
  const calls = [];
  const service = serviceWith({ now: () => time, fetchImpl: async (url) => {
    calls.push(url);
    return calls.length === 1 ? { ok: false, status: 429, headers: { get: () => '120' } } : response();
  } });
  await assert.rejects(service.searchPlaces(area), { status: 503 });
  time += 60000;
  await assert.rejects(service.searchPlaces(area), { status: 503 });
  assert.deepEqual(calls, [primary]);
  time += 60001;
  assert.equal((await service.searchPlaces(area)).places.length, 1);
  assert.deepEqual(calls, [primary, primary]);
});

test('custom primary providers do not implicitly send searches to a public fallback', async () => {
  const calls = [];
  const service = createNearbyService({ gapMs: 0, overpassUrl: primary, fetchImpl: async (url) => {
    calls.push(url);
    throw new Error('Offline');
  } });
  await assert.rejects(service.searchPlaces(area), { status: 503 });
  assert.deepEqual(calls, [primary]);
});

test('last successful results survive a provider outage with their original timestamp', async () => {
  let time = 1000000;
  let offline = false;
  const service = serviceWith({ now: () => time, fetchImpl: async () => {
    if (offline) throw new Error('Offline');
    return response();
  } });
  const first = await service.searchPlaces(area);
  time += 21 * 60000;
  offline = true;
  const cached = await service.searchPlaces(area);
  assert.deepEqual(cached.places, first.places);
  assert.equal(cached.stale, true);
  assert.equal(cached.fetchedAt, first.fetchedAt);
  assert.ok(cached.notice.includes(first.fetchedAt));
  await assert.rejects(service.searchPlaces({ ...area, lat: area.lat + 0.000001 }), { status: 503 });
  await assert.rejects(service.searchPlaces({ ...area, radius: 5 }), { status: 503 });
  await assert.rejects(service.searchPlaces({ ...area, category: 'tuitions' }), { status: 400 });
  time += 24 * 60 * 60000;
  await assert.rejects(service.searchPlaces(area), { status: 503 });
});

test('empty and out-of-radius stale results cannot hide a failed search', async () => {
  for (const elements of [[], [{ ...library, lat: 0 }]]) {
    let time = 1000000;
    let offline = false;
    const service = serviceWith({ now: () => time, fetchImpl: async () => {
      if (offline) throw new Error('Offline');
      return response(elements);
    } });
    assert.equal((await service.searchPlaces(area)).places.length, 0);
    time += 21 * 60000;
    offline = true;
    await assert.rejects(service.searchPlaces(area), { status: 503 });
  }
});

test('a successful empty refresh replaces old places instead of reviving stale data', async () => {
  let time = 1000000;
  let calls = 0;
  const service = serviceWith({ now: () => time, fetchImpl: async () => {
    calls += 1;
    if (calls > 2) throw new Error('Offline');
    return response(calls === 1 ? [library] : []);
  } });
  await service.searchPlaces(area);
  time += 21 * 60000;
  assert.equal((await service.searchPlaces(area)).places.length, 0);
  time += 21 * 60000;
  await assert.rejects(service.searchPlaces(area), { status: 503 });
});

test('a search that waits too long in the queue never contacts the provider later', async () => {
  let release;
  let started;
  let calls = 0;
  const entered = new Promise((resolve) => { started = resolve; });
  const service = serviceWith({ queueWaitMs: 20, fetchImpl: async () => {
    calls += 1;
    started();
    await new Promise((resolve) => { release = resolve; });
    return response();
  } });
  const first = service.searchPlaces(area);
  await entered;
  const duplicate = service.searchPlaces(area);
  try {
    await assert.rejects(service.searchPlaces({ ...area, radius: 5 }), { status: 503, code: 'NEARBY_PROVIDER_BUSY' });
    assert.equal(calls, 1);
  } finally { release(); }
  assert.deepEqual(await duplicate, await first);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
});
