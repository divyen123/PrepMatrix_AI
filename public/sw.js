const OFFLINE_CACHE_NAME = "prepmatrix-offline-v1";
const OFFLINE_SHELL_PATHS = ["/", "/index.html", "/favicon.svg"];

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

self.addEventListener("install", (event) => {
  const prepareOfflineShell = self.caches
    ? self.caches.open(OFFLINE_CACHE_NAME).then((cache) => (
        Promise.allSettled(OFFLINE_SHELL_PATHS.map((path) => cache.add(path)))
      ))
    : Promise.resolve();
  event.waitUntil(prepareOfflineShell.then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  const removeOldCaches = self.caches
    ? self.caches.keys().then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("prepmatrix-offline-") && key !== OFFLINE_CACHE_NAME)
          .map((key) => self.caches.delete(key)),
      ))
    : Promise.resolve();
  event.waitUntil(removeOldCaches.then(() => self.clients.claim()));
});

async function cacheSuccessfulResponse(cache, key, response) {
  if (response?.ok && (response.type === "basic" || response.type === "default")) {
    await cache.put(key, response.clone()).catch(() => undefined);
  }
  return response;
}

async function networkFirstNavigation(request) {
  const cache = await self.caches.open(OFFLINE_CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response?.ok) {
      await cacheSuccessfulResponse(cache, "/index.html", response);
    }
    return response;
  } catch {
    return cache.match(request)
      .then((cached) => cached || cache.match("/index.html"))
      .then((cached) => cached || cache.match("/"));
  }
}

async function cacheFirstAsset(request) {
  const cache = await self.caches.open(OFFLINE_CACHE_NAME);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => cacheSuccessfulResponse(cache, request, response))
    .catch(() => cached);
  return cached || refresh;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (!self.caches || request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (["script", "style", "image", "font", "audio"].includes(request.destination)) {
    event.respondWith(cacheFirstAsset(request));
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
  const icon = "/favicon.svg";
  const badge = "/favicon.svg";
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
