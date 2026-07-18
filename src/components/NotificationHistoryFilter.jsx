import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown, Clock3, X } from "lucide-react";

import {
  getCustomNotificationDateRange,
  NOTIFICATION_DATE_FILTERS,
  NOTIFICATION_SORT_ORDERS,
} from "../utils/notificationHistoryFilters";
import "./NotificationHistoryFilter.css";

const DATE_FILTER_OPTIONS = [
  { value: NOTIFICATION_DATE_FILTERS.ALL, label: "All time" },
  { value: NOTIFICATION_DATE_FILTERS.LAST_15_DAYS, label: "Last 15 days" },
  { value: NOTIFICATION_DATE_FILTERS.LAST_3_MONTHS, label: "Last 3 months" },
  { value: NOTIFICATION_DATE_FILTERS.LAST_6_MONTHS, label: "Last 6 months" },
  { value: NOTIFICATION_DATE_FILTERS.LAST_1_YEAR, label: "Last 1 year" },
];

const DATE_FILTER_LABELS = Object.freeze({
  [NOTIFICATION_DATE_FILTERS.ALL]: "All time",
  [NOTIFICATION_DATE_FILTERS.LAST_15_DAYS]: "Last 15 days",
  [NOTIFICATION_DATE_FILTERS.LAST_3_MONTHS]: "Last 3 months",
  [NOTIFICATION_DATE_FILTERS.LAST_6_MONTHS]: "Last 6 months",
  [NOTIFICATION_DATE_FILTERS.LAST_1_YEAR]: "Last 1 year",
  [NOTIFICATION_DATE_FILTERS.CUSTOM]: "Custom range",
});

const FILTER_MENU_EDGE_GAP = 16;
const FILTER_MENU_TRIGGER_GAP = 9;
const FILTER_MENU_MAX_HEIGHT = 520;

