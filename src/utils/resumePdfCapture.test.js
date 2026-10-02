import test from "node:test";
import assert from "node:assert/strict";
import { createResumePdfFromElement } from "./resumePdf.js";

const PAPER_WIDTH = 500;
const PAPER_HEIGHT = PAPER_WIDTH * 297 / 210;
const ONE_PIXEL_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const DRAFT = {
  personal: { fullName: "Avery Sharma", headline: "Software engineer", email: "avery@example.com" },
  skills: ["React", "JavaScript"],
  tools: ["Git", "VS Code"],
};

function styleDeclaration(initial = {}) {
  const values = new Map(Object.entries(initial));
  const priorities = new Map();
  const cssName = (name) => name.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
  return new Proxy({
    getPropertyValue: (name) => values.get(name) ?? "",
    getPropertyPriority: (name) => priorities.get(name) ?? "",
    setProperty: (name, value, priority = "") => {
      values.set(name, String(value));
      priorities.set(name, priority);
    },
  }, {
    get: (target, name) => name in target || typeof name !== "string" ? target[name] : values.get(cssName(name)) ?? "",
    set: (_target, name, value) => {
      values.set(cssName(name), String(value));
      priorities.delete(cssName(name));
      return true;
    },
  });
}

function makePaperTree({ cloned = false } = {}) {
  const html = { style: styleDeclaration({ zoom: "1", transform: "none" }), parentElement: null };
  const body = { style: styleDeclaration({ zoom: "0.9", transform: "none" }), parentElement: html };
  const root = { style: styleDeclaration({ transform: "translateY(8px)" }), parentElement: body };
  const surface = {
    className: "resume-pdf-export-surface",
    style: styleDeclaration({ position: "fixed", left: "-12000px", top: "0px", width: "500px" }),
    parentElement: root,
  };
  const attributes = new Map();
  const fit = {
    style: styleDeclaration({ transform: "scale(0.8)", width: "125%", "transform-origin": "left top" }),
    computedStyle: { fontFamily: "Georgia, serif", fontStyle: "normal", fontWeight: "700", fontSize: "24px" },
    parentElement: null,
  };
  const anchor = {
    href: "mailto:avery@example.com",
    computedStyle: { fontFamily: "Inter, sans-serif", fontStyle: "normal", fontWeight: "400", fontSize: "8px" },
    getClientRects: () => [{ left: 145, top: 95, right: 235, bottom: 104, width: 90, height: 9 }],
  };
  const paper = {
    attributes,
    scrollWidth: 494,
    scrollHeight: 707,
    offsetWidth: PAPER_WIDTH,
    offsetHeight: 707,
    clientWidth: 494,
    clientHeight: 707,
    computedStyle: {
      width: `${PAPER_WIDTH}px`,
      height: `${PAPER_HEIGHT}px`,
      boxSizing: "border-box",
      fontFamily: "Inter, sans-serif",
      borderLeftWidth: "6px",
      borderRightWidth: "0px",
      borderTopWidth: "0px",
      borderBottomWidth: "0px",
      paddingLeft: "0px",
      paddingRight: "0px",
      paddingTop: "0px",
      paddingBottom: "0px",
    },
    style: styleDeclaration({ width: "500px", "--resume-fit-scale": "0.8", "--resume-fit-width": "125%" }),
    parentElement: surface,
    children: [fit],
    getBoundingClientRect: () => ({ left: 100, top: 50, right: 550, bottom: 50 + PAPER_HEIGHT * 0.9, width: 450, height: PAPER_HEIGHT * 0.9 }),
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
    closest: (selector) => selector === ".resume-pdf-export-surface" ? surface : null,
    querySelectorAll: (selector) => selector === "*" ? [fit, anchor] : cloned ? [] : [anchor],
  };
  fit.parentElement = paper;
  return { paper, fit, surface, ancestors: [surface, root, body, html], body };
}

function installDocument(t, source, clone) {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const previousComputedStyle = Object.getOwnPropertyDescriptor(globalThis, "getComputedStyle");
  const getStyle = (node) => node.computedStyle || node.style;
  const document = {
    documentElement: { clientWidth: 1400, clientHeight: 900 },
    fonts: { ready: Promise.resolve(), load: async () => [] },
    defaultView: { getComputedStyle: getStyle },
  };
  source.paper.ownerDocument = document;
  const clonedDocument = {
    documentElement: clone.ancestors.at(-1),
    body: clone.body,
    defaultView: { getComputedStyle: getStyle },
    querySelector: (selector) => {
      assert.match(selector, /^\[data-resume-pdf-capture="resume-/u);
      return clone.paper;
    },
  };
  clone.paper.ownerDocument = clonedDocument;
  Object.defineProperty(globalThis, "document", { configurable: true, value: document });
  Object.defineProperty(globalThis, "getComputedStyle", { configurable: true, value: getStyle });
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else delete globalThis.document;
    if (previousComputedStyle) Object.defineProperty(globalThis, "getComputedStyle", previousComputedStyle);
    else delete globalThis.getComputedStyle;
  });
  return clonedDocument;
}

