import Insights from "../components/Insights";
import ProgressBar1 from "../components/Progressbar1";
import Reminder from "../components/Reminder";
import SmartSuggestion from "../components/SmartSuggestion";
import WeeklyReview from "../components/WeeklyReview";

function DashboardPage({ academicLevel, academicTrack, overviewCards, metrics, schedule, completed }) {
  return (
    <section className="page-stack">
      <section className="overview-grid route-overview-grid">
        {overviewCards.map((card) => (
          <article className="overview-card" key={card.label}>
            <div className="overview-card-top">
              <span className="overview-label">{card.label}</span>
            </div>
            <div className="overview-card-body">
              <strong className="overview-value">{card.value}</strong>
              <span className="overview-detail">{card.detail}</span>
            </div>
          </article>
        ))}
      </section>

      <div className="dashboard-feature-grid">
        <SmartSuggestion academicLevel={academicLevel} academicTrack={academicTrack} completed={completed} schedule={schedule} />
        <ProgressBar1 completed={completed} schedule={schedule} />
        <Insights completed={completed} schedule={schedule} />

        <div className="dashboard-glance-stack">
          <article className="card compact-data-card">
            <span className="section-tag">Today</span>
            <h3>First pending step</h3>
            <p className="card-desc">
              {metrics.firstPendingTask || "Generate your timetable to see the next task."}
            </p>
          </article>

          <article className="card compact-data-card">
            <span className="section-tag">Focus area</span>
            <h3>Weakest subject</h3>
            <p className="card-desc">
              {metrics.weakSubject || "No weak subject detected yet. Start completing tasks to surface one."}
            </p>
          </article>
        </div>

        <div className="dashboard-full-span">
          <WeeklyReview academicLevel={academicLevel} academicTrack={academicTrack} completed={completed} schedule={schedule} />
        </div>

        <div className="dashboard-full-span">
          <Reminder completed={completed} schedule={schedule} />
        </div>
      </div>
    </section>
  );
}

export default DashboardPage;



