import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseFragment } from "parse5";
import { createServer } from "vite";

let vite;
let fixtureVite;
let BuyMaterialsDialog;
let BookDetailsDialog;
let useMaterialDialogLifecycle;
let createHarness;
let SubjectBookShelf;
let bookRequests;

// Run the actual hook and its effect cleanups with deterministic frames/timers.
const hookFixture = `
  let active;
  export function useState(initial) {
    const harness = active, index = harness.cursor++;
    harness.slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
    return [harness.slots[index].value, next => {
      harness.slots[index].value = typeof next === "function" ? next(harness.slots[index].value) : next;
    }];
  }
  export const useRef = initial => useState(() => ({ current: initial }))[0];
  export function useEffect(callback, dependencies) {
    const index = active.cursor++, previous = active.slots[index];
    if (!previous || !dependencies || dependencies.some((value, item) => !Object.is(value, previous.dependencies?.[item]))) {
      active.slots[index] = { dependencies, callback, cleanup: previous?.cleanup };
      active.pending.add(index);
    }
  }
  export const useLayoutEffect = useEffect;
  export function useCallback(callback, dependencies) {
    const index = active.cursor++, previous = active.slots[index];
    if (!previous || dependencies.some((value, item) => !Object.is(value, previous.dependencies?.[item]))) {
      active.slots[index] = { dependencies, value: callback };
    }
    return active.slots[index].value;
  }
  export function useMemo(callback, dependencies) {
    const index = active.cursor++, previous = active.slots[index];
    if (!previous || dependencies.some((value, item) => !Object.is(value, previous.dependencies?.[item]))) {
      active.slots[index] = { dependencies, value: callback() };
    }
    return active.slots[index].value;
  }
  export function createHarness() {
    const harness = { slots: [], cursor: 0, pending: new Set() };
    return {
      render(callback) { harness.cursor = 0; active = harness; try { return callback(); } finally { active = undefined; } },
      flushEffects() {
        for (const index of harness.pending) {
          harness.slots[index].cleanup?.();
          harness.slots[index].cleanup = harness.slots[index].callback();
        }
        harness.pending.clear();
      },
      unmount() {
        for (const slot of harness.slots) { slot?.cleanup?.(); if (slot) slot.cleanup = undefined; }
        harness.pending.clear();
      },
    };
  }
`;

