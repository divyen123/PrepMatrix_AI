import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const baseProps = {
  canManageSchedule: true,
  completed: [],
  schedule: [],
  scheduleStartDate: null,
  setCompleted: () => {},
  setSchedule: () => {},
  setScheduleStartDate: () => {},
};

function findGenerateButton(markup) {
  return markup.match(
    /<button class="action-btn"[^>]*>[\s\S]*?Generate schedule[\s\S]*?<\/button>/u,
  )?.[0] || "";
}

test("requires a subject before enabling schedule generation", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: Timetable } = await vite.ssrLoadModule(
      "/src/components/Timetable.jsx",
    );
    const emptyMarkup = renderToStaticMarkup(React.createElement(Timetable, {
      ...baseProps,
      subjects: [],
      // Deliberately omit onOpenSubjects to cover optional consumers.
    }));
    const configuredMarkup = renderToStaticMarkup(React.createElement(Timetable, {
      ...baseProps,
      subjects: [{ name: "Maths", chapters: 4, difficulty: "easy" }],
    }));

    assert.match(emptyMarkup, /Add a subject first/u);
    assert.match(emptyMarkup, />Open Subjects</u);
    assert.match(findGenerateButton(emptyMarkup), /disabled=""/u);

    assert.doesNotMatch(configuredMarkup, /Add a subject first|>Open Subjects/u);
    assert.doesNotMatch(findGenerateButton(configuredMarkup), /disabled=/u);
  } finally {
    await vite.close();
  }
});

test("renders completed, reopened, and date-locked planner task states", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const {
      PlannerScheduleDay,
      default: Timetable,
    } = await vite.ssrLoadModule("/src/components/Timetable.jsx");
    const schedule = [
      {
        day: 1,
        date: "2999-01-01",
        tasks: [
          { task: "Completed lesson", time: "Morning" },
          { task: "Review lesson", time: "Evening", recheckPending: true },
        ],
      },
      {
        day: 2,
        date: "2999-01-02",
        tasks: [{ task: "Future lesson", time: "Morning" }],
      },
    ];
    const markup = renderToStaticMarkup(React.createElement(Timetable, {
      ...baseProps,
      completed: ["Completed lesson", "Review lesson"],
      schedule,
      scheduleStartDate: "2999-01-01",
      subjects: [{ name: "Maths", chapters: 4, difficulty: "easy" }],
    }));
    const completedCheckbox = markup.match(
      /<input[^>]*aria-label="Mark Completed lesson complete"[^>]*>/u,
    )?.[0] || "";
    const rescheduleButton = markup.match(
      /<button[^>]*aria-label="Reschedule Completed lesson"[^>]*>/u,
    )?.[0] || "";
    const reopenedCheckbox = markup.match(
      /<input[^>]*aria-label="Complete Review lesson again"[^>]*>/u,
    )?.[0] || "";
    const futureCheckbox = markup.match(
      /<input[^>]*aria-label="Mark Future lesson complete"[^>]*>/u,
    )?.[0] || "";

    assert.match(markup, /Day 1 - 01\/01\/2999/u);
    assert.match(markup, /Day 2 - 02\/01\/2999/u);
    assert.equal(completedCheckbox, "");
    assert.match(rescheduleButton, /class="planner-reschedule-btn"/u);
    assert.doesNotMatch(rescheduleButton, /disabled=/u);

    assert.doesNotMatch(reopenedCheckbox, /checked=|disabled=/u);
    assert.match(markup, /class="planner-already-completed-badge"/u);
    assert.match(markup, />Already completed</u);

    assert.match(markup, /class="day-card planner-day-card is-locked"/u);
    assert.doesNotMatch(markup, /aria-disabled="true"/u);
    assert.match(markup, /class="planner-day-locked-badge"/u);
    assert.match(markup, /Locked until 02\/01\/2999/u);
    assert.match(futureCheckbox, /disabled=""/u);
    assert.match(
      markup,
      /aria-label="Take unlock quiz for Day 2"[^>]*class="planner-day-unlock-btn"/u,
    );
    assert.match(markup, />Clear schedule</u);

    const completedMarkup = renderToStaticMarkup(React.createElement(
      PlannerScheduleDay,
      {
        completed: ["Completed lesson"],
        dayIndex: 0,
        item: {
          day: 1,
          date: "2999-01-01",
          tasks: [{ task: "Completed lesson", time: "Morning · 45 min" }],
        },
        onComplete: () => {},
        onReschedule: () => {},
        onUnlock: () => {},
        schedule: [{
          day: 1,
          date: "2999-01-01",
          tasks: [{ task: "Completed lesson", time: "Morning · 45 min" }],
        }],
        scheduleStartDate: "2999-01-01",
        today: new Date(2026, 7, 23),
      },
    ));

    assert.match(completedMarkup, /planner-task-row is-completed/u);
    assert.match(completedMarkup, /aria-label="Reschedule Completed lesson"/u);
    assert.doesNotMatch(completedMarkup, /<input|time-slot|Morning · 45 min/u);
  } finally {
    await vite.close();
  }
});

