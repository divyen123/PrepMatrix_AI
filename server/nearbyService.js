const CACHE_LIMIT = 300;
const GEOCODE_TTL = 24 * 60 * 60 * 1000;
const PLACES_TTL = 20 * 60 * 1000;
const STALE_PLACES_TTL = 24 * 60 * 60 * 1000;
const DEFAULT_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const BACKUP_OVERPASS_URL = 'https://overpass.private.coffee/api/interpreter';
export const NEARBY_SERVICE_VERSION = 'study-spots-1';

function providerFailureType(error) {
  if (error?.providerFailure) return error.providerFailure;
  if (['TimeoutError', 'AbortError'].includes(error?.name)) return 'timeout';
  if (error instanceof SyntaxError) return 'invalid_response';
  return 'network';
}

function safeErrorCode(value) {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(value) ? value : undefined;
}

function providerFailureLog(endpoint, error, elapsedMs) {
  let provider = 'invalid-endpoint';
  try { provider = new URL(endpoint).hostname; } catch { /* Configuration errors have no safe host. */ }
  const revision = process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || '';
  return {
    event: 'nearby_provider_failure', version: NEARBY_SERVICE_VERSION,
    ...(/^[a-f0-9]{7,40}$/i.test(revision) ? { revision: revision.slice(0, 12) } : {}),
    provider, failure: providerFailureType(error), elapsedMs,
    ...(error.upstreamStatus ? { status: error.upstreamStatus } : {}),
    ...(error.transportCode ? { transportCode: error.transportCode } : {}),
  };
}

export function nearbyError(status, message, code = 'NEARBY_REQUEST_FAILED') {
  return Object.assign(new Error(message), { status, code });
}

export function shortText(value, maximum = 160) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

export function parseNearbyArea(query = {}) {
  for (const key of ['lat', 'lon']) {
    if (query[key] === undefined || query[key] === null || String(query[key]).trim() === '') {
      throw nearbyError(400, 'Choose a location before searching nearby.');
    }
  }
  const lat = Number(query.lat);
  const lon = Number(query.lon);
  const radius = Number(query.radius ?? 5);
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180) {
    throw nearbyError(400, 'Choose a valid location.');
  }
  if (!Number.isFinite(radius) || radius < 1 || radius > 25) {
    throw nearbyError(400, 'Search within a radius from 1 to 25 kilometres.');
  }
  return { lat, lon, radius };
}

