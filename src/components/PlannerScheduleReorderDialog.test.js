import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("renders safe order-wise and priority-wise reorder choices", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: Dialog } = await vite.ssrLoadModule(
      "/src/components/PlannerScheduleReorderDialog.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(Dialog, {
      onApply() {},
      onClose() {},
      open: true,
    }));

    assert.match(markup, /role="dialog"/u);
    assert.match(markup, /aria-modal="true"/u);
    assert.match(markup, /Reorder unfinished tasks/u);
    assert.match(markup, /Completed tasks, recall sessions, notes, learning tasks, dates, and time slots stay unchanged./u);
    assert.match(markup, /Order-wise/u);
    assert.match(markup, /Priority-wise/u);
    assert.match(markup, /name="planner-reorder-mode"/u);
    assert.match(markup, /checked=""[^>]*value="sequence"/u);
    assert.match(markup, />Apply reorder<\/button>/u);
  } finally {
    await vite.close();
  }
});
