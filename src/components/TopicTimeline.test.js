import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const timelineSource = readFileSync(new URL("./TopicTimeline.jsx", import.meta.url), "utf8");
const appStyles = readFileSync(new URL("../App.css", import.meta.url), "utf8");

test("topic progress lanes rotate through subtle subject card tones", () => {
  assert.match(
    timelineSource,
    /const TOPIC_LANE_TONES = \["azure", "teal", "violet", "amber", "rose"\]/u,
  );
  assert.match(
    timelineSource,
    /topic-lane-card--\$\{TOPIC_LANE_TONES\[index % TOPIC_LANE_TONES\.length\]\}/u,
  );

  for (const tone of ["azure", "teal", "violet", "amber", "rose"]) {
    assert.match(
      appStyles,
      new RegExp(`\\.topic-lane-card--${tone}\\s*\\{[\\s\\S]*?--topic-lane-rgb:`, "u"),
    );
  }

  assert.match(
    appStyles,
    /\.topic-lane-card\s*\{[\s\S]*?background:[\s\S]*?rgba\(var\(--topic-lane-rgb\), 0\.15\)/u,
  );
  assert.match(appStyles, /\.topic-lane-track div\s*\{[\s\S]*?rgb\(var\(--topic-lane-rgb\)\)/u);
  assert.match(appStyles, /\.topic-lane-dots span\.done\s*\{[\s\S]*?rgb\(var\(--topic-lane-rgb\)\)/u);
});
