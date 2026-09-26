import { randomUUID } from 'node:crypto';
import { normalizeAcademicProfile } from '../src/utils/academicProfile.js';
import { academicProfileFilter, withAcademicProfileWriteFence } from './profileDataScope.js';
import { readParentAccess } from './kidsParentAccess.js';
import { createNearbyService, distanceKm, nearbyError, parseNearbyArea, safePhone, safeWebsite, shortText } from './nearbyService.js';

const CIRCLES = 'nearbyCircles';
const REPORTS = 'nearbyReports';
const LISTINGS = 'nearbyListings';
const indexesByDb = new WeakMap();
const idText = (value) => String(value || '');
const sameMember = (record, req) => idText(record.userId) === idText(req.user._id) && record.academicProfileId === req.academicProfileId;
const displayName = (req) => shortText(req.user.name || req.user.fullName || req.user.username || 'Learner', 60).split(/[\s@]/)[0];
const textArray = (value, limit = 20) => Array.isArray(value) ? value.slice(0, limit).map((item) => shortText(item)).filter(Boolean) : [];

async function ensureIndexes(db) {
  if (!indexesByDb.has(db)) {
    const promise = Promise.all([
      db.collection(CIRCLES).createIndex({ status: 1, startsAt: 1, lat: 1, lon: 1 }),
      db.collection(CIRCLES).createIndex({ userId: 1, academicProfileId: 1 }),
      db.collection(CIRCLES).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db.collection(REPORTS).createIndex({ circleId: 1, userId: 1, academicProfileId: 1 }, { unique: true }),
      db.collection(LISTINGS).createIndex({ status: 1, category: 1, lat: 1, lon: 1 }),
    ]).catch((error) => { indexesByDb.delete(db); throw error; });
    indexesByDb.set(db, promise);
  }
  return indexesByDb.get(db);
}

export function nearbyBounds(area) {
  const latitudeDelta = area.radius / 110;
  const longitudeDelta = Math.min(180, area.radius / (110 * Math.max(0.01, Math.cos(area.lat * Math.PI / 180))));
  const min = area.lon - longitudeDelta;
  const max = area.lon + longitudeDelta;
  const latitude = { lat: { $gte: area.lat - latitudeDelta, $lte: area.lat + latitudeDelta } };
  if (min < -180) return { ...latitude, $or: [{ lon: { $gte: min + 360 } }, { lon: { $lte: max } }] };
  if (max > 180) return { ...latitude, $or: [{ lon: { $gte: min } }, { lon: { $lte: max - 360 } }] };
  return { ...latitude, lon: { $gte: min, $lte: max } };
}

export function publicNearbyListing(record, category) {
  const phoneSupport = record.phoneSupport === true && record.phoneSupportConsent === true;
  return {
    id: `listing:${record._id}`, name: shortText(record.name), category,
    lat: Number(record.lat), lon: Number(record.lon), address: shortText(record.address, 400),
    phone: record.phonePublishedConsent === true ? safePhone(record.phone) : '', website: safeWebsite(record.website),
    hours: shortText(record.hours, 300), source: 'Reviewed listing', sourceUrl: safeWebsite(record.sourceUrl),
    updatedAt: record.updatedAt || null, subjects: textArray(record.subjects), board: shortText(record.board),
    language: shortText(record.language), fees: shortText(record.fees), facilities: textArray(record.facilities),
    type: shortText(record.type), access: shortText(record.access), phoneSupport,
    callHours: phoneSupport ? shortText(record.callHours, 300) : '',
    chapters: textArray(record.chapters),
    batches: Array.isArray(record.batches) ? record.batches.slice(0, 20).map((batch) => ({
      id: shortText(batch.id), name: shortText(batch.name), subject: shortText(batch.subject),
      board: shortText(batch.board), grade: shortText(batch.grade), chapter: shortText(batch.chapter),
      schedule: shortText(batch.schedule, 300), language: shortText(batch.language), fees: shortText(batch.fees),
      availableSeats: Number.isInteger(batch.availableSeats) && batch.availableSeats >= 0 ? batch.availableSeats : null,
      trial: shortText(batch.trial),
    })) : [],
  };
}

