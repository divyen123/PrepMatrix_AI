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
  assert.match(analyticsPageSource, /<ReportModal/u);
});

test("ReportModal popup is 100% opaque and styled across all background themes", () => {
  assert.match(reportModalCss, /\.report-modal\s*\{[\s\S]*?background:\s*#ffffff !important;/u);
  assert.match(reportModalCss, /\.report-modal\s*\{[\s\S]*?opacity:\s*1 !important;/u);
  assert.match(reportModalCss, /\.report-modal\s*\{[\s\S]*?backdrop-filter:\s*none !important;/u);
  assert.match(reportModalCss, /body\.dark \.report-modal\s*\{[\s\S]*?background:\s*#121c26 !important;/u);
  assert.match(reportModalCss, /body\.has-bg-image:not\(\.dark\) \.report-modal\s*\{[\s\S]*?background:\s*#ffffff !important;/u);
  assert.match(reportModalCss, /body\.has-bg-image\.dark \.report-modal\s*\{[\s\S]*?background:\s*#111a24 !important;/u);
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
