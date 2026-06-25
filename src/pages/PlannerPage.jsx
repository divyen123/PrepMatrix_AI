import { useState } from "react";
import Reminder from "../components/Reminder";
import SmartSuggestion from "../components/SmartSuggestion";
import Timetable from "../components/Timetable";

function PlannerPage({ subjects, schedule, setSchedule, completed, setCompleted }) {
  return (
    <section className="page-stack planner-route-page">
      <div className="section-intro">
        <span className="section-tag">Planner</span>
        <h2>Generate, adjust, and recover your schedule</h2>
      </div>

      <div className="planner-support-strip">
        <SmartSuggestion completed={completed} schedule={schedule} />
        <Reminder completed={completed} schedule={schedule} />
      </div>

      <Timetable
        completed={completed}
        schedule={schedule}
        setCompleted={setCompleted}
        setSchedule={setSchedule}
        subjects={subjects}
      />
    </section>
  );
}

export default PlannerPage;
