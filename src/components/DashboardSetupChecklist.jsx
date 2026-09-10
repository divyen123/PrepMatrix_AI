import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { BookOpen, CalendarDays, Check, ChevronDown, ChevronUp, ListChecks, Plus } from "lucide-react";
import api from "../utils/apiClient";
import { getCodeMatrixSetupSteps } from "../utils/codeMatrixProfile.js";
import { readCodeMatrixDraft } from "../utils/codeMatrixWorkspace.js";
import "./DashboardSetupChecklist.css";

const ACTIONS = {
  subjects: { title: "Add your subjects", button: "Add subject", to: "/subjects#add-subject", icon: Plus },
  notebook: { title: "Prepare a notebook", button: "Start learning", to: "/learn#notebook-preparation", icon: BookOpen },
  plan: { title: "Plan your schedule", button: "Create plan", to: "/planner/schedule", icon: CalendarDays },
};

export default function DashboardSetupChecklist({ academicProfileDataId, subjects = [], schedule = [] }) {
  const contentId = useId();
  const [collapsed, setCollapsed] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 600px)").matches);
  const [completedSteps, setCompletedSteps] = useState(() => readCodeMatrixDraft(academicProfileDataId)?.completedSteps || []);
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  const steps = useMemo(() => getCodeMatrixSetupSteps({ subjects, schedule, completedSteps }), [subjects, schedule, completedSteps]);
  const completeCount = steps.filter((step) => step.complete).length;

  useEffect(() => {
    let active = true;
    const load = () => {
      setStatus("loading");
      // The same profile-scoped endpoint observes subjects, saved notebooks and plans for CodeMatrix.
      api.get("/api/code-matrix/workspace", { academicProfileId: academicProfileDataId }).then((payload) => {
        if (!active) return;
        setCompletedSteps(payload.setup?.completedSteps || []);
        setStatus("ready");
      }).catch(() => { if (active) setStatus("error"); });
    };
    load();
    window.addEventListener("online", load);
    return () => { active = false; window.removeEventListener("online", load); };
  }, [academicProfileDataId, attempt, subjects, schedule]);

  if (completeCount === steps.length) return null;

  return createPortal(
    <aside aria-label="Complete actions" className="dashboard-setup">
      <button aria-controls={contentId} aria-expanded={!collapsed} className="dashboard-setup-toggle" onClick={() => setCollapsed((value) => !value)} type="button">
        <ListChecks aria-hidden="true" size={20} />
        <strong>Complete actions</strong>
        <span>{completeCount}/3</span>
        {collapsed ? <ChevronUp aria-hidden="true" size={17} /> : <ChevronDown aria-hidden="true" size={17} />}
      </button>
      <div hidden={collapsed} id={contentId}>
        <p className="dashboard-setup-intro">Set up your study space, one step at a time.</p>
        <progress aria-label="Study setup progress" max={3} value={completeCount} />
        {status === "loading" ? <p className="dashboard-setup-status" role="status">Checking your progress…</p> : (
          <ol>
            {steps.map((step) => {
              const { title, button, to, icon: Icon } = ACTIONS[step.id];
              return (
                <li className={step.complete ? "is-complete" : step.recommended ? "is-next" : ""} key={step.id}>
                  <span className="dashboard-setup-icon">{step.complete ? <Check aria-label="Completed" size={17} /> : <Icon aria-hidden="true" size={17} />}</span>
                  <div>
                    <strong>{title}</strong>
                    {step.complete ? <span className="dashboard-setup-done">Completed</span> : <Link to={to}>{button}</Link>}
                  </div>
                  {step.recommended && <small>Next</small>}
                </li>
              );
            })}
          </ol>
        )}
        {status === "error" && <p className="dashboard-setup-status" role="status">Could not refresh progress. <button onClick={() => setAttempt((value) => value + 1)} type="button">Retry</button></p>}
      </div>
    </aside>, document.body,
  );
}
