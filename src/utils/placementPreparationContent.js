const sentenceSegmenter = typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter("en", { granularity: "sentence" })
  : null;

function sentencePoints(text) {
  // Keep punctuation inside inline code intact while splitting legacy prose.
  const code = [];
  const protectedText = text.replace(/`[^`\n]+`/gu, (value) => {
    code.push(value);
    return `\uE000${code.length - 1}\uE001`;
  });
  const segments = sentenceSegmenter
    ? [...sentenceSegmenter.segment(protectedText)].map(({ segment }) => segment.trim())
    : protectedText.split(/(?<=[.!?])\s+(?=[\p{Lu}\d])/u);
  const points = [];
  for (const segment of segments.filter(Boolean)) {
    if (points.length && /\b(?:e\.g|i\.e|Mr|Mrs|Ms|Dr|vs|etc)\.$/iu.test(points.at(-1))) {
      points[points.length - 1] += ` ${segment}`;
    } else points.push(segment);
  }
  return points.map((point) => point.replace(/\uE000(\d+)\uE001/gu, (_, index) => code[Number(index)]));
}

export function placementContentBlocks(value) {
  const text = typeof value === "string" ? value.replace(/\r\n?/gu, "\n").trim() : "";
  if (!text) return [];
  const blocks = [];
  let prose = [];
  let code = [];
  let fence = null;
  const flushProse = () => {
    const points = prose.flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed) return [];
      // Respect intentional bullet/numbered points from new generations.
      const bullet = trimmed.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/u);
      return bullet ? [bullet[1]] : sentencePoints(trimmed);
    });
    if (points.length) blocks.push({ type: "points", points });
    prose = [];
  };
  for (const line of text.split("\n")) {
    const marker = line.match(/^\s*(`{3,}|~{3,})([\w+-]*)\s*$/u);
    if (!fence && marker) {
      flushProse();
      fence = { delimiter: marker[1], language: marker[2] };
    } else if (fence && marker && marker[1][0] === fence.delimiter[0] && marker[1].length >= fence.delimiter.length && !marker[2]) {
      blocks.push({ type: "code", language: fence.language, code: code.join("\n") });
      fence = null;
      code = [];
    } else if (fence) code.push(line);
    else prose.push(line);
  }
  if (fence) blocks.push({ type: "code", language: fence.language, code: code.join("\n") });
  flushProse();
  return blocks;
}
