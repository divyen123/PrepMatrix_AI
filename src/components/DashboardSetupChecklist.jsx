import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown, ChevronUp, ListChecks } from "lucide-react";
import api from "../utils/apiClient";
import { getCodeMatrixSetupSteps } from "../utils/codeMatrixProfile.js";
import { readCodeMatrixDraft } from "../utils/codeMatrixWorkspace.js";
import useFloatingOverlayStackSlot from "../hooks/useFloatingOverlayStackSlot";
import { FLOATING_OVERLAY_STACK_PROPERTIES } from "../utils/floatingOverlayStack";
import SpringCheck from "./SpringCheck";
import "./DashboardSetupChecklist.css";

const ACTIONS = {
  subjects: { title: "Add your subjects", button: "Add subject", to: "/subjects#add-subject" },
  plan: { title: "Plan your schedule", button: "Create plan", to: "/planner/schedule" },
  notebook: { title: "Prepare a notebook", button: "Start learning", to: "/learn#notebook-preparation" },
};
const ACTION_ORDER = Object.keys(ACTIONS);

export default function DashboardSetupChecklist({ academicProfileDataId, subjects = [], schedule = [] }) {
  const contentId = useId();
  const setupRef = useRef(null);
  const [collapsed, setCollapsed] = useState(true);
  const [completedSteps, setCompletedSteps] = useState(() => readCodeMatrixDraft(academicProfileDataId)?.completedSteps || []);
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  const steps = useMemo(() => getCodeMatrixSetupSteps({ subjects, schedule, completedSteps })
    .sort((left, right) => ACTION_ORDER.indexOf(left.id) - ACTION_ORDER.indexOf(right.id)), [subjects, schedule, completedSteps]);
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

  useFloatingOverlayStackSlot(setupRef, FLOATING_OVERLAY_STACK_PROPERTIES.dashboardSetup, completeCount < steps.length);

  if (completeCount === steps.length) return null;

  return createPortal(
    <aside aria-label="Complete actions" className="dashboard-setup" ref={setupRef}>
      <button aria-controls={contentId} aria-expanded={!collapsed} className="dashboard-setup-toggle" onClick={() => setCollapsed((value) => !value)} type="button">
        <ListChecks aria-hidden="true" size={20} />
        <strong>Complete actions</strong>
        <span>{completeCount}/3</span>
        {collapsed ? <ChevronUp aria-hidden="true" size={17} /> : <ChevronDown aria-hidden="true" size={17} />}
      </button>
      <div
        aria-hidden={collapsed}
        className={`dashboard-setup-content${collapsed ? " is-collapsed" : ""}`}
        id={contentId}
        inert={collapsed ? "" : undefined}
      >
        <div className="dashboard-setup-content-inner">
          <p className="dashboard-setup-intro">Set up your study space, one step at a time.</p>
          <progress aria-label="Study setup progress" max={3} value={completeCount} />
          {status === "loading" ? <p className="dashboard-setup-status" role="status">Checking your progress…</p> : (
            <ol>
              {steps.map((step) => {
                const { title, button, to } = ACTIONS[step.id];
                return (
                  <li className={step.complete ? "is-complete" : step.recommended ? "is-next" : ""} key={step.id}>
                    <SpringCheck
                      key={`${step.id}-${collapsed ? "closed" : "open"}`}
                      label={title}
                      checked={step.complete}
                      readOnly
                      animateOnMount
                      color="var(--text)"
                      fillColor="var(--accent)"
                      checkColor="var(--dashboard-setup-check-ink)"
                      boxSize={24}
                      boxRadius={7}
                      fontSize={13}
                      doneOpacity={0.55}
                    />
                    {!step.complete && (
                      <Link aria-label={button} className="dashboard-setup-action" title={button} to={to}>
                        <ArrowRight aria-hidden="true" size={18} strokeWidth={2.2} />
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          {status === "error" && <p className="dashboard-setup-status" role="status">Could not refresh progress. <button onClick={() => setAttempt((value) => value + 1)} type="button">Retry</button></p>}
        </div>
      </div>
    </aside>, document.body,
  );
}
