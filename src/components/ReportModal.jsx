import jsPDF from "jspdf";
import { Download, FileText, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import api from "../utils/apiClient";
import { getPlannerMetrics } from "../utils/plannerMetrics";
import "./ReportModal.css";

const REPORT_MODAL_EXIT_DURATION_MS = 200;

const PDF_COLORS = {
  accent: [11, 143, 116],
  accentSoft: [229, 246, 241],
  border: [218, 225, 232],
  ink: [20, 31, 49],
  muted: [91, 106, 132],
  paper: [255, 255, 255],
  panel: [248, 250, 252],
};

function getProgressTone(rate) {
  if (rate >= 70) return "high"; // Green: more completed
  if (rate >= 40) return "mid";  // Yellow: completed mid
  return "low";                  // Red: less completed
}

function getPdfToneColor(rate) {
  if (rate >= 70) return [16, 185, 129]; // Green
  if (rate >= 40) return [245, 158, 11];  // Yellow
  return [239, 68, 68];                  // Red
}

function ReportModal({
  completed = [],
  onClose,
  schedule = [],
  subjects = [],
  userProfile = {},
}) {
  const navigate = useNavigate();
  const closeButtonRef = useRef(null);
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const [attempts, setAttempts] = useState([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const closingRef = useRef(false);
  const closeTimerRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const handleClose = useCallback(() => {
    if (closingRef.current) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);

    if (prefersReducedMotion) {
      onCloseRef.current?.();
      return;
    }

    closingRef.current = true;
    setIsClosing(true);

    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onCloseRef.current?.();
    }, REPORT_MODAL_EXIT_DURATION_MS);
  }, []);

  const metrics = useMemo(
    () => getPlannerMetrics(schedule, completed),
    [schedule, completed],
  );
  const subjectCount = Array.isArray(subjects) ? subjects.length : 0;
  const needsSubjects = subjectCount === 0;
  const needsPlan = !metrics.hasScheduledPlanner;

  let setupNotice = null;
  if (needsSubjects && needsPlan) {
    setupNotice = {
      title: "Add subjects first, then generate a plan",
      description:
        "Your report will start tracking tasks, completion, and study patterns after both steps are ready.",
      steps: [
        "Add subjects to define your active study areas.",
        "Generate a study plan after your subjects are ready.",
      ],
    };
  } else if (needsSubjects) {
    setupNotice = {
      title: "Add subjects before continuing",
      description:
        "Add subjects to define your active study areas, then generate a fresh plan if your schedule needs one.",
      steps: ["Add subjects before reviewing subject-level performance."],
    };
  } else if (needsPlan) {
    setupNotice = {
      title: "Your subjects are ready — generate a plan",
      description:
        "Generate a study plan to begin tracking scheduled tasks, completion, and recovery insights.",
      steps: ["Generate a study plan to turn your subjects into scheduled study tasks."],
    };
  }

  useEffect(() => {
    let isMounted = true;
    api.getQuizzes()
      .then((payload) => {
        if (isMounted) setAttempts(payload.attempts || []);
      })
      .catch(() => {
        if (isMounted) setAttempts([]);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.classList.add("modal-open");
    document.body.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus({ preventScroll: true });
    });

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
      document.body.classList.remove("modal-open");
      document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, [handleClose]);

  const averageQuiz = attempts.length
    ? Math.round(
        attempts.reduce(
          (sum, attempt) =>
            sum + (attempt.total ? (attempt.score / attempt.total) * 100 : 0),
          0,
        ) / attempts.length,
      )
    : 0;

  const strongestSignal =
    metrics.morningCompleted >= metrics.eveningCompleted
      ? "Morning study pace is strongest"
      : "Evening study pace is strongest";

  const subjectWatchlist = Object.entries(metrics.subjectStats || {})
    .sort(([, left], [, right]) => right.pending - left.pending || left.done - right.done)
    .slice(0, 4);

  const reportActions = setupNotice?.steps || [
    metrics.firstPendingTask
      ? `Priority next: ${metrics.firstPendingTask}.`
      : "Study plan is up to date.",
    metrics.weakSubject
      ? `Allocate dedicated practice for ${metrics.weakSubject}.`
      : "Subject progress is balanced across active lanes.",
    attempts.length
      ? `Quiz performance stands at ${averageQuiz}% average.`
      : "Complete a topic quiz to benchmark retention.",
  ].filter(Boolean);

  const planTone = getProgressTone(metrics.completionRate);

  const exportReportPDF = () => {
    setIsExporting(true);
    try {
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 18;
      const contentWidth = pageWidth - margin * 2;
      const generatedAt = new Date();
      const learnerName = userProfile?.username || "Student";
      const profileLine = [
        userProfile?.institutionName,
        userProfile?.academicLevel,
        userProfile?.degree || userProfile?.grade || userProfile?.academicTrack,
      ]
        .filter(Boolean)
        .join(" - ") || "Academic Portfolio";
      const safeName = learnerName.replace(/[^a-z0-9]/gi, "_").toLowerCase() || "student";
      let y = margin;

      const setTextColor = (color) => pdf.setTextColor(color[0], color[1], color[2]);
      const setFillColor = (color) => pdf.setFillColor(color[0], color[1], color[2]);
      const setDrawColor = (color) => pdf.setDrawColor(color[0], color[1], color[2]);

      // Header block
      setFillColor([15, 29, 36]);
      pdf.roundedRect(margin, y, contentWidth, 30, 6, 6, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(20);
      pdf.setTextColor(255, 255, 255);
      pdf.text("PrepMatrix AI", margin + 8, y + 13);
      pdf.setFontSize(9.5);
      pdf.setFont("helvetica", "normal");
      pdf.text("Study Performance & Planner Report", margin + 8, y + 22);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.5);
      pdf.text(generatedAt.toLocaleDateString(), pageWidth - margin - 8, y + 13, { align: "right" });
      pdf.setFont("helvetica", "normal");
      pdf.text("Exported Report", pageWidth - margin - 8, y + 21, { align: "right" });
      y += 38;

      // Learner Profile Card
      setFillColor(PDF_COLORS.panel);
      setDrawColor(PDF_COLORS.border);
      pdf.roundedRect(margin, y, contentWidth, 30, 4, 4, "FD");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);
      setTextColor(PDF_COLORS.ink);
      pdf.text(learnerName, margin + 6, y + 10);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      setTextColor(PDF_COLORS.muted);
      pdf.text(profileLine, margin + 6, y + 18);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      const planColor = getPdfToneColor(metrics.completionRate);
      setTextColor(planColor);
      pdf.text(`${metrics.completionRate}%`, pageWidth - margin - 8, y + 13, { align: "right" });
      pdf.setFontSize(7.5);
      setTextColor(PDF_COLORS.muted);
      pdf.text("OVERALL COMPLETION", pageWidth - margin - 8, y + 20, { align: "right" });

      // Progress bar with tone color
      const barWidth = 60;
      setFillColor([226, 232, 238]);
      pdf.roundedRect(pageWidth - margin - barWidth - 8, y + 23, barWidth, 3, 1.5, 1.5, "F");
      setFillColor(planColor);
      pdf.roundedRect(pageWidth - margin - barWidth - 8, y + 23, (barWidth * Math.min(Math.max(metrics.completionRate, 0), 100)) / 100, 3, 1.5, 1.5, "F");
      y += 38;

      // 4 Metric cards
      const gap = 5;
      const cardWidth = (contentWidth - gap * 3) / 4;
      const statItems = [
        { label: "SUBJECTS", val: String(subjectCount), sub: "active lanes" },
        { label: "TASKS", val: String(metrics.totalTasks), sub: `${metrics.completedTasks} done` },
        { label: "REMAINING", val: String(metrics.remainingTasks), sub: "pending tasks" },
        { label: "QUIZ AVG", val: attempts.length ? `${averageQuiz}%` : "N/A", sub: `${attempts.length} tests` },
      ];

      statItems.forEach((st, idx) => {
        const cx = margin + (cardWidth + gap) * idx;
        setFillColor(PDF_COLORS.panel);
        setDrawColor(PDF_COLORS.border);
        pdf.roundedRect(cx, y, cardWidth, 24, 4, 4, "FD");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7.5);
        setTextColor(PDF_COLORS.accent);
        pdf.text(st.label, cx + 5, y + 7);
        pdf.setFontSize(15);
        setTextColor(PDF_COLORS.ink);
        pdf.text(st.val, cx + 5, y + 16);
        pdf.setFontSize(7.5);
        pdf.setFont("helvetica", "normal");
        setTextColor(PDF_COLORS.muted);
        pdf.text(st.sub, cx + 5, y + 21);
      });
      y += 32;

      // Subject breakdown
      if (subjectWatchlist.length) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        setTextColor(PDF_COLORS.ink);
        pdf.text("Subject Progress Snapshot", margin, y);
        y += 6;

        const subCardH = Math.max(30, subjectWatchlist.length * 11 + 10);
        setFillColor(PDF_COLORS.panel);
        setDrawColor(PDF_COLORS.border);
        pdf.roundedRect(margin, y, contentWidth, subCardH, 4, 4, "FD");

        subjectWatchlist.forEach(([sName, sStat], i) => {
          const sy = y + 10 + i * 11;
          const sPct = sStat.total ? Math.round((sStat.done / sStat.total) * 100) : 0;
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(9);
          setTextColor(PDF_COLORS.ink);
          pdf.text(`${i + 1}. ${sName}`, margin + 6, sy);

          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(8.5);
          setTextColor(getPdfToneColor(sPct));
          pdf.text(`${sStat.done}/${sStat.total} done (${sPct}%)`, pageWidth - margin - 6, sy, { align: "right" });
        });
        y += subCardH + 10;
      }

      // Action recommendations
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      setTextColor(PDF_COLORS.ink);
      pdf.text("Recommended Next Actions", margin, y);
      y += 6;

      const actH = reportActions.length * 11 + 10;
      setFillColor(PDF_COLORS.panel);
      setDrawColor(PDF_COLORS.border);
      pdf.roundedRect(margin, y, contentWidth, actH, 4, 4, "FD");

      reportActions.forEach((act, idx) => {
        const ay = y + 10 + idx * 11;
        setFillColor(PDF_COLORS.accentSoft);
        pdf.circle(margin + 8, ay - 2.5, 3, "F");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7.5);
        setTextColor(PDF_COLORS.accent);
        pdf.text(String(idx + 1), margin + 8, ay - 1.2, { align: "center" });

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8.8);
        setTextColor(PDF_COLORS.ink);
        pdf.text(act, margin + 16, ay);
      });

      // Footer
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      setTextColor(PDF_COLORS.muted);
      pdf.text("PrepMatrix AI • Study & Performance Intelligence", margin, pageHeight - 10);
      pdf.text(`Generated on ${generatedAt.toLocaleDateString()}`, pageWidth - margin, pageHeight - 10, { align: "right" });

      pdf.save(`PrepMatrix_Report_${safeName}_${generatedAt.toISOString().slice(0, 10)}.pdf`);
    } finally {
      setIsExporting(false);
    }
  };

  const learnerSubtitle = [
    userProfile?.academicLevel,
    userProfile?.institutionName,
  ]
    .filter(Boolean)
    .join(" · ") || "Current study overview";

  return createPortal(
    <div
      className={`report-modal-backdrop${isClosing ? " is-closing" : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      role="presentation"
    >
      <section
        aria-describedby="report-modal-subtitle"
        aria-labelledby="report-modal-title"
        aria-modal="true"
        className={`report-modal${isClosing ? " is-closing" : ""}`}
        ref={dialogRef}
        role="dialog"
      >
        <header className="report-modal-header">
          <div className="report-modal-title-wrap">
            <span className="report-modal-icon" aria-hidden="true">
              <FileText size={20} />
            </span>
            <div>
              <h2 id="report-modal-title">Study &amp; Performance Report</h2>
              <p id="report-modal-subtitle">
                {userProfile?.username ? `${userProfile.username} · ` : ""}
                {learnerSubtitle}
              </p>
            </div>
          </div>
          <button
            aria-label="Close report dialog"
            className="report-modal-close"
            disabled={isClosing}
            onClick={handleClose}
            ref={closeButtonRef}
            type="button"
          >
            <X size={18} />
          </button>
        </header>

        <div className="report-modal-body">
          {setupNotice && (
            <div className="report-setup-notice" role="status">
              <strong>{setupNotice.title}</strong>
              <p>{setupNotice.description}</p>
            </div>
          )}

          {/* Completion summary banner with color-toned bar */}
          <div className="report-progress-banner">
            <div className="report-progress-info">
              <span className="report-progress-label">Plan Completion</span>
              <strong className={`report-progress-val is-${planTone}`}>
                {metrics.completionRate}%
              </strong>
              <small>
                {metrics.completedTasks} of {metrics.totalTasks} tasks completed
              </small>
            </div>
            <div
              aria-label={`Plan progress ${metrics.completionRate}%`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={metrics.completionRate}
              className="report-progress-track"
              role="progressbar"
            >
              <div
                className={`report-progress-fill is-${planTone}`}
                style={{ width: `${Math.min(Math.max(metrics.completionRate, 0), 100)}%` }}
              />
            </div>
          </div>

          {/* Minimal 4-metric grid */}
          <div className="report-stat-grid">
            <div className="report-stat-card">
              <span className="report-stat-label">Active Subjects</span>
              <strong className="report-stat-value">{subjectCount}</strong>
              <small>{metrics.remainingTasks} tasks pending</small>
            </div>
            <div className="report-stat-card">
              <span className="report-stat-label">Tasks Completed</span>
              <strong className="report-stat-value">{metrics.completedTasks}</strong>
              <small>of {metrics.totalTasks} scheduled</small>
            </div>
            <div className="report-stat-card">
              <span className="report-stat-label">Quiz Average</span>
              <strong className="report-stat-value">
                {attempts.length ? `${averageQuiz}%` : "—"}
              </strong>
              <small>{attempts.length ? `${attempts.length} attempts` : "No attempts"}</small>
            </div>
            <div className="report-stat-card">
              <span className="report-stat-label">Study Pattern</span>
              <strong className="report-stat-value" style={{ fontSize: "1.05rem" }}>
                {metrics.morningCompleted >= metrics.eveningCompleted ? "Morning" : "Evening"}
              </strong>
              <small>{strongestSignal}</small>
            </div>
          </div>

          {/* Subjects breakdown with color-toned bars */}
          {subjectWatchlist.length > 0 && (
            <div className="report-section-block">
              <h3 className="report-section-heading">Subject Progress</h3>
              <div className="report-subject-list">
                {subjectWatchlist.map(([sName, sStat]) => {
                  const pct = sStat.total ? Math.round((sStat.done / sStat.total) * 100) : 0;
                  const subTone = getProgressTone(pct);
                  return (
                    <div className="report-subject-item" key={sName}>
                      <div className="report-subject-row">
                        <span className="report-subject-name">{sName}</span>
                        <span className={`report-subject-stats is-${subTone}`}>
                          {sStat.done}/{sStat.total} done ({pct}%)
                        </span>
                      </div>
                      <div className="report-mini-track">
                        <div
                          className={`report-mini-fill is-${subTone}`}
                          style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action recommendations */}
          <div className="report-section-block">
            <h3 className="report-section-heading">
              {setupNotice ? "Next steps" : "Recommended Recovery"}
            </h3>
            <ul className="report-action-list">
              {reportActions.map((action, idx) => (
                <li key={action}>
                  <span className="report-action-num">{idx + 1}</span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <footer className="report-modal-footer">
          <button
            className="secondary-btn report-footer-cancel-btn"
            disabled={isClosing}
            onClick={handleClose}
            type="button"
          >
            Close
          </button>
          {needsSubjects ? (
            <button
              className="action-btn report-setup-action-btn"
              disabled={isClosing}
              onClick={() => navigate("/subjects#add-subject")}
              type="button"
            >
              Add subjects
            </button>
          ) : needsPlan ? (
            <button
              className="action-btn report-setup-action-btn"
              disabled={isClosing}
              onClick={() => navigate("/planner/schedule", {
                state: { plannerShortcutAction: "new" },
              })}
              type="button"
            >
              Generate plan
            </button>
          ) : (
            <button
              className="action-btn report-export-pdf-btn"
              disabled={isExporting || isClosing}
              onClick={exportReportPDF}
              type="button"
            >
              <Download aria-hidden="true" size={15} />
              <span>{isExporting ? "Exporting..." : "Export report PDF"}</span>
            </button>
          )}
        </footer>
      </section>
    </div>,
    document.body,
  );
}

export default ReportModal;
