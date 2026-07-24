const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function createDateKey(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateKey(value) {
  const match = DATE_KEY_PATTERN.exec(String(value || "").trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return { day, month, year };
}

export function toLocalDateKey(value) {
  const dateKey = parseDateKey(value);
  if (dateKey) return createDateKey(dateKey.year, dateKey.month, dateKey.day);
  if (DATE_KEY_PATTERN.test(String(value || "").trim())) return "";

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  return createDateKey(
    parsed.getFullYear(),
    parsed.getMonth() + 1,
    parsed.getDate(),
  );
}

export function addDaysToDateKey(value, offset = 0) {
  const dateKey = toLocalDateKey(value);
  const parsed = parseDateKey(dateKey);
  if (!parsed) return "";

  const shifted = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + offset));
  return createDateKey(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

export function getScheduleGenerationWindow(examDate, now = new Date(), cutoffHour = 18) {
  const generatedAt = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  const today = toLocalDateKey(generatedAt);
  const parsedCutoff = Number.parseInt(cutoffHour, 10);
  const cutoffHourValue = Number.isInteger(parsedCutoff) ? Math.min(Math.max(parsedCutoff, 0), 23) : 18;
  const startDate = generatedAt.getHours() >= cutoffHourValue
    ? addDaysToDateKey(today, 1)
    : today;
  const examKey = toLocalDateKey(examDate);
  const startParts = parseDateKey(startDate);
  const examParts = parseDateKey(examKey);

  if (!startParts || !examParts) {
    return { days: 0, startDate };
  }

  const startUtc = Date.UTC(
    startParts.year, startParts.month - 1, startParts.day,
  );
  const examUtc = Date.UTC(
    examParts.year, examParts.month - 1, examParts.day,
  );

  return {
    days: Math.max(0, Math.round((examUtc - startUtc) / 86_400_000)),
    startDate,
  };
}

export function getScheduleDateKey(day, index = 0, scheduleStartDate = "") {
  const explicitDate = toLocalDateKey(day?.date);
  if (explicitDate) return explicitDate;

  const dayNumber = Number.parseInt(day?.day, 10);
  const offset = Number.isInteger(dayNumber) && dayNumber > 0
    ? dayNumber - 1
    : Math.max(0, Number.parseInt(index, 10) || 0);

  return addDaysToDateKey(scheduleStartDate, offset);
}

export function formatScheduleDate(value) {
  const parsed = parseDateKey(toLocalDateKey(value));
  if (!parsed) return "";
  return `${String(parsed.day).padStart(2, "0")}/${String(parsed.month).padStart(2, "0")}/${parsed.year}`;
}

export function formatScheduleDayHeading(day, index = 0, scheduleStartDate = "") {
  const dayNumber = Number.parseInt(day?.day, 10) || index + 1;
  const date = formatScheduleDate(getScheduleDateKey(day, index, scheduleStartDate));
  return date ? `Day ${dayNumber} - ${date}` : `Day ${dayNumber}`;
}
