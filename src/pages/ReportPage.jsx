import jsPDF from "jspdf";
import { useEffect, useMemo, useState } from "react";
import api from "../utils/apiClient";
import { getPlannerMetrics } from "../utils/plannerMetrics";

const PDF_COLORS = {
  accent: [11, 143, 116],
  accentSoft: [229, 246, 241],
  border: [218, 225, 232],
  ink: [20, 31, 49],
  muted: [91, 106, 132],
  paper: [249, 248, 244],
  panel: [255, 255, 255],
};

function setTextColor(pdf, color) {
  pdf.setTextColor(color[0], color[1], color[2]);
}

function setFillColor(pdf, color) {
  pdf.setFillColor(color[0], color[1], color[2]);
}

function setDrawColor(pdf, color) {
  pdf.setDrawColor(color[0], color[1], color[2]);
}

function addWrappedText(pdf, text, x, y, maxWidth, options = {}) {
  const lineHeight = options.lineHeight || 6;
  const lines = pdf.splitTextToSize(String(text || ""), maxWidth);
  pdf.text(lines, x, y, options.textOptions || {});
  return y + lines.length * lineHeight;
}

function drawMetricCard(pdf, x, y, width, title, value, detail = "") {
  setFillColor(pdf, PDF_COLORS.panel);
  setDrawColor(pdf, PDF_COLORS.border);
  pdf.roundedRect(x, y, width, 24, 4, 4, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  setTextColor(pdf, PDF_COLORS.accent);
  pdf.text(title.toUpperCase(), x + 5, y + 7);
  pdf.setFontSize(17);
  setTextColor(pdf, PDF_COLORS.ink);
  pdf.text(String(value), x + 5, y + 16);

  if (detail) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    setTextColor(pdf, PDF_COLORS.muted);
    pdf.text(String(detail), x + 5, y + 21);
  }
}

function drawProgressBar(pdf, x, y, width, percent) {
  const safePercent = Math.min(Math.max(percent, 0), 100);
  setFillColor(pdf, [226, 232, 238]);
  pdf.roundedRect(x, y, width, 4, 2, 2, "F");
  setFillColor(pdf, PDF_COLORS.accent);
  pdf.roundedRect(x, y, (width * safePercent) / 100, 4, 2, 2, "F");
}

