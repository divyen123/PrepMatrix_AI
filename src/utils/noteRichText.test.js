import assert from "node:assert/strict";
import test from "node:test";
import {
  noteRichTextToPlainText,
  readNoteRichTextFromElement,
  sanitizeNoteLink,
  sanitizeNoteRichText,
  trimNoteRichText,
} from "./noteRichText.js";

test("note links accept only absolute HTTPS URLs without credentials", () => {
  assert.equal(sanitizeNoteLink("https://example.com/study?q=1"), "https://example.com/study?q=1");
  for (const value of ["javascript:alert(1)", "http://example.com", "/relative", "https://user:pass@example.com", "data:text/html,evil", null]) {
    assert.equal(sanitizeNoteLink(value), "");
  }
});

test("rich notes retain only supported formatting and merge adjacent spans", () => {
  assert.deepEqual(sanitizeNoteRichText([
    { text: "Bold", bold: true, style: "display:none", href: "javascript:evil" },
    { text: " note", bold: true },
    { text: " and ", fake: true },
    { text: "reference", underline: true, href: "https://example.com/notes" },
    { text: 123, bold: true },
  ]), [
    { text: "Bold note", bold: true, italic: false, underline: false, href: "" },
    { text: " and ", bold: false, italic: false, underline: false, href: "" },
    { text: "reference", bold: false, italic: false, underline: true, href: "https://example.com/notes" },
  ]);
});

test("plain text and trimmed rich spans stay aligned for existing note storage", () => {
  const richText = trimNoteRichText([
    { text: "  ", underline: true },
    { text: "  Topic", bold: true },
    { text: "\nDetails  ", italic: true },
    { text: "  ", underline: true },
  ]);
  assert.equal(noteRichTextToPlainText(richText), "Topic\nDetails");
  assert.equal(richText[0].text, "Topic");
  assert.equal(richText[1].text, "\nDetails");
});

test("DOM extraction keeps only supported inline formatting and plain line breaks", () => {
  const text = (value) => ({ nodeType: 3, nodeValue: value });
  const element = (tagName, children = [], attributes = {}, style = {}) => ({
    nodeType: 1,
    tagName,
    childNodes: children,
    style,
    getAttribute: (name) => attributes[name] || null,
  });
  const root = {
    childNodes: [
      element("DIV", [element("B", [text("Important")])]),
      element("DIV", [
        text("See "),
        element("A", [text("reference")], { href: "javascript:alert(1)" }),
        element("BR"),
        element("A", [text("safe link")], { href: "https://example.com" }),
      ]),
    ],
  };

  const richText = readNoteRichTextFromElement(root);
  assert.equal(noteRichTextToPlainText(richText), "Important\nSee reference\nsafe link");
  assert.equal(richText[0].bold, true);
  assert.equal(richText.find((part) => part.text.includes("reference"))?.href, "");
  assert.equal(richText.at(-1).href, "https://example.com/");
});
