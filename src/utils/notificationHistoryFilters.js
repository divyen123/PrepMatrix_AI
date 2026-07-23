export const NOTIFICATION_SORT_ORDERS = Object.freeze({
  NEWEST: "newest",
  OLDEST: "oldest",
});

export const NOTIFICATION_DATE_FILTERS = Object.freeze({
  ALL: "all",
  LAST_15_DAYS: "last-15-days",
  LAST_3_MONTHS: "last-3-months",
  LAST_6_MONTHS: "last-6-months",
  LAST_1_YEAR: "last-1-year",
  CUSTOM: "custom",
});

export const NOTIFICATION_STATUS_FILTERS = Object.freeze({
  ALL: "all",
  UNREAD: "unread",
  READ: "read",
});

function getTimestamp(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : null;
}

function parseLocalDate(value, endOfDay = false) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(
    year,
    monthIndex,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  );

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function subtractCalendarMonths(value, months) {
  const date = new Date(value);
  const desiredDay = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() - months);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(desiredDay, lastDay));
  return date;
}

export function getCustomNotificationDateRange(startDate, endDate) {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate, true);
  if (!start || !end || start.getTime() > end.getTime()) return null;

  return {
    startTime: start.getTime(),
    endTime: end.getTime(),
  };
}

function getNotificationDateRange(dateFilter, { customStartDate, customEndDate, now }) {
  if (dateFilter === NOTIFICATION_DATE_FILTERS.ALL) return null;

  if (dateFilter === NOTIFICATION_DATE_FILTERS.CUSTOM) {
    return getCustomNotificationDateRange(customStartDate, customEndDate);
  }

  const end = new Date(now);
  if (Number.isNaN(end.getTime())) return null;

  let start = new Date(end);
  if (dateFilter === NOTIFICATION_DATE_FILTERS.LAST_15_DAYS) {
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 14);
  } else if (dateFilter === NOTIFICATION_DATE_FILTERS.LAST_3_MONTHS) {
    start = subtractCalendarMonths(start, 3);
    start.setHours(0, 0, 0, 0);
  } else if (dateFilter === NOTIFICATION_DATE_FILTERS.LAST_6_MONTHS) {
    start = subtractCalendarMonths(start, 6);
    start.setHours(0, 0, 0, 0);
  } else if (dateFilter === NOTIFICATION_DATE_FILTERS.LAST_1_YEAR) {
    start = subtractCalendarMonths(start, 12);
    start.setHours(0, 0, 0, 0);
  } else {
    return null;
  }

  return {
    startTime: start.getTime(),
    endTime: end.getTime(),
  };
}

export function filterAndSortNotificationHistory(
  notifications,
  {
    sortOrder = NOTIFICATION_SORT_ORDERS.NEWEST,
    dateFilter = NOTIFICATION_DATE_FILTERS.ALL,
    statusFilter = NOTIFICATION_STATUS_FILTERS.ALL,
    customStartDate = "",
    customEndDate = "",
    now = new Date(),
  } = {}
) {
  const source = Array.isArray(notifications) ? notifications : [];
  const range = getNotificationDateRange(dateFilter, {
    customStartDate,
    customEndDate,
    now,
  });

  const dateFiltered = dateFilter === NOTIFICATION_DATE_FILTERS.ALL
    ? [...source]
    : range
      ? source.filter((notification) => {
        const timestamp = getTimestamp(notification?.createdAt);
        return timestamp !== null && timestamp >= range.startTime && timestamp <= range.endTime;
      })
      : [];

  const filtered = statusFilter === NOTIFICATION_STATUS_FILTERS.ALL
    ? dateFiltered
    : dateFiltered.filter((notification) => (
      statusFilter === NOTIFICATION_STATUS_FILTERS.READ
        ? Boolean(notification?.readAt)
        : !notification?.readAt
    ));

  const direction = sortOrder === NOTIFICATION_SORT_ORDERS.OLDEST ? 1 : -1;
  return filtered.sort((a, b) => {
    const aTime = getTimestamp(a?.createdAt);
    const bTime = getTimestamp(b?.createdAt);
    if (aTime === null && bTime === null) return 0;
    if (aTime === null) return 1;
    if (bTime === null) return -1;
    return (aTime - bTime) * direction;
  });
}
