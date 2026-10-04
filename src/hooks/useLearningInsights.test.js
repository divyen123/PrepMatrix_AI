import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import { notifyLearningNotebookSaved } from "../utils/learningNotebookEvents.js";

const HOOKS = `
  let slots = [], cursor = 0, dirty = false, effects = [];
  const changed = (previous, next) => !previous || previous.length !== next.length || next.some((value, index) => !Object.is(value, previous[index]));
  export function useState(initial) {
    const index = cursor++;
    slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
    return [slots[index].value, (next) => {
      if (!slots[index]) return;
      const value = typeof next === 'function' ? next(slots[index].value) : next;
      if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
    }];
  }
  export function useMemo(create, dependencies) {
    const index = cursor++;
    if (!slots[index] || changed(slots[index].dependencies, dependencies)) slots[index] = { value: create(), dependencies };
    return slots[index].value;
  }
  export const useCallback = (callback, dependencies) => useMemo(() => callback, dependencies);
  export function useEffect(callback, dependencies) {
    const index = cursor++;
    if (slots[index] && !changed(slots[index].dependencies, dependencies)) return;
    const previous = slots[index];
    slots[index] = { dependencies, cleanup: previous?.cleanup };
    effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = callback(); });
  }
  export function render(callback) {
    let result, renders = 0;
    do {
      dirty = false; cursor = 0;
      result = callback();
      const queue = effects; effects = []; queue.forEach((run) => run());
      if (++renders > 10) throw Error('Unexpected render loop');
    } while (dirty);
    return result;
  }
  export function unmount() { slots.forEach((slot) => slot?.cleanup?.()); slots = []; effects = []; }
`;
const API = `
  let handler = async () => ({ notebooks: [] });
  export const requests = [];
  export const setHandler = (value) => { handler = value; };
  export default { async get(url, options) { requests.push({ url, options }); return handler(url, options); } };
`;
const settle = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((success) => { resolve = success; });
  return { promise, resolve };
};
const savedNotebook = (completed = false, id = "notebook-data") => ({
  id,
  subjectName: "Data analytics",
  chapters: [{
    id: "intro",
    title: "Introduction",
    topics: [{ id: "visualization", title: "Data Visualization Basics" }],
  }],
  revisedNotes: [{
    id: "visualization-note",
    title: "Data Visualization Basics",
    completed,
  }],
});

async function fixture() {
  const originalWindow = globalThis.window;
  globalThis.window = new EventTarget();
  const modules = { "virtual:learning-insights-hooks": HOOKS, "virtual:learning-insights-api": API };
  const vite = await createServer({
    configFile: false, appType: "custom", logLevel: "silent", server: { middlewareMode: true },
    plugins: [{
      name: "learning-insights-hook-fixtures", enforce: "pre",
      resolveId(id) { return Object.hasOwn(modules, id) ? `\0${id}` : null; },
      load(id) { return modules[id.slice(1)] ?? null; },
      transform(source, id) {
        if (!id.replaceAll("\\", "/").endsWith("/src/hooks/useLearningInsights.js")) return null;
        return source.replace('from "react"', 'from "virtual:learning-insights-hooks"')
          .replace('from "../utils/apiClient"', 'from "virtual:learning-insights-api"');
      },
    }],
  });
  try {
    const [{ default: useLearningInsights }, hooks, api] = await Promise.all([
      vite.ssrLoadModule("/src/hooks/useLearningInsights.js"),
      vite.ssrLoadModule("virtual:learning-insights-hooks"),
      vite.ssrLoadModule("virtual:learning-insights-api"),
    ]);
    return {
      ...api,
      render(academicProfileDataId = "profile-a") {
        return hooks.render(() => useLearningInsights({ academicProfileDataId }));
      },
      unmount: hooks.unmount,
      async close() {
        hooks.unmount();
        globalThis.window = originalWindow;
        await vite.close();
      },
    };
  } catch (error) {
    globalThis.window = originalWindow;
    await vite.close();
    throw error;
  }
}

test("analytics refreshes when a debounced notebook save finishes after navigation", async () => {
  const context = await fixture();
  try {
    let serverNotebook = savedNotebook(false);
    context.setHandler(() => ({ notebooks: [serverNotebook] }));
    context.render();
    await settle();
    assert.equal(context.render().insights.learnedTopicCount, 0);
    assert.equal(context.requests.length, 1);

    // The learning page has already unmounted; the server now confirms its delayed save.
    serverNotebook = savedNotebook(true);
    notifyLearningNotebookSaved({ academicProfileId: "profile-a", notebookId: serverNotebook.id });
    context.render();
    await settle();
    const updated = context.render();
    assert.equal(updated.insights.learnedTopicCount, 1);
    assert.equal(updated.insights.topicCount, 1);
    assert.equal(updated.loading, false);
    assert.equal(context.requests.length, 2);

    await settle();
    context.render();
    assert.equal(context.requests.length, 2, "reading fresh progress does not create another save event");
  } finally { await context.close(); }
});

test("an older analytics read cannot overwrite the refresh triggered by a confirmed save", async () => {
  const context = await fixture();
  try {
    const beforeSave = deferred();
    const afterSave = deferred();
    let calls = 0;
    context.setHandler(() => (++calls === 1 ? beforeSave : afterSave).promise);
    context.render();
    notifyLearningNotebookSaved({ academicProfileId: "profile-a", notebookId: "notebook-data" });
    context.render();

    afterSave.resolve({ notebooks: [savedNotebook(true)] });
    await settle();
    assert.equal(context.render().insights.learnedTopicCount, 1);
    beforeSave.resolve({ notebooks: [savedNotebook(false)] });
    await settle();
    assert.equal(context.render().insights.learnedTopicCount, 1);
    assert.equal(context.requests.length, 2);
  } finally { await context.close(); }
});

test("notebook-save refreshes stay in the active profile and unsubscribe on unmount", async () => {
  const context = await fixture();
  try {
    context.setHandler((url, options) => ({ notebooks: [savedNotebook(true, options.academicProfileId)] }));
    context.render("profile-a");
    await settle();
    context.render("profile-a");
    notifyLearningNotebookSaved({ academicProfileId: "profile-b", notebookId: "foreign-notebook" });
    context.render("profile-a");
    assert.equal(context.requests.length, 1);

    context.render("profile-b");
    await settle();
    assert.equal(context.render("profile-b").notebooks[0].id, "profile-b");
    notifyLearningNotebookSaved({ academicProfileId: "profile-a", notebookId: "previous-profile-notebook" });
    context.render("profile-b");
    assert.equal(context.requests.length, 2);
    notifyLearningNotebookSaved({ academicProfileId: "profile-b", notebookId: "profile-b" });
    context.render("profile-b");
    await settle();
    context.render("profile-b");
    assert.equal(context.requests.length, 3);
    assert.ok(context.requests.slice(1).every((request) => request.options.academicProfileId === "profile-b"));

    context.unmount();
    notifyLearningNotebookSaved({ academicProfileId: "profile-b", notebookId: "profile-b" });
    await settle();
    assert.equal(context.requests.length, 3);
  } finally { await context.close(); }
});
