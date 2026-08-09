export const PWA_SERVICE_WORKER_PATH = "/sw.js";
export const PWA_SERVICE_WORKER_OPTIONS = Object.freeze({
  scope: "/",
  updateViaCache: "none",
});
export const PWA_UPDATE_CHECK_THROTTLE_MS = 60_000;

function getDefaultRuntime() {
  return {
    documentRef: typeof document !== "undefined" ? document : null,
    navigatorRef: typeof navigator !== "undefined" ? navigator : null,
    windowRef: typeof window !== "undefined" ? window : null,
  };
}

function readUserAgent(navigatorRef) {
  return String(navigatorRef?.userAgent || "");
}

export function isIosDevice(navigatorRef) {
  const userAgent = readUserAgent(navigatorRef);
  const classicIos = /iPad|iPhone|iPod/i.test(userAgent);
  const ipadDesktopMode = navigatorRef?.platform === "MacIntel"
    && Number(navigatorRef?.maxTouchPoints) > 1;
  return classicIos || ipadDesktopMode;
}

export function isSafariBrowser(navigatorRef) {
  const userAgent = readUserAgent(navigatorRef);
  return /Safari/i.test(userAgent)
    && !/(CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo)/i.test(userAgent);
}

export function isStandaloneDisplay({ navigatorRef, windowRef } = {}) {
  if (navigatorRef?.standalone === true) return true;
  try {
    return Boolean(windowRef?.matchMedia?.("(display-mode: standalone)")?.matches);
  } catch {
    return false;
  }
}

export function createPwaSnapshot(runtime = {}) {
  const defaults = getDefaultRuntime();
  const navigatorRef = runtime.navigatorRef ?? defaults.navigatorRef;
  const windowRef = runtime.windowRef ?? defaults.windowRef;
  const isStandalone = isStandaloneDisplay({ navigatorRef, windowRef });

  return {
    canInstall: false,
    error: "",
    installBusy: false,
    installDismissed: false,
    installedNoticeDismissed: false,
    installedThisSession: false,
    isIos: isIosDevice(navigatorRef),
    isIosSafari: isSafariBrowser(navigatorRef),
    isOnline: navigatorRef?.onLine !== false,
    isStandalone,
    iosGuideDismissed: false,
    registrationReady: false,
    supported: Boolean(navigatorRef?.serviceWorker),
    updateBusy: false,
    updateDismissed: false,
    updateReady: false,
  };
}

export function selectPwaSurface(snapshot = {}) {
  if (snapshot.updateReady && !snapshot.updateDismissed) return "update";
  if (snapshot.isOnline === false) return "offline";
  if (snapshot.installedThisSession && !snapshot.installedNoticeDismissed) return "installed";
  if (
    snapshot.canInstall
    && !snapshot.installDismissed
    && !snapshot.isStandalone
    && !snapshot.installedThisSession
  ) {
    return "install";
  }
  if (
    snapshot.isIos
    && !snapshot.iosGuideDismissed
    && !snapshot.isStandalone
    && !snapshot.installedThisSession
    && !snapshot.canInstall
  ) {
    return "ios";
  }
  return null;
}

function addEventListener(target, type, listener, options) {
  if (!target?.addEventListener) return () => undefined;
  target.addEventListener(type, listener, options);
  return () => target.removeEventListener?.(type, listener, options);
}

function addMediaQueryListener(mediaQuery, listener) {
  if (!mediaQuery) return () => undefined;
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener?.("change", listener);
  }
  if (mediaQuery.addListener) {
    mediaQuery.addListener(listener);
    return () => mediaQuery.removeListener?.(listener);
  }
  return () => undefined;
}

