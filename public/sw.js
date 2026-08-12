const BUILD_VERSION = "__PREPMATRIX_BUILD_VERSION__";
const SHELL_CACHE_NAME = `prepmatrix-pwa-shell-${BUILD_VERSION}`;
const RUNTIME_CACHE_NAME = `prepmatrix-pwa-runtime-${BUILD_VERSION}`;
const OWNED_CACHE_PREFIXES = [
  "prepmatrix-pwa-shell-",
  "prepmatrix-pwa-runtime-",
  "prepmatrix-offline-",
];
const BUILD_ASSET_MANIFEST_PATH = "/asset-manifest.json";
const FACE_DETECTION_ASSET_PATHS = [
  "/mediapipe/vision_wasm_internal.js",
  "/mediapipe/vision_wasm_internal.wasm",
  "/models/blaze-face-full-range.tflite",
];
const SHELL_PATHS = [
  "/",
  "/index.html",
  "/favicon.svg",
  "/manifest.webmanifest",
  "/pwa/brand-icon-192.png",
  "/pwa/brand-icon-512.png",
  "/pwa/brand-icon-maskable-192.png",
  "/pwa/brand-icon-maskable-512.png",
  "/pwa/brand-apple-touch-icon-180.png",
  "/pwa/notification-badge-96.png",
];
const PRIVATE_PATH_PREFIXES = [
  "/api/",
  "/attachments/",
  "/downloads/",
  "/exports/",
  "/generated/",
  "/private/",
  "/uploads/",
  "/user-content/",
];
const PRIVATE_FILE_PATTERN = /\.(?:docx?|pdf|pptx?|xlsx?|zip)$/i;
const RUNTIME_CACHE_MAX_ENTRIES = 72;

function safeAppPath(value, fallback = "/") {
  if (typeof value !== "string") return fallback;
  try {
    const parsed = new URL(value, self.location.origin);
    if (parsed.origin !== self.location.origin) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

function clientMatchesAppPath(clientUrl, appPath) {
  try {
    const client = new URL(clientUrl);
    const target = new URL(appPath, self.location.origin);
    return client.origin === target.origin && client.pathname === target.pathname;
  } catch {
    return false;
  }
}

function responseIsPublicAndCacheable(response) {
  if (!response?.ok || !["basic", "default"].includes(response.type)) return false;
  const cacheControl = response.headers?.get?.("Cache-Control")?.toLowerCase() || "";
  const contentDisposition = response.headers?.get?.("Content-Disposition")?.toLowerCase() || "";
  return !cacheControl.includes("no-store")
    && !cacheControl.includes("private")
    && !contentDisposition.includes("attachment");
}

function normalizeBuildAssetPath(value) {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value, self.location.origin);
    if (parsed.origin !== self.location.origin) return null;
    if (!parsed.pathname.startsWith("/assets/")) return null;
    if (parsed.pathname.startsWith("/assets/backgrounds/")) return null;
    if (parsed.pathname.startsWith("/assets/pets/")) return null;
    return parsed.pathname;
  } catch {
    return null;
  }
}

async function loadBuildAssetManifest() {
  try {
    const response = await fetch(BUILD_ASSET_MANIFEST_PATH, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!responseIsPublicAndCacheable(response)) return null;
    const cacheResponse = response.clone();
    const payload = await response.json();
    const assets = Array.isArray(payload?.assets)
      ? payload.assets.map(normalizeBuildAssetPath).filter(Boolean)
      : [];
    return { assets: [...new Set(assets)], response: cacheResponse };
  } catch {
    // Vite development does not emit asset-manifest.json. Core shell caching
    // remains available there, while production builds verify this artifact.
    return null;
  }
}

async function fetchAndCache(cache, path) {
  const response = await fetch(path, { cache: "reload", credentials: "same-origin" });
  if (!responseIsPublicAndCacheable(response)) {
    throw new Error(`Could not precache ${path}`);
  }
  await cache.put(path, response.clone());
}

async function precacheShell() {
  if (!self.caches) return;
  const cache = await self.caches.open(SHELL_CACHE_NAME);
  const buildManifest = await loadBuildAssetManifest();
  const paths = [...new Set([
    ...SHELL_PATHS,
    ...(buildManifest?.assets || []),
  ])];

  await Promise.all(paths.map((path) => fetchAndCache(cache, path)));
  if (buildManifest?.response) {
    await cache.put(BUILD_ASSET_MANIFEST_PATH, buildManifest.response);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell());
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "SKIP_WAITING") return;
  const activation = self.skipWaiting();
  if (typeof event.waitUntil === "function") event.waitUntil(activation);
});

