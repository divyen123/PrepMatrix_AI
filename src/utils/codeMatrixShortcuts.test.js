import assert from "node:assert/strict";
import test from "node:test";
import { resolveCodeMatrixShortcut } from "./codeMatrixShortcuts.js";

const keyEvent = (key, modifiers = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  defaultPrevented: false,
  ...modifiers,
});

test("CodeMatrix shortcuts run code and save the active file on both platforms", () => {
  assert.equal(resolveCodeMatrixShortcut(keyEvent("Enter", { ctrlKey: true })), "run");
  assert.equal(resolveCodeMatrixShortcut(keyEvent("Enter", { metaKey: true })), "run");
  assert.equal(resolveCodeMatrixShortcut(keyEvent("s", { ctrlKey: true })), "save");
  assert.equal(resolveCodeMatrixShortcut(keyEvent("S", { metaKey: true })), "save");
});

test("CodeMatrix shortcuts do not consume unrelated or modified keys", () => {
  assert.equal(resolveCodeMatrixShortcut(keyEvent("s")), null);
  assert.equal(resolveCodeMatrixShortcut(keyEvent("s", { ctrlKey: true, shiftKey: true })), null);
  assert.equal(resolveCodeMatrixShortcut(keyEvent("s", { ctrlKey: true, altKey: true })), null);
  assert.equal(resolveCodeMatrixShortcut(keyEvent("s", { ctrlKey: true, metaKey: true })), null);
  assert.equal(resolveCodeMatrixShortcut(keyEvent("Enter", { ctrlKey: true, repeat: true })), null);
  assert.equal(resolveCodeMatrixShortcut(keyEvent("Enter", { ctrlKey: true, defaultPrevented: true })), null);
});
