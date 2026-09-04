import { ListTodo, Target } from "lucide-react";

import {
  openGoalReminderCenter,
  summarizePlannerData,
} from "../utils/goalReminderStore";

function GoalSettingsPanel({ plannerData }) {
  const summary = summarizePlannerData(plannerData);

  return (
    <section className="card goal-settings-card">
      <div className="goal-settings-heading">
        <div>
          <span className="section-tag">GOALS</span>
          <h3><Target aria-hidden="true" size={20} /> Study Goals &amp; To-Do</h3>
        </div>
        <button
          className="goal-settings-open-btn"
          onClick={() => openGoalReminderCenter()}
          type="button"
        >
          <Target aria-hidden="true" size={15} /> Open center
        </button>
      </div>

      <div className="goal-settings-summary" aria-label="Goal and to-do summary">
        <div><Target aria-hidden="true" size={15} /><span>Active goals</span><strong>{summary.activeGoals}</strong></div>
        <div><ListTodo aria-hidden="true" size={15} /><span>Open to-dos</span><strong>{summary.openTodos}</strong></div>
      </div>
    </section>
  );
}

export default GoalSettingsPanel;
