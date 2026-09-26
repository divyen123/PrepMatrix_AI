const CACHE_LIMIT = 300;
const GEOCODE_TTL = 24 * 60 * 60 * 1000;
const PLACES_TTL = 20 * 60 * 1000;

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
    updatedAt: element.timestamp || null, subjects: [], board: '', language: '',
    fees: tags.fee === 'no' ? 'Free entry (listed)' : '', batches: [], facilities, phoneSupport: false,
    type: shortText(tags.amenity || tags.office || tags.education || 'institution'),
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
function providerQueue({ now, wait, gapMs }) {
  let tail = Promise.resolve();
  let queued = 0;
  let nextAt = 0;
  return (operation) => {
    if (queued >= 6) return Promise.reject(nearbyError(503, 'Nearby search is busy. Please try again shortly.', 'NEARBY_PROVIDER_BUSY'));
    queued += 1;
    const result = tail.then(async () => {
      const pause = Math.max(0, nextAt - now());
      if (pause) await wait(pause);
      nextAt = now() + gapMs;
      return operation();
    });
    tail = result.catch(() => undefined).finally(() => { queued -= 1; });
    return result;
  };
}

export function createNearbyService({
  fetchImpl = globalThis.fetch,
  now = Date.now,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  gapMs = 1100,
  photonUrl = process.env.NEARBY_PHOTON_URL || 'https://photon.komoot.io/api/',
  overpassUrl = process.env.NEARBY_OVERPASS_URL || 'https://overpass-api.de/api/interpreter',
} = {}) {
  const cache = makeCache(now);
  const pending = new Map();
  const geocodeQueue = providerQueue({ now, wait, gapMs });
  const placesQueue = providerQueue({ now, wait, gapMs });
  async function upstream(url, options = {}) {
    try {
      const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(25_000), headers: {
        'User-Agent': 'PrepMatrixAI-Nearby/1.0', Accept: 'application/json', ...options.headers,
      } });
      if (!response.ok) throw nearbyError(503, 'The map provider is temporarily unavailable. Try again shortly.', 'NEARBY_PROVIDER_UNAVAILABLE');
      return await response.json();
    } catch (error) {
      if (error.code === 'NEARBY_PROVIDER_UNAVAILABLE') throw error;
      throw nearbyError(503, 'Nearby search could not reach the map provider. Try again shortly.', 'NEARBY_PROVIDER_UNAVAILABLE');
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
  return {
    async geocode(value) {
      const query = shortText(value, 180);
      if (query.length < 3) throw nearbyError(400, 'Enter at least three characters of an area, city or pincode.');
      return cached(`geo:${query.toLowerCase()}`, GEOCODE_TTL, () => geocodeQueue(async () => {
        const url = new URL(photonUrl);
        url.searchParams.set('q', query);
        url.searchParams.set('limit', '5');
        const data = await upstream(url);
        if (!Array.isArray(data.features)) throw nearbyError(503, 'The location provider returned an invalid response.');
        const locations = data.features.map((feature) => {
          const p = feature.properties || {};
          const [lon, lat] = feature.geometry?.coordinates || [];
          return { lat, lon, label: [...new Set([p.name, p.district, p.city, p.state, p.postcode, p.country].filter(Boolean))].join(', ') };
        }).filter((location) => location.label && Number.isFinite(location.lat) && Number.isFinite(location.lon) && Math.abs(location.lat) <= 90 && Math.abs(location.lon) <= 180);
        return { locations, source: 'OpenStreetMap / Photon' };
      }));
    },
    async places(input) {
      const area = parseNearbyArea(input);
      const category = input.category || 'tuitions';
      if (!['tuitions', 'spots', 'rescue'].includes(category)) throw nearbyError(400, 'Choose a valid nearby category.');
      const providerCategory = category === 'rescue' ? 'tuitions' : category;
      const key = `places:${area.lat.toFixed(4)}:${area.lon.toFixed(4)}:${area.radius}:${providerCategory}`;
      const result = await cached(key, PLACES_TTL, () => placesQueue(async () => {
        const around = `(around:${Math.ceil(area.radius * 1000)},${area.lat},${area.lon})`;
        const filters = providerCategory === 'spots'
          ? ['["amenity"="library"]', '["office"="coworking"]']
          : ['["amenity"~"^(school|college|university|language_school|music_school|training)$"]', '["education"="tutoring"]', '["amenity"="cram_school"]'];
        const query = `[out:json][timeout:20];(${filters.map((filter) => `nwr${filter}${around};`).join('')});out meta center 250;`;
        const data = await upstream(overpassUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ data: query }).toString() });
        if (!Array.isArray(data.elements) || data.remark) throw nearbyError(503, 'The map provider could not complete this search. Try a smaller radius.');
        return data.elements.map((element) => osmPlace(element, providerCategory)).filter(Boolean);
      }));
      return result.map((place) => ({ ...place, category, distanceKm: distanceKm(area, place) }))
        .filter((place) => place.distanceKm <= area.radius && (category !== 'rescue' || place.phone))
        .sort((a, b) => a.distanceKm - b.distanceKm);
    },
  };
}
