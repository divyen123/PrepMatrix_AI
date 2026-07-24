import test from "node:test";
import assert from "node:assert/strict";
import {
  addDaysToDateKey,
  formatScheduleDayHeading,
  getScheduleDateKey,
  getScheduleGenerationWindow,
  toLocalDateKey,
} from "./scheduleDates.js";

test("normalizes local calendar dates without shifting date-only values", () => {
  assert.equal(toLocalDateKey("2026-04-15"), "2026-04-15");
  assert.equal(toLocalDateKey("2026-02-30"), "");
  assert.equal(toLocalDateKey("not-a-date"), "");
});

test("adds days across month and year boundaries", () => {
  assert.equal(addDaysToDateKey("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysToDateKey("2026-02-28", 1), "2026-03-01");
});

test("uses an explicit schedule date for the day heading", () => {
  assert.equal(
    formatScheduleDayHeading({ day: 1, date: "2026-04-15" }),
    "Day 1 - 15/04/2026",
  );
});

test("derives dates for legacy schedule days from the stored start date", () => {
  const day = { day: 3, tasks: [] };

  assert.equal(getScheduleDateKey(day, 2, "2026-04-15"), "2026-04-17");
  assert.equal(
    formatScheduleDayHeading(day, 2, "2026-04-15"),
    "Day 3 - 17/04/2026",
  );
});

test("keeps the original day-only heading when no valid date is available", () => {
  assert.equal(formatScheduleDayHeading({ day: 2 }, 1), "Day 2");
});

test("keeps today's date before the evening planner cutoff", () => {
  assert.deepEqual(
    getScheduleGenerationWindow("2026-07-30", new Date(2026, 6, 24, 17, 59)),
    { days: 6, startDate: "2026-07-24" },
  );
});

test("starts on the next date at and after the evening planner cutoff", () => {
  assert.deepEqual(
    getScheduleGenerationWindow("2026-07-30", new Date(2026, 6, 24, 18, 0)),
    { days: 5, startDate: "2026-07-25" },
  );
  assert.deepEqual(
    getScheduleGenerationWindow("2026-07-30", new Date(2026, 6, 24, 23, 30)),
    { days: 5, startDate: "2026-07-25" },
  );
});

test("rolls a late-night schedule into the next month or year", () => {
  assert.deepEqual(
    getScheduleGenerationWindow("2027-01-05", new Date(2026, 11, 31, 20, 0)),
    { days: 4, startDate: "2027-01-01" },
  );
});

test("reports no study window when a next-day exam is generated at night", () => {
  assert.deepEqual(
    getScheduleGenerationWindow("2026-07-25", new Date(2026, 6, 24, 20, 0)),
    { days: 0, startDate: "2026-07-25" },
  );
});
