export const PWA_SERVICE_WORKER_PATH = "/sw.js";
export const PWA_SERVICE_WORKER_OPTIONS = Object.freeze({
  scope: "/",
  updateViaCache: "none",
});
export const PWA_UPDATE_CHECK_THROTTLE_MS = 60_000;
export const PWA_INSTALLED_STORAGE_KEY = "prepmatrix:pwa-installed";

const INSTALLED_DISPLAY_MODES = Object.freeze([
  "standalone",
  "minimal-ui",
  "fullscreen",
  "window-controls-overlay",
]);

function getWindowStorage(windowRef) {
  try {
    return windowRef?.localStorage ?? null;
  } catch {
    return null;
  }
}

function getDefaultRuntime() {
  const windowRef = typeof window !== "undefined" ? window : null;
  return {
    documentRef: typeof document !== "undefined" ? document : null,
    navigatorRef: typeof navigator !== "undefined" ? navigator : null,
    storageRef: getWindowStorage(windowRef),
    windowRef,
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

export function isStandaloneDisplay({ documentRef, navigatorRef, windowRef } = {}) {
  if (navigatorRef?.standalone === true) return true;
  if (navigatorRef?.windowControlsOverlay?.visible === true) return true;
  if (String(documentRef?.referrer || "").startsWith("android-app://")) return true;

  for (const displayMode of INSTALLED_DISPLAY_MODES) {
    try {
      if (windowRef?.matchMedia?.(`(display-mode: ${displayMode})`)?.matches) return true;
    } catch {
      // Some embedded browsers throw for unsupported media features.
    }
  }
  return false;
}

export function createPwaSnapshot(runtime = {}) {
  const defaults = getDefaultRuntime();
  const documentRef = runtime.documentRef ?? defaults.documentRef;
  const navigatorRef = runtime.navigatorRef ?? defaults.navigatorRef;
  const storageRef = runtime.storageRef ?? defaults.storageRef;
  const windowRef = runtime.windowRef ?? defaults.windowRef;
  const isStandalone = isStandaloneDisplay({ documentRef, navigatorRef, windowRef });
  const hasInstalledMarker = readInstalledMarker(storageRef);
  const isInstalled = isStandalone || hasInstalledMarker;
  const supportsInstalledAppsCheck = typeof navigatorRef?.getInstalledRelatedApps === "function";

  return {
    canInstall: false,
    error: "",
    installBusy: false,
    installDismissed: false,
    installedThisSession: false,
    installDetectionPending: !isStandalone && supportsInstalledAppsCheck,
    installDetectionVerified: isStandalone,
    isIos: isIosDevice(navigatorRef),
    isIosSafari: isSafariBrowser(navigatorRef),
    isInstalled,
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
  if (
    snapshot.canInstall
    && !snapshot.installDismissed
    && !snapshot.installDetectionPending
    && !snapshot.isInstalled
    && !snapshot.isStandalone
    && !snapshot.installedThisSession
  ) {
    return "install";
  }
  if (
    snapshot.isIos
    && !snapshot.iosGuideDismissed
    && !snapshot.installDetectionPending
    && !snapshot.isInstalled
    && !snapshot.isStandalone
    && !snapshot.installedThisSession
    && !snapshot.canInstall
  ) {
    return "ios";
  }
  return null;
}

function readInstalledMarker(storageRef) {
  try {
    return storageRef?.getItem?.(PWA_INSTALLED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeInstalledMarker(storageRef) {
  try {
    storageRef?.setItem?.(PWA_INSTALLED_STORAGE_KEY, "1");
  } catch {
    // Storage can be blocked in private or embedded contexts. Runtime detection remains available.
  }
}

function clearInstalledMarker(storageRef) {
  try {
    storageRef?.removeItem?.(PWA_INSTALLED_STORAGE_KEY);
  } catch {
    // The async related-app check still remains authoritative for this page load.
  }
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
  const storageRef = options.storageRef ?? defaults.storageRef;
  const serviceWorkerRef = options.serviceWorkerRef ?? navigatorRef?.serviceWorker ?? null;
  const now = options.now || (() => Date.now());
  const updateThrottleMs = Math.max(
    0,
    Number(options.updateThrottleMs ?? PWA_UPDATE_CHECK_THROTTLE_MS) || 0,
  );
  const onError = typeof options.onError === "function"
    ? options.onError
    : (error) => console.warn("PWA lifecycle warning:", error);

  let snapshot = createPwaSnapshot({ documentRef, navigatorRef, storageRef, windowRef });
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
  let installedAppsCheckPromise = null;
  let installedAppsCheckGeneration = Number.NEGATIVE_INFINITY;

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

  const rememberInstalled = () => {
    writeInstalledMarker(storageRef);
    deferredInstallPrompt = null;
  };

  const refreshInstalledState = async () => {
    const requestGeneration = generation;
    const canCommit = () => started && generation === requestGeneration;
    const isStandalone = isStandaloneDisplay({ documentRef, navigatorRef, windowRef });
    const hasInstalledMarker = readInstalledMarker(storageRef);
    if (isStandalone) {
      rememberInstalled();
      publish({
        canInstall: false,
        installDetectionPending: false,
        installDetectionVerified: true,
        installDismissed: true,
        iosGuideDismissed: true,
        isInstalled: true,
        isStandalone,
      });
      return true;
    }
    if (snapshot.installedThisSession) {
      publish({
        canInstall: false,
        installDetectionPending: false,
        installDetectionVerified: false,
        installDismissed: true,
        iosGuideDismissed: true,
        isInstalled: true,
        isStandalone,
      });
      return true;
    }

    if (typeof navigatorRef?.getInstalledRelatedApps !== "function") {
      publish({
        canInstall: hasInstalledMarker ? false : Boolean(deferredInstallPrompt?.prompt),
        installDetectionPending: false,
        installDetectionVerified: false,
        ...(hasInstalledMarker ? {
          installDismissed: true,
          iosGuideDismissed: true,
        } : {}),
        isInstalled: hasInstalledMarker,
        isStandalone,
      });
      return hasInstalledMarker;
    }

    if (
      installedAppsCheckPromise
      && installedAppsCheckGeneration === requestGeneration
    ) {
      return installedAppsCheckPromise;
    }
    publish({
      installDetectionPending: true,
      installDetectionVerified: false,
      isStandalone,
    });
    const checkPromise = Promise.resolve()
      .then(() => navigatorRef.getInstalledRelatedApps())
      .then((relatedApps) => {
        if (!canCommit()) return snapshot.isInstalled;
        const isInstalled = Array.isArray(relatedApps) && relatedApps.length > 0;
        if (isInstalled) rememberInstalled();
        else clearInstalledMarker(storageRef);
        publish({
          canInstall: isInstalled ? false : Boolean(deferredInstallPrompt?.prompt),
          installDetectionPending: false,
          installDetectionVerified: true,
          ...(isInstalled ? {
            installDismissed: true,
            iosGuideDismissed: true,
          } : {}),
          isInstalled,
          isStandalone,
        });
        return isInstalled;
      })
      .catch((error) => {
        if (!canCommit()) return snapshot.isInstalled;
        publish({
          canInstall: hasInstalledMarker ? false : Boolean(deferredInstallPrompt?.prompt),
          installDetectionPending: false,
          installDetectionVerified: false,
          ...(hasInstalledMarker ? {
            installDismissed: true,
            iosGuideDismissed: true,
          } : {}),
          isInstalled: hasInstalledMarker,
          isStandalone,
        });
        reportError(error);
        return hasInstalledMarker;
      })
      .finally(() => {
        if (installedAppsCheckPromise === checkPromise) {
          installedAppsCheckPromise = null;
          installedAppsCheckGeneration = Number.NEGATIVE_INFINITY;
        }
      });
    installedAppsCheckPromise = checkPromise;
    installedAppsCheckGeneration = requestGeneration;
    return checkPromise;
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
    const isStandalone = isStandaloneDisplay({ documentRef, navigatorRef, windowRef });
    if (
      isStandalone
      || snapshot.installedThisSession
    ) {
      return;
    }
    if (
      snapshot.isInstalled
      && snapshot.installDetectionVerified
      && !snapshot.installDetectionPending
    ) {
      return;
    }
    if (snapshot.isInstalled && !snapshot.installDetectionVerified) {
      clearInstalledMarker(storageRef);
      publish({
        installDismissed: false,
        installDetectionVerified: false,
        isInstalled: false,
      });
    }
    deferredInstallPrompt = event;
    publish({
      canInstall: !snapshot.installDetectionPending && Boolean(event?.prompt),
      error: "",
      installBusy: false,
      installDismissed: false,
      iosGuideDismissed: true,
    });
  };

  const handleAppInstalled = () => {
    rememberInstalled();
    publish({
      canInstall: false,
      error: "",
      installBusy: false,
      installDismissed: true,
      installedThisSession: true,
      installDetectionPending: false,
      installDetectionVerified: true,
      isInstalled: true,
      iosGuideDismissed: true,
    });
  };

  const handleDisplayModeChange = () => {
    void refreshInstalledState();
  };

  const handleInstallMarkerChange = (event) => {
    if (event?.key !== PWA_INSTALLED_STORAGE_KEY || event?.newValue !== "1") return;
    rememberInstalled();
    publish({
      canInstall: false,
      installDetectionPending: false,
      installDetectionVerified: false,
      installDismissed: true,
      iosGuideDismissed: true,
      isInstalled: true,
    });
  };

  const handleOnline = () => {
    publish({ isOnline: true });
    void checkForUpdate();
  };

  const handleOffline = () => publish({ isOnline: false });

  const handleVisibilityChange = () => {
    if (documentRef?.visibilityState === "visible") {
      void refreshInstalledState();
      void checkForUpdate();
    }
  };

  const handleWindowFocus = () => void refreshInstalledState();

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

    const displayModeQueries = INSTALLED_DISPLAY_MODES.map((displayMode) => {
      try {
        return windowRef?.matchMedia?.(`(display-mode: ${displayMode})`) || null;
      } catch {
        return null;
      }
    });

    lifecycleCleanups = [
      addEventListener(windowRef, "beforeinstallprompt", handleBeforeInstallPrompt),
      addEventListener(windowRef, "appinstalled", handleAppInstalled),
      addEventListener(windowRef, "online", handleOnline),
      addEventListener(windowRef, "offline", handleOffline),
      addEventListener(windowRef, "focus", handleWindowFocus),
      addEventListener(windowRef, "pageshow", handleWindowFocus),
      addEventListener(windowRef, "storage", handleInstallMarkerChange),
      addEventListener(documentRef, "visibilitychange", handleVisibilityChange),
      addEventListener(serviceWorkerRef, "controllerchange", handleControllerChange),
      ...displayModeQueries.map((query) => addMediaQueryListener(query, handleDisplayModeChange)),
    ];

    const installedStatePromise = refreshInstalledState();

    if (!serviceWorkerRef?.register) {
      await installedStatePromise;
      return null;
    }

    try {
      const nextRegistration = await serviceWorkerRef.register(
        options.serviceWorkerPath || PWA_SERVICE_WORKER_PATH,
        options.serviceWorkerOptions || PWA_SERVICE_WORKER_OPTIONS,
      );
      if (!started || activeGeneration !== generation) return nextRegistration;
      observeRegistration(nextRegistration);
      await Promise.all([
        checkForUpdate({ force: true }),
        installedStatePromise,
      ]);
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
    installedAppsCheckPromise = null;
    installedAppsCheckGeneration = Number.NEGATIVE_INFINITY;
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
          installedThisSession: true,
          installDetectionPending: false,
          installDetectionVerified: false,
          isInstalled: true,
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

  return {
    applyUpdate,
    checkForUpdate,
    dismissInstall,
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
