const SIDEBAR_WIDGET_ROUTES = new Set(["/ai-chat", "/exam"]);

export function getPrimarySidebarNavItems(items = [], { isYoungKidsLearner = false } = {}) {
  return items.filter((item) => {
    const route = String(item?.to || "").trim();

    if (SIDEBAR_WIDGET_ROUTES.has(route)) return false;
    if (isYoungKidsLearner && route === "/kids") return false;

    return true;
  });
}
