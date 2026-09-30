import express from 'express';
import { AcademicProfileScopeError, academicProfileFilter, withAcademicProfileWriteFence } from './profileDataScope.js';
import { consumeCodeMatrixRateLimit, CODE_MATRIX_RATE_LIMITS_COLLECTION } from './codeMatrixRoutes.js';
import { CodeMatrixError } from './codeMatrixWorkspace.js';
import { readCodeMatrixInsights, recordInsightActivity, recordInsightAttempt } from './codeMatrixInsights.js';

const BODY_LIMIT = 4096;

async function readBody(req, res) {
  if (!req.is('application/json')) throw new CodeMatrixError(415, 'CODE_INSIGHTS_JSON_REQUIRED', 'Use Content-Type: application/json.');
  if (req.body === undefined) await new Promise((resolve, reject) => express.json({ limit: BODY_LIMIT, inflate: false })(req, res, (error) => error ? reject(new CodeMatrixError(error.status === 413 ? 413 : 400, 'CODE_INSIGHTS_INVALID_JSON', 'The JSON request is invalid or too large.')) : resolve()));
  if (Buffer.byteLength(JSON.stringify(req.body) || '', 'utf8') > BODY_LIMIT) throw new CodeMatrixError(413, 'CODE_INSIGHTS_SIZE_LIMIT', 'The request body is too large.');
  return req.body;
}

export function registerCodeMatrixInsightsRoutes(app, {
  getDb, requireAuth, mutationSecurity, now = () => new Date(),
  withProfileWriteFence = withAcademicProfileWriteFence,
}) {
  const guard = (handler) => requireAuth(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { academicProfileFilter(req); return await handler(req, res); }
    catch (error) {
      const known = error instanceof CodeMatrixError || error instanceof AcademicProfileScopeError;
      if (error.retryAfterSeconds) res.set('Retry-After', String(error.retryAfterSeconds));
      return res.status(known ? error.status : 503).json({ code: known ? error.code : 'CODE_INSIGHTS_UNAVAILABLE', error: known ? error.message : 'CodeMatrix insights could not be loaded. Please try again.' });
    }
  });
  app.get('/api/code-matrix/insights', guard(async (req, res) => {
    const db = await getDb();
    await consumeCodeMatrixRateLimit(db.collection(CODE_MATRIX_RATE_LIMITS_COLLECTION), req.user._id, 'insightsRead', now());
    const insights = await readCodeMatrixInsights(db, academicProfileFilter(req), { range: req.query.range || '30d', timeZone: req.query.timezone || 'UTC', now: now() });
    return res.json({ insights });
  }));
  for (const [path, action, record] of [['attempts', 'insightsWrite', recordInsightAttempt], ['activity', 'insightsActivity', recordInsightActivity]]) {
    app.post(`/api/code-matrix/insights/${path}`, ...(mutationSecurity ? [mutationSecurity] : []), guard(async (req, res) => {
      const body = await readBody(req, res);
      const db = await getDb();
      const result = await withProfileWriteFence(db, req, async () => {
        await consumeCodeMatrixRateLimit(db.collection(CODE_MATRIX_RATE_LIMITS_COLLECTION), req.user._id, action, now());
        return record(db, academicProfileFilter(req), body, now());
      });
      return res.json(result);
    }));
  }
}