function NotificationHistoryFilter({
  closeSignal,
  customEndDate,
  customStartDate,
  dateFilter,
  onDateFilterChange,
  onOpen,
  onReset,
  onSortOrderChange,
  sortOrder,
}) {
  const [open, setOpen] = useState(false);
  const [customExpanded, setCustomExpanded] = useState(false);
  const [draftStartDate, setDraftStartDate] = useState(customStartDate || "");
  const [draftEndDate, setDraftEndDate] = useState(customEndDate || "");
  const [customError, setCustomError] = useState("");
  const [menuLayout, setMenuLayout] = useState({ maxHeight: FILTER_MENU_MAX_HEIGHT, placement: "below" });
  const rootRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return undefined;

    const visualViewport = window.visualViewport;

    function updateMenuLayout() {
      const triggerRect = triggerRef.current?.getBoundingClientRect();
      if (!triggerRect) return;

      const viewportTop = visualViewport?.offsetTop ?? 0;
      const viewportHeight = visualViewport?.height ?? window.innerHeight;
      const viewportBottom = viewportTop + viewportHeight;
      const spaceBelow = Math.max(
        0,
        viewportBottom - triggerRect.bottom - FILTER_MENU_TRIGGER_GAP - FILTER_MENU_EDGE_GAP,
      );
      const spaceAbove = Math.max(
        0,
        triggerRect.top - viewportTop - FILTER_MENU_TRIGGER_GAP - FILTER_MENU_EDGE_GAP,
      );
      const placement = spaceBelow >= FILTER_MENU_MAX_HEIGHT || spaceBelow >= spaceAbove
        ? "below"
        : "above";
      const availableSpace = placement === "below" ? spaceBelow : spaceAbove;
      const maxHeight = Math.max(1, Math.floor(Math.min(FILTER_MENU_MAX_HEIGHT, availableSpace)));

      setMenuLayout((current) => (
        current.maxHeight === maxHeight && current.placement === placement
          ? current
          : { maxHeight, placement }
      ));
    }

    updateMenuLayout();
    window.addEventListener("resize", updateMenuLayout);
    window.addEventListener("scroll", updateMenuLayout, true);
    visualViewport?.addEventListener("resize", updateMenuLayout);
    visualViewport?.addEventListener("scroll", updateMenuLayout);

    return () => {
      window.removeEventListener("resize", updateMenuLayout);
      window.removeEventListener("scroll", updateMenuLayout, true);
      visualViewport?.removeEventListener("resize", updateMenuLayout);
      visualViewport?.removeEventListener("scroll", updateMenuLayout);
    };
  }, [open]);

  useEffect(() => {
    if (closeSignal !== null && closeSignal !== undefined) setOpen(false);
  }, [closeSignal]);

  const sortLabel = sortOrder === NOTIFICATION_SORT_ORDERS.OLDEST
    ? "Oldest first"
    : "Newest first";
  const dateLabel = DATE_FILTER_LABELS[dateFilter] || DATE_FILTER_LABELS[NOTIFICATION_DATE_FILTERS.ALL];
  const triggerLabel = dateFilter === NOTIFICATION_DATE_FILTERS.ALL
    ? sortLabel
    : `${sortOrder === NOTIFICATION_SORT_ORDERS.OLDEST ? "Oldest" : "Newest"} · ${dateLabel}`;

  function toggleMenu() {
    const next = !open;
    if (next) {
      onOpen?.();
      if (dateFilter === NOTIFICATION_DATE_FILTERS.CUSTOM) {
        setDraftStartDate(customStartDate || "");
        setDraftEndDate(customEndDate || "");
        setCustomExpanded(true);
      }
    }
    setOpen(next);
    setCustomError("");
  }

  function selectDateFilter(nextFilter) {
    onDateFilterChange(nextFilter, { startDate: "", endDate: "" });
    setCustomExpanded(false);
    setCustomError("");
  }

  function applyCustomRange() {
    if (!draftStartDate || !draftEndDate) {
      setCustomError("Select both a starting date and an ending date.");
      return;
    }

    if (!getCustomNotificationDateRange(draftStartDate, draftEndDate)) {
      setCustomError("Starting date must be on or before the ending date.");
      return;
    }

    onDateFilterChange(NOTIFICATION_DATE_FILTERS.CUSTOM, {
      startDate: draftStartDate,
      endDate: draftEndDate,
    });
    setCustomError("");
    setOpen(false);
  }

  function resetFilters() {
    setDraftStartDate("");
    setDraftEndDate("");
    setCustomExpanded(false);
    setCustomError("");
    onReset();
  }

  return (
    <div className="notification-filter" ref={rootRef}>
      <button
        aria-controls="notification-history-filter-menu"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="notification-sort-label"
        onClick={toggleMenu}
        ref={triggerRef}
        type="button"
      >
        <Clock3 aria-hidden="true" size={14} />
        <span>{triggerLabel}</span>
        <ChevronDown aria-hidden="true" className={open ? "is-open" : ""} size={13} />
      </button>

      {open && (
        <div
          aria-label="Sort and filter notifications"
          className={`notification-filter-menu is-${menuLayout.placement}`}
          id="notification-history-filter-menu"
          role="dialog"
          style={{ "--notification-filter-menu-max-height": `${menuLayout.maxHeight}px` }}
        >
          <div className="notification-filter-menu-header">
            <div>
              <strong>Sort & filter</strong>
              <span>Choose the notification period to display.</span>
            </div>
            <button
              aria-label="Close notification filters"
              className="notification-filter-close"
              onClick={() => setOpen(false)}
              type="button"
            >
              <X aria-hidden="true" size={15} />
            </button>
          </div>

          <fieldset className="notification-filter-section">
            <legend>Sort order</legend>
            <div className="notification-filter-options is-sort">
              {[
                { value: NOTIFICATION_SORT_ORDERS.NEWEST, label: "Newest first" },
                { value: NOTIFICATION_SORT_ORDERS.OLDEST, label: "Oldest first" },
              ].map((option) => {
                const active = sortOrder === option.value;
                return (
                  <button
                    aria-pressed={active}
                    className={`notification-filter-option${active ? " is-active" : ""}`}
                    key={option.value}
                    onClick={() => onSortOrderChange(option.value)}
                    type="button"
                  >
                    <span>{option.label}</span>
                    {active && <Check aria-hidden="true" size={14} />}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="notification-filter-section">
            <legend>Date range</legend>
            <div className="notification-filter-options">
              {DATE_FILTER_OPTIONS.map((option) => {
                const active = dateFilter === option.value;
                return (
                  <button
                    aria-pressed={active}
                    className={`notification-filter-option${active ? " is-active" : ""}`}
                    key={option.value}
                    onClick={() => selectDateFilter(option.value)}
                    type="button"
                  >
                    <span>{option.label}</span>
                    {active && <Check aria-hidden="true" size={14} />}
                  </button>
                );
              })}
            </div>

            <button
              aria-expanded={customExpanded}
              className={`notification-filter-option is-custom${dateFilter === NOTIFICATION_DATE_FILTERS.CUSTOM ? " is-active" : ""}`}
              onClick={() => {
                setCustomExpanded((current) => !current);
                setCustomError("");
              }}
              type="button"
            >
              <span>Custom date range</span>
              {dateFilter === NOTIFICATION_DATE_FILTERS.CUSTOM && <Check aria-hidden="true" size={14} />}
            </button>

            {customExpanded && (
              <div className="notification-filter-custom">
                <div className="notification-filter-custom-fields">
                  <label>
                    <span>Starting date</span>
                    <input
                      max={draftEndDate || undefined}
                      onChange={(event) => {
                        setDraftStartDate(event.target.value);
                        setCustomError("");
                      }}
                      type="date"
                      value={draftStartDate}
                    />
                  </label>
                  <label>
                    <span>Ending date</span>
                    <input
                      min={draftStartDate || undefined}
                      onChange={(event) => {
                        setDraftEndDate(event.target.value);
                        setCustomError("");
                      }}
                      type="date"
                      value={draftEndDate}
                    />
                  </label>
                </div>
                {customError && <p className="notification-filter-error" role="alert">{customError}</p>}
                <button className="notification-filter-apply" onClick={applyCustomRange} type="button">
                  Apply date range
                </button>
              </div>
            )}
          </fieldset>

          <button className="notification-filter-reset" onClick={resetFilters} type="button">
            Reset filters
          </button>
        </div>
      )}
    </div>
  );
}

export default NotificationHistoryFilter;
