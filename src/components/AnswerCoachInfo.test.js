import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let vite, AnswerCoachInfo, createHarness;
const fixtureId = "virtual:answer-coach-info-hooks";
const hooks = `
  let active;
  export function useState(initial) {
    const owner = active, index = owner.cursor++;
    owner.slots[index] ??= { value: initial };
    return [owner.slots[index].value, next => {
      owner.slots[index].value = typeof next === 'function' ? next(owner.slots[index].value) : next;
    }];
  }
  export const useRef = initial => useState({ current: initial })[0];
  export const useId = () => useState('answer-coach-info-fixture')[0];
  export function useEffect(callback, deps) {
    const index = active.cursor++, previous = active.slots[index];
    if (previous && deps.every((value, item) => Object.is(value, previous.deps[item]))) return;
    active.slots[index] = { deps, callback, cleanup: previous?.cleanup };
    active.pending.add(index);
  }
  export function createHarness() {
    const owner = { cursor: 0, slots: [], pending: new Set() };
    return {
      render(callback) { owner.cursor = 0; active = owner; try { return callback(); } finally { active = undefined; } },
      flush() {
        for (const index of owner.pending) {
          const slot = owner.slots[index]; slot.cleanup?.(); slot.cleanup = slot.callback();
        }
        owner.pending.clear();
      },
      unmount() { for (const slot of owner.slots) { slot.cleanup?.(); slot.cleanup = undefined; } owner.pending.clear(); },
    };
  }
`;

before(async () => {
  vite = await createServer({
    appType: "custom", logLevel: "silent", server: { middlewareMode: true },
    plugins: [{
      name: "answer-coach-info-fixture", enforce: "pre",
      resolveId(id) { return id === fixtureId ? `\0${id}` : null; },
      load(id) { return id === `\0${fixtureId}` ? hooks : null; },
      transform(source, id) {
        return id.replaceAll("\\", "/").endsWith("/src/components/AnswerCoachInfo.jsx")
          ? source.replace('from "react"', `from "${fixtureId}"`) : null;
      },
    }],
  });
  ({ default: AnswerCoachInfo } = await vite.ssrLoadModule("/src/components/AnswerCoachInfo.jsx"));
  ({ createHarness } = await vite.ssrLoadModule(fixtureId));
});
after(async () => { await vite?.close(); });

function fixture() {
  const originals = Object.fromEntries(["window", "document"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const listeners = new Map(), timers = new Map(), inside = {};
  let nextId = 0;
  const harness = createHarness();
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    setTimeout(callback, delay) { timers.set(++nextId, { callback, delay }); return nextId; },
    clearTimeout(id) { timers.delete(id); },
  } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(callback); },
    removeEventListener(name, callback) { listeners.get(name)?.delete(callback); },
  } });
  return {
    timers, listeners, inside,
    draw() {
      const tree = harness.render(AnswerCoachInfo);
      tree.props.ref.current = { contains: target => target === inside };
      harness.flush();
      const [trigger, popup] = tree.props.children;
      return { tree, trigger, popup };
    },
    dispatch(name, event) { for (const callback of listeners.get(name) || []) callback(event); },
    flushTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach(({ callback }) => callback()); },
    unmount: harness.unmount,
    close() {
      harness.unmount();
      for (const [name, descriptor] of Object.entries(originals)) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    },
  };
}

test("hover opens the guidance and permits moving onto the popup before dismissing", () => {
  const context = fixture();
  try {
    assert.equal(context.draw().trigger.props["aria-expanded"], false);
    context.draw().tree.props.onPointerEnter({ pointerType: "mouse" });
    let view = context.draw();
    assert.equal(view.popup.props["aria-hidden"], false);
    assert.equal(view.trigger.props["aria-describedby"], view.popup.props.id);
    view.tree.props.onPointerLeave();
    assert.equal([...context.timers.values()][0].delay, 120);
    context.draw().tree.props.onPointerEnter({ pointerType: "mouse" });
    assert.equal(context.timers.size, 0);
    context.draw().tree.props.onPointerLeave();
    context.flushTimers();
    view = context.draw();
    assert.equal(view.trigger.props["aria-expanded"], false);
    assert.equal(view.popup.props["aria-hidden"], true);
  } finally { context.close(); }
});

test("click pins the popup and a second click or outside interaction dismisses it", () => {
  const context = fixture();
  try {
    context.draw().trigger.props.onClick();
    context.draw().tree.props.onPointerLeave();
    assert.equal(context.timers.size, 0);
    context.dispatch("pointerdown", { target: context.inside });
    assert.equal(context.draw().trigger.props["aria-expanded"], true);
    context.draw().trigger.props.onClick();
    assert.equal(context.draw().trigger.props["aria-expanded"], false);
    context.draw().trigger.props.onClick();
    context.draw();
    context.dispatch("pointerdown", { target: {} });
    assert.equal(context.draw().trigger.props["aria-expanded"], false);
    context.draw().trigger.props.onClick();
    context.draw();
    context.dispatch("focusin", { target: {} });
    assert.equal(context.draw().trigger.props["aria-expanded"], false);
  } finally { context.close(); }
});

test("keyboard focus shows help, Escape closes it, and unmount cleans pending timers", () => {
  const context = fixture();
  try {
    context.draw().trigger.props.onFocus();
    assert.equal(context.draw().trigger.props["aria-expanded"], true);
    let prevented = false;
    context.dispatch("keydown", { key: "Escape", preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(context.draw().trigger.props["aria-expanded"], false);
    assert.ok([...context.listeners.values()].every(set => set.size === 0));
    context.draw().trigger.props.onFocus();
    context.draw().trigger.props.onBlur({ relatedTarget: {} });
    assert.equal(context.draw().trigger.props["aria-expanded"], false);
    context.draw().tree.props.onPointerEnter({ pointerType: "mouse" });
    context.draw().tree.props.onPointerLeave();
    context.unmount();
    assert.equal(context.timers.size, 0);
    assert.ok([...context.listeners.values()].every(set => set.size === 0));
  } finally { context.close(); }
});

test("touch uses click and the title help retains the removed intro content", () => {
  const context = fixture();
  try {
    context.draw().tree.props.onPointerEnter({ pointerType: "touch" });
    assert.equal(context.draw().trigger.props["aria-expanded"], false);
    context.draw().trigger.props.onClick();
    const markup = renderToStaticMarkup(context.draw().tree);
    assert.match(markup, /aria-label="About Answer coach"/u);
    assert.match(markup, /role="tooltip"/u);
    assert.match(markup, /Review written answers/u);
    assert.match(markup, /Choose one of your generated papers, upload clearly numbered answers, and get provisional step feedback\. Only readable answers are scored\./u);
    const page = readFileSync(new URL("../pages/ExamPage.jsx", import.meta.url), "utf8");
    const panel = readFileSync(new URL("./AnswerCoachPanel.jsx", import.meta.url), "utf8");
    assert.match(page, /section === "coach" && <AnswerCoachInfo \/>/u);
    assert.doesNotMatch(panel, /answer-coach-intro/u);
  } finally { context.close(); }
});
