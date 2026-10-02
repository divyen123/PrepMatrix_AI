import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { FileText, History, LoaderCircle } from "lucide-react";
import Analytics from "../components/Analytics";
import FocusLandscape from "../components/FocusLandscape";
import Gamification from "../components/Gamification";
import LearningProgressSummary from "../components/LearningProgressSummary";
import Prediction from "../components/Prediction";
import GlobalMomentumCard from "../components/GlobalMomentumCard";
import Readiness from "../components/Readiness";
import ReportModal from "../components/ReportModal";
import TopicTimeline from "../components/TopicTimeline";
import useLearningInsights from "../hooks/useLearningInsights";
import useQuizBattleStats from "../hooks/useQuizBattleStats";
import useMomentum from '../hooks/useMomentum';
import useAnalyticsHistory from "../hooks/useAnalyticsHistory";
import "./AnalyticsPage.css";

export function AnalyticsViewContent({
  academicProfileDataId = "",
  subjects = [], schedule = [], completed = [], plannerHistory = [], scheduleStartDate = "",
  quizBattlesEnabled = true, userProfile = {}, materialBookmarks = [],
  learning = {}, battles = {}, momentum = {}, historical = false, snapshot = null,
}) {
  return (
    <>
      {historical && (
        <p className="analytics-history-caption">
          Previous schedule{snapshot?.scheduleStartDate ? ` · ${snapshot.scheduleStartDate}` : ""}
          {snapshot?.endDate && snapshot.endDate !== snapshot.scheduleStartDate ? ` – ${snapshot.endDate}` : ""}
          {snapshot?.isPartialSnapshot && (
            <span>Only saved completions are available for this older schedule. Its full plan was not archived.</span>
          )}
        </p>
      )}
      <div className="analytics-row primary-analytics-row">
        <Analytics completed={completed} schedule={schedule} />
        <Prediction historical={historical} completed={completed} schedule={schedule} scheduleStartDate={scheduleStartDate} subjects={subjects} />
        <Readiness historical={historical} completed={completed} schedule={schedule} />
      </div>

      {historical && !snapshot?.learningInsights ? (
        <p className="analytics-history-note">Learning evidence was not saved with this previous schedule.</p>
      ) : (
        <LearningProgressSummary
          historical={historical}
          error={historical ? "" : learning.error}
          insights={historical ? snapshot.learningInsights : learning.insights}
          loading={!historical && learning.loading}
          onRetry={learning.reload}
          title={historical ? "Learning evidence at the time of this schedule" : "From study time to verified mastery"}
        />
      )}

      <div className="analytics-support-grid">
        <Gamification
          key={`${academicProfileDataId}:${historical ? snapshot?.id : "current"}`}
          historical={historical}
          referenceDate={historical ? snapshot?.endDate || snapshot?.archivedAt : ""}
          momentum={momentum.data}
          momentumLoading={momentum.loading}
          momentumError={momentum.error}
          onRetryMomentum={momentum.reload}
          battleStats={battles.stats}
          battleStatsError={historical ? "" : battles.error}
          battleStatsEnabled={quizBattlesEnabled}
          battleStatsLoading={!historical && battles.loading}
          completed={completed}
          onRetryBattleStats={battles.reload}
          schedule={schedule}
          scheduleStartDate={scheduleStartDate}
          subjects={subjects}
        />
        <GlobalMomentumCard
          historical={historical}
          momentum={momentum.data}
          momentumLoading={momentum.loading}
          momentumError={momentum.error}
          onRetryMomentum={momentum.reload}
        />
      </div>

      {subjects.length > 0 ? (
        <>
          <div id="topic-progress">
            <TopicTimeline historical={historical} completed={completed} schedule={schedule} subjects={subjects} userProfile={userProfile} />
          </div>
          <FocusLandscape historical={historical} key={`${academicProfileDataId}:${historical ? snapshot?.id : "current"}`} completed={completed} schedule={schedule} subjects={subjects} history={plannerHistory} materialBookmarks={materialBookmarks} userProfile={userProfile} />
        </>
      ) : (
        <p className="analytics-subject-empty" id="topic-progress">
          {historical ? "No subjects were saved with this schedule." : "Add subjects and generate a timetable to unlock topic lanes and study landscape."}
        </p>
      )}
    </>
  );
}

