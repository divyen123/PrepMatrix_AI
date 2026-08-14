const LOCAL_ORIGIN = "https://prepmatrix.local";

export function safeAuthReturnTo(search = "") {
  const raw = new URLSearchParams(String(search || "")).get("returnTo");
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "";
  try {
    const url = new URL(raw, LOCAL_ORIGIN);
    if (url.origin !== LOCAL_ORIGIN) return "";
    if (url.pathname === "/login" || url.pathname === "/register") return "";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "";
  }
}

export function buildLoginRedirect(pathname = "/", search = "", hash = "") {
  const returnTo = `${String(pathname || "/")}${String(search || "")}${String(hash || "")}`;
  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function authSwitchTarget(pathname, search = "") {
  const returnTo = safeAuthReturnTo(search);
  return returnTo
    ? `${pathname}?returnTo=${encodeURIComponent(returnTo)}`
    : pathname;
}
