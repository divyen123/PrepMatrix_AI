import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import ArrowLeft01Icon from "@hugeicons/core-free-icons/ArrowLeft01Icon";
import Mic01Icon from "@hugeicons/core-free-icons/Mic01Icon";
import "./VoicePill.css";

const LOOP = 4.8;
const SYLLABLES = [
  [0.1, 0.16, 0.9], [0.3, 0.12, 0.7], [0.5, 0.2, 1],
  [0.95, 0.14, 0.8], [1.15, 0.1, 0.6], [1.3, 0.22, 0.95],
  [1.9, 0.16, 0.85], [2.12, 0.12, 0.7], [2.3, 0.18, 0.9],
  [2.55, 0.1, 0.5], [3.05, 0.24, 1], [3.4, 0.12, 0.75],
  [3.6, 0.16, 0.9],
];
const MIC_BINS = [[1, 4], [4, 11], [11, 33]];
const MIC_GAIN = 2.2;
const DT_MAX = 0.05;
const SLIDE_MIN = 4;
const WAVE_EVERY = 4;
const WAVE_MAX = 80;
const monotonicNow = () => performance.now();

function simulatedLevel(time) {
  const position = time % LOOP;
  let amplitude = 0.06;
  for (const [start, duration, peak] of SYLLABLES) {
    const progress = (position - start) / duration;
    if (progress >= 0 && progress <= 1) {
      amplitude = Math.max(amplitude, peak * 0.5 * (1 - Math.cos(2 * Math.PI * progress)));
    }
  }
  return amplitude * (0.7 + 0.3 * Math.abs(Math.sin(2 * Math.PI * 7.1 * position)));
}

function micLevel(analyser, buffer) {
  analyser.getByteFrequencyData(buffer);
  let total = 0;
  for (const [lower, upper] of MIC_BINS) {
    let sum = 0;
    for (let index = lower; index < upper; index += 1) sum += buffer[index];
    total += sum / ((upper - lower) * 255);
  }
  return (total / MIC_BINS.length) * MIC_GAIN;
}

function drawWave(state, canvas, level, floor) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  state.acc = Math.max(state.acc, level);
  state.tick = (state.tick + 1) % WAVE_EVERY;
  if (state.tick === 0) {
    state.hist.push(state.acc);
    state.acc = 0;
    if (state.hist.length > WAVE_MAX) state.hist.shift();
  }
  const barWidth = 2 * dpr;
  const step = 3 * dpr;
  const shift = (state.tick / WAVE_EVERY) * step;
  context.clearRect(0, 0, width, height);
  context.fillStyle = window.getComputedStyle(canvas).color;
  for (let index = 0; index < state.hist.length; index += 1) {
    const value = state.hist[state.hist.length - 1 - index];
    const x = width - (index + 1) * step - shift;
    if (x + barWidth < 0) break;
    const barHeight = Math.max(barWidth, (floor + (1 - floor) * value) * height);
    const fadePosition = Math.min(1, Math.max(0, (x + barWidth / 2) / (width * 0.55)));
    const fade = fadePosition * fadePosition * (3 - 2 * fadePosition);
    context.globalAlpha = (0.35 + 0.65 * value) * fade;
    context.beginPath();
    context.roundRect(x, (height - barHeight) / 2, barWidth, barHeight, barWidth / 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

function formatTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

async function openMic(state) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass || !navigator.mediaDevices?.getUserMedia) throw new Error("Microphone unavailable");
  state.audio ??= { ctx: new AudioContextClass() };
  const audio = state.audio;
  if (audio.ctx.state === "suspended") await audio.ctx.resume();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  if (!state.listening) {
    stream.getTracks().forEach((track) => track.stop());
    return;
  }
  audio.stream = stream;
  audio.src = audio.ctx.createMediaStreamSource(stream);
  audio.analyser = audio.ctx.createAnalyser();
  audio.analyser.fftSize = 256;
  audio.analyser.smoothingTimeConstant = 0;
  audio.src.connect(audio.analyser);
  audio.buf = new Uint8Array(audio.analyser.frequencyBinCount);
}

function closeMic(state) {
  const audio = state.audio;
  if (!audio?.stream) return;
  audio.stream.getTracks().forEach((track) => track.stop());
  audio.src?.disconnect();
  audio.stream = null;
  audio.src = null;
  audio.analyser = null;
  audio.buf = null;
}