function AnalyticsPage({ academicProfileDataId = "", subjects = [], schedule, completed, plannerHistory = [], scheduleStartDate = '', quizBattlesEnabled = true, userProfile = {}, materialBookmarks = [] }) {
  const location = useLocation();
  const [showReportModal, setShowReportModal] = useState(false);
  const learning = useLearningInsights({ academicProfileDataId });
  const battles = useQuizBattleStats({ academicProfileDataId, enabled: quizBattlesEnabled });
  const momentum = useMomentum(academicProfileDataId, String(battles.stats?.battleXp || 0));
  const historyView = useAnalyticsHistory(academicProfileDataId, plannerHistory);
  const { historical, snapshot, busy, phase } = historyView;
  const displayed = historical ? snapshot : { subjects, schedule, completed, scheduleStartDate };
  const displayedMomentum = historical
    ? { data: historyView.momentum, error: historyView.error, loading: false, reload: () => historyView.switchView(true) }
    : historyView.loadedAt > (momentum.loadedAt || 0)
      ? { data: historyView.momentum || momentum.data, error: historyView.error, loading: false, reload: momentum.reload }
      : momentum;

  useEffect(() => setShowReportModal(false), [academicProfileDataId, historical]);

  useEffect(() => {
    if (location.hash === "#topic-progress" && !busy) {
      const timer = setTimeout(() => {
        const el = document.getElementById("topic-progress");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          el.classList.add("highlight-pulse");
          setTimeout(() => el.classList.remove("highlight-pulse"), 1000);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [location.hash, busy, historical]);

  return (
    <section className="page-stack analytics-page">
      <div className="section-intro analytics-page-intro">
        <div>
          <h2>Performance signals and study patterns</h2>
        </div>
        <div className="analytics-page-actions">
          <button
            className="secondary-btn view-report-btn"
            disabled={busy}
            onClick={() => setShowReportModal(true)}
            type="button"
          >
            <FileText aria-hidden="true" size={16} />
            <span>View report</span>
          </button>
          <button
            aria-pressed={historical}
            className="secondary-btn view-report-btn analytics-history-toggle"
            disabled={busy || (!historical && !historyView.previous)}
            onClick={() => {
              setShowReportModal(false);
              historyView.switchView(!historical);
            }}
            title={!historical && !historyView.previous ? "No previous schedule has been saved yet" : undefined}
            type="button"
          >
            <History aria-hidden="true" size={16} />
            <span>{historical ? "View current analytics" : "Load previous analytics"}</span>
          </button>
        </div>
      </div>

      {phase === "loading" ? (
        <div aria-live="polite" className="analytics-view-loading" role="status">
          <LoaderCircle aria-hidden="true" size={28} />
          <p>{historyView.targetHistorical ? "Loading previous analytics…" : "Loading current analytics…"}</p>
        </div>
      ) : (
        <div
          aria-busy={busy}
          className={`analytics-view-content${phase === "leaving" ? " is-leaving" : ""}`}
          inert={busy ? true : undefined}
          key={`${academicProfileDataId}:${historical ? snapshot?.id : "current"}`}
        >
          <AnalyticsViewContent
            academicProfileDataId={academicProfileDataId}
            {...displayed}
            battles={battles}
            historical={historical}
            learning={learning}
            materialBookmarks={materialBookmarks}
            momentum={displayedMomentum}
            plannerHistory={plannerHistory}
            quizBattlesEnabled={quizBattlesEnabled}
            snapshot={snapshot}
            userProfile={userProfile}
          />
        </div>
      )}
      {showReportModal && !busy && (
        <ReportModal
          completed={displayed.completed}
          historical={historical}
          historySnapshot={snapshot}
          historicalAttempts={historical ? historyView.momentum?.quizAttempts : null}
          materialBookmarks={materialBookmarks}
          onClose={() => setShowReportModal(false)}
          schedule={displayed.schedule}
          subjects={displayed.subjects}
          userProfile={userProfile}
        />
      )}
    </section>
  );
}

export default AnalyticsPage;

