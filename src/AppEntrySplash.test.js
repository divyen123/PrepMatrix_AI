import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("./App.css", import.meta.url), "utf8");

test("uses the extended 3.9-second main entry sequence", () => {
  assert.match(appSource, /const ENTRY_SPLASH_DURATION_MS = 3_900;/u);
  assert.match(
    stylesheet,
    /animation:\s*entrySplashFadeOut 3\.9s ease forwards;/u,
  );
  assert.match(
    stylesheet,
    /animation:\s*entrySplashRingsReveal 3\.9s [^;]+ forwards;/u,
  );
  assert.match(
    stylesheet,
    /animation:\s*entrySplashContentReveal 3\.9s [^;]+ forwards;/u,
  );
});

test("keeps the main splash visible while session recovery is pending", () => {
  assert.match(appSource, /function EntrySplash\(\{ loading = false \}\)/u);
  assert.match(appSource, /className=\{`entry-splash\$\{loading \? " is-loading" : ""\}`\}/u);
  assert.match(appSource, /maxRenderDuration=\{loading \? 0 : ENTRY_SPLASH_DURATION_MS\}/u);
  assert.match(appSource, /<EntrySplash loading=\{authLoading\} \/>/u);
  assert.match(
    stylesheet,
    /\.entry-splash\.is-loading,[\s\S]*?animation:\s*none;/u,
  );
});
