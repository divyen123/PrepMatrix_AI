import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

test("the practice guide works for both manual help and first-time onboarding", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: Guide } = await vite.ssrLoadModule("/src/components/PrepMatrixGuideDialog.jsx");
    const render = (props) => renderToStaticMarkup(React.createElement(
      MemoryRouter,
      {},
      React.createElement(Guide, props),
    ));
    assert.equal(render({ open: false }), "");

    const profile = {
      academicLevel: "Medical / Health Sciences",
      academicTrack: "Medical & Health Sciences",
      degree: "BDS",
      department: "Dentistry",
    };
    const manual = render({ open: true, academicProfile: profile });
    const onboarding = render({ open: true, academicProfile: profile, variant: "onboarding", userName: "Mohan" });

    for (const markup of [manual, onboarding]) {
      assert.match(markup, /role="dialog"/u);
      assert.match(markup, /aria-modal="true"/u);
      assert.match(markup, /data-step="profile"/u);
      assert.match(markup, /BDS/u);
      assert.match(markup, /Watch demo/u);
      assert.match(markup, /Open Settings/u);
      assert.equal((markup.match(/class="guide-step-number"/gu) || []).length, 7);
      assert.doesNotMatch(markup, /guide-instruction-list|guide-tip/u);
    }
    assert.match(manual, /Learn PrepMatrix by doing/u);
    assert.match(onboarding, /Welcome to PrepMatrix, Mohan/u);
    assert.match(onboarding, /guide-dialog-backdrop--onboarding/u);
  } finally {
    await vite.close();
  }
});
