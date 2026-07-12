export const EXAM_CERTIFICATE_MIN_PERCENTAGE = 60;

const CERTIFICATE_TIERS = Object.freeze({
  bronze: Object.freeze({
    key: "bronze",
    label: "Bronze",
    colors: Object.freeze({
      primary: Object.freeze([169, 96, 51]),
      dark: Object.freeze([112, 58, 29]),
      light: Object.freeze([244, 224, 207]),
    }),
  }),
  silver: Object.freeze({
    key: "silver",
    label: "Silver",
    colors: Object.freeze({
      primary: Object.freeze([113, 126, 145]),
      dark: Object.freeze([67, 78, 96]),
      light: Object.freeze([226, 231, 237]),
    }),
  }),
  gold: Object.freeze({
    key: "gold",
    label: "Gold",
    colors: Object.freeze({
      primary: Object.freeze([202, 145, 20]),
      dark: Object.freeze([126, 83, 10]),
      light: Object.freeze([250, 235, 184]),
    }),
  }),
  elite: Object.freeze({
    key: "elite",
    label: "Elite",
    colors: Object.freeze({
      primary: Object.freeze([104, 68, 196]),
      dark: Object.freeze([61, 38, 130]),
      light: Object.freeze([228, 219, 252]),
    }),
  }),
});

function clampPercentage(value) {
  return Math.min(100, Math.max(0, value));
}

export function getExamPercentage(resultOrPercentage) {
  if (typeof resultOrPercentage === "number" || typeof resultOrPercentage === "string") {
    const directValue = Number(resultOrPercentage);
    return Number.isFinite(directValue) ? clampPercentage(directValue) : 0;
  }

  const result = resultOrPercentage || {};
  if (result.percentage !== null && result.percentage !== undefined) {
    const explicitPercentage = Number(result.percentage);
    if (Number.isFinite(explicitPercentage)) return clampPercentage(explicitPercentage);
  }

  const score = Number(result.score ?? result.correctCount);
  const total = Number(result.total ?? result.totalQuestions);
  if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0) return 0;
  return clampPercentage((score / total) * 100);
}

export function formatExamPercentage(resultOrPercentage) {
  const percentage = getExamPercentage(resultOrPercentage);
  return Number.isInteger(percentage)
    ? String(percentage)
    : percentage.toFixed(1).replace(/\.0$/, "");
}

export function getExamCertificate(resultOrPercentage) {
  if (typeof resultOrPercentage === "object" && resultOrPercentage !== null) {
    if (resultOrPercentage.locked === true || resultOrPercentage.available === false) return null;
  }

  const percentage = getExamPercentage(resultOrPercentage);
  if (percentage < EXAM_CERTIFICATE_MIN_PERCENTAGE) return null;

  let tier = CERTIFICATE_TIERS.bronze;
  if (percentage > 96) tier = CERTIFICATE_TIERS.elite;
  else if (percentage >= 88) tier = CERTIFICATE_TIERS.gold;
  else if (percentage >= 75) tier = CERTIFICATE_TIERS.silver;

  return { ...tier, percentage };
}

export function getExamCertificateId(result) {
  const rawId = result?.attemptId || result?.id || result?._id || result?.examId || "achievement";
  const compactId = String(rawId).replace(/[^a-z0-9]/gi, "").slice(-8).toUpperCase() || "ACHIEVE";
  const submittedAt = result?.submittedAt ? new Date(result.submittedAt) : null;
  const dateStamp = submittedAt && !Number.isNaN(submittedAt.getTime())
    ? submittedAt.toISOString().slice(0, 10).replaceAll("-", "")
    : "UNDATED";
  return `PMA-${dateStamp}-${compactId}`;
}