export function normalizeCircleInput(input, now = new Date()) {
  const title = shortText(input.title, 100);
  const subject = shortText(input.subject, 100);
  const chapter = shortText(input.chapter, 140);
  const startsAt = new Date(input.startsAt);
  const durationMinutes = Number(input.durationMinutes);
  const capacity = Number(input.capacity);
  if (title.length < 4 || subject.length < 2 || chapter.length < 2) throw nearbyError(400, 'Add a title, subject and chapter for your revision circle.');
  if (!Number.isFinite(startsAt.getTime()) || startsAt <= now || startsAt > new Date(now.getTime() + 90 * 86400000)) throw nearbyError(400, 'Choose a future session within the next 90 days.');
  if (!Number.isInteger(durationMinutes) || durationMinutes < 30 || durationMinutes > 240) throw nearbyError(400, 'Choose a duration from 30 to 240 minutes.');
  if (!Number.isInteger(capacity) || capacity < 2 || capacity > 20) throw nearbyError(400, 'Choose a capacity from 2 to 20 people, including you.');
  if (input.publicVenueConfirmed !== true) throw nearbyError(400, 'Confirm that the selected venue permits your study group.');
  if (!input.venue?.id) throw nearbyError(400, 'Choose a listed library or study space as the venue.');
  parseNearbyArea({ ...input.venue, radius: 1 });
  return { title, subject, chapter, board: shortText(input.board), language: shortText(input.language, 80), agenda: shortText(input.agenda, 1200), startsAt, durationMinutes, capacity };
}

export function publicCircle(circle, req, area) {
  const isHost = sameMember(circle, req);
  const requests = Array.isArray(circle.requests) ? circle.requests : [];
  const joinedCount = 1 + requests.filter((request) => request.status === 'approved').length;
  return {
    id: circle._id, title: circle.title, subject: circle.subject, chapter: circle.chapter,
    board: circle.board, language: circle.language, agenda: circle.agenda, startsAt: circle.startsAt,
    durationMinutes: circle.durationMinutes, capacity: circle.capacity, venue: circle.venue,
    hostName: circle.hostName, isHost, joinedCount, remainingSeats: Math.max(0, circle.capacity - joinedCount),
    myStatus: requests.find((request) => sameMember(request, req))?.status || null,
    status: circle.status === 'active' && new Date(circle.startsAt) <= new Date() ? 'completed' : circle.status,
    distanceKm: area ? distanceKm(area, circle) : null,
    ...(isHost ? { requests: requests.map((request) => ({ id: request.id, name: request.name, status: request.status })) } : {}),
  };
}

export async function cleanupNearbyProfileData(db, { userId, academicProfileId }) {
  const member = { userId, ...(academicProfileId ? { academicProfileId } : {}) };
  await db.collection(CIRCLES).updateMany({ requests: { $elemMatch: member } }, { $pull: { requests: member }, $inc: { version: 1 } });
  await db.collection(CIRCLES).deleteMany(member);
  await db.collection(REPORTS).deleteMany(member);
}

