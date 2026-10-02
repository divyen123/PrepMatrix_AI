import { getFontEmbedCSS, toSvg } from "html-to-image";

const FONT_ERROR = "The resume fonts could not be prepared. Please retry when the fonts have loaded. No generation was used.";
const normalizeFamily = (family) => family.replaceAll(/["']/g, "").trim().toLowerCase();

async function embeddedFonts(element, usedFamilies) {
  const fonts = element.ownerDocument.fonts;
  if (fonts?.ready) await fonts.ready;
  // Keep every source format: filtering formats in html-to-image drops some
  // font-face sources, which silently substitutes weights during export.
  const css = await getFontEmbedCSS(element);
  if (fonts?.ready) await fonts.ready;
  // An SVG image cannot access the page's downloaded web fonts. Do not silently
  // export a fallback font if embedding failed; it changes line breaks.
  const embeddedFamilies = new Set(Array.from(css.matchAll(/font-family\s*:\s*([^;}]+)/gi), (match) => normalizeFamily(match[1])));
  for (const face of fonts || []) {
    const family = normalizeFamily(face.family);
    if (usedFamilies.has(family) && (face.status === "error"
      || (face.status === "loaded" && !embeddedFamilies.has(family)))) {
      throw new Error(FONT_ERROR);
    }
  }
  const sources = Array.from(css.matchAll(/url\(\s*["']?([^"')]*?)["']?\s*\)/gi), (match) => match[1]);
  const missingSource = Array.from(css.matchAll(/@font-face\s*\{([^}]*)\}/gi))
    .some((match) => !/src\s*:[^;}]*url\(/i.test(match[1]));
  if (missingSource || sources.some((source) => !/^data:[^,]+;base64,.+/i.test(source))) {
    throw new Error(FONT_ERROR);
  }
  return css;
}

export async function createResumeSvg(element, { width, height } = {}) {
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  let zoom = 1;
  // Preserve the app's zoom during text layout; removing it changes browser
  // subpixel shaping. The SVG viewBox maps it back to the full-size A4 image.
  for (let node = element; node; node = node.parentElement) {
    const value = Number.parseFloat(view.getComputedStyle(node).zoom);
    if (value > 0) zoom *= value;
  }
  const marker = `data-resume-font-${Math.random().toString(36).slice(2)}`;
  const nodes = [element, ...element.querySelectorAll("*")];
  const sizes = [];
  const usedFamilies = new Set();
  nodes.forEach((node, index) => {
    const style = view.getComputedStyle(node);
    sizes.push(style.fontSize);
    style.fontFamily.split(",").forEach((family) => usedFamilies.add(normalizeFamily(family)));
    node.setAttribute(marker, String(index));
  });

  let svgUrl;
  try {
    const fontEmbedCSS = await embeddedFonts(element, usedFamilies);
    svgUrl = await toSvg(element, {
      width: width * zoom, height: height * zoom, fontEmbedCSS,
      backgroundColor: "#ffffff",
      style: {
        width: `${width}px`, height: `${height}px`,
        minWidth: `${width}px`, maxWidth: `${width}px`,
        minHeight: `${height}px`, maxHeight: `${height}px`,
        boxSizing: "border-box", margin: "0", zoom: String(zoom),
        transform: "none", boxShadow: "none", animation: "none", transition: "none",
      },
    });
  } finally {
    nodes.forEach((node) => node.removeAttribute(marker));
  }

  const svg = new view.DOMParser().parseFromString(decodeURIComponent(svgUrl.split(",").slice(1).join(",")), "image/svg+xml");
  if (svg.querySelector("parsererror")) throw new Error("The resume preview could not be captured. No generation was used.");
  // html-to-image rounds computed font sizes. Restore their exact fractional
  // values before the browser lays out the SVG, including small contact text.
  for (const node of svg.querySelectorAll(`[${marker}]`)) {
    node.style.setProperty("font-size", sizes[Number(node.getAttribute(marker))], "important");
    node.removeAttribute(marker);
  }
  return new view.XMLSerializer().serializeToString(svg);
}

export async function captureResumeCanvas(element, { width, height, scale = 4 } = {}) {
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  const svg = new view.DOMParser().parseFromString(await createResumeSvg(element, { width, height }), "image/svg+xml");
  svg.documentElement.setAttribute("width", String(Math.round(width * scale)));
  svg.documentElement.setAttribute("height", String(Math.round(height * scale)));
  const serialized = new view.XMLSerializer().serializeToString(svg);
  const image = new view.Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
  await image.decode();
  await new Promise((resolve) => view.requestAnimationFrame(() => view.requestAnimationFrame(resolve)));
  const canvas = doc.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the resume image. No generation was used.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}
