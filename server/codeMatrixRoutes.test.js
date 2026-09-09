import assert from 'node:assert/strict';
import test from 'node:test';
import { registerCodeMatrixRoutes, consumeCodeMatrixRateLimit } from './codeMatrixRoutes.js';

function matches(doc, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') return expected.some((branch) => matches(doc, branch));
    const actual = doc[key];
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      return Object.entries(expected).every(([operator, value]) => {
        if (operator === '$exists') return (actual !== undefined) === value;
        if (operator === '$lt') return actual < value;
        if (operator === '$lte') return actual <= value;
        if (operator === '$gt') return actual > value;
        if (operator === '$ne') return actual !== value;
        throw Error(`Unsupported test operator ${operator}`);
      });
    }
    return actual === expected;
  });
}
class Collection {
  docs = [];
  async findOne(filter) { return structuredClone(this.docs.find((doc) => matches(doc, filter)) || null); }
  async *find(filter) { yield* this.docs.filter((doc) => matches(doc, filter)).map((doc) => structuredClone(doc)); }
  async insertOne(doc) { this.docs.push(structuredClone(doc)); }
  async updateOne(filter, update, options = {}) {
    // MongoDB rejects overlapping paths, including $set and $setOnInsert.
    const paths = Object.values(update).flatMap((fields) => Object.keys(fields));
    assert.equal(paths.length, new Set(paths).size, 'conflicting MongoDB update paths');
    let doc = this.docs.find((candidate) => matches(candidate, filter));
    const found = Boolean(doc);
    if (!doc && !options.upsert) return { matchedCount: 0 };
    if (!doc) {
      if (this.docs.some((candidate) => candidate._id === filter._id)) throw Object.assign(new Error('duplicate'), { code: 11000 });
      doc = Object.fromEntries(Object.entries(filter).filter(([, value]) => typeof value !== 'object'));
      Object.assign(doc, structuredClone(update.$setOnInsert || {}));
      this.docs.push(doc);
    }
    Object.assign(doc, structuredClone(update.$set || {}));
    for (const [key, value] of Object.entries(update.$inc || {})) doc[key] = (doc[key] || 0) + value;
    for (const key of Object.keys(update.$unset || {})) delete doc[key];
    return { matchedCount: found ? 1 : 0 };
  }
}
function harness() {
  const routes = new Map();
  const collections = new Map();
  const db = { collection(name) { if (!collections.has(name)) collections.set(name, new Collection()); return collections.get(name); } };
  let time = new Date('2026-09-09T10:00:00Z');
  let polls = 0;
  let creates = 0;
  const judge0 = {
    providerKey: 'test-provider', timeoutMs: 1000, ensureConfigured() {},
    capabilities: () => ({ configured: true, health: 'not_checked' }),
    async create() { creates++; return 'private-provider-token'; },
    async poll() { polls++; return { status: { id: 3, description: 'Accepted' }, completed: true, success: true, stdout: 'hello', stderr: null, timeSeconds: 0.01 }; },
  };
  registerCodeMatrixRoutes(Object.fromEntries(['get', 'put', 'post'].map((method) => [method, (path, handler) => routes.set(`${method} ${path}`, handler)])), {
    getDb: async () => db, judge0, now: () => time,
    withProfileWriteFence: async (_db, req, work) => { assert.ok(req.academicProfileId); return work(); },
    getEligibility: (profile) => ({ eligible: profile.coding, defaultLanguage: 'python' }),
    requireAuth: (handler) => (req, res) => req.user ? handler(req, res) : res.status(401).json({ error: 'Login required' }),
  });
  return {
    db, get polls() { return polls; }, get creates() { return creates; }, advance(ms) { time = new Date(+time + ms); },
    async request(method, path, { body, profile = 'profile-a', user = 'user-a', coding = true, id } = {}) {
      const req = { body, is: (type) => type === 'application/json', params: { id }, user: user ? { _id: user } : null, academicProfileId: profile, academicProfileContext: { profile: { coding } } };
      const res = { statusCode: 200, headers: {}, set(key, value) { this.headers[key] = value; return this; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
      await routes.get(`${method} ${path}`)(req, res);
      return res;
    },
  };
}
test('workspace requires authentication and isolates drafts by user and academic profile', async () => {
  const h = harness();
  assert.equal((await h.request('get', '/api/code-matrix/workspace', { user: null })).statusCode, 401);
  assert.equal((await h.request('get', '/api/code-matrix/workspace', { profile: '' })).statusCode, 409);
  const saved = await h.request('put', '/api/code-matrix/workspace', { body: { drafts: { python: 'print("mine")' }, setupDismissed: true } });
  assert.equal(saved.statusCode, 200);
  for (const scope of [{ profile: 'profile-b' }, { user: 'user-b' }]) assert.equal((await h.request('get', '/api/code-matrix/workspace', scope)).body.workspace, null);
  assert.equal((await h.request('get', '/api/code-matrix/workspace')).body.workspace.drafts.python, 'print("mine")');
  assert.equal((await h.request('put', '/api/code-matrix/workspace', { body: { drafts: { c: '' }, revision: 0 } })).statusCode, 409);
});
test('setup completion follows stored work and GET safely remembers newly completed steps', async () => {
  const h = harness();
  await h.request('put', '/api/code-matrix/workspace', { body: { language: 'python', completedSteps: ['plan', 'notebook'] } });
  h.db.collection('workspaces').docs.push({ userId: 'user-a', academicProfileId: 'profile-a', subjects: [{ name: 'Python' }], schedule: [] });
  const read = await h.request('get', '/api/code-matrix/workspace');
  assert.equal(read.statusCode, 200);
  assert.deepEqual(read.body.setup.completedSteps, ['subjects']);
  h.db.collection('workspaces').docs[0].schedule = [{ tasks: [{ task: 'Practise loops' }] }];
  const planned = await h.request('get', '/api/code-matrix/workspace');
  assert.equal(planned.statusCode, 200);
  assert.deepEqual(planned.body.setup.completedSteps, ['subjects', 'plan']);
  h.db.collection('workspaces').docs.length = 0;
  assert.deepEqual((await h.request('get', '/api/code-matrix/workspace')).body.setup.completedSteps, ['subjects', 'plan']);
});
test('compiled submissions enforce eligibility, hide provider tokens and cache terminal results', async () => {
  const h = harness();
  const body = { language: 'c', code: 'int main() {return 0;}' };
  assert.equal((await h.request('post', '/api/code-matrix/submissions', { body, coding: false })).statusCode, 403);
  assert.equal(h.creates, 0);
  const created = await h.request('post', '/api/code-matrix/submissions', { body });
  assert.equal(created.statusCode, 202);
  assert.doesNotMatch(JSON.stringify(created.body), /private-provider-token|providerKey/);
  const id = created.body.submission.id;
  assert.equal((await h.request('get', '/api/code-matrix/submissions/:id', { id, profile: 'profile-b' })).statusCode, 404);
  assert.equal((await h.request('get', '/api/code-matrix/submissions/:id', { id, user: 'user-b' })).statusCode, 404);
  assert.equal(h.polls, 0);
  const result = await h.request('get', '/api/code-matrix/submissions/:id', { id });
  assert.equal(result.body.submission.stdout, 'hello');
  assert.equal(result.body.submission.success, true);
  await h.request('get', '/api/code-matrix/submissions/:id', { id });
  assert.equal(h.polls, 1);
  h.advance(25 * 60 * 60 * 1000);
  assert.equal((await h.request('get', '/api/code-matrix/submissions/:id', { id })).statusCode, 404);
});
test('account execution quota cannot be reset by profile switching', async () => {
  const collection = new Collection();
  const now = new Date('2026-09-09T10:00:01Z');
  for (let i = 0; i < 10; i++) await consumeCodeMatrixRateLimit(collection, 'user-a', 'create', now);
  await assert.rejects(consumeCodeMatrixRateLimit(collection, 'user-a', 'create', now), { status: 429 });
  await consumeCodeMatrixRateLimit(collection, 'user-b', 'create', now);
});
