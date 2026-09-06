import { Fragment, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { APP_SHORTCUT_GUIDE_GROUPS } from "../utils/appKeyboardShortcuts";
import { acquireDocumentScrollLock } from "../utils/documentScrollLock";
import "./KeyboardShortcutDialog.css";

function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ));
}

export function KeyboardShortcutGroups() {
  return (
    <div className="about-shortcut-groups">
      {APP_SHORTCUT_GUIDE_GROUPS.map((group) => (
        <article className="about-shortcut-group" key={group.id}>
          <div className="about-shortcut-group-heading">
            <h4>{group.label}</h4>
            <p>{group.description}</p>
          </div>
          <ul>
            {group.items.map((item) => (
              <li key={`${item.context || group.id}-${item.label}`}>
                <span
                  aria-label={item.keys.join(item.separator === "or" ? " or " : " plus ")}
                  className="about-shortcut-keys"
                >
                  {item.keys.map((key, index) => (
                    <Fragment key={`${item.label}-${key}-${index}`}>
                      {index > 0 && <span aria-hidden="true">{item.separator || "+"}</span>}
                      <kbd>{key}</kbd>
                    </Fragment>
                  ))}
                </span>
                <span className="about-shortcut-action">
                  {item.context && <small>{item.context}</small>}
                  <span>{item.label}</span>
                </span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

export default function KeyboardShortcutDialog({ onClose, open = false }) {
  const closeButtonRef = useRef(null);
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const previouslyFocused = document.activeElement;
    const releaseScrollLock = acquireDocumentScrollLock();

    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current?.("escape");
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = getFocusableElements(dialogRef.current);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown);
      releaseScrollLock();
      if (previouslyFocused?.isConnected) previouslyFocused.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  const closeDialog = (reason) => onCloseRef.current?.(reason);
  const content = (
    <div
      className="keyboard-shortcut-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeDialog("backdrop");
      }}
      role="presentation"
    >
      <section
        aria-labelledby="keyboard-shortcut-dialog-title"
        aria-modal="true"
        className="keyboard-shortcut-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <header className="keyboard-shortcut-dialog-header">
          <h2 id="keyboard-shortcut-dialog-title">Shortcut keyboard guide</h2>
          <button
            aria-label="Close keyboard shortcut guide"
            className="keyboard-shortcut-dialog-close"
            onClick={() => closeDialog("close")}
            ref={closeButtonRef}
            title="Close"
            type="button"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </header>

        <div aria-label="Keyboard shortcuts" className="keyboard-shortcut-dialog-body" tabIndex={0}>
          <KeyboardShortcutGroups />
        </div>
      </section>
    </div>
  );

  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
