import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("legacy revised-note teaching remains readable in notebook content without the old outline page", async () => {
  const vite = await createServer({ appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  try {
    const { default: NotebookContent } = await vite.ssrLoadModule("/src/components/NotebookContent.jsx");
    const notebook = {
      subjectName: "Operating Systems",
      chapters: [{ id: "memory", title: "Memory", topics: [{ id: "memory-management", title: "Memory management", summary: "How memory is allocated.", keyPoints: ["Paging"] }] }],
      revisedNotes: [
        { id: "legacy-note", title: "Memory management", content: "Paging divides memory into fixed-size units.", keyPoints: ["Pages map to frames."], revisionTips: ["Draw the address translation path."] },
        { id: "standalone", title: "Additional observations", content: "A page fault can require a disk read." },
      ],
    };
    const render = (value) => renderToStaticMarkup(React.createElement(NotebookContent, { notebook: value, completionByTopic: { "memory-management": true }, isSaving: () => false }));
    const legacy = render(notebook);
    assert.match(legacy, /Paging divides memory into fixed-size units\./u);
    assert.match(legacy, /Pages map to frames\./u);
    assert.match(legacy, /Draw the address translation path\./u);
    assert.match(legacy, /A page fault can require a disk read\./u);
    assert.match(legacy, /aria-pressed="true"/u);
    assert.doesNotMatch(legacy, /Topic outline/u);

    const modern = structuredClone(notebook);
    modern.chapters[0].topics[0].explanation = "The complete modern explanation covers paging and protection.";
    modern.revisedNotes = [modern.revisedNotes[0]];
    const detailed = render(modern);
    assert.match(detailed, /The complete modern explanation covers paging and protection\./u);
    assert.doesNotMatch(detailed, /Paging divides memory into fixed-size units\./u);
    assert.doesNotMatch(detailed, /Saved notes/u);

    const notesOnly = render({ ...notebook, chapters: [] });
    assert.match(notesOnly, /Paging divides memory into fixed-size units\./u);
    assert.match(notesOnly, /A page fault can require a disk read\./u);
  } finally {
    await vite.close();
  }
});
