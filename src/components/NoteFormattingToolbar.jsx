import { useRef, useState } from "react";
import { Bold, Italic, Link2, Underline } from "lucide-react";
import WarmTooltip, { WarmTooltipGroup } from "./WarmTooltip";
import { sanitizeNoteLink } from "../utils/noteRichText";

import "./NoteFormattingToolbar.css";

const FORMAT_ACTIONS = [
  { command: "bold", label: "Bold", shortcut: "Ctrl+B", Icon: Bold },
  { command: "italic", label: "Italic", shortcut: "Ctrl+I", Icon: Italic },
  { command: "underline", label: "Underline", shortcut: "Ctrl+U", Icon: Underline },
];

export default function NoteFormattingToolbar({ editorRef }) {
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState("");
  const linkInputRef = useRef(null);

  const openLinkInput = () => {
    setIsLinkOpen(true);
    setLinkError("");
    window.requestAnimationFrame(() => linkInputRef.current?.focus());
  };

  const applyLink = () => {
    const href = sanitizeNoteLink(linkUrl);
    if (!href) {
      setLinkError("Enter a secure https:// link.");
      linkInputRef.current?.focus();
      return;
    }
    editorRef.current?.format("link", href);
    setIsLinkOpen(false);
    setLinkUrl("");
    setLinkError("");
  };

  return (
    <div className="note-format-toolbar-wrap">
      <div aria-label="Format note details" className="note-format-toolbar" role="toolbar">
        <WarmTooltipGroup delay={350} warmWindow={250} travel={200}>
          {FORMAT_ACTIONS.map((action) => (
            <WarmTooltip content={action.label} inkColor="var(--text)" key={action.command} shortcut={action.shortcut} size="sm" surfaceColor="var(--surface-strong)">
              <button
                aria-label={action.label}
                className="note-format-action"
                onClick={() => editorRef.current?.format(action.command)}
                onMouseDown={(event) => {
                  editorRef.current?.captureSelection();
                  event.preventDefault();
                }}
                type="button"
              >
                <action.Icon aria-hidden="true" size={15} />
              </button>
            </WarmTooltip>
          ))}
          <WarmTooltip content="Add link" inkColor="var(--text)" size="sm" surfaceColor="var(--surface-strong)">
            <button
              aria-expanded={isLinkOpen}
              aria-label="Add link"
              className="note-format-action"
              onClick={() => isLinkOpen ? setIsLinkOpen(false) : openLinkInput()}
              onMouseDown={(event) => {
                editorRef.current?.captureSelection();
                event.preventDefault();
              }}
              type="button"
            >
              <Link2 aria-hidden="true" size={15} />
            </button>
          </WarmTooltip>
        </WarmTooltipGroup>
      </div>
      {isLinkOpen && (
        <div className="note-format-link-popover" onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            applyLink();
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setIsLinkOpen(false);
          }
        }}>
          <label htmlFor="note-format-link-url">Link URL</label>
          <div>
            <input
              aria-invalid={Boolean(linkError)}
              autoComplete="url"
              id="note-format-link-url"
              onChange={(event) => { setLinkUrl(event.target.value); setLinkError(""); }}
              placeholder="https://example.com"
              ref={linkInputRef}
              type="url"
              value={linkUrl}
            />
            <button onClick={applyLink} type="button">Add</button>
          </div>
          {linkError && <small role="alert">{linkError}</small>}
        </div>
      )}
    </div>
  );
}
