import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const tableReply = `3. **Concrete example**

| Step | Operation | Front | Rear | Queue (array) | Comment |
| --- | --- | ---: | ---: | --- | --- |
| 1 | Init \`cap=5\` | -1 | -1 | \`[_ _ _ _ _]\` | Empty |
| 2 | Enqueue 10 | 0 | 0 | \`[10 _ _ _ _]\` | |
| 3 | Enqueue 20 | 0 | 1 | \`[10 20 _ _ _]\` |`;

test("renders answer tables as aligned semantic markup instead of raw pipe text", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: ChatMessageText } = await vite.ssrLoadModule(
      "/src/components/ChatMessageText.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(ChatMessageText, {
      text: tableReply,
    }));

    assert.match(markup, /<table class="chat-markdown-table">/u);
    assert.match(markup, /<thead><tr>/u);
    assert.match(markup, /<tbody><tr>/u);
    assert.equal(markup.match(/<th\b/gu)?.length, 6);
    assert.equal(markup.match(/<td\b/gu)?.length, 18);
    assert.match(markup, /data-align="right"[^>]*>Front/u);
    assert.match(markup, /<code class="chat-inline-code">cap=5<\/code>/u);
    assert.doesNotMatch(markup, /\| Step \||\| --- \||`cap=5`/u);
  } finally {
    await vite.close();
  }
});

test("keeps ordinary pipe prose while preserving lists and safe inline formatting", async () => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: ChatMessageText } = await vite.ssrLoadModule(
      "/src/components/ChatMessageText.jsx",
    );
    const markup = renderToStaticMarkup(React.createElement(ChatMessageText, {
      text: "Choose A | B without a delimiter.\n- **Review** `FIFO`\n2. Explain the result",
    }));

    assert.doesNotMatch(markup, /<table/u);
    assert.match(markup, /<p class="chat-paragraph">Choose A \| B without a delimiter\.<\/p>/u);
    assert.match(markup, /<ul class="chat-bullet-list">/u);
    assert.match(markup, /<strong>Review<\/strong> <code class="chat-inline-code">FIFO<\/code>/u);
    assert.match(markup, /<ol class="chat-num-list" start="2">/u);
  } finally {
    await vite.close();
  }
});

test("keeps wide answer tables contained and aligned in the chat message", async () => {
  const stylesheet = await readFile(new URL("../App.css", import.meta.url), "utf8");

  assert.match(
    stylesheet,
    /\.sidebar-chatbot-portal \.chat-message\.assistant:has\(\.chat-table-scroll\)\s*\{[\s\S]*?max-width:\s*100%\s*!important;/u,
  );
  assert.match(
    stylesheet,
    /\.sidebar-chatbot-portal \.chat-table-scroll\s*\{[\s\S]*?width:\s*100%;[\s\S]*?overflow-x:\s*auto;/u,
  );
  assert.match(
    stylesheet,
    /\.sidebar-chatbot-portal \.chat-markdown-table th,[\s\S]*?text-align:\s*left;[\s\S]*?vertical-align:\s*top;[\s\S]*?white-space:\s*normal\s*!important;/u,
  );
});
