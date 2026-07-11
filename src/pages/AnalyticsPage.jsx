import Analytics from "../components/Analytics";
import FocusLandscape from "../components/FocusLandscape";
import Gamification from "../components/Gamification";
import GoalTracker from "../components/GoalTracker";
import Prediction from "../components/Prediction";
import ProgressBar1 from "../components/Progressbar1";
import Readiness from "../components/Readiness";
import TopicTimeline from "../components/TopicTimeline";

function AnalyticsPage({ subjects, schedule, completed }) {
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

      <div className="analytics-support-grid">
        <Gamification completed={completed} schedule={schedule} />
        <ProgressBar1 completed={completed} schedule={schedule} />
        <GoalTracker completed={completed} schedule={schedule} subjects={subjects} />
      </div>

      <TopicTimeline completed={completed} schedule={schedule} subjects={subjects} />
      <FocusLandscape completed={completed} schedule={schedule} subjects={subjects} />
    </section>
  );
}

export default AnalyticsPage;

