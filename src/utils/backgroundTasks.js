const STATUS_PRIORITY = Object.freeze({
  running: 3,
  failed: 2,
  completed: 1,
});

function clean(value) {
  return String(value ?? "").trim();
}

export function getBackgroundTaskKey(feature, academicProfileId = "") {
  const normalizedFeature = clean(feature).replace(/[^a-z0-9_-]+/giu, "-").toLowerCase();
  const normalizedProfile = clean(academicProfileId);
  return normalizedFeature && normalizedProfile
    ? `${normalizedFeature}:${normalizedProfile}`
    : "";
}

export function deriveRouteTaskActivity(tasks, route, academicProfileId = "") {
  const normalizedRoute = clean(route);
  const normalizedProfile = clean(academicProfileId);
  const matches = Object.values(tasks || {}).filter((task) => (
    task
    && task.route === normalizedRoute
    && (!normalizedProfile || task.academicProfileId === normalizedProfile)
    && STATUS_PRIORITY[task.status]
  ));

  if (!matches.length) return null;
  return matches.sort((left, right) => {
    const priority = STATUS_PRIORITY[right.status] - STATUS_PRIORITY[left.status];
    if (priority) return priority;
    return Number(right.updatedAt || 0) - Number(left.updatedAt || 0);
  })[0];
}

