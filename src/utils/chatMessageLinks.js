const MAX_CHAT_LINK_LENGTH = 2048;
const MAX_LINK_LABEL_LENGTH = 240;

const TRUSTED_CHAT_LINKS = new Map([
  ["www.youtube.com", new Map([
    ["/", null],
    ["/results", "search_query"],
  ])],
  ["www.google.com", new Map([
    ["/", null],
    ["/search", "q"],
  ])],
  ["en.wikipedia.org", new Map([
    ["/", null],
    ["/w/index.php", "search"],
  ])],
]);

function hasControlCharacters(value = "") {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 31 || codePoint === 127;
  });
}

export function normalizeSafeChatLink(value = "") {
  const raw = String(value).trim();
  if (!raw || raw.length > MAX_CHAT_LINK_LENGTH || hasControlCharacters(raw)) {
    return "";
  }

  try {
    const url = new URL(raw);
    const allowedPaths = TRUSTED_CHAT_LINKS.get(url.hostname.toLowerCase());
    const requiredQuery = allowedPaths?.get(url.pathname);
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || url.port
      || url.hash
      || !allowedPaths?.has(url.pathname)
      || (requiredQuery && !url.searchParams.get(requiredQuery)?.trim())
      || (requiredQuery && Array.from(url.searchParams.keys()).some(
        (key) => key !== requiredQuery,
      ))
      || (!requiredQuery && url.search)
    ) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function youtubeRecommendationToken(source, youtubeContext) {
  if (!youtubeContext) return null;
  const match = source.match(
    /^(?:\*\*)?([^*\n“”"]{2,100})(?:\*\*)?\s*(?:–|—|-)\s*[“"]([^”"\n]{3,180})[”"]/u,
  );
  if (!match) return null;

  const channel = match[1].trim();
  const label = match[2].trim();
  const query = `${channel} ${label}`.trim().slice(0, 300);
  if (!query) return null;

  const url = new URL("https://www.youtube.com/results");
  url.searchParams.set("search_query", query);
  const titleStart = match[0].indexOf(match[2]);
  return {
    end: titleStart + match[2].length,
    href: url.toString(),
    label,
    start: titleStart,
  };
}

function matchAt(source, offset, youtubeToken, linksAllowed) {
  if (youtubeToken?.start === offset && linksAllowed) {
    return {
      end: youtubeToken.end,
      token: { type: "link", href: youtubeToken.href, value: youtubeToken.label },
    };
  }

  const remaining = source.slice(offset);
  const markdownLink = remaining.match(/^\[([^\]\n]{1,240})\]\(([^)\s]{1,2048})\)/u);
  if (markdownLink) {
    const href = linksAllowed ? normalizeSafeChatLink(markdownLink[2]) : "";
    return {
      end: offset + markdownLink[0].length,
      token: href
        ? { type: "link", href, value: markdownLink[1] }
        : { type: "text", value: markdownLink[1] },
    };
  }

  const strong = remaining.match(/^\*\*([^*\n]{1,240})\*\*/u);
  if (strong) {
    return {
      end: offset + strong[0].length,
      token: { type: "strong", value: strong[1] },
    };
  }

  const bareUrl = remaining.match(/^https:\/\/[^\s<>()]+/iu);
  if (bareUrl) {
    const rawUrl = bareUrl[0].replace(/[.,!?;:]+$/u, "");
    const href = linksAllowed ? normalizeSafeChatLink(rawUrl) : "";
    if (href) {
      return {
        end: offset + rawUrl.length,
        token: { type: "link", href, value: rawUrl.slice(0, MAX_LINK_LABEL_LENGTH) },
      };
    }
  }

  return null;
}

export function tokenizeChatMessageInline(
  value = "",
  { linksAllowed = true, youtubeContext = false } = {},
) {
  const source = String(value);
  const youtubeToken = youtubeRecommendationToken(
    source,
    linksAllowed && youtubeContext,
  );
  const tokens = [];
  let cursor = 0;
  let textStart = 0;

  while (cursor < source.length) {
    const matched = matchAt(source, cursor, youtubeToken, linksAllowed);
    if (!matched) {
      cursor += 1;
      continue;
    }
    if (cursor > textStart) {
      tokens.push({ type: "text", value: source.slice(textStart, cursor) });
    }
    tokens.push(matched.token);
    cursor = matched.end;
    textStart = cursor;
  }

  if (textStart < source.length) {
    tokens.push({ type: "text", value: source.slice(textStart) });
  }
  return tokens.length ? tokens : [{ type: "text", value: source }];
}