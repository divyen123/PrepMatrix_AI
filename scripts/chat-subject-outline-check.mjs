import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

// An in-memory React harness: assertions only, with no screenshots or QA files.
const virtualId = "\0chat-subject-outline-check.jsx";
const harness = `
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Card from "/src/components/ChatSubjectOutlineCard.jsx";
import { mergeChatSubjectOutline, undoChatSubjectOutline } from "/src/utils/chatSubjectOutline.js";
import { persistChatSubjectMutation } from "/src/utils/chatSubjectPersistence.js";

const scenario = new URLSearchParams(location.search).get("scenario");
const outline = {
  subjectName: scenario === "ambiguous" ? "DSA" : "Data Structures",
  chapterNames: ["Arrays", "Linked lists"], topics: ["Time complexity"], difficulty: "medium",
};
const initial = scenario === "existing"
  ? [{ name: "Data Structures", chapters: 2, difficulty: "hard", custom: "retain" }]
  : scenario === "ambiguous"
    ? [{ name: "Data Structures and Algorithms", chapters: 0, difficulty: "easy" }]
    : scenario === "saved" ? mergeChatSubjectOutline([], outline).subjects : [];

function Harness() {
  const [subjects, setSubjects] = useState(initial);
  const [profileId, setProfileId] = useState("profile-a");
  const stateRef = useRef(null);
  const callsRef = useRef(0);
  const receiptRef = useRef(null);
  const openedRef = useRef("");
  stateRef.current = { subjects, profileId, epoch: profileId === "profile-a" ? 1 : 2, ready: true };
  useEffect(() => {
    window.outlineCheck = {
      read: () => ({ subjects: stateRef.current.subjects, calls: callsRef.current, opened: openedRef.current }),
      undo: () => {
        const restored = undoChatSubjectOutline(stateRef.current.subjects, receiptRef.current);
        stateRef.current = { ...stateRef.current, subjects: restored };
        setSubjects(restored);
      },
      switchProfile: () => {
        stateRef.current = { subjects: [], profileId: "profile-b", epoch: 2, ready: true };
        setSubjects([]);
        setProfileId("profile-b");
      },
    };
    return () => { delete window.outlineCheck; };
  }, []);
  const onAdd = async (draft, options) => {
    callsRef.current += 1;
    const result = await persistChatSubjectMutation({
      readCurrent: () => stateRef.current,
      prepare: (latest) => mergeChatSubjectOutline(latest, draft, {
        targetIndex: options.targetIndex, expectedTargetName: options.targetSubjectName,
      }),
      saveSubjects: async () => {
        if (scenario === "retry" && callsRef.current === 1) throw new Error("Simulated save failure");
        if (scenario === "delayed") await new Promise((resolve) => setTimeout(resolve, 500));
      },
      commitSubjects: (next) => {
        stateRef.current = { ...stateRef.current, subjects: next };
        setSubjects(next);
      },
    });
    receiptRef.current = result.undoReceipt;
    return { ...result, subjectName: result.subject.name };
  };
  return React.createElement(Card, {
    academicProfileDataId: profileId, outline, subjects, onAdd,
    onOpenSubject: (name) => { openedRef.current = name; },
  });
}
createRoot(document.getElementById("root")).render(React.createElement(Harness));
`;

const vite = await createServer({
  root: fileURLToPath(new URL("../", import.meta.url)),
  configFile: false,
  appType: "custom",
  logLevel: "error",
  plugins: [react(), {
    name: "chat-subject-outline-check",
    resolveId(id) { if (id === "virtual:chat-subject-outline-check") return virtualId; },
    load(id) { if (id === virtualId) return harness; },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/__outline-check")) return next();
        const html = await server.transformIndexHtml(req.url, '<html><head><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module" src="/@id/virtual:chat-subject-outline-check"></script></body></html>');
        res.setHeader("Content-Type", "text/html");
        res.end(html);
      });
    },
  }],
  server: { host: "127.0.0.1", port: 0 },
});

