import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeSafeChatLink,
  tokenizeChatMessageInline,
} from "./chatMessageLinks.js";

test("allows only credential-free trusted search destinations", () => {
  assert.equal(
    normalizeSafeChatLink("https://www.youtube.com/results?search_query=REST+API"),
    "https://www.youtube.com/results?search_query=REST+API",
  );
  assert.equal(
    normalizeSafeChatLink("https://www.google.com/search?q=queues"),
    "https://www.google.com/search?q=queues",
  );
  assert.equal(
    normalizeSafeChatLink("https://en.wikipedia.org/w/index.php?search=photosynthesis"),
    "https://en.wikipedia.org/w/index.php?search=photosynthesis",
  );

  [
    "javascript:alert(1)",
    "data:text/html,hello",
    "http://www.youtube.com/results?search_query=REST",
    "https://user:secret@www.youtube.com/results?search_query=REST",
    "https://www.youtube.com/watch?v=unsafe-direct-id",
    "https://www.youtube.com/results",
    "https://www.google.com/search?q=REST&btnI=1",
    "https://attacker.example/results?search_query=REST",
    "https://example.com/docs",
    "https://localhost/private",
    "https://127.0.0.1/private",
    "https://[::ffff:127.0.0.1]/private",
  ].forEach((unsafeUrl) => {
    assert.equal(normalizeSafeChatLink(unsafeUrl), "", unsafeUrl);
  });
});

test("tokenizes trusted Markdown and bare search links without trusting labels", () => {
  const tokens = tokenizeChatMessageInline(
    "Try [YouTube](https://www.youtube.com/results?search_query=REST+API) "
      + "or https://www.google.com/search?q=REST+API. "
      + "Ignore [YouTube](https://attacker.example/results?search_query=REST).",
  );
  const links = tokens.filter((token) => token.type === "link");

  assert.deepEqual(
    links.map(({ href, value }) => ({ href, value })),
    [
      {
        href: "https://www.youtube.com/results?search_query=REST+API",
        value: "YouTube",
      },
      {
        href: "https://www.google.com/search?q=REST+API",
        value: "https://www.google.com/search?q=REST+API",
      },
    ],
  );
  assert.ok(tokens.some((token) => token.type === "text" && token.value === "YouTube"));
  assert.ok(!tokens.some((token) => token.type === "link" && /attacker/iu.test(token.href)));
});

test("tokenizes inline code without exposing Markdown backticks", () => {
  assert.deepEqual(
    tokenizeChatMessageInline("Use `front=rear=-1` before enqueue."),
    [
      { type: "text", value: "Use " },
      { type: "code", value: "front=rear=-1" },
      { type: "text", value: " before enqueue." },
    ],
  );
});

test("turns recommendation-shaped YouTube titles into trusted searches", () => {
  const tokens = tokenizeChatMessageInline(
    "**freeCodeCamp.org** – “REST API Tutorial for Beginners”",
    { youtubeContext: true },
  );
  const title = tokens.find((token) => token.type === "link");

  assert.equal(title?.value, "REST API Tutorial for Beginners");
  const url = new URL(title?.href);
  assert.equal(url.origin, "https://www.youtube.com");
  assert.equal(url.pathname, "/results");
  assert.equal(
    url.searchParams.get("search_query"),
    "freeCodeCamp.org REST API Tutorial for Beginners",
  );

  assert.equal(
    tokenizeChatMessageInline("The term “resource” means data.", {
      youtubeContext: true,
    }).some((token) => token.type === "link"),
    false,
  );
});

test("keeps every external link inert in child mode", () => {
  const tokens = tokenizeChatMessageInline(
    "[YouTube](https://www.youtube.com/results?search_query=space) "
      + "**NASA** – “Space for Kids”",
    { linksAllowed: false, youtubeContext: true },
  );

  assert.equal(tokens.some((token) => token.type === "link"), false);
  assert.ok(tokens.some((token) => token.type === "text" && token.value === "YouTube"));
});
