/* eslint-disable react-refresh/only-export-components -- compatibility module intentionally exports the toast API and its container. */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert,
} from "lucide-react";
import {
  ToastContainer as ReactToastContainer,
  cssTransition,
  toast as reactToast,
} from "react-toastify";
import SwipeToast from "../components/SwipeToast";

const DEFAULT_TOAST_DURATION = 2200;
const DEFAULT_CONTAINER_SETTINGS = Object.freeze({
  autoClose: DEFAULT_TOAST_DURATION,
  closeButton: false,
  draggable: true,
  hideProgressBar: false,
  pauseOnHover: true,
});

const ToastContainerSettingsContext = createContext(DEFAULT_CONTAINER_SETTINGS);
const closeControllers = new Map();
let toastSequence = 0;

const hostTransition = cssTransition({
  enter: "prepmatrix-swipe-host-enter",
  exit: "prepmatrix-swipe-host-exit",
  duration: [1, 1],
  collapse: false,
});

const rawToast = reactToast;
const rawNotify = Object.freeze({
  default: reactToast,
  success: reactToast.success,
  error: reactToast.error,
  info: reactToast.info,
  warning: reactToast.warn,
});
const rawDismiss = reactToast.dismiss;

function createToastId() {
  toastSequence += 1;
  return `prepmatrix-swipe-toast-${Date.now()}-${toastSequence}`;
}

function requestToastClose(toastId) {
  if (toastId === undefined || toastId === null) {
    const controllers = Array.from(closeControllers.values());
    rawToast.clearWaitingQueue();
    if (!controllers.length) {
      rawDismiss();
      return;
    }
    controllers.forEach((close) => close());
    return;
  }

  const close = closeControllers.get(toastId);
  if (close) close();
  else rawDismiss(toastId);
}

function resolveDuration(value, fallback) {
  if (value === false) return 0;
  const candidate = value ?? fallback;
  const duration = Number(candidate);
  return Number.isFinite(duration) && duration >= 0
    ? duration
    : DEFAULT_TOAST_DURATION;
}

function resolveBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function DefaultToastIcon({ type }) {
  const iconProps = { "aria-hidden": true, size: 19, strokeWidth: 2.2 };
  if (type === "success") return <CircleCheck {...iconProps} />;
  if (type === "error") return <CircleAlert {...iconProps} />;
  if (type === "warning") return <TriangleAlert {...iconProps} />;
  return <Info {...iconProps} />;
}

function resolveIcon(icon, type) {
  if (icon === false) return null;
  if (typeof icon === "function") {
    return icon({ isLoading: false, theme: "light", type });
  }
  return icon || <DefaultToastIcon type={type} />;
}

function renderToastContent(content, toastId, type, options) {
  if (typeof content !== "function") return content;
  return content({
    closeToast: () => requestToastClose(toastId),
    data: options.data,
    isPaused: false,
    toastProps: { ...options, toastId, type },
  });
}

function SwipeToastContent({ content, options, toastId, type }) {
  const containerSettings = useContext(ToastContainerSettingsContext);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const close = () => setOpen(false);
    closeControllers.set(toastId, close);
    return () => {
      if (closeControllers.get(toastId) === close) closeControllers.delete(toastId);
    };
  }, [toastId]);

  const duration = resolveDuration(options.autoClose, containerSettings.autoClose);
  const closeButton = resolveBoolean(options.closeButton, containerSettings.closeButton);
  const dismissible = resolveBoolean(options.draggable, containerSettings.draggable);
  const hideProgressBar = resolveBoolean(
    options.hideProgressBar,
    containerSettings.hideProgressBar,
  );
  const pauseOnHover = resolveBoolean(options.pauseOnHover, containerSettings.pauseOnHover);
  const renderedContent = renderToastContent(content, toastId, type, options);
  const role = options.role || (type === "error" ? "alert" : "status");

  return (
    <SwipeToast
      actionLabel={options.actionLabel}
      background="var(--swipe-toast-surface)"
      className={`swipe-toast--${type}${options.swipeClassName ? ` ${options.swipeClassName}` : ""}`}
      closeButton={closeButton}
      color="var(--swipe-toast-ink)"
      description={options.description}
      dismissible={dismissible}
      duration={duration}
      fuse={hideProgressBar ? "none" : (options.fuse || "bottom")}
      fuseColor="var(--swipe-toast-tone)"
      icon={resolveIcon(options.icon, type)}
      inline
      onAction={options.onAction}
      onClose={() => rawDismiss(toastId)}
      open={open}
      pauseOnHover={pauseOnHover}
      radius={options.radius ?? 12}
      role={role}
      settleBounce={options.settleBounce ?? 0.2}
      slideMs={options.slideMs ?? 400}
      swipeDistance={options.swipeDistance ?? 40}
      title={renderedContent}
      width={options.width ?? 356}
    />
  );
}

function notify(type, content, incomingOptions = {}) {
  const options = incomingOptions || {};
  const toastId = options.toastId ?? createToastId();
  const hostClassName = [
    "prepmatrix-toast",
    "prepmatrix-swipe-toast-host",
    options.className,
  ].filter(Boolean).join(" ");
  const notifyWithType = rawNotify[type] || rawNotify.default;

  notifyWithType(
    <SwipeToastContent
      content={content}
      options={options}
      toastId={toastId}
      type={type}
    />,
    {
      ...options,
      autoClose: false,
      className: hostClassName,
      closeButton: false,
      closeOnClick: false,
      draggable: false,
      hideProgressBar: true,
      icon: false,
      pauseOnHover: false,
      role: "presentation",
      toastId,
      transition: hostTransition,
    },
  );
  return toastId;
}

export const toast = Object.assign(
  (content, options) => notify("default", content, options),
  {
    success: (content, options) => notify("success", content, options),
    error: (content, options) => notify("error", content, options),
    info: (content, options) => notify("info", content, options),
    warn: (content, options) => notify("warning", content, options),
    warning: (content, options) => notify("warning", content, options),
    dismiss: requestToastClose,
    isActive: rawToast.isActive,
    clearWaitingQueue: rawToast.clearWaitingQueue,
  },
);

function mergeToastClassName(toastClassName, context) {
  const providedClassName = typeof toastClassName === "function"
    ? toastClassName(context)
    : toastClassName;
  return [
    context?.defaultClassName,
    "prepmatrix-toast",
    "prepmatrix-swipe-toast-host",
    providedClassName,
  ].filter(Boolean).join(" ");
}

export function ToastContainer({
  autoClose = DEFAULT_TOAST_DURATION,
  closeButton = false,
  draggable = true,
  hideProgressBar = false,
  pauseOnHover = true,
  toastClassName,
  ...props
}) {
  const settings = useMemo(() => ({
    autoClose,
    closeButton: closeButton === true,
    draggable: draggable !== false,
    hideProgressBar: hideProgressBar === true,
    pauseOnHover: pauseOnHover !== false,
  }), [autoClose, closeButton, draggable, hideProgressBar, pauseOnHover]);

  return (
    <ToastContainerSettingsContext.Provider value={settings}>
      <ReactToastContainer
        {...props}
        autoClose={false}
        closeButton={false}
        closeOnClick={false}
        draggable={false}
        hideProgressBar
        pauseOnHover={false}
        toastClassName={(context) => mergeToastClassName(toastClassName, context)}
        transition={hostTransition}
      />
    </ToastContainerSettingsContext.Provider>
  );
}
