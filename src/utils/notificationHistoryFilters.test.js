import assert from "node:assert/strict";
import test from "node:test";

import {
  filterAndSortNotificationHistory,
  getCustomNotificationDateRange,
  NOTIFICATION_DATE_FILTERS,
  NOTIFICATION_SORT_ORDERS,
} from "./notificationHistoryFilters.js";

function at(year, monthIndex, day, hour = 12) {
  return new Date(year, monthIndex, day, hour).toISOString();
}

test("sorts notification history newest or oldest without mutating the source", () => {
  const source = [
    { id: "middle", createdAt: at(2026, 6, 10) },
    { id: "oldest", createdAt: at(2026, 6, 1) },
    { id: "newest", createdAt: at(2026, 6, 18) },
    { id: "undated", createdAt: "not-a-date" },
  ];

  const newest = filterAndSortNotificationHistory(source);
  const oldest = filterAndSortNotificationHistory(source, {
    sortOrder: NOTIFICATION_SORT_ORDERS.OLDEST,
  });

  assert.deepEqual(newest.map(({ id }) => id), ["newest", "middle", "oldest", "undated"]);
  assert.deepEqual(oldest.map(({ id }) => id), ["oldest", "middle", "newest", "undated"]);
  assert.deepEqual(source.map(({ id }) => id), ["middle", "oldest", "newest", "undated"]);
});

test("last 15 days includes today and the previous fourteen local calendar days", () => {
  const notifications = [
    { id: "boundary", createdAt: at(2026, 6, 4, 0) },
    { id: "before", createdAt: at(2026, 6, 3, 23) },
    { id: "today", createdAt: at(2026, 6, 18, 10) },
  ];

  const filtered = filterAndSortNotificationHistory(notifications, {
    dateFilter: NOTIFICATION_DATE_FILTERS.LAST_15_DAYS,
    now: new Date(2026, 6, 18, 12),
  });

  assert.deepEqual(filtered.map(({ id }) => id), ["today", "boundary"]);
});

test("calendar month filters use stable three, six, and twelve month boundaries", () => {
  const notifications = [
    { id: "three", createdAt: at(2026, 3, 18, 0) },
    { id: "six", createdAt: at(2026, 0, 18, 0) },
    { id: "year", createdAt: at(2025, 6, 18, 0) },
    { id: "too-old", createdAt: at(2025, 6, 17, 23) },
  ];
  const now = new Date(2026, 6, 18, 12);

  assert.deepEqual(
    filterAndSortNotificationHistory(notifications, {
      dateFilter: NOTIFICATION_DATE_FILTERS.LAST_3_MONTHS,
      now,
    }).map(({ id }) => id),
    ["three"]
  );
  assert.deepEqual(
    filterAndSortNotificationHistory(notifications, {
      dateFilter: NOTIFICATION_DATE_FILTERS.LAST_6_MONTHS,
      now,
    }).map(({ id }) => id),
    ["three", "six"]
  );
  assert.deepEqual(
    filterAndSortNotificationHistory(notifications, {
      dateFilter: NOTIFICATION_DATE_FILTERS.LAST_1_YEAR,
      now,
    }).map(({ id }) => id),
    ["three", "six", "year"]
  );
});

test("custom ranges include the complete starting and ending dates", () => {
  const range = getCustomNotificationDateRange("2026-07-01", "2026-07-02");
  assert.ok(range);

  const filtered = filterAndSortNotificationHistory([
    { id: "before", createdAt: at(2026, 5, 30, 23) },
    { id: "start", createdAt: at(2026, 6, 1, 0) },
    { id: "end", createdAt: new Date(2026, 6, 2, 23, 59, 59, 999).toISOString() },
    { id: "after", createdAt: at(2026, 6, 3, 0) },
  ], {
    dateFilter: NOTIFICATION_DATE_FILTERS.CUSTOM,
    customStartDate: "2026-07-01",
    customEndDate: "2026-07-02",
  });

  assert.deepEqual(filtered.map(({ id }) => id), ["end", "start"]);
  assert.equal(getCustomNotificationDateRange("2026-07-03", "2026-07-02"), null);
});
