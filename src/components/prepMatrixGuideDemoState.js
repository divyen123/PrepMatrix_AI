const LAST_PHASE = 3;

function futureDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function createGuideDemoState(stepId, examples = {}) {
  return {
    stepId,
    playing: false,
    phase: 0,
    contextTarget: "",
    subjectName: "",
    chapters: "3",
    difficulty: "Medium",
    subjectAdded: false,
    examDate: "",
    strategy: "balanced",
    generated: false,
    sourceAdded: false,
    outlineReady: false,
    scheduled: false,
    learned: false,
    completed: [false, false, false],
    recovered: false,
    revisionTab: "notes",
    note: `Revisit ${examples.topic || "this topic"} before the next quiz.`,
    noteSaved: false,
    answer: "",
    resourceType: "Video",
    bookmarked: false,
    selectedLane: -1,
    feedback: "Try the controls, or watch a short demo.",
  };
}

function advanceScene(state, examples) {
  const phase = state.phase + 1;
  let changes = {};
  switch (state.stepId) {
    case "profile": {
      const contextTarget = ["Subjects", "Materials", "AI"][phase - 1];
      changes = { contextTarget, feedback: `Your learning profile gives ${contextTarget} relevant study context.` };
      break;
    }
    case "subjects":
      changes = phase === 1
        ? { subjectName: examples.subject || "Your subject", feedback: "Start with a subject from your syllabus." }
        : phase === 2
          ? { difficulty: "Hard", feedback: "Chapter count and difficulty help balance your plan." }
          : { subjectAdded: true, feedback: "Subject added to this preview library." };
      break;
    case "plan":
      changes = phase === 1
        ? { examDate: futureDate(), feedback: "Choose the date you are working toward." }
        : phase === 2
          ? { strategy: "priority", feedback: "High priority first starts with the harder work." }
          : { generated: true, feedback: "Your subjects become daily tasks. Here are three sample days." };
      break;
    case "learn":
      changes = phase === 1
        ? { sourceAdded: true, outlineReady: true, feedback: "A source or chapter list becomes a notebook with connected topics." }
        : phase === 2
          ? { scheduled: true, feedback: "Add the topic to your planner before recording its completion." }
          : { learned: true, feedback: "Mark the scheduled topic as completed when you have learned it." };
      break;
    case "follow":
      changes = phase === 1
        ? { completed: [false, true, false], feedback: "Tick a task after you finish it." }
        : phase === 2
          ? { completed: [false, true, true], feedback: "Your completion progress updates as you study." }
          : { recovered: true, feedback: "Recovery moves unfinished work to a later study day." };
      break;
    case "revise":
      changes = phase === 1
        ? { noteSaved: true, feedback: "Keep the difficult part in a short note." }
        : phase === 2
          ? { revisionTab: "quiz", answer: "revisit", feedback: "Use missed quiz topics to choose what to revise." }
          : { revisionTab: "materials", bookmarked: true, feedback: "Bookmark a useful resource for your next revision." };
      break;
    case "review":
      changes = {
        selectedLane: phase === 1 ? 0 : phase === 2 ? 1 : 2,
        feedback: phase === 3
          ? "The lowest progress lane is a useful place to plan your next session."
          : "Select a progress lane to see the next useful action.",
      };
      break;
    default:
      break;
  }
  return { ...state, ...changes, phase, playing: phase < LAST_PHASE };
}

export function guideDemoReducer(state, action) {
  switch (action.type) {
    case "watch":
      return state.phase > 0 && state.phase < LAST_PHASE
        ? { ...state, playing: true }
        : { ...createGuideDemoState(state.stepId, action.examples), playing: true };
    case "pause":
      return { ...state, playing: false };
    case "replay":
      return { ...createGuideDemoState(state.stepId, action.examples), playing: true };
    case "advance":
      return !state.playing || state.phase >= LAST_PHASE
        ? state
        : advanceScene(state, action.examples || {});
    case "interact":
      return { ...state, ...action.changes, phase: 0, playing: false };
    default:
      return state;
  }
}
