// Small synthesized sound effects (Web Audio). Off by default; the toggle in the top bar is the
// user gesture that creates and resumes the audio context.

let ctx = null;
let master = null;
let noise = null;
let enabled = false;
const lastPlayed = new Map();

function ensure() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) {
      return false;
    }
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }
  if (ctx.state === "suspended") {
    ctx.resume();
  }
  return true;
}

export function setSoundEnabled(on) {
  enabled = on;
  if (on) {
    ensure();
  }
}

export function soundEnabled() {
  return enabled;
}

function tone(type, freq, start, dur, { gain = 0.5, to = null, attack = 0.005 } = {}) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (to !== null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + dur);
  }
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(amp).connect(master);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function hiss(start, dur, { gain = 0.4, freq = 1200, type = "bandpass", q = 0.8 } = {}) {
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  src.buffer = noise;
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  amp.gain.setValueAtTime(gain, start);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(amp).connect(master);
  src.start(start);
  src.stop(start + dur + 0.02);
}

const SOUNDS = {
  coin(t) {
    tone("square", 988, t, 0.08, { gain: 0.3 });
    tone("square", 1319, t + 0.08, 0.32, { gain: 0.3 });
  },
  blip(t) {
    tone("square", 660, t, 0.07, { gain: 0.25, to: 520 });
  },
  pad(t, v = 0) {
    tone("square", v ? 523 : 784, t, 0.09, { gain: 0.25 });
  },
  buzz(t) {
    tone("sawtooth", 110, t, 0.22, { gain: 0.28 });
    tone("sawtooth", 116, t, 0.22, { gain: 0.2 });
    hiss(t, 0.12, { gain: 0.25, freq: 3000 });
  },
  clank(t) {
    tone("triangle", 420, t, 0.18, { gain: 0.35, to: 160 });
    hiss(t, 0.06, { gain: 0.4, freq: 2400 });
  },
  thud(t, strength = 1) {
    const s = Math.min(1, Math.max(0.05, strength));
    tone("sine", 150, t, 0.16, { gain: 0.55 * s, to: 55 });
    hiss(t, 0.05, { gain: 0.18 * s, freq: 500, type: "lowpass" });
  },
  powerdown(t) {
    tone("sawtooth", 440, t, 0.9, { gain: 0.25, to: 40 });
    hiss(t, 0.3, { gain: 0.3, freq: 2000 });
  },
  powerup(t) {
    [523, 659, 784, 1047].forEach((f, i) => tone("square", f, t + i * 0.08, 0.12, { gain: 0.22 }));
  },
  stamp(t) {
    tone("sine", 880, t, 0.12, { gain: 0.4, to: 1320 });
    tone("triangle", 1760, t + 0.1, 0.25, { gain: 0.18 });
  },
  gacon(t) {
    hiss(t, 0.18, { gain: 0.7, freq: 380, type: "lowpass" });
    tone("sine", 95, t, 0.2, { gain: 0.6, to: 50 });
    tone("triangle", 300, t + 0.16, 0.12, { gain: 0.15, to: 180 });
  },
  tick(t) {
    tone("square", 1800, t, 0.02, { gain: 0.08 });
  },
  fizz(t) {
    hiss(t, 0.35, { gain: 0.35, freq: 5000, type: "highpass" });
  },
  win(t) {
    [784, 988, 1175, 1568, 1175, 1568].forEach((f, i) =>
      tone("square", f, t + i * 0.09, 0.14, { gain: 0.22 })
    );
  },
  jingle(t) {
    [523, 659, 784, 659, 784, 1047, 1319].forEach((f, i) =>
      tone("square", f, t + i * 0.075, 0.12, { gain: 0.2 })
    );
  },
  shot(t) {
    tone("square", 1400, t, 0.06, { gain: 0.12, to: 500 });
  },
  pop(t) {
    tone("sine", 400, t, 0.12, { gain: 0.35, to: 1200 });
  }
};

// Plays a named effect. `minGap` keeps rapid physics impacts from stacking into noise.
export function play(name, value, minGap = 0) {
  if (!enabled || !SOUNDS[name] || !ensure()) {
    return;
  }
  const now = ctx.currentTime;
  if (minGap > 0) {
    const last = lastPlayed.get(name) ?? -1;
    if (now - last < minGap) {
      return;
    }
    lastPlayed.set(name, now);
  }
  SOUNDS[name](now + 0.005, value);
}
