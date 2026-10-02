import { academicProfileFilter, withAcademicProfileWriteFence } from './profileDataScope.js';
import { consumeCodeMatrixRateLimit, CODE_MATRIX_RATE_LIMITS_COLLECTION } from './codeMatrixRoutes.js';
import { getCodeMatrixEligibility } from '../src/utils/codeMatrixProfile.js';
import { readMomentum, readPreviousMomentum, reconcileMomentum, recordSuccessfulCodeRun } from './momentumService.js';

export default function registerMomentumRoutes(app, { getDb, requireAuth, mutationSecurity, withProfileWriteFence = withAcademicProfileWriteFence }) {
  app.get('/api/momentum', requireAuth(async (req, res) => {
    const db = await getDb();
    const scope = academicProfileFilter(req);
    res.set('Cache-Control', 'no-store');
    try {
      const historyId = req.query?.historyId;
      if (historyId !== undefined && (typeof historyId !== 'string' || !historyId.trim() || historyId.length > 160)) {
        return res.status(400).json({ error: 'Choose a valid previous schedule.' });
      }
      const result = await withProfileWriteFence(db, req, async () => {
        if (historyId) return readPreviousMomentum(db, scope, historyId.trim());
        const schedule = await reconcileMomentum(db, scope);
        return readMomentum(db, scope, schedule);
      });
      return res.json({ momentum: result });
    } catch (error) { if (!error.status) throw error; return res.status(error.status).json({ error: error.message }); }
  }));
  app.post('/api/momentum/code-runs', mutationSecurity, requireAuth(async (req, res) => {
    const db = await getDb();
    try {
      if (JSON.stringify(req.body || {}).length > 48 * 1024) {
        return res.status(400).json({ error: 'The coding reward request is too large.' });
      }
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
