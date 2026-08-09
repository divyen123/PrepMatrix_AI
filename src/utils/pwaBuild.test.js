import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";
import { createPwaAssetManifest } from "../../vite.config.js";

const manifestUrl = new URL("../../public/manifest.webmanifest", import.meta.url);
const workerSource = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");

function pngDimensions(path) {
  const bytes = readFileSync(path);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(bytes.subarray(12, 16).toString("ascii"), "IHDR");
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function createHeaders(entries = {}) {
  const values = new Map(Object.entries(entries).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    get: (name) => values.get(String(name).toLowerCase()) ?? null,
    has: (name) => values.has(String(name).toLowerCase()),
  };
}

function createResponse(path, payload = null, headers = {}) {
  return {
    headers: createHeaders(headers),
    ok: true,
    path,
    status: 200,
    type: "basic",
    clone: () => createResponse(path, payload, headers),
    json: async () => payload,
  };
}

function cacheKey(request) {
  if (typeof request === "string") return request;
  return new URL(request.url).pathname;
}

function createWorkerHarness({ manifestAssets = [] } = {}) {
  const listeners = new Map();
  const cacheStores = new Map();
  const deletedCaches = [];
  const fetchCalls = [];
  const lifecycle = { claimed: 0, skippedWaiting: 0 };

  function createCache() {
    const entries = new Map();
    return {
      entries,
      delete: async (request) => entries.delete(cacheKey(request)),
      keys: async () => [...entries.keys()],
      match: async (request) => entries.get(cacheKey(request)),
      put: async (request, response) => {
        entries.set(cacheKey(request), response);
      },
    };
  }

  const caches = {
    delete: async (name) => {
      deletedCaches.push(name);
      return cacheStores.delete(name);
    },
    keys: async () => [...cacheStores.keys()],
    open: async (name) => {
      if (!cacheStores.has(name)) cacheStores.set(name, createCache());
      return cacheStores.get(name);
    },
  };
  const workerSelf = {
    addEventListener: (type, handler) => listeners.set(type, handler),
    caches,
    clients: {
      claim: async () => {
        lifecycle.claimed += 1;
      },
      matchAll: async () => [],
      openWindow: async () => null,
    },
    location: { origin: "https://prep-matrix-ai.vercel.app" },
    registration: { showNotification: async () => undefined },
    skipWaiting: async () => {
      lifecycle.skippedWaiting += 1;
    },
  };
  const fetchImpl = async (request) => {
    const path = typeof request === "string"
      ? new URL(request, workerSelf.location.origin).pathname
      : new URL(request.url).pathname;
    fetchCalls.push(path);
    if (path === "/asset-manifest.json") {
      return createResponse(path, { version: "test-build", assets: manifestAssets });
    }
    return createResponse(path);
  };

  vm.runInNewContext(workerSource, {
    Error,
    Promise,
    Set,
    URL,
    fetch: fetchImpl,
    self: workerSelf,
  });

  return {
    cacheStores,
    caches,
    deletedCaches,
    fetchCalls,
    lifecycle,
    listeners,
  };
}

function workerRequest(path, options = {}) {
  const headers = options.headers || {};
  return {
    destination: options.destination || "",
    headers: createHeaders(headers),
    method: options.method || "GET",
    mode: options.mode || "cors",
    url: path.startsWith("http") ? path : `https://prep-matrix-ai.vercel.app${path}`,
  };
}

test("PWA manifest references valid install icons and same-scope shortcuts", () => {
  const manifest = JSON.parse(readFileSync(manifestUrl, "utf8"));
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.name, "PrepMatrix AI");

  const expectedIcons = new Map([
    ["/pwa/icon-192.png", 192],
    ["/pwa/icon-512.png", 512],
    ["/pwa/icon-maskable-192.png", 192],
    ["/pwa/icon-maskable-512.png", 512],
  ]);
  assert.equal(manifest.icons.length, expectedIcons.size);
  assert.equal(manifest.icons.some(({ purpose }) => purpose === "any"), true);
  assert.equal(manifest.icons.some(({ purpose }) => purpose === "maskable"), true);

  for (const icon of manifest.icons) {
    const expectedSize = expectedIcons.get(icon.src);
    assert.equal(Number.isInteger(expectedSize), true, `Unexpected manifest icon: ${icon.src}`);
    const localPath = fileURLToPath(new URL(`../../public${icon.src}`, import.meta.url));
    assert.equal(existsSync(localPath), true, `Missing manifest icon: ${icon.src}`);
    assert.deepEqual(pngDimensions(localPath), { width: expectedSize, height: expectedSize });
    assert.equal(icon.sizes, `${expectedSize}x${expectedSize}`);
    assert.equal(icon.type, "image/png");
  }

  const supplementalIcons = [
    ["../../public/pwa/apple-touch-icon-180.png", 180],
    ["../../public/pwa/notification-badge-96.png", 96],
  ];
  for (const [relativePath, expectedSize] of supplementalIcons) {
    assert.deepEqual(
      pngDimensions(fileURLToPath(new URL(relativePath, import.meta.url))),
      { width: expectedSize, height: expectedSize },
    );
  }

  assert.deepEqual(
    manifest.shortcuts.map(({ url }) => url),
    ["/planner", "/learn", "/quiz"],
  );
});

