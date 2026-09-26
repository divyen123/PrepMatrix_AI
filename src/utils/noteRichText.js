const MAX_RICH_TEXT_SEGMENTS = 2000;

export function sanitizeNoteLink(value) {
  if (typeof value !== "string") return "";

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return "";
    return url.href;
  } catch {
    return "";
  }
}

function sameFormatting(first, second) {
  return first.bold === second.bold
    && first.italic === second.italic
    && first.underline === second.underline
    && first.href === second.href;
}

function appendSegment(segments, candidate) {
  if (!candidate.text) return;
  const previous = segments.at(-1);
  if (previous && sameFormatting(previous, candidate)) {
    previous.text += candidate.text;
  } else if (segments.length < MAX_RICH_TEXT_SEGMENTS) {
    segments.push(candidate);
  } else {
    // Preserve all text even for very fragmented content, without an unbounded AST.
    segments.at(-1).text += candidate.text;
  }
}

export function sanitizeNoteRichText(value) {
  if (!Array.isArray(value)) return [];

  const segments = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || typeof item.text !== "string") continue;
    appendSegment(segments, {
      text: item.text,
      bold: item.bold === true,
      italic: item.italic === true,
      underline: item.underline === true,
      href: sanitizeNoteLink(item.href),
    });
  }
  return segments;
}

export function noteRichTextToPlainText(value) {
  return sanitizeNoteRichText(value).map((segment) => segment.text).join("");
}

export function trimNoteRichText(value) {
  const segments = sanitizeNoteRichText(value);
  while (segments.length) {
    segments[0].text = segments[0].text.trimStart();
    if (segments[0].text) break;
    segments.shift();
  }
  while (segments.length) {
    segments[segments.length - 1].text = segments.at(-1).text.trimEnd();
    if (segments.at(-1).text) break;
    segments.pop();
  }
  return sanitizeNoteRichText(segments);
}

function hasStrongWeight(weight) {
  return weight === "bold" || weight === "bolder" || Number.parseInt(weight, 10) >= 600;
}

export function readNoteRichTextFromElement(root) {
  if (!root) return [];
  const segments = [];

  function visit(node, format) {
    if (node.nodeType === 3) {
      appendSegment(segments, { text: node.nodeValue || "", ...format });
      return;
    }
    if (node.nodeType !== 1) return;

    const tag = node.tagName.toUpperCase();
    if (tag === "BR") {
      appendSegment(segments, { text: "\n", ...format });
      return;
    }

    const isBlock = tag === "DIV" || tag === "P" || tag === "LI";
    if (isBlock && segments.length && !segments.at(-1).text.endsWith("\n")) {
      appendSegment(segments, { text: "\n", ...format });
    }

    const style = node.style;
    const nextFormat = {
      bold: format.bold || tag === "B" || tag === "STRONG" || hasStrongWeight(style?.fontWeight),
      italic: format.italic || tag === "I" || tag === "EM" || style?.fontStyle === "italic",
      underline: format.underline || tag === "U" || style?.textDecorationLine?.includes("underline"),
      href: tag === "A" ? sanitizeNoteLink(node.getAttribute("href")) : format.href,
    };

    for (const child of node.childNodes) visit(child, nextFormat);
  }

  for (const child of root.childNodes) {
    visit(child, { bold: false, italic: false, underline: false, href: "" });
  }
  return sanitizeNoteRichText(segments);
}