export function createPwaLifecycleController(options = {}) {
  const defaults = getDefaultRuntime();
  const windowRef = options.windowRef ?? defaults.windowRef;
  const documentRef = options.documentRef ?? defaults.documentRef;
  const navigatorRef = options.navigatorRef ?? defaults.navigatorRef;
  const serviceWorkerRef = options.serviceWorkerRef ?? navigatorRef?.serviceWorker ?? null;
  const now = options.now || (() => Date.now());
  const updateThrottleMs = Math.max(
    0,
    Number(options.updateThrottleMs ?? PWA_UPDATE_CHECK_THROTTLE_MS) || 0,
  );
  const onError = typeof options.onError === "function"
    ? options.onError
    : (error) => console.warn("PWA lifecycle warning:", error);

  let snapshot = createPwaSnapshot({ navigatorRef, windowRef });
  let deferredInstallPrompt = null;
  let registration = null;
  let waitingWorker = null;
  let dismissedWorker = null;
  let installingWorkerCleanup = null;
  let registrationUpdateCleanup = null;
  let lifecycleCleanups = [];
  let subscribers = new Set();
  let started = false;
  let generation = 0;
  let lastUpdateCheckAt = Number.NEGATIVE_INFINITY;
  let updateCheckPromise = null;
  let reloadRequested = false;
  let hasReloaded = false;

  const publish = (patch) => {
    const nextSnapshot = { ...snapshot, ...patch };
    const changed = Object.keys(nextSnapshot).some((key) => nextSnapshot[key] !== snapshot[key]);
    if (!changed) return snapshot;
    snapshot = nextSnapshot;
    subscribers.forEach((listener) => listener(snapshot));
    return snapshot;
  };

  const reportError = (error) => {
    try {
      onError(error);
    } catch {
      // Diagnostic callbacks must never interrupt PWA lifecycle handling.
    }
  };

  const setWaitingWorker = (worker) => {
    if (!worker || !serviceWorkerRef?.controller) return;
    const isNewWorker = waitingWorker !== worker;
    waitingWorker = worker;
    if (isNewWorker && dismissedWorker !== worker) {
      publish({
        error: "",
        updateBusy: false,
        updateDismissed: false,
        updateReady: true,
      });
      return;
    }
    publish({ updateReady: true, updateDismissed: dismissedWorker === worker });
  };

  const watchInstallingWorker = (worker) => {
    installingWorkerCleanup?.();
    installingWorkerCleanup = null;
    if (!worker) return;

    const handleStateChange = () => {
      if (worker.state === "installed" && serviceWorkerRef?.controller) {
        setWaitingWorker(registration?.waiting || worker);
      }
    };
    installingWorkerCleanup = addEventListener(worker, "statechange", handleStateChange);
    handleStateChange();
  };

  const observeRegistration = (nextRegistration) => {
    registrationUpdateCleanup?.();
    registrationUpdateCleanup = null;
    registration = nextRegistration;
    publish({ registrationReady: Boolean(registration) });
    if (!registration) return;

    if (registration.waiting && serviceWorkerRef?.controller) {
      setWaitingWorker(registration.waiting);
    }

    const handleUpdateFound = () => watchInstallingWorker(registration.installing);
    registrationUpdateCleanup = addEventListener(registration, "updatefound", handleUpdateFound);
    if (registration.installing) watchInstallingWorker(registration.installing);
  };

  const checkForUpdate = async ({ force = false } = {}) => {
    if (!registration?.update || snapshot.isOnline === false) return null;
    const currentTime = now();
    if (!force && currentTime - lastUpdateCheckAt < updateThrottleMs) return null;
    if (updateCheckPromise) return updateCheckPromise;

    lastUpdateCheckAt = currentTime;
    updateCheckPromise = Promise.resolve()
      .then(() => registration.update())
      .catch((error) => {
        reportError(error);
        return null;
      })
      .finally(() => {
        updateCheckPromise = null;
      });
    return updateCheckPromise;
  };

  const handleBeforeInstallPrompt = (event) => {
    event?.preventDefault?.();
    if (snapshot.isStandalone || snapshot.installedThisSession) return;
    deferredInstallPrompt = event;
    publish({
      canInstall: Boolean(event?.prompt),
      error: "",
      installBusy: false,
      installDismissed: false,
      iosGuideDismissed: true,
    });
  };

  const handleAppInstalled = () => {
    deferredInstallPrompt = null;
    publish({
      canInstall: false,
      error: "",
      installBusy: false,
      installDismissed: true,
      installedNoticeDismissed: false,
      installedThisSession: true,
      iosGuideDismissed: true,
    });
  };

  const handleDisplayModeChange = () => {
    const isStandalone = isStandaloneDisplay({ navigatorRef, windowRef });
    if (isStandalone) deferredInstallPrompt = null;
    publish({
      canInstall: isStandalone ? false : Boolean(deferredInstallPrompt?.prompt),
      isStandalone,
      ...(isStandalone ? { installDismissed: true, iosGuideDismissed: true } : {}),
    });
  };

  const handleOnline = () => {
    publish({ isOnline: true });
    void checkForUpdate();
  };

  const handleOffline = () => publish({ isOnline: false });

  const handleVisibilityChange = () => {
    if (documentRef?.visibilityState === "visible") void checkForUpdate();
  };

  const handleControllerChange = () => {
    if (!reloadRequested || hasReloaded) return;
    hasReloaded = true;
    windowRef?.location?.reload?.();
  };

  const start = async () => {
    if (started) return registration;
    started = true;
    generation += 1;
    const activeGeneration = generation;

    let standaloneQuery = null;
    try {
      standaloneQuery = windowRef?.matchMedia?.("(display-mode: standalone)") || null;
    } catch {
      standaloneQuery = null;
    }

    lifecycleCleanups = [
      addEventListener(windowRef, "beforeinstallprompt", handleBeforeInstallPrompt),
      addEventListener(windowRef, "appinstalled", handleAppInstalled),
      addEventListener(windowRef, "online", handleOnline),
      addEventListener(windowRef, "offline", handleOffline),
      addEventListener(documentRef, "visibilitychange", handleVisibilityChange),
      addEventListener(serviceWorkerRef, "controllerchange", handleControllerChange),
      addMediaQueryListener(standaloneQuery, handleDisplayModeChange),
    ];

    if (!serviceWorkerRef?.register) return null;

    try {
      const nextRegistration = await serviceWorkerRef.register(
        options.serviceWorkerPath || PWA_SERVICE_WORKER_PATH,
        options.serviceWorkerOptions || PWA_SERVICE_WORKER_OPTIONS,
      );
      if (!started || activeGeneration !== generation) return nextRegistration;
      observeRegistration(nextRegistration);
      await checkForUpdate({ force: true });
      return nextRegistration;
    } catch (error) {
      if (started && activeGeneration === generation) {
        publish({ registrationReady: false });
        reportError(error);
      }
      return null;
    }
  };

  const stop = () => {
    if (!started) return;
    started = false;
    generation += 1;
    lifecycleCleanups.forEach((cleanup) => cleanup());
    lifecycleCleanups = [];
    installingWorkerCleanup?.();
    installingWorkerCleanup = null;
    registrationUpdateCleanup?.();
    registrationUpdateCleanup = null;
  };

  const install = async () => {
    if (!deferredInstallPrompt?.prompt || snapshot.installBusy) {
      return { outcome: "unavailable" };
    }

    const promptEvent = deferredInstallPrompt;
    publish({ error: "", installBusy: true });
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      const outcome = choice?.outcome === "accepted" ? "accepted" : "dismissed";
      deferredInstallPrompt = null;
      publish({
        canInstall: false,
        installBusy: false,
        installDismissed: true,
        ...(outcome === "accepted" ? {
          installedNoticeDismissed: false,
          installedThisSession: true,
        } : {}),
      });
      return { outcome, platform: choice?.platform || "" };
    } catch (error) {
      publish({
        error: "Installation could not start. Please try again.",
        installBusy: false,
      });
      reportError(error);
      return { outcome: "error", error };
    }
  };

  const applyUpdate = async () => {
    if (!waitingWorker?.postMessage || snapshot.updateBusy) return false;
    reloadRequested = true;
    publish({ error: "", updateBusy: true });
    try {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
      return true;
    } catch (error) {
      reloadRequested = false;
      publish({
        error: "The update could not be applied. Please try again.",
        updateBusy: false,
      });
      reportError(error);
      return false;
    }
  };

  const dismissUpdate = () => {
    dismissedWorker = waitingWorker;
    publish({ updateDismissed: true });
  };

  const dismissInstall = () => publish({ installDismissed: true });
  const dismissIosGuide = () => publish({ iosGuideDismissed: true });
  const dismissInstalledNotice = () => publish({ installedNoticeDismissed: true });

  return {
    applyUpdate,
    checkForUpdate,
    dismissInstall,
    dismissInstalledNotice,
    dismissIosGuide,
    dismissUpdate,
    getSnapshot: () => snapshot,
    install,
    start,
    stop,
    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
  };
}