function ReportPage({ completed, materialBookmarks, schedule, subjects, userProfile }) {
  const metrics = useMemo(
    () => getPlannerMetrics(schedule, completed),
    [schedule, completed]
  );
  const [attempts, setAttempts] = useState([]);

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

  const averageQuiz = attempts.length
    ? Math.round(
        attempts.reduce((sum, attempt) => sum + (attempt.total ? (attempt.score / attempt.total) * 100 : 0), 0) / attempts.length
      )
    : 0;
  const riskLevel = metrics.completionRate >= 75
    ? "Stable"
    : metrics.completionRate >= 40
      ? "Watchlist"
      : "Needs recovery";
  const strongestSignal = metrics.morningCompleted >= metrics.eveningCompleted
    ? "Morning sessions are currently stronger."
    : "Evening sessions are currently stronger.";

  const subjectWatchlist = Object.entries(metrics.subjectStats)
    .sort(([, left], [, right]) => right.pending - left.pending || left.done - right.done)
    .slice(0, 5);

  const reportActions = [
    metrics.firstPendingTask ? `Start with ${metrics.firstPendingTask}.` : "Generate a schedule before adding extra tasks.",
    metrics.weakSubject ? `Give ${metrics.weakSubject} one focused repair block.` : "Complete a few tasks to reveal weak subjects.",
    attempts.length ? `Review quiz mistakes. Average quiz score is ${averageQuiz}%.` : "Take one topic quiz to measure understanding.",
    materialBookmarks.length ? "Use saved materials before searching for more resources." : "Bookmark useful materials for faster revision.",
  ];

  const exportReportPDF = () => {
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 18;
    const footerReserve = 18;
    const contentBottom = pageHeight - footerReserve;
    const contentWidth = pageWidth - margin * 2;
    const generatedAt = new Date();
    const learnerName = userProfile?.username || "Student";
    const profileLine = [
      userProfile?.institutionName || "Institution not set",
      userProfile?.academicLevel || "Level not set",
      userProfile?.department || userProfile?.academicTrack,
    ].filter(Boolean).join(" - ");
    const safeName = learnerName.replace(/[^a-z0-9]/gi, "_").toLowerCase() || "student";
    let y = margin;

    const paintPage = () => {
      setFillColor(pdf, PDF_COLORS.paper);
      pdf.rect(0, 0, pageWidth, pageHeight, "F");
    };

    const addPage = () => {
      pdf.addPage();
      paintPage();
      y = margin;
    };

    const ensureSpace = (heightNeeded) => {
      if (y + heightNeeded <= contentBottom) {
        return;
      }

      addPage();
    };

    const fitText = (text, maxWidth) => {
      const cleanText = String(text || "");

      if (pdf.getTextWidth(cleanText) <= maxWidth) {
        return cleanText;
      }

      let fitted = cleanText;
      while (fitted.length > 3 && pdf.getTextWidth(`${fitted}...`) > maxWidth) {
        fitted = fitted.slice(0, -1);
      }

      return `${fitted}...`;
    };

    const sectionTitle = (label, title, requiredHeight = 0) => {
      ensureSpace(24 + requiredHeight);
      setFillColor(pdf, PDF_COLORS.accentSoft);
      pdf.roundedRect(margin, y, 48, 8, 4, 4, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      setTextColor(pdf, PDF_COLORS.accent);
      pdf.text(label.toUpperCase(), margin + 4, y + 5.4);
      y += 14;
      pdf.setFontSize(15);
      setTextColor(pdf, PDF_COLORS.ink);
      pdf.text(title, margin, y);
      y += 10;
    };

    const drawPanel = (x, top, width, height) => {
      setFillColor(pdf, PDF_COLORS.panel);
      setDrawColor(pdf, PDF_COLORS.border);
      pdf.roundedRect(x, top, width, height, 6, 6, "FD");
    };

    paintPage();

    setFillColor(pdf, [15, 29, 36]);
    pdf.roundedRect(margin, y, contentWidth, 34, 8, 8, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(24);
    pdf.setTextColor(255, 255, 255);
    pdf.text("PrepMatrix", margin + 8, y + 14);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text("Planner intelligence report", margin + 8, y + 24);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text(generatedAt.toLocaleDateString(), pageWidth - margin - 8, y + 14, { align: "right" });
    pdf.setFont("helvetica", "normal");
    pdf.text("Generated PDF", pageWidth - margin - 8, y + 23, { align: "right" });
    y += 45;

    sectionTitle("Learner", "Profile and plan health", 42);
    drawPanel(margin, y, contentWidth, 42);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    setTextColor(pdf, PDF_COLORS.ink);
    pdf.text(fitText(learnerName, 104), margin + 7, y + 12);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    setTextColor(pdf, PDF_COLORS.muted);
    addWrappedText(pdf, profileLine, margin + 7, y + 20, 104, { lineHeight: 5 });
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(22);
    setTextColor(pdf, PDF_COLORS.accent);
    pdf.text(`${metrics.completionRate}%`, pageWidth - margin - 8, y + 15, { align: "right" });
    pdf.setFontSize(8);
    setTextColor(pdf, PDF_COLORS.muted);
    pdf.text("PLAN COMPLETION", pageWidth - margin - 8, y + 23, { align: "right" });
    drawProgressBar(pdf, pageWidth - margin - 70, y + 30, 62, metrics.completionRate);
    y += 54;

    sectionTitle("Snapshot", "Planner performance", 76);
    const gap = 5;
    const cardWidth = (contentWidth - gap * 3) / 4;
    drawMetricCard(pdf, margin, y, cardWidth, "Subjects", subjects.length, "active lanes");
    drawMetricCard(pdf, margin + (cardWidth + gap), y, cardWidth, "Tasks", metrics.totalTasks, "scheduled");
    drawMetricCard(pdf, margin + (cardWidth + gap) * 2, y, cardWidth, "Done", metrics.completedTasks, `${metrics.completionRate}% complete`);
    drawMetricCard(pdf, margin + (cardWidth + gap) * 3, y, cardWidth, "Left", metrics.remainingTasks, "remaining");
    y += 34;

    const panelGap = 8;
    const panelWidth = (contentWidth - panelGap) / 2;
    drawPanel(margin, y, panelWidth, 40);
    drawPanel(margin + panelWidth + panelGap, y, panelWidth, 40);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    setTextColor(pdf, PDF_COLORS.ink);
    pdf.text("Study rhythm", margin + 6, y + 10);
    pdf.text("Quiz and resources", margin + panelWidth + panelGap + 6, y + 10);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.8);
    setTextColor(pdf, PDF_COLORS.muted);
    addWrappedText(pdf, `${strongestSignal} Morning completed: ${metrics.morningCompleted}. Evening completed: ${metrics.eveningCompleted}.`, margin + 6, y + 18, panelWidth - 12, { lineHeight: 5 });
    addWrappedText(pdf, `${attempts.length ? `${averageQuiz}% quiz average across ${attempts.length} attempts.` : "No quiz attempts yet."} ${materialBookmarks.length} saved material bookmarks.`, margin + panelWidth + panelGap + 6, y + 18, panelWidth - 12, { lineHeight: 5 });
    y += 52;

    const watchRows = subjectWatchlist.length || 1;
    const watchHeight = Math.max(34, watchRows * 10 + 16);
    sectionTitle("Watchlist", "Subjects needing attention", watchHeight + 10);
    drawPanel(margin, y, contentWidth, watchHeight);
    pdf.setFontSize(9.2);

    if (subjectWatchlist.length) {
      subjectWatchlist.forEach(([subject, stats], index) => {
        const rowY = y + 12 + index * 10;
        pdf.setFont("helvetica", "bold");
        setTextColor(pdf, PDF_COLORS.ink);
        pdf.text(`${index + 1}. ${fitText(subject, 96)}`, margin + 7, rowY);
        pdf.setFont("helvetica", "normal");
        setTextColor(pdf, PDF_COLORS.muted);
        pdf.text(`${stats.done}/${stats.total} complete - ${stats.pending} pending`, pageWidth - margin - 7, rowY, { align: "right" });
      });
    } else {
      pdf.setFont("helvetica", "normal");
      setTextColor(pdf, PDF_COLORS.muted);
      pdf.text("Generate a study schedule to unlock subject-level watchlists.", margin + 7, y + 14);
    }
    y += watchHeight + 12;

    const actionHeight = 60;
    sectionTitle("Action plan", "Next best recovery steps", actionHeight + 10);
    drawPanel(margin, y, contentWidth, actionHeight);
    pdf.setFontSize(9.2);
    reportActions.forEach((action, index) => {
      const itemY = y + 12 + index * 11;
      setFillColor(pdf, PDF_COLORS.accentSoft);
      pdf.circle(margin + 8, itemY - 2.7, 3.2, "F");
      pdf.setFont("helvetica", "bold");
      setTextColor(pdf, PDF_COLORS.accent);
      pdf.text(String(index + 1), margin + 8, itemY - 1.3, { align: "center" });
      pdf.setFont("helvetica", "normal");
      setTextColor(pdf, PDF_COLORS.ink);
      addWrappedText(pdf, action, margin + 17, itemY, contentWidth - 25, { lineHeight: 4.7 });
    });
    y += actionHeight + 12;

    if (attempts.length) {
      const attemptCount = Math.min(attempts.length, 4);
      const attemptHeight = attemptCount * 10 + 16;
      sectionTitle("Quiz history", "Latest topic checks", attemptHeight + 10);
      drawPanel(margin, y, contentWidth, attemptHeight);
      attempts.slice(0, 4).forEach((attempt, index) => {
        const rowY = y + 12 + index * 10;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9.2);
        setTextColor(pdf, PDF_COLORS.ink);
        pdf.text(fitText(attempt.topic || "Topic quiz", 62), margin + 7, rowY);
        pdf.setFont("helvetica", "normal");
        setTextColor(pdf, PDF_COLORS.muted);
        pdf.text(fitText(attempt.subjectName || "Subject", 62), margin + 78, rowY);
        pdf.setFont("helvetica", "bold");
        setTextColor(pdf, PDF_COLORS.accent);
        pdf.text(`${attempt.score}/${attempt.total}`, pageWidth - margin - 7, rowY, { align: "right" });
      });
      y += attemptHeight + 12;
    }

    const totalPages = pdf.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      pdf.setPage(page);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      setTextColor(pdf, PDF_COLORS.muted);
      pdf.text("PrepMatrix report", margin, pageHeight - 8);
      pdf.text(`Page ${page} of ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: "right" });
    }

    pdf.save(`PrepMatrix_Report_${safeName}_${generatedAt.toISOString().slice(0, 10)}.pdf`);
  };
  return (
    <section className="page-stack report-page">
      <div className="section-intro report-intro-row">
        <div>
          <span className="section-tag">Overall report</span>
          <h2>Your planner intelligence report</h2>
        </div>
        <button className="secondary-btn report-export-btn" onClick={exportReportPDF} type="button">
          Export report PDF
        </button>
      </div>

      <div className="report-hero-row">
        <section className="card report-hero-card">
          <span className="section-tag" style={{ marginBottom: "8px" }}>Learner profile</span>
          <h3 style={{ fontSize: "1.75rem", fontWeight: "700", margin: "4px 0" }}>{userProfile?.username}</h3>
          <p className="card-subtext" style={{ margin: "0 0 10px 0", fontSize: "0.95rem" }}>
            {userProfile?.institutionName || "Institution not set"}
          </p>
          <div style={{ fontSize: "0.88rem", color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: "4px", width: "100%" }}>
            <span><strong>Education Level:</strong> {userProfile?.academicLevel || "Not set"}</span>
            {userProfile?.degree && (
              <span><strong>Degree / Major:</strong> {userProfile.degree}</span>
            )}
            {userProfile?.grade && (
              <span><strong>Grade / Class:</strong> {userProfile.grade}</span>
            )}
            {userProfile?.academicTrack && userProfile.academicTrack !== "General" && (
              <span><strong>Track / Board:</strong> {userProfile.academicTrack}</span>
            )}
          </div>
        </section>

        <section className="card report-readiness-card">
          <span className="section-tag" style={{ marginBottom: "14px" }}>Exam Readiness</span>
          <div className="report-score-ring" style={{ "--report-progress": `${Math.min(Math.max(metrics.completionRate, 0), 100)}%` }}>
            <strong>{metrics.completionRate}%</strong>
          </div>
        </section>
      </div>

      <div className="report-grid">
        <article className="card report-panel">
          <span className="section-tag">Planner report</span>
          <h3>{riskLevel}</h3>
          <div className="report-stat-grid">
            <div><strong>{subjects.length}</strong><span>Subjects</span></div>
            <div><strong>{metrics.totalTasks}</strong><span>Tasks</span></div>
            <div><strong>{metrics.completedTasks}</strong><span>Done</span></div>
            <div><strong>{metrics.remainingTasks}</strong><span>Left</span></div>
          </div>
        </article>

        <article className="card report-panel">
          <span className="section-tag">Quiz report</span>
          <h3>{attempts.length ? `${averageQuiz}% average` : "No attempts yet"}</h3>
          <p className="card-subtext">
            {attempts.length
              ? `${attempts.length} quiz attempts are stored for this profile.`
              : "Use the Quiz route to create topic-level checks for your class or department."}
          </p>
        </article>

        <article className="card report-panel">
          <span className="section-tag">Study rhythm</span>
          <h3>{strongestSignal}</h3>
          <p className="card-subtext">
            Morning completed: {metrics.morningCompleted}. Evening completed: {metrics.eveningCompleted}.
          </p>
        </article>

        <article className="card report-panel">
          <span className="section-tag">Resource bank</span>
          <h3>{materialBookmarks.length} bookmarks</h3>
          <p className="card-subtext">
            Saved materials become your personal revision library across subjects.
          </p>
        </article>
      </div>

      <section className="card report-action-card">
        <span className="section-tag">Next best actions</span>
        <h3>Recommended recovery path</h3>
        <div className="report-action-grid">
          {reportActions.map((action, index) => (
            <article key={action}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{action}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

export default ReportPage;

