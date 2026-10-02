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

test("chapter and topic controls connect to separate hidden forms until opened", () => {
  const tree = render(SubjectMaterialSearch, { subject: { name: "Networks", chapters: 4 } });
  const forms = byTag(tree, "form");
  assert.equal(forms.length, 2);
  for (const kind of ["chapter", "topic"]) {
    const trigger = byTag(tree, "button").find((node) => contents(node) === `Search ${kind}`);
    const form = forms.find((node) => attr(node, "id") === attr(trigger, "aria-controls"));
    assert.equal(attr(trigger, "aria-expanded"), "false");
    assert.equal(attr(form, "hidden"), "");
    assert.equal(attr(form, "aria-label"), `Search ${kind} materials`);
  }
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

test("subject detail keeps the Buy materials control last, removes chapter cards and wires real search context", () => {
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
  const lastElement = detail.childNodes.filter((node) => node.tagName).at(-1);
  assert.equal(attr(lastElement, "class"), "resource-book-entry");
  assert.equal(contents(lastElement).trim(), "Buy materials");
  assert.ok(markup.indexOf("resource-lane-grid") < markup.indexOf("resource-material-search"));
  assert.ok(markup.indexOf("resource-material-search") < markup.indexOf("resource-book-entry"));
});

// A small hook fixture exercises actual callbacks without a browser or DOM renderer.
const hookFixture = `
  let slots = [], cursor = 0;
  export function useState(initial) {
    const index = cursor++;
    slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
    return [slots[index].value, next => { slots[index].value = typeof next === "function" ? next(slots[index].value) : next; }];
  }
  export const useRef = initial => useState(() => ({ current: initial }))[0];
  export const useId = () => useState("material-search-fixture")[0];
  export const useEffect = () => {};
  export const render = callback => { cursor = 0; return callback(); };
  export const reset = () => { slots = []; cursor = 0; };
`;
const elements = (tree, predicate) => !tree || typeof tree !== "object" ? [] : [
  ...(predicate(tree) ? [tree] : []),
  ...[tree.props?.children].flat(Infinity).flatMap((child) => elements(child, predicate)),
];

test("search callbacks require a term, follow selections and toggle institution queries", async () => {
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
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const opened = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: { open: (...args) => opened.push(args) } });
  try {
    const { MaterialSearchPanel: Panel } = await fixtureVite.ssrLoadModule("/src/components/SubjectMaterialSearch.jsx");
    const hooks = await fixtureVite.ssrLoadModule(fixtureId);
    const props = { kind: "topic", options: [], subjectName: "Linear algebra", institutionName: "Sathyabama", isOpen: true, id: "topic" };
    const draw = () => hooks.render(() => Panel(props));
    const submit = () => { let prevented = false; draw().props.onSubmit({ preventDefault() { prevented = true; } }); assert.ok(prevented); };
    const input = (type) => elements(draw(), (node) => node.type === "input" && node.props.type === type)[0];
    submit();
    assert.equal(opened.length, 0);
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
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete globalThis.window;
    await fixtureVite.close();
  }
});
