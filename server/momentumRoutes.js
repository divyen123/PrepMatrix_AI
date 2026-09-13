import { academicProfileFilter, withAcademicProfileWriteFence } from './profileDataScope.js';
import { consumeCodeMatrixRateLimit, CODE_MATRIX_RATE_LIMITS_COLLECTION } from './codeMatrixRoutes.js';
import { getCodeMatrixEligibility } from '../src/utils/codeMatrixProfile.js';
import { readMomentum, reconcileMomentum, recordSuccessfulCodeRun } from './momentumService.js';

export default function registerMomentumRoutes(app, { getDb, requireAuth, mutationSecurity, withProfileWriteFence = withAcademicProfileWriteFence }) {
  app.get('/api/momentum', requireAuth(async (req, res) => {
    const db = await getDb();
    const scope = academicProfileFilter(req);
    const result = await withProfileWriteFence(db, req, async () => {
      const schedule = await reconcileMomentum(db, scope);
      return readMomentum(db, scope, schedule);
    });
    res.set('Cache-Control', 'no-store');
    return res.json({ momentum: result });
  }));
  app.post('/api/momentum/code-runs', mutationSecurity, requireAuth(async (req, res) => {
    const db = await getDb();
    try {
      const result = await withProfileWriteFence(db, req, async () => {
        const scope = academicProfileFilter(req);
        const workspace = await db.collection('workspaces').findOne(scope);
        if (!getCodeMatrixEligibility(req.academicProfileContext?.profile ?? req.user, workspace?.subjects || []).eligible) { const error = new Error('CodeMatrix is unavailable for this academic profile.'); error.status = 403; throw error; }
        await consumeCodeMatrixRateLimit(db.collection(CODE_MATRIX_RATE_LIMITS_COLLECTION), req.user._id, 'create', new Date());
        return recordSuccessfulCodeRun(db, scope, req.body || {});
      });
      return res.json(result);
    } catch (error) { if (!error.status) throw error; return res.status(error.status).json({ error: error.message }); }
  }));
}
