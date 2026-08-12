function transcriptText(alternative) {
  return String(alternative?.transcript || "").replace(/\s+/gu, " ").trim();
}

export function getVoiceRecognitionCandidates(results = []) {
  const segments = Array.from(results || [])
    .map((result) => Array.from(result || []).map(transcriptText).filter(Boolean))
    .filter((alternatives) => alternatives.length > 0);
  if (!segments.length) return [];

  const primarySegments = segments.map((alternatives) => alternatives[0]);
  const candidates = new Set([primarySegments.join(" ").trim()]);
  segments.forEach((alternatives, segmentIndex) => {
    alternatives.slice(1).forEach((alternative) => {
      const candidateSegments = [...primarySegments];
      candidateSegments[segmentIndex] = alternative;
      candidates.add(candidateSegments.join(" ").trim());
    });
  });

  return Array.from(candidates).filter(Boolean);
}

export function selectVoiceRecognitionTranscript(results, resolveCommand) {
  const candidates = getVoiceRecognitionCandidates(results);
  if (!candidates.length) return "";
  if (typeof resolveCommand !== "function") return candidates[0];

  const commandCandidate = candidates.find((candidate) => {
    try {
      return Boolean(resolveCommand(candidate));
    } catch {
      return false;
    }
  });
  return commandCandidate || candidates[0];
}
