import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const apiSource = readFileSync(new URL("./apiClient.js", import.meta.url), "utf8");
const chatbotSource = readFileSync(new URL("../components/Chatbot.jsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("../App.css", import.meta.url), "utf8");

test("the API client persists a boolean chat pin with the dedicated endpoint", () => {
  assert.match(
    apiSource,
    /setChatSessionPinned: \(id, pinned, options = \{\}\) => request\(`\/api\/chat-sessions\/\$\{id\}\/pin`, \{[\s\S]*?method: "PATCH"[\s\S]*?JSON\.stringify\(\{ pinned \}\)/u,
  );
});

test("chat history exposes one overflow menu with pin, edit, and delete actions", () => {
  const handlerStart = chatbotSource.indexOf("const handleOpenSessionContextMenu =");
  const handlerEnd = chatbotSource.indexOf("// Delete a session", handlerStart);
  const handlers = chatbotSource.slice(handlerStart, handlerEnd);
  const listStart = chatbotSource.indexOf("{visibleSessions.map((s) => {");
  const listEnd = chatbotSource.indexOf("{/* Right Panel: Active Chat */}", listStart);
  const list = chatbotSource.slice(listStart, listEnd);

  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
  assert.match(handlers, /api\.setChatSessionPinned\(sessionId, nextPinned\)/u);
  assert.match(handlers, /setSessions\(updatePinnedSession\)/u);
  assert.match(handlers, /setHistorySearchResponse/u);
  assert.match(list, /onContextMenu=\{\(event\) => handleOpenSessionContextMenu\(event, s\)\}/u);
  assert.match(list, /handleToggleSessionActionsMenu\(event, s\)/u);
  assert.match(list, /aria-haspopup="menu"/u);
  assert.match(list, /aria-expanded=\{isActionsMenuOpen\}/u);
  assert.match(list, /data-session-id=\{s\._id\}/u);
  assert.match(list, /<Ellipsis aria-hidden="true" size=\{15\} \/>/u);
  assert.doesNotMatch(list, /aria-label="Rename conversation"/u);
  assert.doesNotMatch(list, /aria-label="Delete conversation"/u);
  assert.match(chatbotSource, /sessionContextMenu\.pinned \? "Unpin" : "Pin"/u);
  assert.match(chatbotSource, /<span>Edit<\/span>/u);
  assert.match(chatbotSource, /<span>Delete<\/span>/u);
  assert.match(chatbotSource, /handleRequestSessionDeleteFromMenu[\s\S]*?setDeletingSessionId\(sessionId\)/u);
  assert.match(chatbotSource, /sessionMenuTriggerRef\.current\?\.contains\(event\.target\)/u);
  assert.match(chatbotSource, /role="menu"/u);
  assert.match(chatbotSource, /role="menuitem"/u);
});

test("chat delete uses inline check and cancel controls before mutating data", () => {
  assert.match(chatbotSource, /className="delete-confirm-wrap"[\s\S]*?role="group"/u);
  assert.match(chatbotSource, /aria-label=\{`Confirm deleting \$\{s\.title\}`\}[\s\S]*?<Check/u);
  assert.match(chatbotSource, /aria-label=\{`Cancel deleting \$\{s\.title\}`\}[\s\S]*?<X/u);
  assert.match(chatbotSource, /if \(deletingSessionBusyId\) return;[\s\S]*?api\.deleteChatSession\(sessionId\)/u);
  assert.match(chatbotSource, /event\.key === "Escape" && !isDeleting/u);
  assert.match(chatbotSource, /handleCancelSessionDelete[\s\S]*?restoreSessionActionFocus\(sessionId\)/u);
  assert.match(chatbotSource, /handleCancelSessionRename[\s\S]*?restoreSessionActionFocus\(sessionId\)/u);
});

test("existing chat activity keeps pinned-first ordering", () => {
  const responseUpdateStart = chatbotSource.indexOf("const hasMatch = current.some");
  const responseUpdateEnd = chatbotSource.indexOf("if (historySearchQuery)", responseUpdateStart);
  const responseUpdate = chatbotSource.slice(responseUpdateStart, responseUpdateEnd);

  assert.ok(responseUpdateStart >= 0 && responseUpdateEnd > responseUpdateStart);
  assert.match(responseUpdate, /sortChatSessionsPinnedFirst/u);
});

test("the chat pin menu stays opaque across dashboard themes", () => {
  assert.match(
    stylesheet,
    /body \.chat-session-context-menu\s*\{[^}]*--chat-session-menu-bg:\s*#ffffff;[^}]*background:\s*var\(--chat-session-menu-bg\);[^}]*backdrop-filter:\s*none;/u,
  );
  assert.match(
    stylesheet,
    /body\.dark \.chat-session-context-menu\s*\{[^}]*--chat-session-menu-bg:\s*#172033;/u,
  );
  assert.match(
    stylesheet,
    /body\.has-bg-image \.chat-session-context-menu\s*\{[^}]*--chat-session-menu-bg:\s*rgb\(var\(--bg-surface-rgb, 18, 27, 45\)\);/u,
  );
  assert.match(
    stylesheet,
    /body \.chat-session-context-menu button\s*\{[^}]*background:\s*var\(--chat-session-menu-bg\) !important;[^}]*backdrop-filter:\s*none !important;/u,
  );
  assert.doesNotMatch(
    stylesheet,
    /body \.chat-session-context-menu\s*\{[^}]*background:\s*var\(--surface-strong\);/u,
  );
  assert.match(stylesheet, /body \.chat-session-context-menu button\.is-danger\s*\{[^}]*color:\s*var\(--danger\) !important;/u);
  assert.match(stylesheet, /\.history-session-item:focus-within \.session-actions/u);
});