const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} should equal ${expected}`);

test("captures the unzoomed border-box paper and preserves the preview's inner fit", async (t) => {
  const source = makePaperTree();
  const clone = makePaperTree({ cloned: true });
  const clonedDocument = installDocument(t, source, clone);
  let captureOptions;
  const pdf = await createResumePdfFromElement(source.paper, DRAFT, { template: "modern" }, {
    renderElement: async (element, options) => {
      assert.equal(element, source.paper);
      captureOptions = options;
      await options.onclone(clonedDocument);
      return { toDataURL: () => ONE_PIXEL_PNG };
    },
  });

  assert.equal(captureOptions.width, PAPER_WIDTH);
  closeTo(captureOptions.height, PAPER_HEIGHT);
  assert.equal(captureOptions.scale, 4);
  assert.equal(pdf.__resumeLayout.sourceWidth, PAPER_WIDTH);
  closeTo(pdf.__resumeLayout.sourceHeight, PAPER_HEIGHT);
  closeTo(parseFloat(clone.paper.style.width), PAPER_WIDTH);
  closeTo(parseFloat(clone.paper.style.height), PAPER_HEIGHT);
  assert.equal(clone.paper.style.boxSizing, "border-box");
  for (const ancestor of clone.ancestors) {
    assert.equal(ancestor.style.getPropertyValue("zoom"), "1");
    assert.equal(ancestor.style.getPropertyPriority("zoom"), "important");
    assert.equal(ancestor.style.getPropertyValue("transform"), "none");
    assert.equal(ancestor.style.getPropertyPriority("transform"), "important");
  }
  assert.equal(clone.fit.style.transform, "scale(0.8)");
  assert.equal(clone.fit.style.width, "125%");
  assert.equal(clone.paper.style.getPropertyValue("--resume-fit-scale"), "0.8");
  assert.equal(clone.paper.style.getPropertyValue("--resume-fit-width"), "125%");
  assert.equal(source.body.style.zoom, "0.9");
  assert.equal(source.ancestors[1].style.transform, "translateY(8px)");
  assert.equal(source.surface.style.left, "-12000px");
  assert.equal(source.fit.style.transform, "scale(0.8)");
  assert.equal(source.paper.attributes.size, 0);
  assert.equal(pdf.getNumberOfPages(), 1);

  // Link bounds come from the actual zoomed live preview, independent of the
  // CSS pixel dimensions used to capture its clone.
  const annotation = pdf.internal.getCurrentPageInfo().pageContext.annotations.find((item) => item.options.url === "mailto:avery@example.com");
  assert.ok(annotation);
  closeTo(Number(annotation.finalBounds.x), Number(pdf.internal.getCoordinateString(21)));
  closeTo(Number(annotation.finalBounds.y), Number(pdf.internal.getVerticalCoordinateString(21)));
  closeTo(Number(annotation.finalBounds.w), Number(pdf.internal.getCoordinateString(63)));
  closeTo(Number(annotation.finalBounds.h), Number(pdf.internal.getVerticalCoordinateString(25.2)));
});

test("restores an existing capture attribute when rendering fails", async (t) => {
  const source = makePaperTree();
  const clone = makePaperTree({ cloned: true });
  const clonedDocument = installDocument(t, source, clone);
  source.paper.setAttribute("data-resume-pdf-capture", "existing-capture");
  await assert.rejects(createResumePdfFromElement(source.paper, DRAFT, {}, {
    renderElement: async (_element, options) => {
      await options.onclone(clonedDocument);
      throw new Error("capture failed");
    },
  }), /capture failed/u);
  assert.equal(source.paper.getAttribute("data-resume-pdf-capture"), "existing-capture");
  assert.equal(source.body.style.zoom, "0.9");
  assert.equal(source.surface.style.left, "-12000px");
});

test("removes a temporary capture attribute when rendering fails", async (t) => {
  const source = makePaperTree();
  const clone = makePaperTree({ cloned: true });
  installDocument(t, source, clone);
  await assert.rejects(createResumePdfFromElement(source.paper, DRAFT, {}, {
    renderElement: async () => { throw new Error("capture failed"); },
  }), /capture failed/u);
  assert.equal(source.paper.getAttribute("data-resume-pdf-capture"), null);
  assert.equal(source.paper.attributes.size, 0);
});

test("waits for the header's distinct font before capturing the preview", async (t) => {
  const source = makePaperTree();
  const clone = makePaperTree({ cloned: true });
  const clonedDocument = installDocument(t, source, clone);
  const requestedFonts = [];
  let headerFontReady = false;
  source.paper.ownerDocument.fonts.load = async (font) => {
    requestedFonts.push(font);
    if (font === "normal 700 24px Georgia, serif") {
      await new Promise((resolve) => setTimeout(resolve, 15));
      headerFontReady = true;
    }
    return [];
  };
  await createResumePdfFromElement(source.paper, DRAFT, {}, {
    renderElement: async (_element, options) => {
      assert.equal(headerFontReady, true);
      await options.onclone(clonedDocument);
      return { toDataURL: () => ONE_PIXEL_PNG };
    },
  });
  assert.ok(requestedFonts.includes("normal 700 24px Georgia, serif"));
  assert.ok(requestedFonts.includes("normal 400 8px Inter, sans-serif"));
});
