export function getUsageLimitTone(limitUsedPercent, hasDailyLimit) {
  if (!hasDailyLimit) return "neutral";
  const percent = Math.max(0, Number(limitUsedPercent) || 0);
  if (percent >= 100) return "danger";
  if (percent >= 80) return "warning";
  return "active";
}
