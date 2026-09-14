import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import Analytics from "../components/Analytics";
import FocusLandscape from "../components/FocusLandscape";
import Gamification from "../components/Gamification";
import GoalTracker from "../components/GoalTracker";
import LearningProgressSummary from "../components/LearningProgressSummary";
import Prediction from "../components/Prediction";
import ProgressBar1 from "../components/Progressbar1";
import Readiness from "../components/Readiness";
import TopicTimeline from "../components/TopicTimeline";
import useLearningInsights from "../hooks/useLearningInsights";
import useQuizBattleStats from "../hooks/useQuizBattleStats";
import useMomentum from '../hooks/useMomentum';
import "./AnalyticsPage.css";

function AnalyticsPage({ academicProfileDataId = "", subjects = [], schedule, completed, plannerHistory = [], scheduleStartDate = '', quizBattlesEnabled = true, userProfile = {} }) {
  const location = useLocation();
  const learning = useLearningInsights({ academicProfileDataId });
  const battles = useQuizBattleStats({ academicProfileDataId, enabled: quizBattlesEnabled });
  const momentum = useMomentum(academicProfileDataId, String(battles.stats?.battleXp || 0));

  useEffect(() => {
    if (location.hash === "#topic-progress") {
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
  }, [location.hash]);

  return (
    <section className="page-stack">
      <div className="section-intro">
        <span className="section-tag">Analytics</span>
        <h2>Performance signals and study patterns</h2>
      </div>

      <div className="analytics-row primary-analytics-row">
        <Analytics completed={completed} schedule={schedule} />
        <Prediction completed={completed} schedule={schedule} />
        <Readiness completed={completed} schedule={schedule} />
      </div>

      <LearningProgressSummary
        error={learning.error}
        insights={learning.insights}
        loading={learning.loading}
        onRetry={learning.reload}
        title="From study time to verified mastery"
      />

      <div className="analytics-support-grid">
        <Gamification
          key={academicProfileDataId}
          momentum={momentum.data}
          momentumLoading={momentum.loading}
          momentumError={momentum.error}
          onRetryMomentum={momentum.reload}
          battleStats={battles.stats}
          battleStatsError={battles.error}
          battleStatsEnabled={quizBattlesEnabled}
          battleStatsLoading={battles.loading}
          completed={completed}
          onRetryBattleStats={battles.reload}
          schedule={schedule}
          subjects={subjects}
        />
        <ProgressBar1 academicProfileDataId={academicProfileDataId} completed={completed} schedule={schedule} />
        <GoalTracker completed={completed} schedule={schedule} subjects={subjects} userProfile={userProfile} />
      </div>

      {subjects.length > 0 ? (
        <>
          <div id="topic-progress">
            <TopicTimeline completed={completed} schedule={schedule} subjects={subjects} userProfile={userProfile} />
          </div>
          <FocusLandscape key={academicProfileDataId} academicProfileDataId={academicProfileDataId} completed={completed} schedule={schedule} subjects={subjects} history={plannerHistory} scheduleStartDate={scheduleStartDate} notebooks={learning.notebooks} notebooksLoading={learning.loading} notebooksError={learning.error} onRetryNotebooks={learning.reload} />
        </>
      ) : (
        <p className="analytics-subject-empty" id="topic-progress">
          Add subjects and generate a timetable to unlock animated topic lanes and study landscape.
        </p>
      )}
    </section>
  );
}

export default AnalyticsPage;