function cacheIsOwned(name) {
  return OWNED_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

self.addEventListener("activate", (event) => {
  const currentCaches = new Set([SHELL_CACHE_NAME, RUNTIME_CACHE_NAME]);
  const removeOldCaches = self.caches
    ? self.caches.keys().then((keys) => Promise.all(
        keys
          .filter((key) => cacheIsOwned(key) && !currentCaches.has(key))
          .map((key) => self.caches.delete(key)),
      ))
    : Promise.resolve();
  event.waitUntil(removeOldCaches.then(() => self.clients.claim()));
});

function requestHasHeader(request, headerName) {
  return Boolean(request.headers?.has?.(headerName));
}

function pathIsPrivate(pathname) {
  if (pathname === "/api") return true;
  if (PRIVATE_FILE_PATTERN.test(pathname)) return true;
  return PRIVATE_PATH_PREFIXES.some((prefix) => (
    pathname === prefix.slice(0, -1) || pathname.startsWith(prefix)
  ));
}

function requestMustUseNetwork(request, url) {
  return !self.caches
    || request.method !== "GET"
    || url.origin !== self.location.origin
    || requestHasHeader(request, "Authorization")
    || requestHasHeader(request, "Range")
    || pathIsPrivate(url.pathname);
}

function pathIsFaceDetectionAsset(pathname) {
  return FACE_DETECTION_ASSET_PATHS.includes(pathname);
}

async function matchPublicCache(request) {
  const shell = await self.caches.open(SHELL_CACHE_NAME);
  const shellMatch = await shell.match(request);
  if (shellMatch) return shellMatch;
  const runtime = await self.caches.open(RUNTIME_CACHE_NAME);
  return runtime.match(request);
}

async function trimRuntimeCache(cache) {
  const keys = await cache.keys();
  const excess = keys.length - RUNTIME_CACHE_MAX_ENTRIES;
  if (excess <= 0) return;
  await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
}

async function putRuntimeResponse(request, response) {
  if (!responseIsPublicAndCacheable(response)) return;
  const cache = await self.caches.open(RUNTIME_CACHE_NAME);
  await cache.delete(request).catch(() => false);
  await cache.put(request, response.clone());
  await trimRuntimeCache(cache);
}

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await self.caches.open(SHELL_CACHE_NAME);
    return (await cache.match("/index.html")) || cache.match("/");
  }
}

async function cacheFirstAsset(request) {
  const cached = await matchPublicCache(request);
  if (cached) return cached;
  const response = await fetch(request);
  await putRuntimeResponse(request, response);
  return response;
}

async function staleWhileRevalidateAsset(request, event) {
  const cached = await matchPublicCache(request);
  const refresh = fetch(request).then(async (response) => {
    await putRuntimeResponse(request, response);
    return response;
  });

  if (!cached) return refresh;
  event.waitUntil(refresh.catch(() => undefined));
  return cached;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (requestMustUseNetwork(request, url)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (pathIsFaceDetectionAsset(url.pathname)) {
    event.respondWith(cacheFirstAsset(request));
    return;
  }

  if (["script", "style", "font", "audio", "worker"].includes(request.destination)) {
    event.respondWith(cacheFirstAsset(request));
    return;
  }

  if (request.destination === "image") {
    event.respondWith(staleWhileRevalidateAsset(request, event));
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { 
      title: "PrepMatrix AI Reminder", 
      body: event.data ? event.data.text() : "You haven't completed any study tasks today! Start preparing now!" 
    };
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) payload = {};

  const title = payload.title || "PrepMatrix AI Reminder";
  const body = payload.body || "You haven't completed any study tasks today! Start preparing now!";
  const icon = "/pwa/brand-icon-192.png";
  const badge = "/pwa/notification-badge-96.png";
  const targetUrl = safeAppPath(payload.url, "/planner");
  const tag = typeof payload.tag === "string" && payload.tag.length <= 80
    ? payload.tag
    : "prepmatrix-study-reminder";
  const forceNative = payload.forceNative === true;

  const showNativeNotification = () => self.registration.showNotification(title, {
    body,
    icon,
    badge,
    vibrate: [200, 100, 200],
    tag,
    renotify: true,
    data: { url: targetUrl },
  });

  event.waitUntil(
    (forceNative
      ? Promise.resolve([])
      : self.clients.matchAll({ type: "window", includeUncontrolled: true }).catch(() => [])
    ).then((clientList) => {
      const focusedClient = clientList.find((client) => (
        client.visibilityState === "visible" && client.focused === true
      ));
      if (!focusedClient) return showNativeNotification();

      try {
        focusedClient.postMessage({
          type: "SHOW_TOAST",
          title,
          message: body,
          tag,
          url: targetUrl,
        });
        return undefined;
      } catch {
        return showNativeNotification();
      }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = safeAppPath(event.notification.data?.url, "/");

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Check if there is already a window tab open
      for (let i = 0; i < windowClients.length; i += 1) {
        const client = windowClients[i];
        if (clientMatchesAppPath(client.url, urlToOpen) && "focus" in client) {
          return client.focus();
        }
      }
      // If no tab is open, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
      return null;
    })
  );
});
