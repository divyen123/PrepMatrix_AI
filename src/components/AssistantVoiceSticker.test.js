import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { createServer } from "vite";

let vite, AssistantVoiceSticker, createHarness;
const fixtureId = "virtual:assistant-voice-sticker-hooks";
const hooks = `
  let active;
  const sameDeps = (left, right) => left && right && left.length === right.length
    && right.every((value, index) => Object.is(value, left[index]));
  export function useState(initial) {
    const owner = active, index = owner.cursor++;
    if (!owner.slots[index]) owner.slots[index] = {
      value: typeof initial === 'function' ? initial() : initial,
    };
    return [owner.slots[index].value, next => {
      owner.slots[index].value = typeof next === 'function'
        ? next(owner.slots[index].value) : next;
    }];
  }
  export const useRef = initial => useState({ current: initial })[0];
  export const useId = () => useState('assistant-voice-sticker-fixture')[0];
  export function useMemo(callback, deps) {
    const index = active.cursor++, previous = active.slots[index];
    if (!previous || !sameDeps(previous.deps, deps)) {
      active.slots[index] = { deps, value: callback() };
    }
    return active.slots[index].value;
  }
  export const useCallback = (callback, deps) => useMemo(() => callback, deps);
  export function useEffect(callback, deps) {
    const index = active.cursor++, previous = active.slots[index];
    if (previous && sameDeps(previous.deps, deps)) return;
    active.slots[index] = { deps, callback, cleanup: previous?.cleanup };
    active.pending.add(index);
  }
  export function createHarness() {
    const owner = { cursor: 0, slots: [], pending: new Set() };
    return {
      render(callback) {
        owner.cursor = 0; active = owner;
        try { return callback(); } finally { active = undefined; }
      },
      flush() {
        for (const index of owner.pending) {
          const slot = owner.slots[index];
          slot.cleanup?.(); slot.cleanup = slot.callback();
        }
        owner.pending.clear();
      },
      unmount() {
        for (const slot of owner.slots) {
          slot.cleanup?.(); slot.cleanup = undefined;
        }
        owner.pending.clear();
      },
    };
  }
`;

before(async () => {
  vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
    plugins: [{
      name: "assistant-voice-sticker-fixture",
      enforce: "pre",
      resolveId(id) { return id === fixtureId ? `\0${id}` : null; },
      load(id) { return id === `\0${fixtureId}` ? hooks : null; },
      transform(source, id) {
        return id.replaceAll("\\", "/").endsWith("/src/components/AssistantVoiceSticker.jsx")
          ? source.replace('from "react"', `from "${fixtureId}"`) : null;
      },
    }],
  });
  ({ default: AssistantVoiceSticker } = await vite.ssrLoadModule("/src/components/AssistantVoiceSticker.jsx"));
  ({ createHarness } = await vite.ssrLoadModule(fixtureId));
});

after(async () => { await vite?.close(); });

function findElement(tree, predicate) {
  if (!tree || typeof tree !== "object") return undefined;
  if (predicate(tree)) return tree;
  const children = tree.props?.children;
  for (const child of Array.isArray(children) ? children.flat(Infinity) : [children]) {
    const match = findElement(child, predicate);
    if (match) return match;
  }
  return undefined;
}

function byClass(name) {
  return node => node.props?.className?.split(/\s+/u).includes(name);
}

