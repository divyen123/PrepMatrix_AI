import test from 'node:test';
import assert from 'node:assert/strict';
import { createNearbyService, nearbySearchBounds } from './nearbyService.js';

const area = { lat: 13.1157422, lon: 80.2249267, radius: 20, category: 'spots' };
const primary = 'https://primary.example/api/interpreter';
const backup = 'https://backup.example/api/interpreter';
const library = { type: 'node', id: 1, lat: area.lat, lon: area.lon, tags: { name: 'Public library' } };
const response = (elements = [library]) => ({ ok: true, json: async () => ({ elements }) });
const serviceWith = (options) => createNearbyService({ gapMs: 0, overpassUrl: primary, overpassFallbackUrl: backup, ...options });

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
  await assert.rejects(service.searchPlaces({ ...area, category: 'tuitions' }), { status: 503 });
  time += 24 * 60 * 60000;
  await assert.rejects(service.searchPlaces(area), { status: 503 });
});

test('empty, out-of-radius and no-phone stale results cannot hide a failed search', async () => {
  for (const [elements, category] of [
    [[], 'spots'],
    [[{ ...library, lat: 0 }], 'spots'],
    [[library], 'rescue'],
  ]) {
    let time = 1000000;
    let offline = false;
    const service = serviceWith({ now: () => time, fetchImpl: async () => {
      if (offline) throw new Error('Offline');
      return response(elements);
    } });
    const query = { ...area, category };
    assert.equal((await service.searchPlaces(query)).places.length, 0);
    time += 21 * 60000;
    offline = true;
    await assert.rejects(service.searchPlaces(query), { status: 503 });
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
