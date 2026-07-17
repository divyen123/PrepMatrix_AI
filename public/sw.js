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
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
