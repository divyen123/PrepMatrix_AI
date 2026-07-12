import { BellRing, Clock3, Eye, ListTodo, Save, SlidersHorizontal, Target } from "lucide-react";

import {
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
  dailyTarget,
  onDailyTargetChange,
  onSaveTargets,
  onPlannerSettingsChange,
  onWeeklyReviewChange,
  plannerData,
  plannerSettings,
  weeklyReview,
}) {
  const summary = summarizePlannerData(plannerData);

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
          <p className="card-subtext">Set study targets and control the personal goal, reminder, and to-do center.</p>
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
        <label className="field-stack">
          <span>Daily study target (hours)</span>
          <input
            max="16"
            min="1"
            onChange={(event) => onDailyTargetChange(Number.parseFloat(event.target.value) || 1)}
            step="0.5"
            type="number"
            value={dailyTarget}
          />
        </label>
        <label className="field-stack">
          <span>Weekly review target</span>
          <select onChange={(event) => onWeeklyReviewChange(event.target.value)} value={weeklyReview}>
            <option value="1">1 review/week</option>
            <option value="2">2 reviews/week</option>
            <option value="3">3 reviews/week</option>
            <option value="daily">Daily reviews</option>
          </select>
        </label>
      </div>

      <div className="goal-reminder-preferences">
        <div className="goal-reminder-preferences-title">
          <SlidersHorizontal aria-hidden="true" size={16} />
          <div><strong>Planner assistant</strong><span>Current-day reminder behavior</span></div>
        </div>

        <PlannerSettingToggle
          checked={plannerSettings.nudgeEnabled}
          label="Animated reminder nudge"
          onChange={(value) => updatePlannerSettings({ nudgeEnabled: value })}
          subtitle="Show a message above the sidebar goal icon for 6 seconds."
        />

        <div className="goal-setting-select-row">
          <div><Clock3 aria-hidden="true" size={15} /><span>Repeat nudge</span></div>
          <select
            aria-label="Reminder nudge repeat interval"
            disabled={!plannerSettings.nudgeEnabled}
            onChange={(event) => updatePlannerSettings({ repeatSeconds: Number(event.target.value) })}
            value={plannerSettings.repeatSeconds}
          >
            <option value="20">Every 20 seconds</option>
            <option value="30">Every 30 seconds</option>
            <option value="60">Every 60 seconds</option>
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
        <span><Eye aria-hidden="true" size={14} /> Planner preferences save automatically</span>
      </div>
    </section>
  );
}

export default GoalSettingsPanel;
