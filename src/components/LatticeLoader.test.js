import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const stylesheet = readFileSync(new URL("./LatticeLoader.css", import.meta.url), "utf8");

test("renders the React Bits lattice as an accessible, theme-aware unboxed status", async () => {
  let vite;
  try {
    vite = await createServer({
      appType: "custom",
      logLevel: "silent",
      server: { middlewareMode: true },
    });
    const { default: LatticeLoader } = await vite.ssrLoadModule("/src/components/LatticeLoader.jsx");
    const working = renderToStaticMarkup(React.createElement(LatticeLoader, {
      className: "generation-lattice-loader",
      label: "Generating AI quiz",
    }));
    const completed = renderToStaticMarkup(React.createElement(LatticeLoader, {
      label: "Generating AI quiz",
      status: "done",
    }));

    assert.match(working, /role="status"/u);
    assert.match(working, /aria-busy="true"/u);
    assert.match(working, /class="lattice-loader generation-lattice-loader"/u);
    assert.match(working, /Generating AI quiz, in progress/u);
    assert.match(working, /class="lattice-loader__timer"/u);
    assert.match(completed, /data-status="done"/u);
    assert.match(completed, /Done in/u);
  } finally {
    await vite?.close();
  }

  assert.match(
    stylesheet,
    /\.lattice-loader\.generation-lattice-loader\s*\{[^}]*color:\s*var\(--text\);[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/u,
  );
  assert.match(stylesheet, /@media \(prefers-reduced-motion:\s*reduce\)/u);
});
