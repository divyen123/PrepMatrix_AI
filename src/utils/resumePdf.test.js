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

const screenshotFixture = {
  personal: {
    fullName: "Divyen R M",
    headline: "Information technology",
    location: "Chennai, Tamil Nadu",
    email: "divyen624@gmail.com",
    phone: "9840801856",
    github: "github.com/divyen123",
  },
  summary:
    "Aspiring Frontend Developer specializing in React.js and modern web technologies, passionate about creating responsive, user-friendly, and engaging web applications. Skilled in building interactive interfaces, optimizing performance, and delivering smooth digital experiences. Committed to continuous learning.",
  skills: ["Frontend developer", "UI Designer", "React developer"],
  projects: [
    {
      name: "MedAI Symptom analyser",
      role: "Full-Stack developer",
      technologies: "React.js, Node.js, Express.js, Groq API.",
      endDate: "May 2026",
      highlights: [
        "Developed a full-stack AI health assistant web app with symptom analysis, vitals tracking, medication management, and an AI doctor chatbot.",
      ],
    },
  ],
  education: [
    {
      degree: "B.Tech",
      field: "IT",
      institution: "R.M.K Engineering college",
      location: "Kavaraipettai, Thiruvallur",
      score: "7.87/10",
      startDate: "2024",
      endDate: "2028",
    },
    {
      degree: "Higher studies",
      field: "CBSE",
      institution: "Maharishi vidya mandir",
      location: "Chetpet, Chennai",
      score: "A",
      startDate: "2010",
      endDate: "2024",
    },
  ],
  certifications: [
    { name: "AI Agentic foundation", issuer: "Oracle", date: "03/08/2025" },
    { name: "Python Foundation certification", issuer: "Infosys", date: "23/08/2025" },
  ],
};

const assertClose = (actual, expected, tolerance = 0.001) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
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
  assertClose(compact.bodyTop, 7);
  assertClose(balanced.bodyTop, 9.916667);
  assertClose(largeAiry.bodyTop, 13.416667);
  assertClose(compact.sectionGap, 5.833333);
  assertClose(balanced.sectionGap, 8.166667);
  assertClose(largeAiry.sectionGap, 11.083333);
  assertClose(compact.entryGap, 3.5);
  assertClose(balanced.entryGap, 5.25);
  assertClose(largeAiry.entryGap, 7);
});

test("fills a representative page like the responsive editor preview", () => {
  const compact = createResumePdf(screenshotFixture, {
    template: "compact",
    typography: "compact",
    density: "compact",
  }).__resumeLayout;
  const balancedCompact = createResumePdf(screenshotFixture, {
    template: "compact",
    typography: "balanced",
    density: "compact",
  }).__resumeLayout;
  const balanced = createResumePdf(screenshotFixture, {
    template: "compact",
    typography: "balanced",
    density: "balanced",
  }).__resumeLayout;
  const largeAiry = createResumePdf(screenshotFixture, {
    template: "compact",
    typography: "large",
    density: "airy",
  }).__resumeLayout;

  assert.equal(compact.pageCount, 1);
  assert.equal(balancedCompact.pageCount, 1);
  assert.equal(balanced.pageCount, 1);
  assert.equal(largeAiry.pageCount, 1);
  assert.ok(compact.contentBottom >= 260 && compact.contentBottom <= 267);
  assert.ok(
    balancedCompact.contentBottom >= 274 &&
      balancedCompact.contentBottom <= 279
  );
  assert.ok(balanced.contentBottom >= 278 && balanced.contentBottom <= 280);
  assert.ok(largeAiry.contentBottom >= 278 && largeAiry.contentBottom <= 280);
  assert.equal(compact.renderScale, 1);
  assert.equal(balancedCompact.renderScale, 1);
  assert.ok(balanced.renderScale < 1);
  assert.ok(largeAiry.renderScale < 1);
  assert.equal(balanced.sectionCount, 5);
});

test("does not stretch a sparse resume", () => {
  const pdf = createResumePdf(
    {
      personal: fixture.personal,
      summary: fixture.summary,
    },
    { template: "compact", typography: "large", density: "airy" }
  );

  assert.equal(pdf.__resumeLayout.pageCount, 1);
  assert.equal(pdf.__resumeLayout.renderScale, 1);
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
  assert.equal(pdf.__resumeLayout.renderScale, 1);
  assert.match(stream, /Engineering role 12/);
});