function fixture(initialVoiceStyle = "female") {
  const originals = Object.fromEntries(["window", "setTimeout", "clearTimeout"]
    .map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const harness = createHarness();
  const timers = new Map();
  let now = 0, nextId = 0, voiceStyle = initialVoiceStyle;
  const fakeTimers = {
    setTimeout(callback, delay) {
      timers.set(++nextId, { callback, delay, due: now + delay });
      return nextId;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: fakeTimers },
    setTimeout: { configurable: true, value: fakeTimers.setTimeout },
    clearTimeout: { configurable: true, value: fakeTimers.clearTimeout },
  });
  return {
    timers,
    draw(nextVoiceStyle = voiceStyle) {
      voiceStyle = nextVoiceStyle;
      let tree = harness.render(() => AssistantVoiceSticker({ voiceStyle }));
      harness.flush();
      tree = harness.render(() => AssistantVoiceSticker({ voiceStyle }));
      harness.flush();
      const trigger = findElement(tree, byClass("assistant-voice-sticker"));
      const greeting = findElement(tree, byClass("assistant-voice-greeting"));
      const image = findElement(trigger, node => node.type === "img");
      assert.ok(trigger, "the selected sticker is an interactive button");
      assert.ok(greeting, "the greeting has its own accessible status element");
      return { tree, trigger, greeting, image };
    },
    advance(milliseconds) {
      const end = now + milliseconds;
      for (;;) {
        const nextTimer = [...timers.entries()]
          .filter(([, timer]) => timer.due <= end)
          .sort(([, left], [, right]) => left.due - right.due)[0];
        if (!nextTimer) break;
        const [id, timer] = nextTimer;
        timers.delete(id);
        now = timer.due;
        timer.callback();
      }
      now = end;
    },
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

test("the saved voice selects its uploaded sticker without greeting on initial mount", () => {
  for (const voiceStyle of ["female", "male"]) {
    const context = fixture(voiceStyle);
    try {
      const view = context.draw();
      assert.equal(view.trigger.type, "button");
      assert.equal(view.trigger.props.type, "button");
      assert.ok(view.trigger.props["aria-label"]);
      assert.match(view.image.props.src, new RegExp(`voice-${voiceStyle}\\.png`, "u"));
      assert.equal(view.greeting.props.hidden, true);
      assert.equal(view.greeting.props.role, "status");
      assert.equal(view.greeting.props["aria-live"], "polite");
      assert.equal(view.trigger.props["aria-describedby"], undefined);
      assert.equal(context.timers.size, 0);
    } finally { context.close(); }
  }
});

test("changing voice shows its greeting for exactly four seconds", () => {
  const context = fixture();
  try {
    const initialGreeting = context.draw().greeting.props.children;
    let view = context.draw("male");
    assert.match(view.image.props.src, /voice-male\.png/u);
    assert.equal(view.greeting.props.hidden, false);
    assert.notEqual(view.greeting.props.children, initialGreeting);
    assert.equal(view.trigger.props["aria-describedby"], view.greeting.props.id);
    assert.equal(context.timers.size, 1);
    assert.equal([...context.timers.values()][0].delay, 4000);
    context.advance(3999);
    assert.equal(context.draw().greeting.props.hidden, false);
    context.advance(1);
    view = context.draw();
    assert.equal(view.greeting.props.hidden, true);
    assert.equal(view.trigger.props["aria-describedby"], undefined);
    assert.equal(context.timers.size, 0);
  } finally { context.close(); }
});

test("rapid voice changes restart the timer and repeat renders do not extend it", () => {
  const context = fixture();
  try {
    context.draw();
    context.draw("male");
    context.advance(2500);
    let view = context.draw("female");
    assert.match(view.image.props.src, /voice-female\.png/u);
    assert.equal(view.greeting.props.hidden, false);
    assert.equal(context.timers.size, 1, "the previous dismissal timer is cancelled");
    context.advance(1500);
    assert.equal(context.draw().greeting.props.hidden, false, "the old deadline cannot hide the new greeting");
    context.advance(2499);
    assert.equal(context.draw().greeting.props.hidden, false);
    context.advance(1);
    view = context.draw();
    assert.equal(view.greeting.props.hidden, true);
    assert.equal(context.timers.size, 0);
  } finally { context.close(); }
});

test("hover and keyboard focus can show the greeting again and remain independent", () => {
  const context = fixture();
  try {
    context.draw();
    context.draw("male");
    context.advance(4000);
    assert.equal(context.draw().greeting.props.hidden, true);
    context.draw().trigger.props.onMouseEnter();
    assert.equal(context.draw().greeting.props.hidden, false);
    context.draw().trigger.props.onFocus();
    context.draw().trigger.props.onMouseLeave();
    assert.equal(context.draw().greeting.props.hidden, false, "focus keeps the greeting visible after the mouse leaves");
    context.draw().trigger.props.onBlur();
    assert.equal(context.draw().greeting.props.hidden, true);
    context.draw().trigger.props.onMouseEnter();
    context.draw().trigger.props.onFocus();
    context.draw().trigger.props.onBlur();
    assert.equal(context.draw().greeting.props.hidden, false, "hover keeps the greeting visible after keyboard focus leaves");
    context.draw().trigger.props.onMouseLeave();
    assert.equal(context.draw().greeting.props.hidden, true);
  } finally { context.close(); }
});

test("timer expiry preserves a greeting while the sticker is hovered or focused", () => {
  for (const [enter, leave] of [["onMouseEnter", "onMouseLeave"], ["onFocus", "onBlur"]]) {
    const context = fixture();
    try {
      context.draw();
      context.draw("male").trigger.props[enter]();
      context.advance(4000);
      assert.equal(context.draw().greeting.props.hidden, false);
      context.draw().trigger.props[leave]();
      assert.equal(context.draw().greeting.props.hidden, true);
    } finally { context.close(); }
  }
});

test("click supports a timed greeting and repeated clicks restart its four seconds", () => {
  const context = fixture();
  try {
    context.draw().trigger.props.onClick();
    assert.equal(context.draw().greeting.props.hidden, false);
    context.advance(3000);
    context.draw().trigger.props.onClick();
    assert.equal(context.timers.size, 1);
    context.advance(1000);
    assert.equal(context.draw().greeting.props.hidden, false);
    context.advance(2999);
    assert.equal(context.draw().greeting.props.hidden, false);
    context.advance(1);
    assert.equal(context.draw().greeting.props.hidden, true);
  } finally { context.close(); }
});

test("unmount clears pending greeting timers", () => {
  const context = fixture();
  try {
    context.draw();
    context.draw("male");
    assert.equal(context.timers.size, 1);
    context.unmount();
    assert.equal(context.timers.size, 0);
  } finally { context.close(); }
});
