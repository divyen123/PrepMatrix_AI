import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_NAVIGATION_SHORTCUTS,
  APP_SHORTCUT_GUIDE_GROUPS,
  resolveAppKeyboardShortcut,
} from "./appKeyboardShortcuts.js";

function keyboardEvent(overrides = {}) {
  return {
    altKey: false,
    ctrlKey: false,
    defaultPrevented: false,
    key: "",
    metaKey: false,
    repeat: false,
    shiftKey: false,
    target: null,
    ...overrides,
  };
}

test("resolves global workspace shortcuts", () => {
  assert.deepEqual(
    resolveAppKeyboardShortcut(keyboardEvent({ ctrlKey: true, shiftKey: true, key: "M" })),
    { action: "toggle-microphone" },
  );
  assert.deepEqual(
    resolveAppKeyboardShortcut(keyboardEvent({ ctrlKey: true, key: "k" })),
    { action: "focus-ask" },
  );
  assert.deepEqual(
    resolveAppKeyboardShortcut(keyboardEvent({ ctrlKey: true, key: "," })),
    { action: "open-settings" },
  );
});

test("keeps all ten numbered navigation routes mapped", () => {
  assert.equal(APP_NAVIGATION_SHORTCUTS.length, 10);
  APP_NAVIGATION_SHORTCUTS.forEach((shortcut) => {
    assert.deepEqual(
      resolveAppKeyboardShortcut(keyboardEvent({ altKey: true, key: shortcut.key })),
      shortcut,
    );
  });
});

test("guide presents workspace, navigation, and page-specific actions", () => {
  assert.deepEqual(
    APP_SHORTCUT_GUIDE_GROUPS.map((group) => group.id),
    ["workspace", "navigation", "page-actions"],
  );
  assert.ok(APP_SHORTCUT_GUIDE_GROUPS.flatMap((group) => group.items).length >= 25);
});

test("ignores repeats and shortcuts with conflicting modifiers", () => {
  assert.equal(resolveAppKeyboardShortcut(keyboardEvent({ ctrlKey: true, key: "k", repeat: true })), null);
  assert.equal(resolveAppKeyboardShortcut(keyboardEvent({ altKey: true, ctrlKey: true, key: "1" })), null);
});

test("does not open the guide while the user is typing", () => {
  const editableTarget = { closest: () => ({}) };
  assert.equal(resolveAppKeyboardShortcut(keyboardEvent({ key: "?", target: editableTarget })), null);
  assert.deepEqual(resolveAppKeyboardShortcut(keyboardEvent({ key: "?" })), {
    action: "open-shortcut-guide",
  });
});