test("revision blocks bypass the quiz icon and later study days skip them as quiz sources", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { PlannerScheduleDay } = await vite.ssrLoadModule(
      "/src/components/Timetable.jsx",
    );
    const schedule = [
      {
        day: 1,
        date: "2999-01-01",
        tasks: [{
          subjectName: "Biology",
          task: "Biology - Cells",
          topic: "Cells",
        }],
      },
      { day: 2, date: "2999-01-02", tasks: [] },
      {
        day: 3,
        date: "2999-01-03",
        tasks: [{ task: "Biology - Genetics", time: "Morning · 45 min" }],
      },
    ];
    const sharedProps = {
      completed: ["Biology - Cells"],
      onComplete: () => {},
      onReschedule: () => {},
      onUnlock: () => {},
      schedule,
      scheduleStartDate: "2999-01-01",
      today: new Date(2026, 7, 23),
    };
    const revisionMarkup = renderToStaticMarkup(React.createElement(
      PlannerScheduleDay,
      { ...sharedProps, dayIndex: 1, item: schedule[1] },
    ));
    const nextStudyMarkup = renderToStaticMarkup(React.createElement(
      PlannerScheduleDay,
      { ...sharedProps, dayIndex: 2, item: schedule[2] },
    ));

    assert.match(revisionMarkup, />Revision block</u);
    assert.doesNotMatch(revisionMarkup, /is-locked|planner-day-unlock-btn/u);
    assert.match(nextStudyMarkup, /planner-day-card is-locked/u);
    assert.match(nextStudyMarkup, /aria-label="Take unlock quiz for Day 3"/u);
  } finally {
    await vite.close();
  }
});

test("exports the in-place clear schedule confirmation markup", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { ClearScheduleConfirmation } = await vite.ssrLoadModule(
      "/src/components/Timetable.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(
      ClearScheduleConfirmation,
    ));

    assert.match(markup, /role="alertdialog"/u);
    assert.match(markup, /aria-modal="true"/u);
    assert.match(markup, /Clear this schedule\?/u);
    assert.match(markup, /Your subjects stay saved\./u);
    assert.match(markup, /class="planner-clear-cancel-btn"[^>]*>Cancel</u);
    assert.match(markup, /class="planner-clear-delete-btn"[^>]*>Delete</u);
  } finally {
    await vite.close();
  }
});

test("keeps the clear confirmation above later schedule content and pointer-interactive", async () => {
  const styles = await readFile(new URL("../App.css", import.meta.url), "utf8");

  assert.match(
    styles,
    /\.schedule-card-header\s*\{[^}]*z-index:\s*50;/su,
  );
  assert.match(
    styles,
    /\.planner-clear-confirmation\s*\{[^}]*z-index:\s*40;[^}]*pointer-events:\s*auto;/su,
  );
  assert.match(
    styles,
    /body \.planner-clear-confirmation-actions button\s*\{[^}]*pointer-events:\s*auto;/su,
  );
});