let browser;
try {
  await vite.listen();
  const port = vite.httpServer.address().port;
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL ? { channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL } : {}),
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => { errors.push(error.message); console.error(error.message); });
  page.on("console", (message) => { if (message.type() === "error") console.error(message.text()); });
  const load = async (scenario) => {
    await page.goto(`http://127.0.0.1:${port}/__outline-check?scenario=${scenario}`);
    await page.waitForFunction(() => Boolean(window.outlineCheck), null, { timeout: 15000 });
  };
  const read = () => page.evaluate(() => window.outlineCheck.read());
  const waitForAdded = () => page.getByRole("button", { name: "Added", exact: true }).waitFor();

  await load("new");
  await page.getByRole("button", { name: "Add to subject", exact: true }).click();
  await waitForAdded();
  assert.equal((await read()).subjects.length, 1);
  await page.getByRole("button", { name: "Open subject", exact: true }).click();
  assert.equal((await read()).opened, "Data Structures");
  await page.evaluate(() => window.outlineCheck.undo());
  await page.getByRole("button", { name: "Add to subject", exact: true }).click();
  await waitForAdded();
  assert.equal((await read()).subjects.length, 1);

  await load("existing");
  await page.getByRole("button", { name: "Add to subject", exact: true }).click();
  await waitForAdded();
  const existing = (await read()).subjects[0];
  assert.equal(existing.chapters, 2);
  assert.deepEqual(existing.chapterNames, ["Arrays", "Linked lists"]);
  assert.equal(existing.difficulty, "hard");
  assert.equal(existing.custom, "retain");

  await load("retry");
  await page.getByRole("button", { name: "Add to subject", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Simulated save failure" }).waitFor();
  assert.deepEqual((await read()).subjects, []);
  await page.getByRole("button", { name: "Retry add", exact: true }).click();
  await waitForAdded();
  assert.equal((await read()).calls, 2);

  await load("ambiguous");
  assert.equal(await page.getByRole("button", { name: "Add to subject", exact: true }).isDisabled(), true);
  await page.getByLabel("Destination subject").selectOption("new");
  await page.getByRole("button", { name: "Add to subject", exact: true }).click();
  await waitForAdded();
  assert.equal((await read()).subjects.length, 2);
  await page.evaluate(() => window.outlineCheck.undo());
  await page.getByRole("button", { name: "Add to subject", exact: true }).waitFor();
  await page.getByLabel("Destination subject").selectOption("subject:0");
  await page.getByRole("button", { name: "Add to subject", exact: true }).click();
  await waitForAdded();
  assert.equal((await read()).subjects.length, 1);
  assert.equal((await read()).subjects[0].name, "Data Structures and Algorithms");

  await load("delayed");
  await page.getByRole("button", { name: "Add to subject", exact: true }).evaluate((button) => {
    button.click();
    button.click();
  });
  await waitForAdded();
  assert.equal((await read()).calls, 1);

  await load("delayed");
  await page.getByRole("button", { name: "Add to subject", exact: true }).click();
  await page.evaluate(() => window.outlineCheck.switchProfile());
  await page.waitForTimeout(650);
  assert.deepEqual((await read()).subjects, []);
  assert.equal(await page.getByRole("button", { name: "Add to subject", exact: true }).isEnabled(), true);

  await load("new");
  await page.getByRole("button", { name: "Edit outline", exact: true }).click();
  await page.getByLabel("Subject name", { exact: true }).fill("");
  assert.equal(await page.getByRole("button", { name: "Add to subject", exact: true }).isDisabled(), true);
  await page.getByLabel("Subject name", { exact: true }).fill("Algorithms");
  await page.getByLabel("Chapter names · one per line").fill("Sorting\nSearching");
  await page.getByLabel("Focus topics · one per line").fill("");
  await page.getByRole("button", { name: "Add to subject", exact: true }).click();
  await waitForAdded();
  assert.equal((await read()).subjects[0].name, "Algorithms");
  assert.deepEqual((await read()).subjects[0].chapterNames, ["Sorting", "Searching"]);

  await load("saved");
  await waitForAdded();
  assert.equal((await read()).calls, 0);
  assert.equal(await page.getByRole("button", { name: "Added", exact: true }).isDisabled(), true);
  assert.deepEqual(errors, []);
  console.log("Passed 8 headless outline interaction checks: create/Undo, merge, retry, target choice, double click, profile switch, editing, and restored content.");
} finally {
  await browser?.close();
  await vite.close();
}