before(async () => {
  vite = await createServer({ appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  ({ BuyMaterialsDialog, BookDetailsDialog } = await vite.ssrLoadModule("/src/components/MaterialBookDialogs.jsx"));
  const fixtureId = "virtual:material-dialog-hooks";
  const booksFixtureId = "virtual:material-dialog-books";
  fixtureVite = await createServer({
    appType: "custom", logLevel: "silent", server: { middlewareMode: true },
    plugins: [{
      name: "material-dialog-hook-fixture", enforce: "pre",
      resolveId(id) { return [fixtureId, booksFixtureId].includes(id) ? `\0${id}` : null; },
      load(id) {
        if (id === `\0${fixtureId}`) return hookFixture;
        if (id === `\0${booksFixtureId}`) return `
          export const requests = [];
          export const fetchSubjectBooks = (...args) => new Promise((resolve, reject) => requests.push({ args, resolve, reject }));
        `;
        return null;
      },
      transform(source, id) {
        const path = id.replaceAll("\\", "/");
        if (path.endsWith("/src/hooks/useMaterialDialogLifecycle.js")) return source.replace('from "react"', `from "${fixtureId}"`);
        if (path.endsWith("/src/components/ResourcesHub.jsx")) return source
          .replace('from "react"', `from "${fixtureId}"`)
          .replace('from "../utils/bookRecommendations"', `from "${booksFixtureId}"`);
        return null;
      },
    }],
  });
  ({ default: useMaterialDialogLifecycle } = await fixtureVite.ssrLoadModule("/src/hooks/useMaterialDialogLifecycle.js"));
  ({ createHarness } = await fixtureVite.ssrLoadModule(fixtureId));
  ({ SubjectBookShelf } = await fixtureVite.ssrLoadModule("/src/components/ResourcesHub.jsx"));
  ({ requests: bookRequests } = await fixtureVite.ssrLoadModule(booksFixtureId));
});
after(async () => { await Promise.all([vite?.close(), fixtureVite?.close()]); });

const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value;
const contents = (node) => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(contents).join("");
const nodes = (node, predicate) => [
  ...(predicate(node) ? [node] : []),
  ...(node.childNodes || []).flatMap((child) => nodes(child, predicate)),
];

test("Buy materials is a named modal with a compact accessible close control and shelf content", () => {
  const tree = parseFragment(renderToStaticMarkup(React.createElement(BuyMaterialsDialog, {
    subject: "Linear algebra", onClose() {},
  }, React.createElement("section", { "aria-label": "Books for Linear algebra" }, "Book recommendations"))));
  const dialog = nodes(tree, (node) => node.tagName === "dialog")[0];
  assert.equal(attr(dialog, "id"), "material-buy-dialog");
  assert.equal(attr(dialog, "aria-modal"), "true");
  const title = nodes(dialog, (node) => attr(node, "id") === attr(dialog, "aria-labelledby"))[0];
  assert.equal(contents(title), "Buy materials");
  const close = nodes(dialog, (node) => node.tagName === "button" && attr(node, "aria-label") === "Close buy materials")[0];
  assert.ok(close);
  assert.equal(attr(close, "type"), "button");
  assert.ok(nodes(close, (node) => node.tagName === "svg" && attr(node, "aria-hidden") === "true").length);
  assert.match(contents(dialog), /Linear algebra/u);
  assert.ok(nodes(dialog, (node) => node.tagName === "section" && attr(node, "aria-label") === "Books for Linear algebra").length);
});

test("book details retain saving and safe retailer links inside the nested named modal", () => {
  const book = { bookId: "vectors", title: "Vector spaces", author: "A. Reader", description: "A concise guide", isbn: "9780123456789" };
  for (const saved of [false, true]) {
    const tree = parseFragment(renderToStaticMarkup(React.createElement(BookDetailsDialog, { book, saved, onSave() {}, onClose() {} })));
    const dialog = nodes(tree, (node) => node.tagName === "dialog")[0];
    assert.equal(attr(dialog, "aria-modal"), "true");
    const title = nodes(dialog, (node) => attr(node, "id") === attr(dialog, "aria-labelledby"))[0];
    assert.equal(contents(title), book.title);
    assert.ok(nodes(dialog, (node) => node.tagName === "button" && attr(node, "aria-label") === "Close book details").length);
    const save = nodes(dialog, (node) => node.tagName === "button" && contents(node).trim() === (saved ? "Saved" : "Save"))[0];
    assert.ok(save);
    assert.equal(attr(save, "disabled"), saved ? "" : undefined);
    const links = nodes(dialog, (node) => node.tagName === "a");
    assert.ok(links.length > 0);
    for (const link of links) {
      assert.equal(new URL(attr(link, "href")).protocol, "https:");
      assert.equal(attr(link, "target"), "_blank");
      assert.deepEqual(attr(link, "rel").split(" ").sort(), ["noopener", "noreferrer"]);
    }
  }
});

function createEnvironment({ reducedMotion = false } = {}) {
  const originalGlobals = Object.fromEntries(["window", "document"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const frames = new Map();
  const timers = new Map();
  let nextId = 0;
  const classList = () => {
    const classes = new Set();
    return { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) };
  };
  const doc = { activeElement: null, body: { classList: classList() }, documentElement: { classList: classList() } };
  const win = {
    requestAnimationFrame(callback) { frames.set(++nextId, callback); return nextId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout(callback, delay) { timers.set(++nextId, { callback, delay }); return nextId; },
    clearTimeout(id) { timers.delete(id); },
    matchMedia() { return { matches: reducedMotion }; },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: win });
  Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
  const focusTarget = (name) => ({
    name, isConnected: true, focusCalls: [],
    focus(options) { this.focusCalls.push(options); doc.activeElement = this; },
  });
  const dialog = (name) => ({
    name, open: false, showCalls: 0, closeCalls: 0,
    showModal() { this.open = true; this.showCalls += 1; doc.activeElement = this; },
    close() { this.open = false; this.closeCalls += 1; },
    getBoundingClientRect() { return { left: 100, right: 400, top: 100, bottom: 400 }; },
  });
  return {
    doc, frames, timers, dialog, focusTarget,
    flushFrame() {
      const callbacks = [...frames.values()]; frames.clear();
      for (const callback of callbacks) callback();
    },
    flushTimers() {
      const callbacks = [...timers.values()]; timers.clear();
      for (const { callback } of callbacks) callback();
    },
    restore() {
      for (const [name, descriptor] of Object.entries(originalGlobals)) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    },
  };
}

function mountDialog(environment, onClose) {
  const harness = createHarness();
  const dialog = environment.dialog("material dialog");
  const draw = () => harness.render(() => useMaterialDialogLifecycle(onClose));
  draw().dialogRef.current = dialog;
  harness.flushEffects();
  return { harness, dialog, draw };
}

test("dialog fades in after painting, dismisses only its backdrop, and closes once after the exit transition", () => {
  const environment = createEnvironment();
  const opener = environment.focusTarget("Buy materials");
  environment.doc.activeElement = opener;
  let closed = 0;
  const { harness, dialog, draw } = mountDialog(environment, () => { closed += 1; });
  try {
    assert.equal(dialog.showCalls, 1);
    assert.equal(draw().isVisible, false);
    environment.flushFrame();
    assert.equal(draw().isVisible, false);
    environment.flushFrame();
    assert.equal(draw().isVisible, true);
    draw().onBackdropClick({ target: {}, currentTarget: dialog, clientX: 150, clientY: 150 });
    assert.equal(environment.timers.size, 0, "clicks on book content do not dismiss the dialog");
    draw().onBackdropClick({ target: dialog, currentTarget: dialog, clientX: 10, clientY: 10 });
    assert.equal(draw().isVisible, false);
    assert.equal(closed, 0);
    assert.deepEqual([...environment.timers.values()].map(({ delay }) => delay), [220]);
    draw().requestClose();
    assert.equal(environment.timers.size, 1, "repeated dismissal cannot schedule duplicate closes");
    environment.flushTimers();
    assert.equal(closed, 1);
    harness.unmount();
    assert.equal(dialog.closeCalls, 1);
    assert.equal(environment.doc.activeElement, opener);
    assert.deepEqual(opener.focusCalls, [{ preventScroll: true }]);
    assert.equal(environment.frames.size, 0);
    assert.equal(environment.timers.size, 0);
  } finally {
    harness.unmount();
    environment.restore();
  }
});

test("nested book details return focus to its card and retain the parent dialog scroll lock", () => {
  const environment = createEnvironment();
  const buyTrigger = environment.focusTarget("Buy materials");
  environment.doc.activeElement = buyTrigger;
  const parent = mountDialog(environment, () => {});
  const card = environment.focusTarget("Book card");
  environment.doc.activeElement = card;
  const child = mountDialog(environment, () => {});
  const isLocked = () => [environment.doc.body, environment.doc.documentElement].every((element) => element.classList.contains("prepmatrix-scroll-locked"));
  try {
    assert.equal(parent.dialog.open, true);
    assert.equal(child.dialog.open, true);
    assert.equal(isLocked(), true);
    child.harness.unmount();
    assert.equal(environment.doc.activeElement, card);
    assert.equal(parent.dialog.open, true);
    assert.equal(isLocked(), true, "closing the nested modal cannot unlock the page behind its parent");
    parent.harness.unmount();
    assert.equal(environment.doc.activeElement, buyTrigger);
    assert.equal(isLocked(), false);
  } finally {
    child.harness.unmount(); parent.harness.unmount();
    environment.restore();
  }
});

test("Escape honors reduced motion and unmount cancels a pending close", () => {
  for (const reducedMotion of [false, true]) {
    const environment = createEnvironment({ reducedMotion });
    let closed = 0;
    const { harness, draw } = mountDialog(environment, () => { closed += 1; });
    try {
      let prevented = false;
      draw().onCancel({ preventDefault() { prevented = true; } });
      assert.equal(prevented, true);
      assert.equal(closed, reducedMotion ? 1 : 0);
      assert.equal(environment.frames.size, 0, "closing during entry cancels the scheduled reveal");
      assert.equal(environment.timers.size, reducedMotion ? 0 : 1);
      harness.unmount();
      assert.equal(environment.timers.size, 0);
      environment.flushFrame(); environment.flushTimers();
      assert.equal(closed, reducedMotion ? 1 : 0, "an unmounted dialog cannot fire a stale onClose callback");
    } finally {
      harness.unmount(); environment.restore();
    }
  }
});

const elements = (tree, predicate) => !tree || typeof tree !== "object" ? [] : [
  ...(predicate(tree) ? [tree] : []),
  ...[tree.props?.children].flat(Infinity).flatMap((child) => elements(child, predicate)),
];

test("the buy shelf pages through four cards at a time and opens the selected existing book detail", async () => {
  const harness = createHarness();
  const props = { subject: "Linear algebra", academicProfile: {}, academicLevel: "College", academicTrack: "Engineering", onOpenBook: (book) => opened.push(book) };
  const opened = [];
  const draw = () => harness.render(() => SubjectBookShelf(props));
  const cards = () => elements(draw(), (node) => Boolean(node.props.book));
  const button = (label) => elements(draw(), (node) => node.type === "button" && node.props["aria-label"] === label)[0];
  const books = Array.from({ length: 5 }, (_, index) => ({ bookId: `book-${index}`, title: `Book ${index + 1}` }));
  try {
    draw(); harness.flushEffects();
    assert.deepEqual(bookRequests.at(-1).args.slice(0, 2), [props.subject, { academicLevel: "College", academicTrack: "Engineering" }]);
    bookRequests.at(-1).resolve(books);
    await Promise.resolve();
    assert.deepEqual(cards().map((node) => node.props.book.bookId), ["book-0", "book-1", "book-2", "book-3"]);
    assert.equal(button("Previous materials").props.disabled, true);
    assert.equal(button("Next materials").props.disabled, false);
    button("Previous materials").props.onClick();
    assert.deepEqual(cards().map((node) => node.props.book.bookId), ["book-0", "book-1", "book-2", "book-3"], "the first page is bounded");
    const card = cards()[3];
    const cardHarness = createHarness();
    const cardTree = cardHarness.render(() => card.type(card.props));
    elements(cardTree, (node) => node.type === "button")[0].props.onClick();
    assert.deepEqual(opened, [books[3]], "selecting a material retains the book details callback");
    button("Next materials").props.onClick();
    assert.deepEqual(cards().map((node) => node.props.book.bookId), ["book-4"]);
    assert.equal(button("Next materials").props.disabled, true);
    button("Next materials").props.onClick();
    assert.deepEqual(cards().map((node) => node.props.book.bookId), ["book-4"], "the last page is bounded");
    button("Previous materials").props.onClick();
    assert.deepEqual(cards().map((node) => node.props.book.bookId), ["book-0", "book-1", "book-2", "book-3"]);
    button("Next materials").props.onClick();
    props.subject = "Networks";
    draw(); harness.flushEffects();
    bookRequests.at(-1).resolve(books.slice(0, 4));
    await Promise.resolve();
    assert.deepEqual(cards().map((node) => node.props.book.bookId), ["book-0", "book-1", "book-2", "book-3"], "new recommendations reset pagination");
    assert.equal(button("Next materials"), undefined, "four books need no extra paging controls");
  } finally {
    harness.unmount();
  }
});
