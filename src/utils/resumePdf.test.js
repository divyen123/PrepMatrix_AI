import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { RESUME_TEMPLATES } from "./resumeBuilder.js";
import {
  createResumePdf,
  createResumePdfFromElement,
  getResumePdfFilename,
  getResumePdfMetrics,
} from "./resumePdf.js";

const pdfSource = readFileSync(new URL("./resumePdf.js", import.meta.url), "utf8");

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

const fullStudentResumeFixture = {
  ...screenshotFixture,
  personal: {
    ...screenshotFixture.personal,
    linkedin: "www.linkedin.com/in-r-m-663b49534a",
    portfolio: "divyen-portfolio-website.vercel.app",
  },
  projects: [
    ...screenshotFixture.projects,
    {
      name: "PrepMatrix AI",
      role: "Full-Stack Developer",
      technologies: "React, node.js, Express.js, Groq API, Gemini API",
      endDate: "May 2026",
      link: "github.com/divyen123/PrepMatrix_AI",
      highlights: [
        "Built an intelligent study planner that auto-generates personalized timetables, tracks chapter-wise progress, and adapts learning strategies using AI-driven smart suggestions and voice assistance.",
      ],
    },
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
  const previewPxToMm = 210 / 500;
  assertClose(compact.bodyTop, 12 * previewPxToMm);
  assertClose(balanced.bodyTop, 17 * previewPxToMm);
  assertClose(largeAiry.bodyTop, 23 * previewPxToMm);
  assertClose(compact.sectionGap, 10 * previewPxToMm);
  assertClose(balanced.sectionGap, 14 * previewPxToMm);
  assertClose(largeAiry.sectionGap, 19 * previewPxToMm);
  assertClose(compact.entryGap, 6 * previewPxToMm);
  assertClose(balanced.entryGap, 9 * previewPxToMm);
  assertClose(largeAiry.entryGap, 12 * previewPxToMm);
});

test("exports every resume template with its own rendering treatment", () => {
  const streams = RESUME_TEMPLATES.map(({ id }) => {
    const pdf = createResumePdf(fixture, { template: id });
    const stream = pdf.internal.pages.flat().join(" ");

    assert.equal(pdf.__resumeLayout.metrics.template, id);
    assert.equal(pdf.getNumberOfPages(), 1);
    assert.doesNotMatch(stream, /undefined|NaN/u);
    return stream;
  });

  assert.equal(new Set(streams).size, RESUME_TEMPLATES.length);
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
  [compact, balancedCompact, balanced, largeAiry].forEach((result) => {
    assert.ok(result.contentBottom > 0);
    assert.ok(result.contentBottom <= 297 - result.metrics.bottomMargin);
    assert.ok(result.renderScale >= 0.55 && result.renderScale <= 1);
  });
  assert.ok(compact.contentBottom < balancedCompact.contentBottom);
  assert.ok(balancedCompact.contentBottom <= balanced.contentBottom);
  assert.equal(balanced.sectionCount, 5);
});

test("fits a representative two-project student resume onto one A4 page", () => {
  const pdf = createResumePdf(fullStudentResumeFixture, {
    template: "compact",
    typography: "balanced",
    density: "balanced",
  });

  assert.equal(pdf.getNumberOfPages(), 1);
  assert.equal(pdf.__resumeLayout.pageCount, 1);
  assert.ok(pdf.__resumeLayout.renderScale >= 0.55 && pdf.__resumeLayout.renderScale <= 1);
  assert.ok(
    pdf.__resumeLayout.contentBottom <=
      297 - pdf.__resumeLayout.metrics.bottomMargin
  );
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

test("captures the fitted preview as a searchable one-page A4 PDF without a footer", async () => {
  const attributes = new Map();
  const element = {
    scrollWidth: 500,
    scrollHeight: 707,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 500, bottom: 707, width: 500, height: 707 }),
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
    querySelectorAll: () => [{
      href: "mailto:avery@example.com",
      getClientRects: () => [{ left: 20, top: 30, right: 140, bottom: 42, width: 120, height: 12 }],
    }],
  };
  let captureOptions;
  const onePixelPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const pdf = await createResumePdfFromElement(element, fixture, {
    template: "executive",
    fontFamily: "lora",
  }, {
    renderElement: async (_element, options) => {
      captureOptions = options;
      return { toDataURL: () => onePixelPng };
    },
  });

  assert.equal(pdf.getNumberOfPages(), 1);
  assert.equal(pdf.__resumeLayout.renderMode, "preview-capture");
  assert.equal(pdf.__resumeLayout.sourceWidth, 500);
  assert.equal(pdf.__resumeLayout.metrics.fontFamily, "lora");
  assert.equal(captureOptions.scale, 4);
  assert.equal(captureOptions.backgroundColor, "#ffffff");
  assert.equal(attributes.size, 0);
  assert.match(pdf.internal.pages.flat().join(" "), /Avery Sharma/u);
  assert.match(pdf.output(), /mailto:avery@example\.com/u);
  assert.doesNotMatch(pdfSource, /addFooter/u);
});