test("Vite asset manifest is deterministic, complete, and excludes public heavyweight media", () => {
  const bundle = {
    "assets/z.css": { type: "asset", fileName: "assets/z.css", source: "body{}" },
    "assets/app.js": { type: "chunk", fileName: "assets/app.js", code: "export default 1" },
    "assets/sound.mp3": { type: "asset", fileName: "assets/sound.mp3", source: Uint8Array.from([1, 2, 3]) },
    "assets/app.js.map": { type: "asset", fileName: "assets/app.js.map", source: "{}" },
    "assets/backgrounds/large.jpg": { type: "asset", fileName: "assets/backgrounds/large.jpg", source: "large" },
    "assets/pets/sprite.webp": { type: "asset", fileName: "assets/pets/sprite.webp", source: "pet" },
    "index.html": { type: "asset", fileName: "index.html", source: "<html></html>" },
  };
  const publicInputs = [
    { fileName: "public/sw.js", contents: "const version = '__PREPMATRIX_BUILD_VERSION__'" },
    { fileName: "public/manifest.webmanifest", contents: "{\"name\":\"PrepMatrix\"}" },
    { fileName: "public/pwa/icon-192.png", contents: Uint8Array.from([1, 2, 3]) },
  ];
  const first = createPwaAssetManifest(bundle, publicInputs);
  const reordered = createPwaAssetManifest(
    Object.fromEntries(Object.entries(bundle).reverse()),
    [...publicInputs].reverse(),
  );

  assert.deepEqual(first, reordered);
  assert.deepEqual(first.assets, ["/assets/app.js", "/assets/sound.mp3", "/assets/z.css"]);
  assert.match(first.version, /^[a-f0-9]{20}$/);
  assert.notEqual(
    createPwaAssetManifest(
      { ...bundle, "index.html": { ...bundle["index.html"], source: "changed" } },
      publicInputs,
    ).version,
    first.version,
  );
  assert.notEqual(
    createPwaAssetManifest(bundle, publicInputs.map((input) => (
      input.fileName === "public/pwa/icon-192.png" ? { ...input, contents: Uint8Array.from([1, 2, 4]) } : input
    ))).version,
    first.version,
  );
});

