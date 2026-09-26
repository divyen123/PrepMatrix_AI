export function getCometDialProgressTone(value, min, max) {
  const range = Number(max) - Number(min);
  const progress = range > 0 ? (Number(value) - Number(min)) / range : 0;

  if (!Number.isFinite(progress) || progress <= 0) return "empty";
  if (progress < 0.35) return "starting";
  if (progress < 0.8) return "building";
  if (progress < 1) return "nearly";
  return "complete";
}
