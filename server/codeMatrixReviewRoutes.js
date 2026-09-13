import { AiQuotaError } from './aiQuota.js';
import { academicProfileFilter, withAcademicProfileWriteFence } from './profileDataScope.js';
import { getCodeMatrixEligibility } from '../src/utils/codeMatrixProfile.js';
import { CODE_REVIEW_FEATURE } from '../src/utils/codeMatrixReview.js';
import { CodeReviewError, normalizeCodeReviewRequest, codeReviewRequestId, createCodeReviewProvider } from './codeMatrixReview.js';
import { consumeCodeMatrixRateLimit, CODE_MATRIX_RATE_LIMITS_COLLECTION } from './codeMatrixRoutes.js';
import { CodeMatrixError } from './codeMatrixWorkspace.js';

export function registerCodeMatrixReviewRoutes(app, {
  getDb, requireAuth, aiQuota, mutationSecurity,
  provider = createCodeReviewProvider(), now = () => new Date(),
  withProfileWriteFence = withAcademicProfileWriteFence, getEligibility = getCodeMatrixEligibility,
}) {
  const headers = (res, quota, cost) => {
    if (quota) Object.entries(aiQuota.responseHeaders(quota, cost)).forEach(([key, value]) => res.set(key, String(value)));
  };
  const guard = (handler) => requireAuth(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { academicProfileFilter(req); return await handler(req, res); }
    catch (error) {
      headers(res, error.quota, error.cost);
      const known = error instanceof AiQuotaError || error instanceof CodeReviewError || error instanceof CodeMatrixError || String(error.code || '').startsWith('ACADEMIC_PROFILE');
      return res.status(known ? error.status || 503 : 503).json({
        code: known ? error.code : 'CODE_REVIEW_UNAVAILABLE',
        error: known ? error.message : 'The assistant is unavailable. Please retry this review shortly.',
        ...(error.creditsRefunded ? { creditsRefunded: true } : {}),
      });
    }
  });
  const eligible = async (db, req) => {
    const workspace = await db.collection('workspaces').findOne(academicProfileFilter(req), { projection: { subjects: 1 } });
    if (!getEligibility(req.academicProfileContext?.profile ?? req.user, workspace?.subjects || []).eligible) {
      throw new CodeReviewError(403, 'CODE_REVIEW_NOT_ELIGIBLE', 'AI Code Assistant is available for coding profiles and subjects.');
    }
  };
  app.get('/api/code-matrix/assistant', guard(async (req, res) => {
    const db = await getDb();
    await eligible(db, req);
    return res.json({ available: provider.configured });
  }));
  const handler = guard(async (req, res) => {
    const input = normalizeCodeReviewRequest(req.body);
    const db = await getDb();
    await eligible(db, req);
    const identity = { userId: req.user._id, academicProfileId: req.academicProfileId, feature: CODE_REVIEW_FEATURE, requestId: codeReviewRequestId(input) };
    const replay = (saved) => {
      if (!saved.replayPayload?.review) throw new AiQuotaError('AI_QUOTA_UNAVAILABLE', 'Your saved review could not be loaded. Retry this same review.', { status: 503 });
      headers(res, saved.quota, saved.cost);
      return res.json({ ...saved.replayPayload, idempotent: true });
    };
    const prior = await aiQuota.lookup(identity);
    if (prior.state === 'replay') return replay(prior);
    if (!provider.configured) throw new CodeReviewError(503, 'CODE_REVIEW_NOT_CONFIGURED', 'AI Code Assistant is not available yet. No credits were used.');
    let reservation;
    let commitStarted = false;
    try {
      reservation = await withProfileWriteFence(db, req, async () => {
        await consumeCodeMatrixRateLimit(db.collection(CODE_MATRIX_RATE_LIMITS_COLLECTION), req.user._id, 'review', now());
        return aiQuota.reserve(identity);
      });
      headers(res, reservation.quota, reservation.cost);
      if (reservation.state === 'replay') return replay(reservation);
      const review = await provider.review(input);
      const payload = { review, cost: reservation.cost };
      const committed = await withProfileWriteFence(db, req, async () => {
        await eligible(db, req);
        commitStarted = true;
        return aiQuota.commit({ eventId: reservation.eventId, reservationToken: reservation.reservationToken, replayPayload: payload });
      });
      headers(res, committed.quota, reservation.cost);
      return res.json(payload);
    } catch (error) {
      if (commitStarted) {
        // A lost commit acknowledgement may already have charged the account.
        // Read back the saved result; never refund/re-generate an uncertain commit.
        try { const saved = await aiQuota.lookup(identity); if (saved.state === 'replay') return replay(saved); } catch { /* Retry uses the same identity. */ }
        throw new AiQuotaError('AI_QUOTA_UNAVAILABLE', 'We could not confirm your saved review. Retry this same review to check its status.', { status: 503 });
      }
      if (reservation?.eventId && reservation.state !== 'replay') {
        const refunded = await aiQuota.refund({ eventId: reservation.eventId, reservationToken: reservation.reservationToken, outcome: error.code || 'code_review_failed' });
        error.quota = refunded.quota;
        error.cost = reservation.cost;
        error.creditsRefunded = refunded.refunded || refunded.status === 'refunded';
      }
      throw error;
    }
  });
  app.post('/api/code-matrix/review', ...(mutationSecurity ? [mutationSecurity] : []), handler);
}
