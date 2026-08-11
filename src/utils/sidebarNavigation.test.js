import test from "node:test";
import assert from "node:assert/strict";
import { getPrimarySidebarNavItems } from "./sidebarNavigation.js";

const ITEMS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/kids", label: "Play & Learn" },
  { to: "/ai-chat", label: "AI Chat" },
  { to: "/exam", label: "Exam" },
  { to: "/subjects", label: "Subjects" },
];

test("moves young-kids destinations from text navigation into sidebar launchers", () => {
  assert.deepEqual(
    getPrimarySidebarNavItems(ITEMS, { isYoungKidsLearner: true }).map((item) => item.to),
    ["/dashboard", "/subjects"],
  );
});

test("keeps the kids route in text navigation for non-young school challenge learners", () => {
  assert.deepEqual(
    getPrimarySidebarNavItems(ITEMS, { isYoungKidsLearner: false }).map((item) => item.to),
    ["/dashboard", "/kids", "/subjects"],
  );
});
