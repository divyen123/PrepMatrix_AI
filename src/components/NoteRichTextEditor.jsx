import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  noteRichTextToPlainText,
  readNoteRichTextFromElement,
  sanitizeNoteLink,
  sanitizeNoteRichText,
  trimNoteRichText,
} from "../utils/noteRichText";
import "./NoteRichTextEditor.css";

function appendFormattedText(root, segments) {
  for (const segment of segments) {
    let child = document.createTextNode(segment.text);
    const wrappers = [
      [segment.underline, "u"],
      [segment.italic, "em"],
      [segment.bold, "strong"],
      [Boolean(segment.href), "a"],
    ];
    for (const [enabled, tag] of wrappers) {
      if (!enabled) continue;
      const wrapper = document.createElement(tag);
      if (tag === "a") {
        wrapper.href = segment.href;
        wrapper.target = "_blank";
        wrapper.rel = "noopener noreferrer";
      }
      wrapper.appendChild(child);
      child = wrapper;
    }
    root.appendChild(child);
  }
}

function isSelectionInside(root, range) {
  return Boolean(root && range
    && root.contains(range.startContainer)
    && root.contains(range.endContainer));
}

function caretAtEnd(root) {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  return range;
}

const NoteRichTextEditor = forwardRef(function NoteRichTextEditor({
  id,
  className = "",
  placeholder = "",
  initialText = "",
  initialRichText = null,
  onChange,
  ...rest
}, ref) {
  const editorRef = useRef(null);
  const savedRangeRef = useRef(null);
  const initialContentRef = useRef({ initialText, initialRichText });

  useEffect(() => {
    const root = editorRef.current;
    if (!root) return;
    const { initialText: startingText, initialRichText: startingRichText } = initialContentRef.current;
    const text = String(startingText || "");
    const segments = sanitizeNoteRichText(startingRichText);
    root.replaceChildren();
    if (segments.length && noteRichTextToPlainText(segments) === text) {
      appendFormattedText(root, segments);
    } else if (text) {
      root.appendChild(document.createTextNode(text));
    }
  }, []);

  function captureSelection() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return false;
    const range = selection.getRangeAt(0);
    if (!isSelectionInside(editorRef.current, range)) return false;
    savedRangeRef.current = range.cloneRange();
    return true;
  }

  function restoreSelection() {
    const root = editorRef.current;
    if (!root) return null;
    root.focus({ preventScroll: true });
    const selection = window.getSelection();
    if (!selection) return null;
    const range = isSelectionInside(root, savedRangeRef.current)
      ? savedRangeRef.current.cloneRange()
      : caretAtEnd(root);
    selection.removeAllRanges();
    selection.addRange(range);
    return range;
  }

  function emitChange() {
    const richText = readNoteRichTextFromElement(editorRef.current);
    onChange?.({ text: noteRichTextToPlainText(richText), richText });
    captureSelection();
  }

  function insertPlainText(value) {
    const range = restoreSelection();
    if (!range) return;
    range.deleteContents();
    const textNode = document.createTextNode(value);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    emitChange();
  }

  function format(command, href) {
    const root = editorRef.current;
    if (!root || !["bold", "italic", "underline", "link"].includes(command)) return false;
    const cleanHref = command === "link" ? sanitizeNoteLink(href) : "";
    if (command === "link" && !cleanHref) return false;
    const range = restoreSelection();
    if (!range) return false;

    if (command === "link" && range.collapsed) {
      const link = document.createElement("a");
      link.href = cleanHref;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = cleanHref;
      range.insertNode(link);
      range.setStartAfter(link);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      emitChange();
      return true;
    }

    const browserCommand = command === "link" ? "createLink" : command;
    let applied = false;
    try {
      applied = document.execCommand?.(browserCommand, false, cleanHref || undefined) || false;
    } catch {
      // The Range fallback below covers browsers that reject legacy editing commands.
    }
    if (!applied && !range.collapsed) {
      const wrapper = document.createElement({
        bold: "strong", italic: "em", underline: "u", link: "a",
      }[command]);
      if (command === "link") {
        wrapper.href = cleanHref;
        wrapper.target = "_blank";
        wrapper.rel = "noopener noreferrer";
      }
      wrapper.appendChild(range.extractContents());
      range.insertNode(wrapper);
      range.selectNodeContents(wrapper);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    } else if (!applied) {
      return false;
    }
    emitChange();
    return true;
  }

  useImperativeHandle(ref, () => ({
    format,
    captureSelection,
    focus: () => editorRef.current?.focus({ preventScroll: true }),
  }));

  function handleKeyDown(event) {
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      const shortcut = { b: "bold", i: "italic", u: "underline" }[event.key.toLowerCase()];
      if (shortcut) {
        event.preventDefault();
        captureSelection();
        format(shortcut);
        return;
      }
    }
    if (event.key === "Enter") {
      event.preventDefault();
      captureSelection();
      insertPlainText("\n");
    }
  }

  function handleBeforeInput(event) {
    if (event.nativeEvent?.inputType !== "insertParagraph" && event.nativeEvent?.inputType !== "insertLineBreak") return;
    event.preventDefault();
    captureSelection();
    insertPlainText("\n");
  }

  function handlePaste(event) {
    event.preventDefault();
    captureSelection();
    insertPlainText(event.clipboardData.getData("text/plain"));
  }

  function handleDrop(event) {
    event.preventDefault();
    const value = event.dataTransfer.getData("text/plain");
    if (value) insertPlainText(value);
  }

  return (
    <div
      {...rest}
      aria-multiline="true"
      className={`note-rich-text-editor ${className}`.trim()}
      contentEditable
      data-placeholder={placeholder}
      id={id}
      onBeforeInput={handleBeforeInput}
      onBlur={captureSelection}
      onClick={(event) => {
        if (event.target.closest?.("a")) event.preventDefault();
      }}
      onDrop={handleDrop}
      onInput={emitChange}
      onKeyDown={handleKeyDown}
      onKeyUp={captureSelection}
      onMouseUp={captureSelection}
      onPaste={handlePaste}
      ref={editorRef}
      role="textbox"
      suppressContentEditableWarning
    />
  );
});

export function NoteFormattedText({ text = "", richText }) {
  const fallback = String(text || "");
  const segments = trimNoteRichText(richText);
  if (!segments.length || noteRichTextToPlainText(segments) !== fallback.trim()) return fallback;

  return segments.map((segment, index) => {
    let child = segment.text;
    if (segment.underline) child = <u>{child}</u>;
    if (segment.italic) child = <em>{child}</em>;
    if (segment.bold) child = <strong>{child}</strong>;
    if (segment.href) {
      child = <a href={segment.href} rel="noopener noreferrer" target="_blank">{child}</a>;
    }
    return <span key={index}>{child}</span>;
  });
}

export default NoteRichTextEditor;
