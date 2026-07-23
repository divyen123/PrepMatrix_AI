import assert from "node:assert/strict";
import test from "node:test";
import { createResumePdf, getResumePdfFilename, getResumePdfMetrics } from "./resumePdf.js";

const fixture = {
  personal: {
    fullName: "Avery Sharma",
    headline: "Software engineer",
    email: "avery@example.com",
    phone: "",
    github: "",
    linkedin: "",
  },
  summary: "Engineer focused on accessible and reliable learning products.",
  skills: ["React", "Node.js", "Product thinking"],
  education: [
    {
      institution: "PrepMatrix Institute",
      degree: "Bachelor of Technology",
      field: "Information Technology",
      startDate: "2022",
      endDate: "2026",
    },
  ],
  projects: [
    {
      name: "Adaptive study planner",
      technologies: "React, Node.js",
      highlights: ["Designed a responsive planning workflow.", "Improved weekly completion rates."],
    },
  ],
};

test("creates an extractable resume without empty optional contact separators", () => {
  const pdf = createResumePdf(fixture, { template: "classic" });
  const stream = pdf.internal.pages.flat().join(" ");
  assert.match(stream, /Avery Sharma/);
  assert.match(stream, /Software engineer/);
  assert.match(stream, /Education/i);
  assert.doesNotMatch(stream, /undefined|NaN/);
  assert.equal(pdf.getNumberOfPages(), 1);
});

test("sanitizes the generated filename", () => {
  assert.equal(getResumePdfFilename(fixture), "Avery-Sharma-resume.pdf");
});

test("keeps template alignment and layout scales distinct", () => {
  const compact = getResumePdfMetrics({ template: "compact", typography: "compact", density: "compact" });
  const balanced = getResumePdfMetrics({ template: "compact", typography: "balanced", density: "balanced" });
  const largeAiry = getResumePdfMetrics({ template: "compact", typography: "large", density: "airy" });
  const classic = getResumePdfMetrics({ template: "classic" });

  assert.equal(compact.headerAlignment, "left");
  assert.equal(classic.headerAlignment, "center");
  assert.ok(compact.bodyLineHeight < balanced.bodyLineHeight);
  assert.ok(balanced.bodyLineHeight < largeAiry.bodyLineHeight);
  assert.ok(compact.sectionGap < balanced.sectionGap);
  assert.ok(balanced.sectionGap < largeAiry.sectionGap);
});

test("keeps wrapped modern header contact details in the exported document", () => {
  const pdf = createResumePdf(
    {
      ...fixture,
      personal: {
        ...fixture.personal,
        location: "Chennai, Tamil Nadu",
        phone: "+91 98408 01856",
        linkedin: "https://linkedin.com/in/avery-sharma",
        github: "https://github.com/avery-sharma",
        portfolio: "https://avery-portfolio.example",
      },
    },
    { template: "modern", typography: "large", density: "airy" }
  );
  const stream = pdf.internal.pages.flat().join(" ");
  assert.match(stream, /avery-portfolio\.example/);
});

test("paginates long content", () => {
  const longFixture = {
    ...fixture,
    experience: Array.from({ length: 14 }, (_, index) => ({
      role: `Engineering role ${index + 1}`,
      organization: "Example organization",
      startDate: "2024",
      endDate: "2026",
      highlights: Array.from(
        { length: 5 },
        () => "Built a reliable product workflow with measurable outcomes for students and educators."
      ),
    })),
  };
  const pdf = createResumePdf(longFixture, { template: "modern", density: "airy" });
  const stream = pdf.internal.pages.flat().join(" ");
  assert.ok(pdf.getNumberOfPages() > 1);
  assert.match(stream, /Engineering role 12/);
});
