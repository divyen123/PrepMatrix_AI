import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const baseMonitor = {
  status: "paused",
  statusReason: "not_started",
  active: false,
  isStarting: false,
  isSupported: true,
  streamActive: false,
  failure: null,
  capabilities: null,
  videoRef: { current: null },
  progress: {
    remainingUntilNudgeMs: 30_000,
    progress: 0,
  },
  start: () => {},
  retry: () => {},
  pause: () => {},
};

async function loadComponent() {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  const module = await vite.ssrLoadModule("/src/components/DistractionAwareFocusRoom.jsx");
  return { vite, module };
}

test("renders explicit webcam consent and truthful browser-only privacy copy", async () => {
  const { vite, module } = await loadComponent();
  try {
    const markup = renderToStaticMarkup(React.createElement(module.FocusRoomPanel, {
      monitor: baseMonitor,
      subject: "Biology",
    }));

    assert.match(markup, /Enable private focus monitor/u);
    assert.match(markup, /Your camera stays off until you opt in\./u);
    assert.match(markup, /Camera frames and detections stay in this browser\./u);
    assert.match(markup, /Nothing is recorded, uploaded, or saved\./u);
    assert.match(markup, /Switching tabs pauses monitoring and turns the camera off\./u);
    assert.match(markup, /On-device only/u);
  } finally {
    await vite.close();
  }
});
test("renders distraction countdown and configured detector capabilities", async () => {
  const { vite, module } = await loadComponent();
  try {
    const markup = renderToStaticMarkup(React.createElement(module.FocusRoomPanel, {
      monitor: {
        ...baseMonitor,
        status: "distracted",
        statusReason: "phone_detected",
        active: true,
        streamActive: true,
        capabilities: { headPose: true, phoneDetection: true },
        progress: { remainingUntilNudgeMs: 12_200, progress: 0.593 },
      },
    }));

    assert.match(markup, /A phone may be in use\./u);
    assert.match(markup, /Gentle reminder in 13s if this continues/u);
    assert.match(markup, /Look-away active/u);
    assert.match(markup, /Phone detection active/u);
    assert.match(markup, /Pause &amp; turn off camera/u);
  } finally {
    await vite.close();
  }
});

test("builds a gentle personalized nudge and can use injected browser speech", async () => {
  const { vite } = await loadComponent();
  try {
    const nudge = await vite.ssrLoadModule("/src/utils/focusRoomNudge.js");
    const message = nudge.buildFocusNudgeMessage("Divyen Shah", "Biology");
    assert.equal(message, "Hey Divyen, let's get back to studying Biology.");

    const spoken = [];
    class TestUtterance {
      constructor(text) {
        this.text = text;
      }
    }
    const supported = nudge.speakFocusNudge(message, {
      speechSynthesis: { speak: (utterance) => spoken.push(utterance) },
      Utterance: TestUtterance,
    });
    assert.equal(supported, true);
    assert.equal(spoken[0].text, message);
    assert.equal(spoken[0].volume, 0.72);
  } finally {
    await vite.close();
  }
});
