import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const stylesheet = readFileSync(new URL("./App.css", import.meta.url), "utf8");
const entrySplashStart = appSource.indexOf("function EntrySplash");
const entrySplashEnd = appSource.indexOf("\nfunction LogoutTransition", entrySplashStart);
const entrySplashSource = appSource.slice(entrySplashStart, entrySplashEnd);

test("uses the 2.9-second main entry sequence", () => {
  assert.match(appSource, /const ENTRY_SPLASH_DURATION_MS = 2_900;/u);
  assert.match(
    stylesheet,
    /animation:\s*entrySplashFadeOut 2\.9s ease forwards;/u,
  );
  assert.match(
    stylesheet,
    /animation:\s*entrySplashRingsReveal 2\.9s [^;]+ forwards;/u,
  );
  assert.match(
    stylesheet,
    /animation:\s*entrySplashContentReveal 2\.9s [^;]+ forwards;/u,
  );
});

test("keeps the main splash visible while session recovery is pending", () => {
  assert.match(appSource, /function EntrySplash\(\{ loading = false \}\)/u);
  assert.match(appSource, /className=\{`entry-splash\$\{loading \? " is-loading" : ""\}`\}/u);
  assert.match(appSource, /maxRenderDuration=\{loading \? 0 : ENTRY_SPLASH_DURATION_MS\}/u);
  assert.match(appSource, /<EntrySplash loading=\{authLoading\} \/>/u);
  assert.match(
    stylesheet,
    /\.entry-splash\.is-loading\s*\{\s*animation:\s*none;/u,
  );
});

test("reveals the entry splash once without replaying after session recovery", () => {
  assert.doesNotMatch(
    stylesheet,
    /\.entry-splash\.is-loading \.entry-splash-(?:rings|card)/u,
  );
  assert.match(
    stylesheet,
    /@keyframes entrySplashContentReveal[\s\S]*?18%, 100%\s*\{\s*opacity:\s*1;\s*transform:\s*translateY\(0\) scale\(1\);/u,
  );
  assert.match(
    stylesheet,
    /@keyframes entrySplashRingsReveal[\s\S]*?24%, 100%\s*\{\s*opacity:\s*0\.96;/u,
  );
});

test("locks document scrolling for the full entry splash mount", () => {
  assert.ok(entrySplashStart >= 0 && entrySplashEnd > entrySplashStart);
  assert.match(
    appSource,
    /import\s*\{\s*acquireDocumentScrollLock\s*\}\s*from\s*["']\.\/utils\/documentScrollLock["'];/u,
  );

  const lockAcquisition = entrySplashSource.indexOf(
    "const releaseScrollLock = acquireDocumentScrollLock()",
  );
  const effectStart = entrySplashSource.lastIndexOf("useEffect", lockAcquisition);
  const effectEnd = entrySplashSource.indexOf("}, []);", lockAcquisition);
  const scrollLockEffect = entrySplashSource.slice(effectStart, effectEnd);

  assert.ok(lockAcquisition >= 0 && effectStart >= 0 && effectEnd > lockAcquisition);
  assert.match(scrollLockEffect, /return\s+\(\)\s*=>\s*releaseScrollLock\(\);/u);
  assert.doesNotMatch(scrollLockEffect, /style\.overflow/u);
  assert.match(
    stylesheet,
    /html:has\(\.entry-splash\),\s*body:has\(\.entry-splash\)\s*\{[^}]*overflow:\s*hidden !important;[^}]*overscroll-behavior:\s*none;/u,
  );
});

test("keeps the main intro concise with a smaller brand title", () => {
  assert.doesNotMatch(appSource, /Preparing your study workspace/u);
  assert.doesNotMatch(stylesheet, /\.entry-splash-message\s*\{/u);
  assert.match(
    stylesheet,
    /\.entry-splash-title\s*\{[\s\S]*?font-size:\s*clamp\(2\.4rem, 5\.2vw, 4\.5rem\);/u,
  );
});