const VoicePill = forwardRef(function VoicePill({
  accentColor = "#f5f5f5",
  iconColor = "#a1a1aa",
  background = "#27272a",
  size = 28,
  shape = "pill",
  reach = 8,
  showTime = true,
  waveform = true,
  slideToCancel = true,
  cancelDistance = 64,
  attack = 40,
  release = 240,
  sensitivity = 1,
  floor = 0.1,
  openDuration = 200,
  pressScale = 0.95,
  mode = "auto",
  holdAfter = 300,
  reactive = "simulated",
  disabled = false,
  ariaLabel = "Dictate",
  onStart,
  onStop,
  className = "",
}, ref) {
  const [listening, setListening] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [input, setInput] = useState("pointer");
  const timeRef = useRef(null);
  const rootRef = useRef(null);
  const waveRef = useRef(null);
  const stateRef = useRef({
    listening: false,
    pointerId: null,
    ownPress: false,
    downX: 0,
    sliding: false,
    hist: [],
    tick: 0,
    acc: 0,
    downAt: 0,
    startedAt: 0,
    raf: 0,
    last: 0,
    env: 0,
    t0: 0,
    audio: null,
  });
  const configRef = useRef({});
  useLayoutEffect(() => {
    configRef.current = {
      attack, release, sensitivity, floor, mode, holdAfter, reactive,
      showTime, waveform, slideToCancel, cancelDistance,
      onStart, onStop,
    };
  }, [
    attack, release, sensitivity, floor, mode, holdAfter, reactive,
    showTime, waveform, slideToCancel, cancelDistance, onStart, onStop,
  ]);

  const frame = (now) => {
    const state = stateRef.current;
    const config = configRef.current;
    const dt = Math.min((now - state.last) / 1000, DT_MAX);
    state.last = now;
    let target = 0;
    if (state.listening) {
      if (state.audio?.analyser) target = micLevel(state.audio.analyser, state.audio.buf);
      else if (config.reactive !== "mic") target = simulatedLevel((now - state.t0) / 1000);
    }
    target = Math.min(1, target * config.sensitivity);
    const timeConstant = Math.max(1, target > state.env ? config.attack : config.release) / 1000;
    state.env += (target - state.env) * (1 - Math.exp(-dt / timeConstant));
    if (state.listening && config.showTime && timeRef.current) {
      const time = formatTime(now - state.startedAt);
      if (timeRef.current.textContent !== time) timeRef.current.textContent = time;
    }
    if (state.listening && config.waveform && waveRef.current) {
      drawWave(state, waveRef.current, state.env, config.floor);
    }
    state.raf = state.listening ? requestAnimationFrame(frame) : 0;
  };

  const begin = (kind, notify = true) => {
    const state = stateRef.current;
    const config = configRef.current;
    if (state.listening || disabled) return;
    state.listening = true;
    state.hist = [];
    state.tick = 0;
    state.acc = 0;
    state.env = 0;
    state.startedAt = monotonicNow();
    state.t0 = state.startedAt;
    state.last = state.startedAt;
    if (timeRef.current) timeRef.current.textContent = "0:00";
    setListening(true);
    setInput(kind);
    if (!state.raf) state.raf = requestAnimationFrame(frame);
    if (notify) config.onStart?.({ source: config.reactive });
    if (notify && config.reactive === "mic") openMic(state).catch(() => end("mic-denied"));
  };

  const end = (reason, notify = true, updateState = true) => {
    const state = stateRef.current;
    const config = configRef.current;
    if (!state.listening) return;
    state.listening = false;
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
    closeMic(state);
    if (updateState) {
      setListening(false);
      setInput(reason === "key" || reason === "escape" ? "key" : "pointer");
    }
    if (notify) config.onStop?.({ reason, duration: Math.round(monotonicNow() - state.startedAt) });
  };

  // External recording systems can synchronize the visual state without replaying callbacks.
  useImperativeHandle(ref, () => ({
    start: () => begin("external", false),
    stop: () => end("external", false),
    isListening: () => stateRef.current.listening,
  }));

  const settleSlide = () => {
    const state = stateRef.current;
    const root = rootRef.current;
    state.sliding = false;
    if (!root) return;
    delete root.dataset.sliding;
    root.style.setProperty("--vp-slide", "0px");
    root.style.setProperty("--vp-cancel", "0");
  };

  const onPointerMove = (event) => {
    const state = stateRef.current;
    const config = configRef.current;
    const root = rootRef.current;
    if (!root || state.pointerId !== event.pointerId || !config.slideToCancel || !state.listening || !state.ownPress) return;
    const dx = event.clientX - state.downX;
    if (!state.sliding && dx > -SLIDE_MIN) return;
    state.sliding = true;
    root.dataset.sliding = "";
    const distance = Math.max(1, config.cancelDistance);
    const pull = Math.min(distance + 24, Math.max(0, -dx));
    root.style.setProperty("--vp-slide", `${-pull}px`);
    const progress = Math.min(1, pull / distance);
    root.style.setProperty("--vp-cancel", progress.toFixed(3));
    if (progress >= 1) {
      settleSlide();
      end("cancel");
    }
  };

  const onPointerDown = (event) => {
    const state = stateRef.current;
    if (disabled || event.button !== 0 || !event.isPrimary || state.pointerId !== null) return;
    state.pointerId = event.pointerId;
    state.downX = event.clientX;
    state.downAt = monotonicNow();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional. */ }
    setPressed(true);
    state.ownPress = !state.listening;
    if (!state.listening) begin("pointer");
  };

  const onPointerUp = (event) => {
    const state = stateRef.current;
    const config = configRef.current;
    if (event.pointerId !== state.pointerId) return;
    state.pointerId = null;
    setPressed(false);
    if (state.sliding) settleSlide();
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch { /* Pointer capture is optional. */ }
    if (!state.listening) return;
    const held = monotonicNow() - state.downAt;
    const isHold = config.mode === "hold" || (config.mode === "auto" && held >= config.holdAfter);
    if (state.ownPress) {
      if (isHold) end("release");
    } else {
      end(held < config.holdAfter ? "tap" : "release");
    }
  };

  const onPointerCancel = (event) => {
    if (event.pointerId !== stateRef.current.pointerId) return;
    stateRef.current.pointerId = null;
    setPressed(false);
    settleSlide();
    end("cancel");
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape") end("escape");
  };

  const onClick = (event) => {
    // Native button clicks handle Enter, Space, and assistive technology. Pointer clicks
    // were handled on pointer down/up and must not toggle the recording a second time.
    if (event.detail !== 0 || stateRef.current.pointerId !== null) return;
    if (stateRef.current.listening) end("key");
    else begin("key");
  };

  useEffect(() => {
    if (!pressed) return undefined;
    const stop = () => end("blur");
    const onVisibilityChange = () => { if (document.hidden) stop(); };
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [pressed]);

  useEffect(() => {
    if (disabled) end("disabled");
  }, [disabled]);

  useEffect(() => {
    const state = stateRef.current;
    return () => {
      end("unmount", true, false);
      if (state.raf) cancelAnimationFrame(state.raf);
      void state.audio?.ctx.close().catch(() => {});
    };
  }, []);

  const radius = shape === "rounded" ? Math.round(size * 0.29) : size / 2;
  const hit = Math.max(0, Math.min(10, (44 - size) / 2));
  const timeSize = Math.max(10, Math.round(size * 0.36));
  const clockWidth = showTime ? Math.round(timeSize * 2.5) + 4 : 0;
  const waveWidth = waveform ? Math.round(size * 1.9) : 0;
  const extra = clockWidth + waveWidth;

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={listening}
      className={`voice-pill${className ? ` ${className}` : ""}`}
      data-state={listening ? "listening" : "idle"}
      data-pressed={pressed ? "" : undefined}
      data-input={input}
      data-time={showTime ? "" : undefined}
      ref={rootRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerUp}
      onKeyDown={onKeyDown}
      onClick={onClick}
      onContextMenu={(event) => event.preventDefault()}
      style={{
        "--vp-accent": accentColor,
        "--vp-icon": iconColor,
        "--vp-bg": background,
        "--vp-size": `${size}px`,
        "--vp-radius": `${radius}px`,
        "--vp-reach": `${reach}px`,
        "--vp-extra": `${extra}px`,
        "--vp-clock-w": `${clockWidth}px`,
        "--vp-wave-w": `${waveWidth}px`,
        "--vp-stop": `${Math.round(size * 0.32)}px`,
        "--vp-icon-size": `${Math.round(size * 0.54)}px`,
        "--vp-time-size": `${timeSize}px`,
        "--vp-open": `${openDuration}ms`,
        "--vp-press": pressScale,
        "--vp-hit": `${hit}px`,
      }}
    >
      <span className="voice-pill__capsule" aria-hidden="true" />
      {waveform ? <canvas ref={waveRef} className="voice-pill__wave" aria-hidden="true" /> : null}
      {slideToCancel ? (
        <span className="voice-pill__cancel" aria-hidden="true">
          <HugeiconsIcon icon={ArrowLeft01Icon} size={12} strokeWidth={2.2} />
          <span>Cancel</span>
        </span>
      ) : null}
      {showTime ? <span ref={timeRef} className="voice-pill__time" aria-hidden="true">0:00</span> : null}
      <span className="voice-pill__glyph">
        <span className="voice-pill__mic">
          <HugeiconsIcon icon={Mic01Icon} size={Math.round(size * 0.54)} strokeWidth={2} />
        </span>
        <span className="voice-pill__stop" aria-hidden="true" />
      </span>
    </button>
  );
});

export default VoicePill;
