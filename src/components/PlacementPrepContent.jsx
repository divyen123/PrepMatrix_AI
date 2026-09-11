import { Fragment } from "react";
import { placementContentBlocks } from "../utils/placementPreparationContent.js";

function inlineContent(text) {
  return text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/gu).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export default function PlacementPrepContent({ text }) {
  return (
    <div className="learning-career-points">
      {placementContentBlocks(text).map((block, index) => block.type === "code" ? (
        <pre key={index}><code>{block.code}</code></pre>
      ) : (
        <ul key={index}>{block.points.map((point, pointIndex) => <li key={pointIndex}>{inlineContent(point)}</li>)}</ul>
      ))}
    </div>
  );
}
