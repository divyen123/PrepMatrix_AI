import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const apiSource = readFileSync(new URL("./apiClient.js", import.meta.url), "utf8");
const chatbotSource = readFileSync(new URL("../components/Chatbot.jsx", import.meta.url), "utf8");

test("the API client persists a boolean chat pin with the dedicated endpoint", () => {
  assert.match(
    apiSource,
    /setChatSessionPinned: \(id, pinned, options = \{\}\) => request\(`\/api\/chat-sessions\/\$\{id\}\/pin`, \{[\s\S]*?method: "PATCH"[\s\S]*?JSON\.stringify\(\{ pinned \}\)/u,
  );
});

test("chat history exposes a right-click pin menu and updates both history collections", () => {
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
  assert.match(chatbotSource, /sessionContextMenu\.pinned \? "Unpin chat" : "Pin chat"/u);
  assert.match(chatbotSource, /role="menu"/u);
  assert.match(chatbotSource, /role="menuitem"/u);
});

test("existing chat activity keeps pinned-first ordering", () => {
  const responseUpdateStart = chatbotSource.indexOf("const hasMatch = current.some");
  const responseUpdateEnd = chatbotSource.indexOf("if (historySearchQuery)", responseUpdateStart);
  const responseUpdate = chatbotSource.slice(responseUpdateStart, responseUpdateEnd);

  assert.ok(responseUpdateStart >= 0 && responseUpdateEnd > responseUpdateStart);
  assert.match(responseUpdate, /sortChatSessionsPinnedFirst/u);
});