test("service worker precaches the complete production shell and waits for update approval", async () => {
  const harness = createWorkerHarness({
    manifestAssets: [
      "/assets/app-123.js",
      "/assets/page-456.css",
      "/assets/backgrounds/too-large.jpg",
      "/pets/sprite.webp",
      "https://evil.example/assets/script.js",
    ],
  });
  let installWork;
  harness.listeners.get("install")({
    waitUntil: (promise) => {
      installWork = promise;
    },
  });
  await installWork;

  const shellName = [...harness.cacheStores.keys()].find((name) => name.startsWith("prepmatrix-pwa-shell-"));
  const cachedPaths = [...harness.cacheStores.get(shellName).entries.keys()];
  assert.equal(cachedPaths.includes("/index.html"), true);
  assert.equal(cachedPaths.includes("/manifest.webmanifest"), true);
  assert.equal(cachedPaths.includes("/pwa/icon-512.png"), true);
  assert.equal(cachedPaths.includes("/asset-manifest.json"), true);
  assert.equal(cachedPaths.includes("/assets/app-123.js"), true);
  assert.equal(cachedPaths.includes("/assets/page-456.css"), true);
  assert.equal(cachedPaths.some((path) => path.includes("backgrounds")), false);
  assert.equal(cachedPaths.some((path) => path.includes("pets")), false);
  assert.equal(harness.lifecycle.skippedWaiting, 0);

  let messageWork;
  harness.listeners.get("message")({
    data: { type: "SKIP_WAITING" },
    waitUntil: (promise) => {
      messageWork = promise;
    },
  });
  await messageWork;
  assert.equal(harness.lifecycle.skippedWaiting, 1);

  await harness.caches.open("prepmatrix-pwa-shell-old");
  await harness.caches.open("prepmatrix-offline-v1");
  await harness.caches.open("unrelated-site-cache");
  let activateWork;
  harness.listeners.get("activate")({
    waitUntil: (promise) => {
      activateWork = promise;
    },
  });
  await activateWork;
  assert.equal(harness.deletedCaches.includes("prepmatrix-pwa-shell-old"), true);
  assert.equal(harness.deletedCaches.includes("prepmatrix-offline-v1"), true);
  assert.equal(harness.deletedCaches.includes("unrelated-site-cache"), false);
  assert.equal(harness.cacheStores.has("unrelated-site-cache"), true);
  assert.equal(harness.lifecycle.claimed, 1);
});

test("service worker bypasses authenticated, API, cross-origin, range, and user-file requests", async () => {
  const harness = createWorkerHarness();
  const bypassedRequests = [
    workerRequest("/api/workspace"),
    workerRequest("/assets/private.js", { headers: { Authorization: "Bearer secret" }, destination: "script" }),
    workerRequest("/assets/video.mp4", { headers: { Range: "bytes=0-100" }, destination: "video" }),
    workerRequest("https://api.example.com/assets/app.js", { destination: "script" }),
    workerRequest("/downloads/personal-export.json"),
    workerRequest("/study-material.pdf"),
    workerRequest("/assets/app.js", { destination: "script", method: "POST" }),
  ];

  for (const request of bypassedRequests) {
    let responsePromise = null;
    harness.listeners.get("fetch")({
      request,
      respondWith: (promise) => {
        responsePromise = promise;
      },
      waitUntil: () => undefined,
    });
    assert.equal(responsePromise, null, `Unexpectedly intercepted ${request.url}`);
  }
  assert.equal(harness.fetchCalls.length, 0);

  let publicAssetResponse;
  harness.listeners.get("fetch")({
    request: workerRequest("/assets/app.js", { destination: "script" }),
    respondWith: (promise) => {
      publicAssetResponse = promise;
    },
    waitUntil: () => undefined,
  });
  assert.equal((await publicAssetResponse).ok, true);
  assert.deepEqual(harness.fetchCalls, ["/assets/app.js"]);
});

test("production worker source retains a single deterministic build-version placeholder", () => {
  assert.equal(workerSource.split("__PREPMATRIX_BUILD_VERSION__").length - 1, 1);
  assert.equal(
    existsSync(fileURLToPath(new URL("../../scripts/generate-pwa-icons.mjs", import.meta.url))),
    true,
  );
});
