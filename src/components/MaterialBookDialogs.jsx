import { useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Check, ExternalLink, ShoppingBag, X } from "lucide-react";
import { resolveBookRetailers } from "../utils/bookRecommendations";
import useMaterialDialogLifecycle from "../hooks/useMaterialDialogLifecycle";

function renderMaterialDialog(children) {
  if (typeof document === "undefined") return children;
  // Keep backdrop sampling outside the route's persistent entrance animation.
  return createPortal(
    <div className="resources-page material-dialog-portal">{children}</div>,
    document.body,
  );
}

export function BuyMaterialsDialog({ subject, children, onClose }) {
  const { dialogRef, isVisible, requestClose, onCancel, onBackdropClick } = useMaterialDialogLifecycle(onClose);

  return renderMaterialDialog(
    <dialog
      aria-labelledby="material-buy-dialog-title"
      aria-modal="true"
      className={`material-buy-dialog${isVisible ? " is-visible" : ""}`}
      id="material-buy-dialog"
      onCancel={onCancel}
      onClick={onBackdropClick}
      ref={dialogRef}
    >
      <div className="material-buy-dialog__content">
        <div className="material-buy-dialog__header">
          <h2 id="material-buy-dialog-title">Buy materials</h2>
          <p>{subject}</p>
        </div>
        <button
          aria-label="Close buy materials"
          autoFocus
          className="material-buy-dialog__close"
          onClick={requestClose}
          type="button"
        ><X aria-hidden="true" size={16} /></button>
        {children}
      </div>
    </dialog>,
  );
}

export function BookDetailsDialog({ book, saved, onSave, onClose }) {
  const { dialogRef, isVisible, requestClose, onCancel, onBackdropClick } = useMaterialDialogLifecycle(onClose);
  const [coverFailed, setCoverFailed] = useState(false);
  const retailers = resolveBookRetailers(book);

  return renderMaterialDialog(
    <dialog
      aria-labelledby="material-book-dialog-title"
      aria-modal="true"
      className={`material-book-dialog${isVisible ? " is-visible" : ""}`}
      onCancel={onCancel}
      onClick={onBackdropClick}
      ref={dialogRef}
    >
      <div className="material-book-dialog__content">
        <button aria-label="Close book details" className="material-book-dialog__close" onClick={requestClose} type="button"><X aria-hidden="true" size={17} /></button>
        <div className="material-book-dialog__hero">
          <span className="material-book-dialog__cover">
            {book.cover && !coverFailed ? <img alt="" onError={() => setCoverFailed(true)} src={book.cover} /> : <BookOpen aria-hidden="true" size={32} />}
          </span>
          <div>
            <h2 id="material-book-dialog-title">{book.title}</h2>
            {book.author ? <p>{book.author}</p> : null}
          </div>
        </div>
        {book.description ? <p className="material-book-dialog__description">{book.description}</p> : null}
        {book.edition || book.isbn ? <p className="material-book-dialog__edition">{[book.edition, book.isbn ? `ISBN ${book.isbn}` : ""].filter(Boolean).join(" · ")}</p> : null}
        <div className="material-book-dialog__actions">
          <button className="material-book-card__button" disabled={saved} onClick={() => onSave?.(book)} type="button">{saved ? <><Check aria-hidden="true" size={16} /> Saved</> : "Save"}</button>
          {retailers.map((retailer) => (
            <a className="material-book-card__button material-book-card__button--buy" href={retailer.href} key={`${retailer.name}-${retailer.href}`} rel="noopener noreferrer" target="_blank">
              <ShoppingBag aria-hidden="true" size={15} /> {retailer.mode === "search" ? `Search ${retailer.name}` : `Buy on ${retailer.name}`} <ExternalLink aria-hidden="true" size={13} />
            </a>
          ))}
        </div>
      </div>
    </dialog>,
  );
}
