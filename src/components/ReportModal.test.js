import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
const analyticsPageSource = readFileSync(
  new URL("../pages/AnalyticsPage.jsx", import.meta.url),
  "utf8",
);
const analyticsPageCss = readFileSync(
  new URL("../pages/AnalyticsPage.css", import.meta.url),
  "utf8",
);
const reportModalSource = readFileSync(
  new URL("./ReportModal.jsx", import.meta.url),
  "utf8",
);
const reportModalCss = readFileSync(
  new URL("./ReportModal.css", import.meta.url),
  "utf8",
);

test("removes the standalone Reports page from navigation and redirects /report to /analytics", () => {
  assert.doesNotMatch(appSource, /const ReportPage\s*=/u);
  assert.doesNotMatch(appSource, /\{ to:\s*"\/report",\s*label:\s*"Report"/u);
  assert.match(
    appSource,
    /<Route[\s\S]*?element=\{<Navigate replace to="\/analytics" \/>\}[\s\S]*?path="\/report"[\s\S]*?\/>/u,
  );
});

test("renders View report button opposite to the section title on AnalyticsPage", () => {
  assert.match(
    analyticsPageSource,
    /<div className="section-intro analytics-page-intro">[\s\S]*?<h2>Performance signals and study patterns<\/h2>[\s\S]*?<button[\s\S]*?className="secondary-btn view-report-btn"[\s\S]*?>[\s\S]*?View report/u,
  );
  assert.match(analyticsPageCss, /\.analytics-page-intro\s*\{[\s\S]*?justify-content:\s*space-between;/u);
  assert.match(analyticsPageCss, /\.view-report-btn\s*\{/u);
  assert.match(
    analyticsPageCss,
    /body \.view-report-btn:hover\s*\{[\s\S]*?box-shadow:\s*none !important;/u,
  );
  assert.match(
    analyticsPageCss,
    /body \.view-report-btn::after\s*\{[\s\S]*?content:\s*none !important;/u,
  );
  assert.match(analyticsPageSource, /<ReportModal/u);
});

test("Analytics buttons and its popup buttons do not gain an outer hover glow", () => {
  assert.match(analyticsPageCss, /body \.page-stack:has\(> \.analytics-page-intro\) button:hover/u);
  for (const popupClass of [
    "report-modal",
    "study-plan-preview-dialog",
    "subject-progress-modal",
    "subject-ai-dialog",
    "planner-history-dialog",
    "momentum-history-dialog",
  ]) {
    assert.match(analyticsPageCss, new RegExp(`\\.${popupClass}`));
  }
  assert.match(analyticsPageCss, /\) button:hover\s*\{\s*box-shadow:\s*none !important;/u);
  assert.match(analyticsPageCss, /body:has\(\.analytics-page-intro\) \.subject-progress-modal \.subject-action-btn:hover:not\(:disabled\)\s*\{\s*box-shadow:\s*none !important;/u);
});

test("ReportModal popup follows the selected canvas, accent, and wallpaper theme", () => {
  assert.match(reportModalCss, /--report-modal-surface:\s*var\(--bg\);/u);
  assert.match(reportModalCss, /--report-panel-surface:[^;]*var\(--accent\)/u);
  assert.match(reportModalCss, /--report-panel-border:[^;]*var\(--accent\)/u);
  assert.match(reportModalCss, /\.report-modal\s*\{[\s\S]*?background:\s*var\(--report-modal-surface\) !important;/u);
  assert.match(reportModalCss, /\.report-modal\s*\{[\s\S]*?color:\s*var\(--text\) !important;/u);
  assert.match(reportModalCss, /\.report-modal\s*\{[\s\S]*?box-shadow:\s*[\s\S]*?var\(--shadow\),/u);
  assert.match(reportModalCss, /\.report-modal\s*\{[\s\S]*?opacity:\s*1;/u);
  assert.match(reportModalCss, /\.report-modal\s*\{[\s\S]*?backdrop-filter:\s*none !important;/u);
  assert.match(
    reportModalCss,
    /body\.has-bg-image \.report-modal\s*\{[\s\S]*?--report-modal-surface:\s*rgb\(var\(--bg-surface-rgb\)\);/u,
  );
  assert.doesNotMatch(reportModalCss, /background:\s*#(?:ffffff|121c26|111a24) !important;/u);
});

test("ReportModal has a compact, softly red circular close action", () => {
  const closeRule = reportModalCss.match(/body \.report-modal \.report-modal-close\s*\{([^}]+)\}/u)?.[1];
  assert.ok(closeRule);
  assert.match(closeRule, /width:\s*32px !important;/u);
  assert.match(closeRule, /height:\s*32px !important;/u);
  assert.match(closeRule, /border-radius:\s*999px !important;/u);
  assert.match(closeRule, /background:\s*rgba\(239, 68, 68, 0\.08\) !important;/u);
  assert.match(closeRule, /border:\s*1px solid rgba\(239, 68, 68, 0\.2\) !important;/u);
  assert.match(reportModalSource, /className="report-modal-close"[\s\S]*?<X size=\{16\} \/>/u);
});

test("ReportModal includes minimal report content and PDF export capabilities", () => {
  assert.match(reportModalSource, /exportReportPDF/u);
  assert.match(reportModalSource, /jsPDF/u);
  assert.match(reportModalSource, /getPlannerMetrics/u);
  assert.match(reportModalSource, /Plan Completion/u);
  assert.match(reportModalSource, /Active Subjects/u);
  assert.match(reportModalSource, /Quiz Average/u);
  assert.match(reportModalSource, /Study Pattern/u);
  assert.match(reportModalSource, /Recommended Recovery/u);
  assert.match(reportModalSource, /Export report PDF/u);
});

test("ReportModal applies muted green, yellow, and red tones based on completion rate", () => {
  assert.match(reportModalSource, /function getProgressTone\(rate\)\s*\{/u);
  assert.match(reportModalSource, /if\s*\(rate\s*>=\s*70\)\s*return\s*"high"/u);
  assert.match(reportModalSource, /if\s*\(rate\s*>=\s*40\)\s*return\s*"mid"/u);
  assert.match(reportModalSource, /return\s*"low"/u);

  // Plan completion uses tone
  assert.match(reportModalSource, /report-progress-fill is-\$\{planTone\}/u);
  assert.match(reportModalSource, /report-progress-val is-\$\{planTone\}/u);

  // Subject progress uses tone
  assert.match(reportModalSource, /report-mini-fill is-\$\{subTone\}/u);
  assert.match(reportModalSource, /report-subject-stats is-\$\{subTone\}/u);

  // The subject and summary bars share muted, theme-aware status tones.
  assert.match(reportModalCss, /--report-tone-high:\s*color-mix\([^;]*#10b981 72%/u);
  assert.match(reportModalCss, /--report-tone-mid:\s*color-mix\([^;]*#f59e0b 72%/u);
  assert.match(reportModalCss, /--report-tone-low:\s*color-mix\([^;]*#ef4444 72%/u);
  assert.match(reportModalCss, /\.report-progress-fill\.is-high,\s*\.report-mini-fill\.is-high\s*\{\s*background:\s*var\(--report-tone-high\) !important;/u);
  assert.match(reportModalCss, /\.report-progress-fill\.is-mid,\s*\.report-mini-fill\.is-mid\s*\{\s*background:\s*var\(--report-tone-mid\) !important;/u);
  assert.match(reportModalCss, /\.report-progress-fill\.is-low,\s*\.report-mini-fill\.is-low\s*\{\s*background:\s*var\(--report-tone-low\) !important;/u);
  assert.match(reportModalCss, /body \.report-modal \.report-stat-grid \.report-stat-card\s*\{[\s\S]*?background:\s*var\(--report-panel-surface\);[\s\S]*?box-shadow:\s*none;/u);
});

test("Report footer actions inherit the shared theme-aware button system", () => {
  assert.match(reportModalSource, /className="secondary-btn report-footer-cancel-btn"/u);
  assert.match(reportModalSource, /className="action-btn report-export-pdf-btn"/u);
  assert.doesNotMatch(reportModalCss, /#(?:0b8f74|076b57|0ea5e9)/u);
  assert.doesNotMatch(reportModalCss, /\.report-export-pdf-btn:hover\s*\{/u);
});

test("ReportModal guides incomplete setup with the correct gated footer action", () => {
  assert.match(reportModalSource, /const needsSubjects = subjectCount === 0;/u);
  assert.match(reportModalSource, /const needsPlan = !metrics\.hasScheduledPlanner;/u);
  assert.match(reportModalSource, /Add subjects first, then generate a plan/u);
  assert.match(reportModalSource, /Your subjects are ready — generate a plan/u);
  assert.match(reportModalSource, /role="status"/u);
  assert.match(reportModalSource, /navigate\("\/subjects#add-subject"\)/u);
  assert.match(
    reportModalSource,
    /navigate\("\/planner\/schedule",\s*\{[\s\S]*?plannerShortcutAction:\s*"new"/u,
  );
  assert.match(
    reportModalSource,
    /\{needsSubjects \? \([\s\S]*?Add subjects[\s\S]*?: needsPlan \? \([\s\S]*?Generate plan/u,
  );
  assert.match(reportModalCss, /\.report-setup-notice\s*\{/u);
});

test("ReportModal body uses an accent-aware scoped scrollbar", () => {
  assert.match(
    reportModalCss,
    /\.report-modal-body\s*\{[\s\S]*?scrollbar-color:\s*rgba\(var\(--accent-rgb\), 0\.32\) transparent;/u,
  );
  assert.match(reportModalCss, /\.report-modal-body::-webkit-scrollbar-track\s*\{/u);
  assert.match(
    reportModalCss,
    /\.report-modal-body::-webkit-scrollbar-thumb\s*\{[\s\S]*?background:\s*rgba\(var\(--accent-rgb\), 0\.32\);/u,
  );
  assert.match(
    reportModalCss,
    /\.report-modal-body::-webkit-scrollbar-thumb:hover\s*\{[\s\S]*?background:\s*rgba\(var\(--accent-rgb\), 0\.48\);/u,
  );
});

test("ReportModal opens and closes with smooth fade-in and fade-out transitions", () => {
  // CSS enter and exit keyframes
  assert.match(reportModalCss, /animation:\s*reportModalFadeIn/u);
  assert.match(reportModalCss, /@keyframes\s*reportModalFadeIn/u);
  assert.match(reportModalCss, /\.report-modal-backdrop\.is-closing\s*\{[\s\S]*?animation:\s*reportModalFadeOut/u);
  assert.match(reportModalCss, /@keyframes\s*reportModalFadeOut/u);

  assert.match(reportModalCss, /animation:\s*reportModalSlideIn/u);
  assert.match(reportModalCss, /@keyframes\s*reportModalSlideIn/u);
  assert.match(reportModalCss, /\.report-modal-backdrop\.is-closing\s*\.report-modal[\s\S]*?animation:\s*reportModalSlideOut/u);
  assert.match(reportModalCss, /@keyframes\s*reportModalSlideOut/u);

  // Accessible reduced motion
  assert.match(reportModalCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.report-modal/u);

  // Component exit delay and class toggling
  assert.match(reportModalSource, /REPORT_MODAL_EXIT_DURATION_MS\s*=\s*200;/u);
  assert.match(reportModalSource, /const\s*\[isClosing,\s*setIsClosing\]\s*=\s*useState\(false\);/u);
  assert.match(reportModalSource, /report-modal-backdrop\$\{isClosing \? " is-closing" : ""\}/u);
  assert.match(reportModalSource, /report-modal\$\{isClosing \? " is-closing" : ""\}/u);
  assert.match(reportModalSource, /handleClose/u);
});