export function registerNearbyRoutes(app, {
  getDb, requireAuth, mutationSecurity, service = createNearbyService(),
  withProfileWriteFence = withAcademicProfileWriteFence,
} = {}) {
  const limits = new Map();
  function consumeLimit(req) {
    const key = idText(req.user._id);
    const now = Date.now();
    let entry = limits.get(key);
    if (!entry || entry.until <= now) { entry = { count: 0, until: now + 60000 }; limits.set(key, entry); }
    if (++entry.count > 40) throw nearbyError(429, 'You are searching too quickly. Please wait a minute and try again.');
    if (limits.size > 2000) for (const [id, value] of limits) if (value.until <= now) limits.delete(id);
  }
  const handle = (handler) => requireAuth(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { consumeLimit(req); return await handler(req, res); }
    catch (error) { return res.status(error.status || 500).json({ error: error.status ? error.message : 'Nearby could not complete this request. Please try again.', code: error.code || 'NEARBY_REQUEST_FAILED' }); }
  });
  const post = (path, handler) => app.post(path, ...(mutationSecurity ? [mutationSecurity] : []), handle(handler));
  async function database() { const db = await getDb(); await ensureIndexes(db); return db; }
  async function eligibility(db, req) {
    const profile = normalizeAcademicProfile(req.academicProfileContext?.profile || req.user);
    const requiresParentAccess = profile.schoolType === 'school';
    const access = requiresParentAccess ? await readParentAccess(db, req.sessionToken) : null;
    return { canParticipate: !requiresParentAccess || access.unlocked, requiresParentAccess };
  }
  async function requireParticipation(db, req) {
    if (!(await eligibility(db, req)).canParticipate) throw nearbyError(403, 'A parent must unlock Parent Corner before this school profile can create or join a revision circle.', 'NEARBY_PARENT_ACCESS_REQUIRED');
  }
  async function places(db, area, category) {
    const records = await db.collection(LISTINGS).find({ status: 'approved', category: category === 'rescue' ? { $in: ['tuitions', 'rescue'] } : category, ...nearbyBounds(area) }).limit(150).toArray();
    const curated = records.map((record) => publicNearbyListing(record, category))
      .map((place) => ({ ...place, distanceKm: distanceKm(area, place) }))
      .filter((place) => place.name && Number.isFinite(place.distanceKm) && place.distanceKm <= area.radius && (category !== 'rescue' || place.phone));
    let osm = [];
    let notice = '';
    try { osm = await service.places({ ...area, category }); }
    catch (error) { if (!curated.length) throw error; notice = 'Map search is temporarily unavailable. Showing reviewed listings only.'; }
    return { places: [...curated, ...osm].sort((a, b) => Number(b.phoneSupport) - Number(a.phoneSupport) || a.distanceKm - b.distanceKm), source: 'OpenStreetMap contributors and reviewed listings', ...(notice ? { notice } : {}) };
  }
  async function circleById(db, id) {
    const circle = await db.collection(CIRCLES).findOne({ _id: shortText(id, 100) });
    if (!circle) throw nearbyError(404, 'This revision circle is no longer available.');
    return circle;
  }
  async function mutateCircle(db, req, mutate) {
    return withProfileWriteFence(db, req, async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const circle = await circleById(db, req.params.id);
        const next = mutate({ ...circle, requests: circle.requests.map((request) => ({ ...request })) });
        next.version = circle.version + 1;
        next.updatedAt = new Date();
        const result = await db.collection(CIRCLES).replaceOne({ _id: circle._id, version: circle.version }, next);
        if (result.matchedCount) return next;
      }
      throw nearbyError(409, 'This circle just changed. Refresh and try again.');
    });
  }
  function active(circle) {
    if (circle.status !== 'active' || new Date(circle.startsAt) <= new Date()) throw nearbyError(409, 'This revision circle is no longer accepting changes.');
  }
  function hostOnly(circle, req) { if (!sameMember(circle, req)) throw nearbyError(403, 'Only the host can manage this revision circle.'); }

  app.get('/api/nearby/geocode', handle(async (req, res) => res.json(await service.geocode(req.query.q))));
  app.get('/api/nearby/places', handle(async (req, res) => {
    const area = parseNearbyArea(req.query);
    const category = req.query.category || 'tuitions';
    if (!['tuitions', 'spots', 'rescue'].includes(category)) throw nearbyError(400, 'Choose a valid nearby category.');
    return res.json(await places(await database(), area, category));
  }));
  app.get('/api/nearby/circles', handle(async (req, res) => {
    const mine = req.query.mine === 'true';
    const area = mine && (req.query.lat === undefined || req.query.lon === undefined) ? null : parseNearbyArea(req.query);
    const db = await database();
    const membership = { $or: [academicProfileFilter(req), { requests: { $elemMatch: academicProfileFilter(req) } }] };
    const filter = mine ? membership : { $or: [
      { status: 'active', startsAt: { $gt: new Date() }, ...nearbyBounds(area) },
      { status: 'cancelled', ...membership },
    ] };
    const records = await db.collection(CIRCLES).find({ ...filter, startsAt: { $gt: new Date(Date.now() - 30 * 86400000) } }).sort({ startsAt: 1 }).limit(150).toArray();
    const reports = await db.collection(REPORTS).find(academicProfileFilter(req)).limit(500).toArray();
    const hidden = new Set(reports.map((report) => report.circleId));
    const circles = records.map((circle) => publicCircle(circle, req, area)).filter((circle) => !hidden.has(circle.id) && (mine || circle.status === 'cancelled' || circle.distanceKm <= area.radius));
    return res.json({ circles, ...await eligibility(db, req) });
  }));
  post('/api/nearby/circles', async (req, res) => {
    const input = req.body || {};
    const normalized = normalizeCircleInput(input);
    const db = await database();
    await requireParticipation(db, req);
    const found = await places(db, parseNearbyArea({ ...input.venue, radius: 1 }), 'spots');
    const venue = found.places.find((place) => place.id === input.venue.id);
    if (!venue || ['private', 'no'].includes(venue.access)) throw nearbyError(400, 'Choose an available library or shared study venue from Study Spots.');
    const circle = await withProfileWriteFence(db, req, async () => {
      const count = await db.collection(CIRCLES).countDocuments({ ...academicProfileFilter(req), status: 'active', startsAt: { $gt: new Date() } });
      if (count >= 5) throw nearbyError(429, 'You can host up to five upcoming revision circles.');
      const record = {
        _id: randomUUID(), ...academicProfileFilter(req), ...normalized,
        lat: venue.lat, lon: venue.lon, venue: { id: venue.id, name: venue.name, address: venue.address, lat: venue.lat, lon: venue.lon },
        hostName: displayName(req), requests: [], status: 'active', version: 1,
        createdAt: new Date(), updatedAt: new Date(), expiresAt: new Date(normalized.startsAt.getTime() + 30 * 86400000),
      };
      await db.collection(CIRCLES).insertOne(record);
      return record;
    });
    return res.status(201).json({ circle: publicCircle(circle, req) });
  });
  post('/api/nearby/circles/:id/join', async (req, res) => {
    const db = await database();
    await requireParticipation(db, req);
    const circle = await mutateCircle(db, req, (record) => {
      active(record);
      if (sameMember(record, req)) throw nearbyError(409, 'You are already hosting this circle.');
      if (record.requests.some((request) => sameMember(request, req))) throw nearbyError(409, 'You already have a request for this circle.');
      if (record.requests.length >= 100 || 1 + record.requests.filter((request) => request.status === 'approved').length >= record.capacity) throw nearbyError(409, 'This circle is full.');
      record.requests.push({ id: randomUUID(), ...academicProfileFilter(req), name: displayName(req), status: 'pending', createdAt: new Date() });
      return record;
    });
    return res.json({ circle: publicCircle(circle, req) });
  });
  post('/api/nearby/circles/:id/leave', async (req, res) => {
    const db = await database();
    const circle = await mutateCircle(db, req, (record) => {
      if (sameMember(record, req)) throw nearbyError(409, 'Cancel the circle if you can no longer host it.');
      record.requests = record.requests.filter((request) => !sameMember(request, req));
      return record;
    });
    return res.json({ circle: publicCircle(circle, req) });
  });
  post('/api/nearby/circles/:id/cancel', async (req, res) => {
    const db = await database();
    const circle = await mutateCircle(db, req, (record) => { hostOnly(record, req); record.status = 'cancelled'; return record; });
    return res.json({ circle: publicCircle(circle, req) });
  });
  post('/api/nearby/circles/:id/requests/:requestId', async (req, res) => {
    const action = req.body?.action;
    if (!['approve', 'decline'].includes(action)) throw nearbyError(400, 'Choose approve or decline.');
    const db = await database();
    await requireParticipation(db, req);
    const circle = await mutateCircle(db, req, (record) => {
      active(record); hostOnly(record, req);
      const request = record.requests.find((item) => item.id === req.params.requestId);
      if (!request || request.status !== 'pending') throw nearbyError(409, 'This request is no longer pending.');
      if (action === 'approve' && 1 + record.requests.filter((item) => item.status === 'approved').length >= record.capacity) throw nearbyError(409, 'This circle has no remaining seats.');
      request.status = action === 'approve' ? 'approved' : 'declined';
      return record;
    });
    return res.json({ circle: publicCircle(circle, req) });
  });
  post('/api/nearby/circles/:id/report', async (req, res) => {
    const reason = shortText(req.body?.reason, 1000);
    if (reason.length < 5) throw nearbyError(400, 'Describe the issue in at least five characters.');
    const db = await database();
    await circleById(db, req.params.id);
    await withProfileWriteFence(db, req, () => db.collection(REPORTS).updateOne(
      { circleId: req.params.id, ...academicProfileFilter(req) },
      { $set: { reason, status: 'pending', updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true },
    ));
    return res.json({ reported: true });
  });
}
