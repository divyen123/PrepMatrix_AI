import { useEffect, useMemo, useState } from "react";
import {
  Download,
  RefreshCw,
  Share2,
  WifiOff,
  X,
} from "lucide-react";
import {
  createPwaLifecycleController,
  selectPwaSurface,
} from "../utils/pwaLifecycle";
import "./PwaManager.css";

function SurfaceIcon({ surface }) {
  if (surface === "update") return <RefreshCw aria-hidden="true" size={21} />;
  if (surface === "offline") return <WifiOff aria-hidden="true" size={21} />;
  if (surface === "ios") return <Share2 aria-hidden="true" size={21} />;
  return <Download aria-hidden="true" size={21} />;
}

export function PwaStatusDock({
  onApplyUpdate,
  onDismissInstall,
  onDismissIosGuide,
  onDismissUpdate,
  onInstall,
  snapshot,
}) {
  const surface = selectPwaSurface(snapshot);
  if (!surface) return null;

  const content = {
    install: {
      eyebrow: "Installable app",
      title: "Install PrepMatrix",
      detail: "Open your study workspace from your home screen or app menu.",
    },
    ios: {
      eyebrow: "Add to Home Screen",
      title: "Install PrepMatrix on this device",
      detail: snapshot.isIosSafari
        ? "In Safari, tap Share, then choose Add to Home Screen."
        : "Open PrepMatrix in Safari, tap Share, then choose Add to Home Screen.",
    },
    offline: {
      eyebrow: "Connection status",
      title: "You’re offline",
      detail: "Cloud sync and AI features need an internet connection.",
    },
    update: {
      eyebrow: "Update ready",
      title: "A new PrepMatrix version is ready",
      detail: "Reload when you’re ready to use the latest version.",
    },
  }[surface];

  return (
    <aside
      aria-atomic="true"
      aria-live="polite"
      className={`pwa-status-dock pwa-status-dock--${surface}`}
      role="status"
    >
      <span className="pwa-status-dock__icon">
        <SurfaceIcon surface={surface} />
      </span>
      <div className="pwa-status-dock__body">
        <span className="pwa-status-dock__eyebrow">{content.eyebrow}</span>
        <strong>{content.title}</strong>
        <p>{content.detail}</p>
        {snapshot.error && <p className="pwa-status-dock__error">{snapshot.error}</p>}

        {surface === "update" && (
          <div className="pwa-status-dock__actions">
            <button
              aria-busy={snapshot.updateBusy}
              className="pwa-status-dock__primary"
              disabled={snapshot.updateBusy}
              onClick={onApplyUpdate}
              type="button"
            >
              <RefreshCw aria-hidden="true" size={15} />
              {snapshot.updateBusy ? "Updating…" : "Update & reload"}
            </button>
            <button
              className="pwa-status-dock__secondary"
              disabled={snapshot.updateBusy}
              onClick={onDismissUpdate}
              type="button"
            >
              Later
            </button>
          </div>
        )}

        {surface === "install" && (
          <div className="pwa-status-dock__actions">
            <button
              aria-busy={snapshot.installBusy}
              className="pwa-status-dock__primary"
              disabled={snapshot.installBusy}
              onClick={onInstall}
              type="button"
            >
              <Download aria-hidden="true" size={15} />
              {snapshot.installBusy ? "Opening…" : "Install app"}
            </button>
            <button
              className="pwa-status-dock__secondary"
              disabled={snapshot.installBusy}
              onClick={onDismissInstall}
              type="button"
            >
              Not now
            </button>
          </div>
        )}

        {surface === "ios" && (
          <button
            className="pwa-status-dock__secondary pwa-status-dock__acknowledge"
            onClick={onDismissIosGuide}
            type="button"
          >
            Got it
          </button>
        )}

      </div>

      {surface === "install" && (
        <button
          aria-label={`Dismiss ${surface === "ios" ? "installation guidance" : "PrepMatrix installation notice"}`}
          className="pwa-status-dock__close"
          onClick={surface === "install"
            ? onDismissInstall
            : onDismissIosGuide}
          type="button"
        >
          <X aria-hidden="true" size={15} />
        </button>
      )}
    </aside>
  );
}

export default function PwaManager({ runtime }) {
  const controller = useMemo(
    () => createPwaLifecycleController(runtime),
    [runtime],
  );
  const [snapshot, setSnapshot] = useState(() => controller.getSnapshot());

  useEffect(() => {
    setSnapshot(controller.getSnapshot());
    const unsubscribe = controller.subscribe(setSnapshot);
    void controller.start();
    return () => {
      unsubscribe();
      controller.stop();
    };
  }, [controller]);

  return (
    <PwaStatusDock
      onApplyUpdate={() => void controller.applyUpdate()}
      onDismissInstall={controller.dismissInstall}
      onDismissIosGuide={controller.dismissIosGuide}
      onDismissUpdate={controller.dismissUpdate}
      onInstall={() => void controller.install()}
      snapshot={snapshot}
    />
  );
}
