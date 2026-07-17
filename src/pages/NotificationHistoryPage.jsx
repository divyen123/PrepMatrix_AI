import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  BellRing,
  CalendarClock,
  Check,
  Clock3,
  Inbox,
  Mail,
  MailOpen,
  RefreshCw,
  Target,
  Trash2,
  X,
} from "lucide-react";
import api from "../utils/apiClient";
import "./NotificationHistoryPage.css";

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const NOTIFICATION_KIND_META = {
  "scheduled-reminder": {
    icon: CalendarClock,
    label: "Scheduled reminder",
  },
  "daily-study-check": {
    icon: Target,
    label: "Daily study check",
  },
  "push-test": {
    icon: BellRing,
    label: "Test notification",
  },
};

function normalizeNotification(value) {
  if (!value || value.id === undefined || value.id === null) return null;

  return {
    id: value.id,
    kind: typeof value.kind === "string" ? value.kind : "reminder",
    title: typeof value.title === "string" && value.title.trim()
      ? value.title.trim()
      : "Study notification",
    body: typeof value.body === "string" && value.body.trim()
      ? value.body.trim()
      : "No message was provided.",
    url: typeof value.url === "string" ? value.url.trim() : "",
    createdAt: value.createdAt || null,
    readAt: value.readAt || null,
  };
}

function newestFirst(a, b) {
  const aTime = Date.parse(a.createdAt || "") || 0;
  const bTime = Date.parse(b.createdAt || "") || 0;
  return bTime - aTime;
}

function formatDateTime(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return DATE_FORMATTER.format(date);
}