export function distanceKm(a, b) {
  const radians = (value) => value * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export function nearbySearchBounds({ lat, lon, radius }) {
  const radians = Math.PI / 180;
  // A small margin keeps floating-point rounding from excluding boundary points.
  const angle = (radius + 0.001) / 6371;
  const latitude = lat * radians;
  const south = Math.max(-Math.PI / 2, latitude - angle);
  const north = Math.min(Math.PI / 2, latitude + angle);
  if (south === -Math.PI / 2 || north === Math.PI / 2) return [south / radians, -180, north / radians, 180];
  const longitudeDelta = Math.asin(Math.sin(angle) / Math.cos(latitude)) / radians;
  const wrap = (value) => ((value + 540) % 360) - 180;
  return [south / radians, wrap(lon - longitudeDelta), north / radians, wrap(lon + longitudeDelta)];
}

export function safeWebsite(value) {
  try {
    const url = new URL(shortText(value, 600));
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function safePhone(value) {
  const phone = shortText(value, 80).split(';')[0].trim();
  return /^[+\d\s().-]{6,35}$/.test(phone) && phone.replace(/\D/g, '').length >= 6 ? phone : '';
}

export function osmPlace(element, category) {
  const tags = element.tags || {};
  const lat = Number(element.lat ?? element.center?.lat);
  const lon = Number(element.lon ?? element.center?.lon);
  if (!tags.name || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const facilities = [];
  if (['yes', 'wlan'].includes(tags.internet_access)) facilities.push('Wi-Fi');
  if (tags['socket:type'] || tags['charging_station'] === 'yes') facilities.push('Charging points');
  if (tags.wheelchair === 'yes') facilities.push('Wheelchair access');
  if (tags.computers === 'yes' || Number(tags.computers) > 0) facilities.push('Computers');
  return {
    id: `osm:${element.type}:${element.id}`, name: shortText(tags.name), category,
    lat, lon, address: shortText(tags['addr:full'] || [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb'], tags['addr:city'], tags['addr:postcode']].filter(Boolean).join(', '), 400),
    phone: safePhone(tags['contact:phone'] || tags.phone), website: safeWebsite(tags['contact:website'] || tags.website),
    hours: shortText(tags.opening_hours, 300), source: 'OpenStreetMap',
    sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    updatedAt: element.timestamp || null,
    fees: tags.fee === 'no' ? 'Free entry (listed)' : '', facilities,
    type: shortText(tags.amenity || tags.office || 'study space'),
    access: shortText(tags.access),
  };
}

function makeCache(now) {
  const values = new Map();
  return {
    get(key) { const value = values.get(key); if (value && value.until > now()) return value.data; values.delete(key); return undefined; },
    set(key, data, ttl) { if (values.size >= CACHE_LIMIT) values.delete(values.keys().next().value); values.set(key, { data, until: now() + ttl }); },
  };
}

// One bounded queue per provider: user-triggered lookups only, cached and at most
// one request per second per process. Configure private endpoints for scale.
function providerQueue({ now, wait, gapMs, maxWaitMs = 3000 }) {
  let tail = Promise.resolve();
  let queued = 0;
  let nextAt = 0;
  return (operation) => {
    if (queued >= 6) return Promise.reject(nearbyError(503, 'Nearby search is busy. Please try again shortly.', 'NEARBY_PROVIDER_BUSY'));
    queued += 1;
    let expired = false;
    let timer;
    const started = now();
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        expired = true;
        reject(nearbyError(503, 'Nearby search is busy. Please try again shortly.', 'NEARBY_PROVIDER_BUSY'));
      }, maxWaitMs);
    });
    const work = tail.then(async () => {
      if (expired || now() - started >= maxWaitMs) throw nearbyError(503, 'Nearby search is busy. Please try again shortly.', 'NEARBY_PROVIDER_BUSY');
      const pause = Math.max(0, nextAt - now());
      if (pause) await wait(pause);
      if (expired || now() - started >= maxWaitMs) throw nearbyError(503, 'Nearby search is busy. Please try again shortly.', 'NEARBY_PROVIDER_BUSY');
      clearTimeout(timer);
      nextAt = now() + gapMs;
      return operation();
    });
    tail = work.catch(() => undefined).finally(() => { clearTimeout(timer); queued -= 1; });
    return Promise.race([work, timeout]);
  };
}

export function createNearbyService({
  fetchImpl = globalThis.fetch,
  now = Date.now,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  gapMs = 1100,
  queueWaitMs = 3000,
  placeTimeoutMs = 15000,
  onProviderFailure = (event) => console.warn('[Nearby]', JSON.stringify(event)),
  photonUrl = process.env.NEARBY_PHOTON_URL || 'https://photon.komoot.io/api/',
  overpassUrl = process.env.NEARBY_OVERPASS_URL || DEFAULT_OVERPASS_URL,
  // Private endpoints never silently send their searches to a public backup.
  overpassFallbackUrl = process.env.NEARBY_OVERPASS_FALLBACK_URL
    ?? (overpassUrl === DEFAULT_OVERPASS_URL ? BACKUP_OVERPASS_URL : ''),
} = {}) {
  const cache = makeCache(now);
  const lastGoodPlaces = makeCache(now);
  const pending = new Map();
  const cooldowns = new Map();
  const endpoints = [...new Set([overpassUrl, overpassFallbackUrl].filter(Boolean))];
  const geocodeQueue = providerQueue({ now, wait, gapMs, maxWaitMs: queueWaitMs });
  const placesQueue = providerQueue({ now, wait, gapMs, maxWaitMs: queueWaitMs });
  async function upstream(url, options = {}, timeoutMs = 16000) {
    try {
      const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs), headers: {
        'User-Agent': 'PrepMatrixAI-Nearby/1.0', Accept: 'application/json', ...options.headers,
      } });
      if (!response.ok) {
        const error = nearbyError(503, 'The map provider is temporarily unavailable. Try again shortly.', 'NEARBY_PROVIDER_UNAVAILABLE');
        error.providerFailure = 'http';
        error.upstreamStatus = response.status;
        const retryAfter = response.headers?.get?.('retry-after');
        error.retryAfterMs = retryAfter && /^\d+$/.test(retryAfter)
          ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - now()) || 0;
        throw error;
      }
      return await response.json();
    } catch (error) {
      if (error?.code === 'NEARBY_PROVIDER_UNAVAILABLE') throw error;
      const type = providerFailureType(error);
      const message = type === 'timeout'
        ? 'The nearby map service took too long to respond. Please try again shortly.'
        : type === 'invalid_response'
          ? 'The nearby map service returned an incomplete response. Please try again shortly.'
          : 'The server could not connect to the nearby map service. Please try again shortly.';
      throw Object.assign(nearbyError(503, message, 'NEARBY_PROVIDER_UNAVAILABLE'), {
        providerFailure: type, transportCode: safeErrorCode(error?.cause?.code || error?.code),
      });
    }
  }
  async function cached(key, ttl, operation) {
    const hit = cache.get(key);
    if (hit) return hit;
    if (pending.has(key)) return pending.get(key);
    const promise = operation().then((data) => { cache.set(key, data, ttl); return data; }).finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  }
  async function queryPlaces(query) {
    let failure;
    for (const endpoint of endpoints) {
      const cooldown = cooldowns.get(endpoint);
      if (cooldown?.until > now()) {
        failure = cooldown.error;
        if (cooldown.stopFailover) break;
        continue;
      }
      const started = now();
      try {
        const data = await upstream(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ data: query }).toString() }, placeTimeoutMs);
        if (!Array.isArray(data?.elements) || data.remark || data.elements.some((element) => !element || typeof element !== 'object')) throw Object.assign(nearbyError(503, 'The map provider could not complete this search. Try again or choose a smaller radius.', 'NEARBY_PROVIDER_UNAVAILABLE'), { providerFailure: 'invalid_response' });
        cooldowns.delete(endpoint);
        return data;
      } catch (error) {
        failure = error;
        // Never include the query, response body, coordinates, or raw error message.
        try { onProviderFailure(providerFailureLog(endpoint, error, Math.max(0, now() - started))); } catch { /* Logging must not break discovery. */ }
        // Respect throttling/access refusals. Failover is for outages, not quotas.
        const stopFailover = Number.isFinite(error.upstreamStatus) && error.upstreamStatus >= 400 && error.upstreamStatus < 500;
        cooldowns.set(endpoint, { until: now() + Math.max(30000, Math.min(3600000, error.retryAfterMs || 0)), error, stopFailover });
        if (stopFailover) break;
      }
    }
    const retryTimes = [];
    for (const endpoint of endpoints) {
      const cooldown = cooldowns.get(endpoint);
      retryTimes.push(cooldown?.until || now());
      if (cooldown?.stopFailover && cooldown.until > now()) break;
    }
    const retryAfterSeconds = retryTimes.length ? Math.max(1, Math.ceil((Math.min(...retryTimes) - now()) / 1000)) : 30;
    const unavailable = failure || nearbyError(503, 'Live place search is temporarily unavailable. Please retry shortly.', 'NEARBY_PROVIDER_UNAVAILABLE');
    // Clone so the cached provider failure keeps its original Retry-After value.
    throw Object.assign(nearbyError(unavailable.status, unavailable.message, unavailable.code), {
      providerFailure: unavailable.providerFailure, retryAfterSeconds,
    });
  }
  const service = {
    async geocode(value) {
      const query = shortText(value, 180);
      if (query.length < 3) throw nearbyError(400, 'Enter at least three characters of an area, city or pincode.');
      return cached(`geo:${query.toLowerCase()}`, GEOCODE_TTL, () => geocodeQueue(async () => {
        const url = new URL(photonUrl);
        url.searchParams.set('q', query);
        url.searchParams.set('limit', '5');
        const started = now();
        let data;
        try {
          data = await upstream(url);
          if (!Array.isArray(data?.features)) throw Object.assign(nearbyError(503, 'The location provider returned an invalid response.'), { providerFailure: 'invalid_response' });
        } catch (error) {
          try { onProviderFailure(providerFailureLog(photonUrl, error, Math.max(0, now() - started))); } catch { /* Logging must not break location search. */ }
          throw error;
        }
        const locations = data.features.map((feature) => {
          const p = feature.properties || {};
          const [lon, lat] = feature.geometry?.coordinates || [];
          return { lat, lon, label: [...new Set([p.name, p.district, p.city, p.state, p.postcode, p.country].filter(Boolean))].join(', ') };
        }).filter((location) => location.label && Number.isFinite(location.lat) && Number.isFinite(location.lon) && Math.abs(location.lat) <= 90 && Math.abs(location.lon) <= 180);
        return { locations, source: 'OpenStreetMap / Photon' };
      }));
    },
    async searchPlaces(input) {
      const area = parseNearbyArea(input);
      const category = input.category || 'spots';
      if (category !== 'spots') throw nearbyError(400, 'Study Spots is the only nearby place category.');
      const key = `places:${area.lat}:${area.lon}:${area.radius}:spots`;
      let snapshot;
      let stale = false;
      let refreshError;
      try {
        snapshot = await cached(key, PLACES_TTL, () => placesQueue(async () => {
          // Bound the provider's scan; the exact circular radius is applied below.
          const bounds = `(${nearbySearchBounds(area).join(',')})`;
          const filters = ['["amenity"="library"]["name"]', '["office"="coworking"]["name"]'];
          const query = `[out:json][timeout:12][maxsize:33554432];(${filters.map((filter) => `nwr${filter}${bounds};`).join('')});out meta center 250;`;
          const data = await queryPlaces(query);
          const next = { places: data.elements.map((element) => osmPlace(element, category)).filter(Boolean), fetchedAt: new Date(now()).toISOString() };
          lastGoodPlaces.set(key, next, STALE_PLACES_TTL);
          return next;
        }));
      } catch (error) {
        snapshot = error.status === 503 ? lastGoodPlaces.get(key) : null;
        // An old empty snapshot is not evidence that this search succeeded.
        if (!snapshot?.places.length) throw error;
        stale = true;
        refreshError = error;
      }
      const places = snapshot.places.map((place) => ({ ...place, category, distanceKm: distanceKm(area, place) }))
        .filter((place) => place.distanceKm <= area.radius)
        .sort((a, b) => a.distanceKm - b.distanceKm);
      if (stale && !places.length) throw refreshError;
      return { places, fetchedAt: snapshot.fetchedAt, stale, ...(stale ? { notice: `Live map search is temporarily unavailable. Showing saved map results fetched at ${snapshot.fetchedAt}. Confirm details before visiting.`, retryAfterSeconds: refreshError.retryAfterSeconds || 0 } : {}) };
    },
    async places(input) {
      return (await service.searchPlaces(input)).places;
    },
  };
  return service;
}
