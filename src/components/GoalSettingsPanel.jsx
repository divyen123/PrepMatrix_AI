import { Activity, BellRing, CalendarCheck2, Clock3, Eye, ListTodo, Save, SlidersHorizontal, Target } from "lucide-react";

import {
  calculateStudyTargetPerformance,
  openGoalReminderCenter,
  summarizePlannerData,
} from "../utils/goalReminderStore";

function PlannerSettingToggle({ checked, label, subtitle, onChange }) {
  return (
    <div className="goal-setting-toggle-row">
      <div>
        <strong>{label}</strong>
        <p>{subtitle}</p>
      </div>
      <button
        aria-checked={checked}
        aria-label={`${label}: ${checked ? "on" : "off"}`}
        className={`goal-setting-switch${checked ? " is-on" : ""}`}
        onClick={() => onChange(!checked)}
        role="switch"
        type="button"
      >
        <span />
      </button>
    </div>
  );
}

function GoalSettingsPanel({
  completed,
  dailyTarget,
  onDailyTargetChange,
  onSaveTargets,
  onPlannerSettingsChange,
  onWeeklyReviewChange,
  plannerData,
  plannerSettings,
  schedule,
  scheduleStartDate,
  weeklyReview,
}) {
  const summary = summarizePlannerData(plannerData);
  const targetSettings = {
    ...plannerSettings,
    dailyStudyTarget: dailyTarget,
    weeklyReviewTarget: weeklyReview,
  };
  const performance = calculateStudyTargetPerformance({
    completed,
    plannerData,
    schedule,
    scheduleStartDate,
    settings: targetSettings,
  });
  const dailyTargetLabel = Number.isInteger(performance.dailyTargetHours)
    ? String(performance.dailyTargetHours)
    : performance.dailyTargetHours.toFixed(1);

  const updatePlannerSettings = (patch) => {
    onPlannerSettingsChange({
      ...plannerSettings,
      dailyStudyTarget: dailyTarget,
      weeklyReviewTarget: weeklyReview,
      ...patch,
    });
  };

  return (
    <section className="card goal-settings-card">
      <div className="goal-settings-heading">
        <div>
          <span className="section-tag">GOALS</span>
          <h3><Target aria-hidden="true" size={20} /> Study Goals & Reminders</h3>
          <p className="card-subtext">Set measurable study targets, track performance, and turn those targets into useful reminders.</p>
        </div>
        <button
          className="goal-settings-open-btn"
          onClick={() => openGoalReminderCenter()}
          type="button"
        >
          <Target aria-hidden="true" size={15} /> Open center
        </button>
      </div>

      <div className="goal-settings-summary" aria-label="Goal and reminder summary">
        <div><Target aria-hidden="true" size={15} /><span>Active goals</span><strong>{summary.activeGoals}</strong></div>
        <div><BellRing aria-hidden="true" size={15} /><span>Due today</span><strong>{summary.todayReminders}</strong></div>
        <div><ListTodo aria-hidden="true" size={15} /><span>Open tasks</span><strong>{summary.openTodos}</strong></div>
      </div>

      <div className="goal-target-fields">
        <label className="field-stack goal-target-field">
          <span>Daily target</span>
          <input
            aria-describedby="daily-target-help"
            max="16"
            min="1"
            onChange={(event) => onDailyTargetChange(Number.parseFloat(event.target.value) || 1)}
            step="0.5"
            type="number"
            value={dailyTarget}
          />
          <small id="daily-target-help">Focused hours; one completed planner session counts as one hour.</small>
        </label>
        <label className="field-stack goal-target-field">
          <span>Weekly reviews</span>
          <select aria-describedby="weekly-review-help" onChange={(event) => onWeeklyReviewChange(event.target.value)} value={weeklyReview}>
            <option value="1">1 review/week</option>
            <option value="2">2 reviews/week</option>
            <option value="3">3 reviews/week</option>
            <option value="daily">Daily reviews</option>
          </select>
          <small id="weekly-review-help">Spreads review reminders across the current week.</small>
        </label>
      </div>

      <div className="goal-target-performance" aria-label="Study target performance">
        <div className="goal-target-performance-item">
          <div className="goal-target-performance-heading">
            <span><Activity aria-hidden="true" size={14} /> Today's study pace</span>
            <strong>{performance.completedHours}/{dailyTargetLabel}h</strong>
          </div>
          <div aria-label={`${performance.dailyProgress}% of daily study target completed`} aria-valuemax="100" aria-valuemin="0" aria-valuenow={performance.dailyProgress} className="goal-target-progress" role="progressbar">
            <span style={{ width: `${performance.dailyProgress}%` }} />
          </div>
          <p>
            {performance.scheduleMapped
              ? `${performance.plannedHours} focused session${performance.plannedHours === 1 ? "" : "s"} planned today · ${performance.dailyRemainingHours}h remaining.`
              : "Generate a dated planner schedule to calculate today's completed focused hours."}
          </p>
        </div>
        <div className="goal-target-performance-item">
          <div className="goal-target-performance-heading">
            <span><CalendarCheck2 aria-hidden="true" size={14} /> This week's reviews</span>
            <strong>{performance.completedReviews}/{performance.weeklyReviewTarget}</strong>
          </div>
          <div aria-label={`${performance.weeklyReviewProgress}% of weekly review target completed`} aria-valuemax="100" aria-valuemin="0" aria-valuenow={performance.weeklyReviewProgress} className="goal-target-progress" role="progressbar">
            <span style={{ width: `${performance.weeklyReviewProgress}%` }} />
          </div>
          <p>Completing target-linked review reminders increases this performance score.</p>
        </div>
      </div>

      <div className="goal-reminder-preferences">
        <div className="goal-reminder-preferences-title">
          <SlidersHorizontal aria-hidden="true" size={16} />
          <div><strong>Planner assistant</strong><span>Current-day reminder behavior</span></div>
        </div>

        <PlannerSettingToggle
          checked={plannerSettings.targetRemindersEnabled}
          label="Target-linked reminders"
          onChange={(value) => updatePlannerSettings({ targetRemindersEnabled: value })}
          subtitle="Create today's study reminder and spread review reminders across the week."
        />

        <PlannerSettingToggle
          checked={plannerSettings.nudgeEnabled}
          label="Centered reminder alerts"
          onChange={(value) => updatePlannerSettings({ nudgeEnabled: value })}
          subtitle="Show a focused popup with Done and Remind later when a scheduled reminder is due."
        />

        <div className="goal-setting-select-row">
          <div><Clock3 aria-hidden="true" size={15} /><span>Remind later</span></div>
          <select
            aria-label="Remind later duration"
            disabled={!plannerSettings.nudgeEnabled}
            onChange={(event) => updatePlannerSettings({ snoozeMinutes: Number(event.target.value) })}
            value={plannerSettings.snoozeMinutes}
          >
            <option value="5">5 minutes</option>
            <option value="10">10 minutes</option>
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">1 hour</option>
          </select>
        </div>

        <PlannerSettingToggle
          checked={plannerSettings.showCompleted}
          label="Show completed items"
          onChange={(value) => updatePlannerSettings({ showCompleted: value })}
          subtitle="Keep finished goals, reminders, and tasks visible in the center."
        />
      </div>

      <div className="goal-settings-actions">
        <button className="goal-settings-save-btn" onClick={onSaveTargets} type="button">
          <Save aria-hidden="true" size={15} /> Save study targets
        </button>
        <span><Eye aria-hidden="true" size={14} /> Saving enables and refreshes target-linked reminders</span>
      </div>
    </section>
  );
}

export default GoalSettingsPanel;
