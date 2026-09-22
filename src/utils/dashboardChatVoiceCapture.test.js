import test from "node:test";
import assert from "node:assert/strict";
import { createDashboardChatVoiceCapture } from "./dashboardChatVoiceCapture.js";

function createClock() {
  let now = 0;
  let nextId = 1;
  const jobs = new Map();
  return {
    setTimeoutFn(callback, delay) {
      const id = nextId++;
      jobs.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimeoutFn(id) {
      jobs.delete(id);
    },
    advance(duration) {
      const deadline = now + duration;
      while (true) {
        const ready = [...jobs.entries()]
          .filter(([, job]) => job.at <= deadline)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!ready) break;
        now = ready[1].at;
        jobs.delete(ready[0]);
        ready[1].callback();
      }
      now = deadline;
    },
    pending: () => jobs.size,
  };
}

function createRecognitionClass() {
  const instances = [];
  class Recognition {
    constructor() {
      instances.push(this);
      this.started = false;
      this.aborted = false;
    }
    start() {
      this.started = true;
      this.onstart?.();
    }
    abort() {
      this.aborted = true;
    }
    result(...parts) {
      this.onresult?.({ results: parts.map((part) => [{ transcript: part }]) });
    }
  }
  return { Recognition, instances };
}

function setup(callbacks = {}) {
  const clock = createClock();
  const { Recognition, instances } = createRecognitionClass();
  const events = { started: 0, transcripts: [], submissions: [], errors: [], stops: [] };
  const capture = createDashboardChatVoiceCapture({
    recognitionConstructor: Recognition,
    ...clock,
    onStart: () => { events.started += 1; },
    onTranscript: (text) => events.transcripts.push(text),
    onSubmit: (text) => events.submissions.push(text),
    onError: (...args) => events.errors.push(args),
    onStop: (details) => events.stops.push(details),
    ...callbacks,
  });
  return { clock, capture, events, instances };
}

test("submits the final transcript once after four seconds without speech", () => {
  const { capture, clock, events, instances } = setup();
  assert.equal(capture.start(), true);
  const recognition = instances[0];
  assert.equal(recognition.continuous, true);
  assert.equal(recognition.interimResults, true);
  assert.equal(recognition.lang, "en-IN");
  recognition.onspeechstart();
  clock.advance(6000);
  assert.equal(events.submissions.length, 0, "ongoing speech does not time out");
  recognition.result("what is");
  recognition.result("what is RestAPI");
  assert.deepEqual(events.transcripts, ["what is", "what is RestAPI"]);
  recognition.onspeechend();
  clock.advance(3999);
  assert.deepEqual(events.submissions, []);
  clock.advance(1);
  assert.deepEqual(events.submissions, ["what is RestAPI"]);
  assert.deepEqual(events.stops, [{ reason: "silence", transcript: "what is RestAPI", submitted: true }]);
  assert.equal(capture.isActive(), false);
  assert.equal(recognition.aborted, true);
  assert.equal(clock.pending(), 0);
});

test("keeps text and silence deadline when browser recognition ends early", () => {
  const { capture, clock, events, instances } = setup();
  capture.start();
  instances[0].result("explain queues");
  clock.advance(1000);
  instances[0].onend();
  clock.advance(150);
  assert.equal(instances.length, 2, "recognition restarts while waiting for silence");
  assert.equal(capture.getTranscript(), "explain queues");
  clock.advance(2850);
  assert.deepEqual(events.submissions, ["explain queues"]);
  assert.equal(clock.pending(), 0);
});

test("new speech resets the silence countdown and joins restarted recognition text", () => {
  const { capture, clock, events, instances } = setup();
  capture.start();
  instances[0].result("explain");
  clock.advance(3500);
  instances[0].result("explain queues");
  clock.advance(1000);
  instances[0].onend();
  clock.advance(150);
  instances[1].result("with an example");
  clock.advance(3999);
  assert.deepEqual(events.submissions, []);
  clock.advance(1);
  assert.deepEqual(events.submissions, ["explain queues with an example"]);
});

test("manual finish submits text, while empty finish and cancel discard", () => {
  const first = setup();
  first.capture.start();
  first.instances[0].result(" summarize this ");
  first.capture.finish();
  first.capture.finish();
  assert.deepEqual(first.events.submissions, ["summarize this"]);
  assert.deepEqual(first.events.stops, [{ reason: "manual", transcript: "summarize this", submitted: true }]);

  const empty = setup();
  empty.capture.start();
  empty.capture.finish();
  assert.deepEqual(empty.events.submissions, []);
  assert.deepEqual(empty.events.stops, [{ reason: "cancel", transcript: "", submitted: false }]);

  const cancelled = setup();
  cancelled.capture.start();
  cancelled.instances[0].result("do not send");
  cancelled.capture.cancel();
  cancelled.clock.advance(5000);
  assert.deepEqual(cancelled.events.submissions, []);
  assert.deepEqual(cancelled.events.stops, [{ reason: "cancel", transcript: "do not send", submitted: false }]);
});

test("initial silence ends without submitting and cleans up a restarted recognizer", () => {
  const { capture, clock, events, instances } = setup();
  capture.start();
  instances[0].onend();
  clock.advance(150);
  assert.equal(instances.length, 2);
  clock.advance(3850);
  assert.deepEqual(events.submissions, []);
  assert.deepEqual(events.stops, [{ reason: "silence", transcript: "", submitted: false }]);
  assert.equal(instances[1].aborted, true);
});

test("unsupported browser and permission errors report a stop without submission", () => {
  const errors = [];
  const stops = [];
  const unsupported = createDashboardChatVoiceCapture({
    recognitionConstructor: null,
    onError: (...args) => errors.push(args),
    onStop: (details) => stops.push(details),
  });
  const previousSpeechRecognition = globalThis.SpeechRecognition;
  const previousWebkitSpeechRecognition = globalThis.webkitSpeechRecognition;
  delete globalThis.SpeechRecognition;
  delete globalThis.webkitSpeechRecognition;
  try {
    assert.equal(unsupported.start(), false);
  } finally {
    globalThis.SpeechRecognition = previousSpeechRecognition;
    globalThis.webkitSpeechRecognition = previousWebkitSpeechRecognition;
  }
  assert.equal(errors[0][1], "unsupported");
  assert.deepEqual(stops, [{ reason: "unsupported", transcript: "", submitted: false }]);

  const denied = setup();
  denied.capture.start();
  denied.instances[0].onerror({ error: "not-allowed" });
  assert.equal(denied.events.errors[0][1], "not-allowed");
  assert.deepEqual(denied.events.stops, [{ reason: "error", transcript: "", submitted: false }]);
  assert.equal(denied.clock.pending(), 0);
});
