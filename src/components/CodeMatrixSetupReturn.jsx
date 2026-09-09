import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { CODE_MATRIX_PATH } from "../utils/codeMatrixProfile.js";
import { codeMatrixSetupNavigation } from "../utils/codeMatrixWorkspace.js";
import "./CodeMatrixSetupReturn.css";

export default function CodeMatrixSetupReturn({ step, complete = false, subjectName = "" }) {
  const location = useLocation();
  if (new URLSearchParams(location.search).get("from") !== "code-matrix") return null;
  const nextStep = step === "subjects" ? "notebook" : step === "notebook" ? "plan" : null;
  const title = complete
    ? step === "subjects" ? "Your subjects are ready" : step === "notebook" ? "Your notebook is ready" : "Your study plan is ready"
    : step === "subjects" ? "Add a subject to your workspace" : step === "notebook" ? "Prepare your notebook" : "Create your study plan";
  return (
    <aside className="cmx-setup-return" aria-label="CodeMatrix setup">
      <div>{complete && <CheckCircle2 size={18} aria-hidden="true" />}<span>{title}<small>Return to CodeMatrix whenever you’re ready.</small></span></div>
      <nav aria-label="Continue account setup">
        <Link to={CODE_MATRIX_PATH}><ArrowLeft size={15} aria-hidden="true" /> Return to CodeMatrix</Link>
        {complete && nextStep && <Link className="cmx-setup-next" to={codeMatrixSetupNavigation(nextStep, subjectName)}>
          {nextStep === "notebook" ? "Prepare a notebook" : "Create plan"}<ArrowRight size={15} aria-hidden="true" />
        </Link>}
      </nav>
    </aside>
  );
}
