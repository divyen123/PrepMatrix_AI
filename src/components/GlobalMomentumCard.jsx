import { useState } from 'react';
import { History } from 'lucide-react';
import GlobalMomentum from './GlobalMomentum';
import MomentumHistoryDialog from './MomentumHistoryDialog';
import './MomentumViews.css';
import './Gamification.css';

export default function GlobalMomentumCard({ momentum, momentumLoading = false, momentumError = '', onRetryMomentum }) {
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <section className="card gamification-card global-momentum-card">
      <div className="gamification-orb" aria-hidden="true" />
      <div className="gamification-header">
        <div>
          <span className="section-tag">Global momentum</span>
          <div className="momentum-title-row">
            <h3>Global momentum</h3>
            <button type="button" className="momentum-icon-button" aria-label="View global XP history" title="View XP history" onClick={() => setHistoryOpen(true)}>
              <History size={17} />
            </button>
          </div>
          <p className="momentum-view-label">Lifetime progress · this academic profile</p>
        </div>
      </div>

      <div className="gamification-scroll-region">
        <GlobalMomentum data={momentum} loading={momentumLoading} error={momentumError} onRetry={onRetryMomentum} />
      </div>

      {historyOpen && <MomentumHistoryDialog data={momentum} onClose={() => setHistoryOpen(false)} />}
    </section>
  );
}
