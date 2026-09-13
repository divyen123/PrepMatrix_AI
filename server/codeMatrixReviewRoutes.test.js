import assert from 'node:assert/strict';
import test from 'node:test';
import { AiQuotaError } from './aiQuota.js';
import { registerCodeMatrixReviewRoutes } from './codeMatrixReviewRoutes.js';
import { CodeReviewError } from './codeMatrixReview.js';

const input = { language: 'python', code: 'print(1/0)', stderr: 'ZeroDivisionError', status: 'error' };
const review = { summary: 'Inspect the divisor.', line: 1, where: 'Check the division.', tryNext: ['Trace the divisor.'], avoid: ['Avoid hiding the exception.'], check: 'Try a non-zero divisor.' };
function harness({ configured = true, generate = async () => review, limit = 2, commitThrows = false, fenceFailsAfterGenerate = false } = {}) {
  const routes = new Map(), events = new Map();
  let providerCalls = 0, refunds = 0;
  const db = { collection: () => ({ findOne: async () => ({ subjects: [] }), updateOne: async () => ({ matchedCount: 1 }) }) };
  const quota = (userId) => ({ remaining: limit - [...events.values()].filter((event) => event.userId === userId && event.state !== 'refunded').length, limit });
  const key = (id) => JSON.stringify([id.userId, id.academicProfileId, id.feature, id.requestId]);
  const lookup = async (id) => {
    const event = events.get(key(id));
    if (event?.state === 'reserved') throw new AiQuotaError('AI_REQUEST_IN_PROGRESS', 'Already in progress', { status: 409 });
    return event?.state === 'committed' ? { state: 'replay', replayPayload: event.payload, cost: 1, quota: quota(id.userId) } : { state: 'none', cost: 1, quota: quota(id.userId) };
  };
  const aiQuota = {
    lookup,
    responseHeaders: (q, cost = 1) => ({ 'X-AI-Credit-Remaining': q.remaining, 'X-AI-Credit-Cost': cost }),
    reserve: async (id) => {
      const prior = await lookup(id);
      if (prior.state === 'replay') return prior;
      if (quota(id.userId).remaining < 1) throw new AiQuotaError('AI_USER_QUOTA_EXHAUSTED', 'No credits', { status: 429, quota: quota(id.userId) });
      const eventId = key(id);
      events.set(eventId, { ...id, state: 'reserved' });
      return { state: 'reserved', eventId, reservationToken: 'token', cost: 1, quota: quota(id.userId) };
    },
    commit: async ({ eventId, replayPayload }) => {
      const event = events.get(eventId);
      event.state = 'committed'; event.payload = replayPayload;
      if (commitThrows) throw new Error('Lost acknowledgement');
      return { quota: quota(event.userId) };
    },
    refund: async ({ eventId }) => { refunds++; const event = events.get(eventId); event.state = 'refunded'; return { refunded: true, quota: quota(event.userId) }; },
  };
  registerCodeMatrixReviewRoutes({ get: (path, fn) => routes.set('GET ' + path, fn), post: (path, fn) => routes.set('POST ' + path, fn) }, {
    getDb: async () => db, requireAuth: (fn) => (req, res) => req.user ? fn(req, res) : res.status(401).json({}), aiQuota,
    provider: { configured, review: async (body) => { providerCalls++; return generate(body); } },
    getEligibility: (profile) => ({ eligible: profile.coding }),
    withProfileWriteFence: async (_db, _req, fn) => {
      if (fenceFailsAfterGenerate && providerCalls) throw new CodeReviewError(409, 'ACADEMIC_PROFILE_CHANGED', 'Profile changed');
      return fn();
    },
  });
  return {
    get calls() { return providerCalls; }, get refunds() { return refunds; }, events,
    async request({ body = input, user = 'alice', profile = 'profile-a', coding = true, method = 'POST' } = {}) {
      const req = { body, user: user ? { _id: user, coding } : null, academicProfileId: profile };
      const res = { statusCode: 200, headers: {}, set(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
      await routes.get(method + (method === 'POST' ? ' /api/code-matrix/review' : ' /api/code-matrix/assistant'))(req, res);
      return res;
    },
  };
}
test('auth, eligibility, missing key and invalid runs do not spend credits', async () => {
  const h = harness({ configured: false });
  assert.equal((await h.request({ user: null })).statusCode, 401);
  assert.equal((await h.request({ coding: false })).statusCode, 403);
  assert.equal((await h.request({ profile: '' })).statusCode, 409);
  assert.equal((await h.request({ body: { ...input, status: 'success' } })).statusCode, 400);
  assert.equal((await h.request()).statusCode, 503);
  assert.equal((await h.request({ method: 'GET' })).body.available, false);
  assert.equal(h.events.size, 0);
  assert.equal(h.calls, 0);
});
test('saved reviews replay for free while credits remain per account across profiles', async () => {
  const h = harness({ limit: 1 });
  const first = await h.request();
  assert.equal(first.statusCode, 200);
  assert.equal(first.headers['X-AI-Credit-Remaining'], '0');
  assert.deepEqual((await h.request()).body.review, review);
  assert.equal(h.calls, 1);
  assert.equal((await h.request({ profile: 'profile-b' })).statusCode, 429);
  assert.equal((await h.request({ user: 'bob' })).statusCode, 200);
  assert.equal(h.calls, 2);
});
test('duplicate in-flight reviews do not call the provider or reserve twice', async () => {
  let finish, started;
  const ready = new Promise((resolve) => { started = resolve; });
  const h = harness({ generate: () => { started(); return new Promise((resolve) => { finish = resolve; }); } });
  const first = h.request();
  await ready;
  assert.equal((await h.request()).body.code, 'AI_REQUEST_IN_PROGRESS');
  finish(review);
  await first;
  assert.equal(h.calls, 1);
  assert.equal(h.events.size, 1);
});
test('failed generation and a profile changed during generation refund the reservation', async () => {
  for (const options of [{ generate: async () => { throw new CodeReviewError(502, 'CODE_REVIEW_INVALID_OUTPUT', 'Bad output'); } }, { fenceFailsAfterGenerate: true }]) {
    const h = harness(options);
    const result = await h.request();
    assert.equal(result.body.creditsRefunded, true);
    assert.equal(result.headers['X-AI-Credit-Remaining'], '2');
    assert.equal(h.refunds, 1);
  }
});
test('lost commit acknowledgements recover the saved review without refund or regeneration', async () => {
  const h = harness({ commitThrows: true });
  const response = await h.request();
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.review, review);
  assert.equal(h.calls, 1);
  assert.equal(h.refunds, 0);
});
