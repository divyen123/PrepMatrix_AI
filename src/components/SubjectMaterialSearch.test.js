import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { parseFragment } from "parse5";
import { createServer } from "vite";
import { getMaterialSearchOptions } from "../utils/materialSearch.js";

let vite;
let SubjectMaterialSearch;
let MaterialSearchPanel;
let ResourcesHub;

before(async () => {
  vite = await createServer({ appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  ({ default: SubjectMaterialSearch, MaterialSearchPanel } = await vite.ssrLoadModule("/src/components/SubjectMaterialSearch.jsx"));
  ({ default: ResourcesHub } = await vite.ssrLoadModule("/src/components/ResourcesHub.jsx"));
});
after(async () => { await vite?.close(); });

const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value;
const contents = (node) => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(contents).join("");
const nodes = (node, predicate) => [
  ...(predicate(node) ? [node] : []),
  ...(node.childNodes || []).flatMap((child) => nodes(child, predicate)),
];
const byTag = (tree, name) => nodes(tree, (node) => node.tagName === name);
const render = (Component, props) => parseFragment(renderToStaticMarkup(React.createElement(Component, props)));
const panel = (props = {}) => render(MaterialSearchPanel, {
  kind: "chapter", options: [], subjectName: "Linear algebra", institutionName: "Sathyabama", isOpen: true,
  id: "chapter-search", ...props,
});

test("institution materials links use the exact subject and institution and safely preserve special characters", () => {
  for (const [subjectName, institutionName] of [
    ["Linear algebra", "Sathyabama"],
    ["C++ & <Networks>", "Université d'été & Research"],
  ]) {
    const tree = render(SubjectMaterialSearch, { subject: { name: subjectName }, institutionName: ` ${institutionName} ` });
    const link = byTag(tree, "a").find((node) => contents(node) === "Institution materials");
    const url = new URL(attr(link, "href"));
    assert.equal(url.origin, "https://www.google.com");
    assert.equal(url.pathname, "/search");
    assert.deepEqual([...url.searchParams], [["q", `${subjectName} ${institutionName} materials`]]);
    assert.equal(attr(link, "target"), "_blank");
    assert.deepEqual(attr(link, "rel").split(" ").sort(), ["noopener", "noreferrer"]);
    assert.equal(attr(link, "title"), `Find ${subjectName} materials from ${institutionName}`);
    assert.equal(nodes(tree, (node) => node.tagName === "networks").length, 0);
  }
});

test("chapter and topic controls share one initially closed popup containing separate hidden forms", () => {
  const tree = render(SubjectMaterialSearch, { subject: { name: "Networks", chapters: 4 } });
  const popups = nodes(tree, (node) => attr(node, "popover") !== undefined);
  assert.equal(popups.length, 1);
  const popup = popups[0];
  assert.equal(attr(popup, "popover"), "manual");
  assert.equal(attr(popup, "role"), "dialog");
  assert.equal(attr(popup, "aria-hidden"), "true");
  assert.equal(attr(popup, "inert"), "");
  const forms = byTag(popup, "form");
  assert.equal(forms.length, 2);
  assert.equal(byTag(tree, "form").length, forms.length, "search forms cannot appear outside the popup");
  for (const kind of ["chapter", "topic"]) {
    const trigger = byTag(tree, "button").find((node) => contents(node) === `Search ${kind}`);
    const form = forms.find((node) => attr(node, "aria-label") === `Search ${kind} materials`);
    assert.equal(attr(trigger, "aria-controls"), attr(popup, "id"));
    assert.equal(attr(trigger, "aria-haspopup"), "dialog");
    assert.equal(attr(trigger, "aria-expanded"), "false");
    assert.equal(attr(form, "hidden"), "");
  }
  assert.ok(byTag(popup, "button").some((node) => attr(node, "aria-label") === "Close material search"));
});

test("unnamed chapters and absent topics offer labeled editable inputs with empty searches disabled", () => {
  const options = getMaterialSearchOptions({ name: "Networks", chapters: 4 });
  for (const kind of ["chapter", "topic"]) {
    const tree = panel({ kind, options: options[`${kind}s`] });
    const field = byTag(tree, "input").find((node) => attr(node, "type") === "text");
    const submit = byTag(tree, "button")[0];
    assert.equal(attr(field, "readonly"), undefined);
    assert.equal(attr(field, "value"), "");
    assert.equal(attr(field, "placeholder"), `Enter a ${kind} name`);
    assert.ok(nodes(tree, (node) => attr(node, "id") === attr(field, "aria-labelledby")).length);
    assert.equal(attr(submit, "disabled"), "");
    assert.equal(attr(submit, "type"), "submit");
    assert.equal(attr(submit, "aria-label"), `Search ${kind} materials in a new tab`);
    assert.doesNotMatch(contents(tree), /Chapter [1-4]/u);
  }
});

test("one saved entry is ready to search and never appears as an empty manual field", () => {
  for (const kind of ["chapter", "topic"]) {
    const tree = panel({ kind, options: ["Vector spaces"] });
    const field = byTag(tree, "input").find((node) => attr(node, "type") === "text");
    assert.equal(attr(field, "value"), "Vector spaces");
    assert.equal(attr(field, "readonly"), "");
    assert.equal(attr(byTag(tree, "button")[0], "disabled"), undefined);
    assert.equal(attr(byTag(tree, "form")[0], "hidden"), undefined);
  }
});

test("multiple chapter and topic choices contain only their own saved names and require a selection", () => {
  const options = getMaterialSearchOptions({
    chapters: 4, chapterNames: [" Network models ", "", { title: "Routing" }],
    topics: ["TCP", { name: "IP addressing" }, "TCP"],
  });
  for (const kind of ["chapter", "topic"]) {
    const tree = panel({ kind, options: options[`${kind}s`] });
    const radios = byTag(tree, "input").filter((node) => attr(node, "type") === "radio");
    assert.deepEqual(radios.map((node) => attr(node, "value")), options[`${kind}s`]);
    assert.ok(radios.every((node) => attr(node, "checked") === undefined));
    assert.equal(new Set(radios.map((node) => attr(node, "name"))).size, 1);
    assert.equal(nodes(tree, (node) => attr(node, "role") === "radiogroup").length, 1);
    assert.equal(attr(byTag(tree, "button")[0], "disabled"), "");
    for (const otherName of options[kind === "chapter" ? "topics" : "chapters"]) {
      assert.ok(!contents(tree).includes(otherName));
    }
    assert.doesNotMatch(contents(tree), /Chapter [1-4]/u);
  }
});

test("missing institution disables its direct link and per-search toggles with setup guidance", () => {
  const tree = render(SubjectMaterialSearch, { subject: { name: "Networks" }, institutionName: "  " });
  const institutionButton = byTag(tree, "button").find((node) => contents(node) === "Institution materials");
  assert.equal(attr(institutionButton, "disabled"), "");
  assert.equal(byTag(tree, "a").length, 0);
  const switches = byTag(tree, "input").filter((node) => attr(node, "role") === "switch");
  assert.equal(switches.length, 2);
  assert.ok(switches.every((node) => attr(node, "disabled") === "" && attr(node, "checked") === undefined));
  assert.match(contents(tree), /Add your institution in your academic profile/u);
});

test("subject detail puts Buy materials beside Search topic and wires real search context without a footer", () => {
  const subject = { name: "Data communication and computer networks", chapters: 4 };
  const markup = renderToStaticMarkup(React.createElement(MemoryRouter, {
    initialEntries: [`/materials?subject=${encodeURIComponent(subject.name)}`],
  }, React.createElement(ResourcesHub, {
    subjects: [subject], academicTrack: "Engineering & Technology",
    academicProfile: { schoolType: "college", stream: "Engineering & Technology", department: "Information Technology", institutionName: "Sathyabama" },
  })));
  const tree = parseFragment(markup);
  const detail = byTag(tree, "article").find((node) => attr(node, "class")?.split(" ").includes("resource-card"));
  assert.ok(detail);
  assert.doesNotMatch(markup, /resource-chapter-strip|<strong>Chapter [1-4]<\/strong>/u);
  const directLink = byTag(detail, "a").find((node) => contents(node) === "Institution materials");
  assert.equal(new URL(attr(directLink, "href")).searchParams.get("q"), `${subject.name} Sathyabama materials`);
  const webNotes = byTag(detail, "a").find((node) => contents(node).includes("Web notes"));
  assert.equal(new URL(attr(webNotes, "href")).searchParams.get("q"), `Engineering & Technology Information Technology ${subject.name} materials pdf`);
  const actions = nodes(detail, (node) => attr(node, "class")?.split(" ").includes("resource-material-search__actions"))[0];
  assert.ok(actions);
  const controls = byTag(actions, "button");
  assert.deepEqual(controls.map(contents), ["Search chapter", "Search topic", "Buy materials"]);
  const buyButton = controls.at(-1);
  assert.equal(attr(buyButton, "aria-haspopup"), "dialog");
  assert.equal(nodes(detail, (node) => attr(node, "class")?.split(" ").includes("resource-book-entry")).length, 0);
  assert.equal(nodes(tree, (node) => attr(node, "class")?.split(" ").includes("material-book-shelf")).length, 0);
  assert.ok(markup.indexOf("resource-lane-grid") < markup.indexOf("resource-material-search"));
});

// A small hook fixture exercises actual callbacks without a browser or DOM renderer.
const hookFixture = `
  let slots = [], cursor = 0, collectLayoutEffects = false, pendingLayoutEffects = new Set();
  export function useState(initial) {
    const index = cursor++;
    slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
    return [slots[index].value, next => { slots[index].value = typeof next === "function" ? next(slots[index].value) : next; }];
  }
  export const useRef = initial => useState(() => ({ current: initial }))[0];
  export const useId = () => useState("material-search-fixture")[0];
  export const useEffect = () => {};
  export function useLayoutEffect(callback, dependencies) {
    if (!collectLayoutEffects) return;
    const index = cursor++;
    const previous = slots[index];
    if (!previous || !dependencies || dependencies.some((value, item) => !Object.is(value, previous.dependencies?.[item]))) {
      slots[index] = { dependencies, callback, cleanup: previous?.cleanup };
      pendingLayoutEffects.add(index);
    }
  }
  export const enableLayoutEffects = () => { collectLayoutEffects = true; };
  export const flushLayoutEffects = () => {
    for (const index of pendingLayoutEffects) {
      slots[index].cleanup?.();
      slots[index].cleanup = slots[index].callback();
    }
    pendingLayoutEffects.clear();
  };
  export const cleanupLayoutEffects = () => { for (const slot of slots) { slot?.cleanup?.(); if (slot) slot.cleanup = undefined; } };
  export const render = callback => { cursor = 0; return callback(); };
  export const reset = () => { cleanupLayoutEffects(); slots = []; cursor = 0; pendingLayoutEffects.clear(); collectLayoutEffects = false; };
`;
const elements = (tree, predicate) => !tree || typeof tree !== "object" ? [] : [
  ...(predicate(tree) ? [tree] : []),
  ...[tree.props?.children].flat(Infinity).flatMap((child) => elements(child, predicate)),
];

async function createHookFixture() {
  const fixtureId = "virtual:material-search-hooks";
  const fixtureVite = await createServer({
    appType: "custom", logLevel: "silent", server: { middlewareMode: true },
    plugins: [{
      name: "material-search-hook-fixture", enforce: "pre",
      resolveId(id) { return id === fixtureId ? `\0${fixtureId}` : null; },
      load(id) { return id === `\0${fixtureId}` ? hookFixture : null; },
      transform(source, id) {
        return id.replaceAll("\\", "/").endsWith("/src/components/SubjectMaterialSearch.jsx")
          ? source.replace('from "react"', `from "${fixtureId}"`) : null;
      },
    }],
  });
  const components = await fixtureVite.ssrLoadModule("/src/components/SubjectMaterialSearch.jsx");
  const hooks = await fixtureVite.ssrLoadModule(fixtureId);
  return { fixtureVite, components, hooks };
}

test("search modes share one popup, retain closing content and restore focus on explicit dismissal", async () => {
  const { fixtureVite, components: { default: SearchControls, MaterialSearchPanel: Panel }, hooks } = await createHookFixture();
  const props = {
    subject: { name: "Networks", chapters: 2, chapterNames: ["Routing", "Transport"], topics: ["TCP", "IP"] },
    institutionName: "Sathyabama",
  };
  const focusCalls = [];
  const sources = Object.fromEntries(["chapter", "topic"].map((kind) => [kind, {
    focus(options) { focusCalls.push({ kind, options }); },
  }]));
  const draw = () => hooks.render(() => SearchControls(props));
  const trigger = (kind) => elements(draw(), (node) => node.type === "button" && node.props.id?.endsWith(`-${kind}-trigger`))[0];
  const popup = () => elements(draw(), (node) => node.props?.popover !== undefined)[0];
  const panels = () => elements(draw(), (node) => node.type === Panel);
  const open = (kind) => {
    const button = trigger(kind);
    if (typeof button.props.ref === "function") button.props.ref(sources[kind]);
    button.props.onClick({ currentTarget: sources[kind] });
  };
  const assertMode = (kind, isOpen) => {
    const popupNodes = elements(draw(), (node) => node.props?.popover !== undefined);
    assert.equal(popupNodes.length, 1);
    assert.equal(popup().props["aria-hidden"], !isOpen);
    assert.equal(Boolean(popup().props.inert), !isOpen);
    for (const candidate of ["chapter", "topic"]) {
      assert.equal(trigger(candidate).props["aria-expanded"], isOpen && candidate === kind);
      const panelNode = panels().find((node) => node.props.kind === candidate);
      assert.equal(panelNode.props.hidden, candidate !== kind);
      assert.equal(panelNode.props.isOpen, isOpen && candidate === kind);
    }
  };
  try {
    assertMode("", false);
    open("chapter");
    assertMode("chapter", true);
    assert.deepEqual(panels().find((node) => node.props.kind === "chapter").props.options, ["Routing", "Transport"]);
    open("topic");
    assertMode("topic", true);
    assert.deepEqual(panels().find((node) => node.props.kind === "topic").props.options, ["TCP", "IP"]);
    open("topic");
    assertMode("topic", false);
    assert.equal(panels().filter((node) => !node.props.hidden).length, 1, "the closing popup keeps its selected content for fade-out");
    open("topic");
    assertMode("topic", true);

    const dismiss = elements(draw(), (node) => node.type === "button" && node.props["aria-label"] === "Close material search")[0];
    const focusedBeforeClose = focusCalls.length;
    dismiss.props.onClick();
    assertMode("topic", false);
    assert.equal(focusCalls.length, focusedBeforeClose + 1);
    assert.equal(focusCalls.at(-1).kind, "topic");

    open("chapter");
    let prevented = false;
    let stopped = false;
    draw().props.onKeyDown({ key: "Escape", preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
    assertMode("chapter", false);
    assert.equal(prevented, true);
    assert.equal(stopped, true);
    assert.equal(focusCalls.at(-1).kind, "chapter");

    open("topic");
    panels().find((node) => node.props.kind === "topic").props.onSearch();
    assertMode("topic", false);
  } finally {
    await fixtureVite.close();
  }
});

test("a retained closing panel preserves its custom term and institution setting when reopened", async () => {
  const { fixtureVite, components: { MaterialSearchPanel: Panel }, hooks } = await createHookFixture();
  const props = { kind: "chapter", options: [], subjectName: "Networks", institutionName: "Sathyabama", isOpen: true, hidden: false, id: "chapter" };
  const draw = () => hooks.render(() => Panel(props));
  const input = (type) => elements(draw(), (node) => node.type === "input" && node.props.type === type)[0];
  try {
    input("text").props.onChange({ target: { value: "Routing" } });
    input("checkbox").props.onChange({ target: { checked: true } });
    props.isOpen = false;
    assert.equal(draw().props.hidden, false, "content visibility is independent of its active state during fade-out");
    props.hidden = true;
    assert.equal(draw().props.hidden, true);
    props.isOpen = true;
    props.hidden = false;
    assert.equal(input("text").props.value, "Routing");
    assert.equal(input("checkbox").props.checked, true);
  } finally {
    await fixtureVite.close();
  }
});

test("popup lifecycle dismisses outside pointer and focus events and removes positioning listeners", async () => {
  const { fixtureVite, components: { default: SearchControls }, hooks } = await createHookFixture();
  const originalGlobals = Object.fromEntries(["window", "document", "ResizeObserver"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const eventTarget = () => {
    const listeners = new Map();
    return {
      listeners,
      addEventListener(type, callback) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(callback);
      },
      removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
      dispatch(type, target) { for (const callback of [...(listeners.get(type) || [])]) callback({ target }); },
      listenerCount() { return [...listeners.values()].reduce((total, callbacks) => total + callbacks.size, 0); },
    };
  };
  const documentEvents = eventTarget();
  const viewportEvents = { ...eventTarget(), width: 1200, height: 800, offsetLeft: 0, offsetTop: 0 };
  const windowEvents = { ...eventTarget(), innerWidth: 1200, innerHeight: 800, visualViewport: viewportEvents };
  const observers = [];
  const popupChild = {};
  const outsideTarget = {};
  const triggerChildren = { chapter: {}, topic: {} };
  let nativeOpen = false;
  let shown = 0;
  let hidden = 0;
  let focusRestored = 0;
  let rectReads = 0;
  const popupNode = {
    style: {}, dataset: {}, offsetWidth: 320,
    matches(selector) { assert.equal(selector, ":popover-open"); return nativeOpen; },
    showPopover() { nativeOpen = true; shown += 1; },
    hidePopover() { nativeOpen = false; hidden += 1; },
    contains(target) { return target === popupNode || target === popupChild; },
    getBoundingClientRect() { rectReads += 1; return { width: 288, height: 180 }; },
  };
  const sourceNodes = Object.fromEntries(["chapter", "topic"].map((kind, index) => [kind, {
    contains(target) { return target === sourceNodes[kind] || target === triggerChildren[kind]; },
    focus() { focusRestored += 1; },
    getBoundingClientRect() { return { left: 300 + index * 150, right: 430 + index * 150, top: 500, bottom: 536 }; },
  }]));
  const observerClass = class {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
  };
  const setGlobal = (name, value) => Object.defineProperty(globalThis, name, { configurable: true, value });
  setGlobal("window", windowEvents);
  setGlobal("document", documentEvents);
  setGlobal("ResizeObserver", observerClass);
  hooks.enableLayoutEffects();
  const draw = () => {
    const tree = hooks.render(() => SearchControls({ subject: { name: "Networks" }, institutionName: "Sathyabama" }));
    for (const node of elements(tree, (item) => item.type === "button" && item.props.id?.endsWith("-trigger"))) {
      const kind = node.props.id.endsWith("-chapter-trigger") ? "chapter" : "topic";
      node.props.ref(sourceNodes[kind]);
    }
    const popup = elements(tree, (node) => node.props?.popover !== undefined)[0];
    popup.props.ref.current = popupNode;
    hooks.flushLayoutEffects();
    return tree;
  };
  const trigger = (tree, kind) => elements(tree, (node) => node.type === "button" && node.props.id?.endsWith(`-${kind}-trigger`))[0];
  const open = (kind) => {
    trigger(draw(), kind).props.onClick({ currentTarget: sourceNodes[kind] });
    return draw();
  };
  const assertClosed = () => {
    const tree = draw();
    assert.equal(nativeOpen, false);
    assert.equal(trigger(tree, "chapter").props["aria-expanded"], false);
    assert.equal(trigger(tree, "topic").props["aria-expanded"], false);
    assert.equal(documentEvents.listenerCount(), 0);
    assert.equal(windowEvents.listenerCount(), 0);
    assert.equal(viewportEvents.listenerCount(), 0);
    assert.equal(observers.at(-1).disconnected, true);
  };
  try {
    draw();
    assert.equal(shown, 0);
    open("chapter");
    assert.equal(nativeOpen, true);
    assert.equal(shown, 1);
    assert.equal(documentEvents.listenerCount(), 3);
    assert.equal(windowEvents.listenerCount(), 1);
    assert.equal(viewportEvents.listenerCount(), 2);
    assert.equal(observers.at(-1).target, popupNode);
    assert.match(popupNode.style.left, /^\d+(?:\.\d+)?px$/u);
    assert.match(popupNode.style.top, /^\d+(?:\.\d+)?px$/u);

    documentEvents.dispatch("pointerdown", popupChild);
    documentEvents.dispatch("focusin", popupChild);
    documentEvents.dispatch("pointerdown", triggerChildren.topic);
    assert.equal(trigger(draw(), "chapter").props["aria-expanded"], true, "popup content and either trigger keep the popup open");
    open("topic");
    assert.equal(shown, 1, "switching modes reuses the native popup");
    assert.equal(trigger(draw(), "chapter").props["aria-expanded"], false);
    assert.equal(trigger(draw(), "topic").props["aria-expanded"], true);
    assert.equal(observers[0].disconnected, true, "mode changes replace old positioning listeners");
    assert.equal(documentEvents.listenerCount(), 3);

    const readsBeforeResize = rectReads;
    windowEvents.dispatch("resize");
    documentEvents.dispatch("scroll");
    viewportEvents.dispatch("scroll");
    observers.at(-1).callback();
    assert.equal(rectReads, readsBeforeResize + 4, "resize, scroll and content changes reposition the popup");

    documentEvents.dispatch("pointerdown", outsideTarget);
    assertClosed();
    assert.equal(hidden, 1);
    assert.equal(focusRestored, 0, "outside pointer dismissal preserves the user's destination focus");

    open("chapter");
    documentEvents.dispatch("focusin", outsideTarget);
    assertClosed();
    assert.equal(hidden, 2);
    assert.equal(focusRestored, 0, "outside focus dismissal does not steal focus back");

    open("topic");
    hooks.cleanupLayoutEffects();
    assert.equal(documentEvents.listenerCount(), 0);
    assert.equal(windowEvents.listenerCount(), 0);
    assert.equal(viewportEvents.listenerCount(), 0);
    assert.equal(observers.at(-1).disconnected, true, "unmount disconnects the observer");
  } finally {
    hooks.cleanupLayoutEffects();
    for (const [name, descriptor] of Object.entries(originalGlobals)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    await fixtureVite.close();
  }
});

test("search callbacks require a term, follow selections and toggle institution queries", async () => {
  const { fixtureVite, components: { MaterialSearchPanel: Panel }, hooks } = await createHookFixture();
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const opened = [];
  let completedSearches = 0;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { open: (...args) => opened.push(args) } });
  try {
    const props = {
      kind: "topic", options: [], subjectName: "Linear algebra", institutionName: "Sathyabama", isOpen: true, id: "topic",
      onSearch: () => { completedSearches += 1; },
    };
    const draw = () => hooks.render(() => Panel(props));
    const submit = () => { let prevented = false; draw().props.onSubmit({ preventDefault() { prevented = true; } }); assert.ok(prevented); };
    const input = (type) => elements(draw(), (node) => node.type === "input" && node.props.type === type)[0];
    submit();
    assert.equal(opened.length, 0);
    assert.equal(completedSearches, 0);
    input("text").props.onChange({ target: { value: "   " } });
    submit();
    assert.equal(opened.length, 0);
    input("text").props.onChange({ target: { value: " Eigenvalues " } });
    submit();
    assert.equal(new URL(opened.at(-1)[0]).searchParams.get("q"), "Linear algebra Eigenvalues materials pdf");
    input("checkbox").props.onChange({ target: { checked: true } });
    submit();
    assert.equal(new URL(opened.at(-1)[0]).searchParams.get("q"), "Linear algebra Eigenvalues Sathyabama materials");
    input("checkbox").props.onChange({ target: { checked: false } });
    submit();
    assert.equal(new URL(opened.at(-1)[0]).searchParams.get("q"), "Linear algebra Eigenvalues materials pdf");
    assert.ok(opened.every((args) => args[1] === "_blank" && args[2] === "noopener,noreferrer"));

    hooks.reset();
    props.options = ["Vector spaces", "Matrices"];
    const beforeSelection = opened.length;
    submit();
    assert.equal(opened.length, beforeSelection);
    elements(draw(), (node) => node.type === "input" && node.props.value === "Matrices")[0].props.onChange();
    submit();
    assert.equal(new URL(opened.at(-1)[0]).searchParams.get("q"), "Linear algebra Matrices materials pdf");
    props.options = ["Vector spaces", "Linear maps"];
    const beforeStaleSelection = opened.length;
    submit();
    assert.equal(opened.length, beforeStaleSelection, "a removed saved option cannot be searched");

    hooks.reset();
    props.options = ["Vector spaces"];
    props.institutionName = "";
    submit();
    assert.equal(new URL(opened.at(-1)[0]).searchParams.get("q"), "Linear algebra Vector spaces materials pdf");
    assert.equal(input("checkbox").props.disabled, true);
    assert.equal(completedSearches, opened.length, "only successful searches notify the popup to close");
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete globalThis.window;
    await fixtureVite.close();
  }
});