function formatKind(kind) {
  return String(kind || "reminder")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getNotificationKindMeta(kind) {
  const normalizedKind = String(kind || "reminder").trim().toLowerCase();
  return NOTIFICATION_KIND_META[normalizedKind] || {
    icon: Bell,
    label: formatKind(normalizedKind),
  };
}

function getSafeNotificationUrl(value) {
  if (typeof value !== "string") return "";
  const url = value.trim();
  if (
    !url.startsWith("/") ||
    url.startsWith("//") ||
    url.includes("\\") ||
    /[\r\n]/.test(url)
  ) {
    return "";
  }
  return url;
}

function NotificationHistoryPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [readErrorId, setReadErrorId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const notificationCardRefs = useRef(new Map());

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      setLoading(true);
      setLoadError("");
      setActionError("");

      try {
        const payload = await api.get("/api/notifications/history");
        if (!active) return;

        const nextNotifications = (Array.isArray(payload?.notifications) ? payload.notifications : [])
          .map(normalizeNotification)
          .filter(Boolean)
          .sort(newestFirst);

        setNotifications(nextNotifications);
      } catch (error) {
        if (!active) return;
        setNotifications([]);
        setLoadError(error?.message || "Notification history could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadHistory();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const selectedNotification = useMemo(
    () => notifications.find((notification) => String(notification.id) === String(selectedId)) || null,
    [notifications, selectedId]
  );

  const totalCount = notifications.length;
  const visibleUnreadCount = notifications.filter((notification) => !notification.readAt).length;
  const readCount = Math.max(0, totalCount - visibleUnreadCount);

  useEffect(() => {
    if (selectedId === null) return undefined;

    if (!previouslyFocusedRef.current) {
      previouslyFocusedRef.current = document.activeElement;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    function handleModalKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedId(null);
        return;
      }

      if (event.key !== "Tab" || !modalRef.current) return;

      const focusable = Array.from(
        modalRef.current.querySelectorAll(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (!focusable.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleModalKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleModalKeyDown);
      document.body.style.overflow = previousOverflow;
      const previousElement = previouslyFocusedRef.current;
      previouslyFocusedRef.current = null;
      window.requestAnimationFrame(() => previousElement?.focus?.());
    };
  }, [selectedId]);

  useEffect(() => {
    if (selectedId !== null || confirmDeleteId === null) return undefined;

    function cancelDeleteOnEscape(event) {
      if (event.key !== "Escape") return;
      const id = confirmDeleteId;
      setConfirmDeleteId(null);
      window.requestAnimationFrame(() => {
        notificationCardRefs.current
          .get(String(id))
          ?.querySelector(".notification-action-icon.is-delete")
          ?.focus();
      });
    }

    document.addEventListener("keydown", cancelDeleteOnEscape);
    return () => document.removeEventListener("keydown", cancelDeleteOnEscape);
  }, [confirmDeleteId, selectedId]);

  function restoreDeleteTrigger(id) {
    setConfirmDeleteId(null);
    window.requestAnimationFrame(() => {
      notificationCardRefs.current
        .get(String(id))
        ?.querySelector(".notification-action-icon.is-delete")
        ?.focus();
    });
  }

  async function openNotification(notification, triggerElement) {
    const id = notification.id;
    previouslyFocusedRef.current = triggerElement;
    setConfirmDeleteId(null);
    setReadErrorId(null);
    setSelectedId(id);

    if (notification.readAt) return;

    const optimisticReadAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => (
      String(item.id) === String(id) ? { ...item, readAt: optimisticReadAt } : item
    )));

    try {
      const payload = await api.patch(
        `/api/notifications/history/${encodeURIComponent(String(id))}/read`,
        {}
      );
      const confirmedReadAt = payload?.notification?.readAt || payload?.readAt || optimisticReadAt;
      setNotifications((current) => current.map((item) => (
        String(item.id) === String(id) ? { ...item, readAt: confirmedReadAt } : item
      )));
    } catch {
      setNotifications((current) => current.map((item) => (
        String(item.id) === String(id) ? { ...item, readAt: null } : item
      )));
      setReadErrorId(id);
    }
  }

  async function deleteNotification(notification) {
    const id = notification.id;
    if (deletingId !== null) return;

    setDeletingId(id);
    setActionError("");
    try {
      await api.delete(`/api/notifications/history/${encodeURIComponent(String(id))}`);
      setNotifications((current) => current.filter((item) => String(item.id) !== String(id)));
      setConfirmDeleteId(null);
      if (String(selectedId) === String(id)) setSelectedId(null);
    } catch (error) {
      setActionError(error?.message || "This notification could not be deleted.");
      restoreDeleteTrigger(id);
    } finally {
      setDeletingId(null);
    }
  }

  const safeSelectedUrl = getSafeNotificationUrl(selectedNotification?.url);
  const selectedKindMeta = getNotificationKindMeta(selectedNotification?.kind);
  const SelectedKindIcon = selectedKindMeta.icon;

  return (
    <section className="notification-history-page page-stack">
      <header className="notification-history-header">
        <button
          aria-label="Back to settings"
          className="notification-history-back"
          onClick={() => navigate("/settings")}
          title="Back to settings"
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={18} />
        </button>
        <div>
          <span className="section-tag">Notifications</span>
          <h1>Notification history</h1>
          <p>Review study reminders and keep your notification list organized.</p>
        </div>
      </header>

      <section aria-label="Notification history summary" className="notification-history-summary">
        <article className="notification-summary-card">
          <span className="notification-summary-icon"><Bell aria-hidden="true" size={18} /></span>
          <div>
            <span>Total</span>
            <strong>{loading ? "—" : totalCount}</strong>
          </div>
        </article>
        <article className="notification-summary-card is-unread">
          <span className="notification-summary-icon"><Mail aria-hidden="true" size={18} /></span>
          <div>
            <span>Unread</span>
            <strong>{loading ? "—" : visibleUnreadCount}</strong>
          </div>
        </article>
        <article className="notification-summary-card is-read">
          <span className="notification-summary-icon"><MailOpen aria-hidden="true" size={18} /></span>
          <div>
            <span>Read</span>
            <strong>{loading ? "—" : readCount}</strong>
          </div>
        </article>
      </section>

      <section className="notification-history-panel" aria-labelledby="notification-history-list-title">
        <div className="notification-history-panel-header">
          <div>
            <span className="section-tag">Recent updates</span>
            <h2 id="notification-history-list-title">All notifications</h2>
          </div>
          {!loading && !loadError && totalCount > 0 && (
            <span className="notification-sort-label">
              <Clock3 aria-hidden="true" size={14} /> Newest first
            </span>
          )}
        </div>

        {actionError && (
          <div className="notification-inline-alert" role="alert">
            <AlertCircle aria-hidden="true" size={16} />
            <span>{actionError}</span>
          </div>
        )}

        {loading ? (
          <div aria-busy="true" aria-label="Loading notification history" className="notification-loading-list">
            {[0, 1, 2].map((item) => (
              <div aria-hidden="true" className="notification-loading-card" key={item}>
                <span />
                <div><i /><i /><i /></div>
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="notification-state-card" role="alert">
            <span className="notification-state-icon is-error">
              <AlertCircle aria-hidden="true" size={24} />
            </span>
            <h3>History unavailable</h3>
            <p>{loadError}</p>
            <button onClick={() => setReloadKey((value) => value + 1)} type="button">
              <RefreshCw aria-hidden="true" size={15} /> Try again
            </button>
          </div>
        ) : totalCount === 0 ? (
          <div className="notification-state-card">
            <span className="notification-state-icon">
              <Inbox aria-hidden="true" size={25} />
            </span>
            <h3>No notifications yet</h3>
            <p>Your study reminders and alerts will appear here after they are sent.</p>
          </div>
        ) : (
          <div className="notification-history-list">
            {notifications.map((notification, index) => {
              const isUnread = !notification.readAt;
              const isConfirming = String(confirmDeleteId) === String(notification.id);
              const isDeleting = String(deletingId) === String(notification.id);
              const previewId = `notification-preview-${index}`;
              const kindMeta = getNotificationKindMeta(notification.kind);
              const KindIcon = kindMeta.icon;

              return (
                <article
                  className={`notification-history-card${isUnread ? " is-unread" : ""}`}
                  key={String(notification.id)}
                  ref={(node) => {
                    const key = String(notification.id);
                    if (node) notificationCardRefs.current.set(key, node);
                    else notificationCardRefs.current.delete(key);
                  }}
                >
                  <button
                    aria-describedby={previewId}
                    aria-label={`Open notification: ${notification.title}`}
                    className="notification-card-main"
                    onClick={(event) => openNotification(notification, event.currentTarget)}
                    type="button"
                  >
                    <span className="notification-card-icon">
                      <KindIcon aria-hidden="true" size={18} />
                    </span>
                    <span className="notification-card-copy">
                      <span className="notification-card-topline">
                        <span className="notification-kind">{kindMeta.label}</span>
                        {isUnread && <span className="notification-unread-label"><i /> Unread</span>}
                      </span>
                      <strong>{notification.title}</strong>
                      <span className="notification-card-preview" id={previewId}>{notification.body}</span>
                      <time dateTime={notification.createdAt || undefined}>
                        {formatDateTime(notification.createdAt)}
                      </time>
                    </span>
                  </button>

                  <div className="notification-card-actions">
                    {isConfirming ? (
                      <div
                        aria-label={`Confirm deletion of ${notification.title}`}
                        className="notification-delete-confirm"
                        role="group"
                      >
                        <button
                          autoFocus
                          aria-busy={isDeleting}
                          aria-label={`Confirm delete: ${notification.title}`}
                          className="notification-action-icon is-confirm"
                          disabled={isDeleting}
                          onClick={() => deleteNotification(notification)}
                          title="Confirm delete"
                          type="button"
                        >
                          <Check aria-hidden="true" size={15} />
                        </button>
                        <button
                          aria-label={`Cancel delete: ${notification.title}`}
                          className="notification-action-icon is-cancel"
                          disabled={isDeleting}
                          onClick={() => restoreDeleteTrigger(notification.id)}
                          title="Cancel"
                          type="button"
                        >
                          <X aria-hidden="true" size={15} />
                        </button>
                      </div>
                    ) : (
                      <button
                        aria-label={`Delete notification: ${notification.title}`}
                        className="notification-action-icon is-delete"
                        onClick={() => {
                          setActionError("");
                          setConfirmDeleteId(notification.id);
                        }}
                        title="Delete notification"
                        type="button"
                      >
                        <Trash2 aria-hidden="true" size={15} />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {selectedNotification && createPortal(
        <div
          className="notification-message-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedId(null);
          }}
          role="presentation"
        >
          <section
            aria-describedby="notification-message-body"
            aria-labelledby="notification-message-title"
            aria-modal="true"
            className="notification-message-modal"
            ref={modalRef}
            role="dialog"
          >
            <div className="notification-message-modal-header">
              <span className="notification-kind">{selectedKindMeta.label}</span>
              <button
                aria-label="Close full notification"
                className="notification-modal-close"
                onClick={() => setSelectedId(null)}
                ref={closeButtonRef}
                title="Close"
                type="button"
              >
                <X aria-hidden="true" size={17} />
              </button>
            </div>
            <div className="notification-message-heading">
              <span className="notification-message-icon"><SelectedKindIcon aria-hidden="true" size={20} /></span>
              <div>
                <h2 id="notification-message-title">{selectedNotification.title}</h2>
                <time dateTime={selectedNotification.createdAt || undefined}>
                  {formatDateTime(selectedNotification.createdAt)}
                </time>
              </div>
            </div>
            <p id="notification-message-body">{selectedNotification.body}</p>
            {String(readErrorId) === String(selectedNotification.id) && (
              <p className="notification-read-error" role="alert">
                <AlertCircle aria-hidden="true" size={14} />
                The message opened, but its read status could not be saved.
              </p>
            )}
            <footer className="notification-message-footer">
              <span>
                <MailOpen aria-hidden="true" size={14} />
                {selectedNotification.readAt ? "Marked as read" : "Unread"}
              </span>
              {safeSelectedUrl && (
                <button
                  className="notification-related-link"
                  onClick={() => {
                    setSelectedId(null);
                    navigate(safeSelectedUrl);
                  }}
                  type="button"
                >
                  Open related page
                </button>
              )}
            </footer>
          </section>
        </div>,
        document.body
      )}
    </section>
  );
}

export default NotificationHistoryPage;
