import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

test("the compact stepper guide works for both manual help and first-time onboarding", async () => {
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
      assert.match(markup, /class="rb-stepper"/u);
      assert.match(markup, /Set up your profile/u);
      assert.match(markup, /aria-current="step"/u);
      assert.match(markup, /class="rb-stepper-next">Next/u);
      assert.equal((markup.match(/class="rb-stepper-indicator-group"/gu) || []).length, 4);
      assert.doesNotMatch(markup, /guide-step-nav|guide-demo|Watch demo|Open Settings/u);
    }
    assert.match(manual, /How to use PrepMatrix/u);
    assert.match(onboarding, /Welcome to PrepMatrix, Mohan/u);
    assert.match(onboarding, /prep-guide-backdrop--onboarding/u);
  } finally {
    await vite.close();
  }
});
