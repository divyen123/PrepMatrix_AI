import { tokenizeChatMessageInline } from "../utils/chatMessageLinks";

function isEscaped(source, index) {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function splitTableRow(value) {
  const source = String(value ?? "").trim();
  if (!source.includes("|")) return null;

  const startsWithPipe = source.startsWith("|");
  const endsWithPipe = source.endsWith("|") && !isEscaped(source, source.length - 1);
  const row = source.slice(startsWithPipe ? 1 : 0, endsWithPipe ? -1 : undefined);
  const cells = [];
  let cell = "";
  let codeSpanOpen = false;
  let separatorCount = 0;

  for (let index = 0; index < row.length; index += 1) {
    const character = row[index];
    if (character === "`" && !isEscaped(row, index)) {
      codeSpanOpen = !codeSpanOpen;
      cell += character;
      continue;
    }
    if (character === "\\" && row[index + 1] === "|") {
      cell += "|";
      index += 1;
      continue;
    }
    if (character === "|" && !codeSpanOpen && !isEscaped(row, index)) {
      cells.push(cell.trim());
      cell = "";
      separatorCount += 1;
      continue;
    }
    cell += character;
  }

  cells.push(cell.trim());
  return separatorCount && cells.length > 1 ? cells : null;
}

function tableAlignments(value, columnCount) {
  const cells = splitTableRow(value);
  if (!cells || cells.length !== columnCount) return null;

  const alignments = cells.map((cell) => {
    const marker = cell.replace(/\s+/gu, "");
    if (!/^:?-{3,}:?$/u.test(marker)) return null;
    if (marker.startsWith(":") && marker.endsWith(":")) return "center";
    if (marker.endsWith(":")) return "right";
    return "left";
  });

  return alignments.every(Boolean) ? alignments : null;
}

function parseChatMessageBlocks(text = "") {
  const lines = String(text).split(/\r?\n/u);
  const blocks = [];

  for (let index = 0; index < lines.length;) {
    const headers = splitTableRow(lines[index]);
    const alignments = headers?.length > 1
      ? tableAlignments(lines[index + 1] ?? "", headers.length)
      : null;

    if (!headers || !alignments) {
      blocks.push({ type: "line", value: lines[index], sourceIndex: index });
      index += 1;
      continue;
    }

    const rows = [];
    let rowIndex = index + 2;
    while (rowIndex < lines.length && lines[rowIndex].trim()) {
      const row = splitTableRow(lines[rowIndex]);
      if (!row) break;
      rows.push(Array.from({ length: headers.length }, (_, cellIndex) => row[cellIndex] ?? ""));
      rowIndex += 1;
    }

    blocks.push({
      type: "table",
      alignments,
      headers,
      rows,
      sourceIndex: index,
    });
    index = rowIndex;
  }

  return blocks;
}

export default function ChatMessageText({
  linksAllowed = true,
  text = "",
  youtubeContext = false,
}) {
  if (!text) return "";

  const parseInline = (value, enableYouTubeTitleLinks = false) => (
    tokenizeChatMessageInline(value, {
      linksAllowed,
      youtubeContext: youtubeContext && enableYouTubeTitleLinks,
    }).map((token, index) => {
      if (token.type === "strong") {
        return <strong key={`strong-${index}`}>{token.value}</strong>;
      }
      if (token.type === "code") {
        return <code className="chat-inline-code" key={`code-${index}`}>{token.value}</code>;
      }
      if (token.type === "link") {
        return (
          <a
            className="chat-message-link"
            href={token.href}
            key={`link-${index}`}
            rel="noopener noreferrer nofollow"
            target="_blank"
          >
            {token.value}
          </a>
        );
      }
      return token.value;
    })
  );

  return parseChatMessageBlocks(text).map((block) => {
    if (block.type === "table") {
      return (
        <div
          aria-label="Scrollable answer table"
          className="chat-table-scroll"
          key={`table-${block.sourceIndex}`}
          role="region"
          tabIndex={0}
        >
          <table className="chat-markdown-table">
            <thead>
              <tr>
                {block.headers.map((header, cellIndex) => (
                  <th data-align={block.alignments[cellIndex]} key={`header-${cellIndex}`} scope="col">
                    {parseInline(header)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td data-align={block.alignments[cellIndex]} key={`cell-${cellIndex}`}>
                      {parseInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    const cleanBlock = block.value.trim();
    if (!cleanBlock) {
      return <div aria-hidden="true" className="chat-spacer" key={`spacer-${block.sourceIndex}`} />;
    }

    const isBullet = cleanBlock.startsWith("* ") || cleanBlock.startsWith("- ");
    const numMatch = cleanBlock.match(/^(\d+)\.\s+(.*)/u);

    if (isBullet) {
      return (
        <ul className="chat-bullet-list" key={`bullet-${block.sourceIndex}`}>
          <li>{parseInline(cleanBlock.substring(2), true)}</li>
        </ul>
      );
    }

    if (numMatch) {
      return (
        <ol className="chat-num-list" key={`number-${block.sourceIndex}`} start={Number(numMatch[1])}>
          <li>{parseInline(numMatch[2], true)}</li>
        </ol>
      );
    }

    return (
      <p className="chat-paragraph" key={`paragraph-${block.sourceIndex}`}>
        {parseInline(block.value)}
      </p>
    );
  });
}
