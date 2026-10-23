// Per-visitor progress kept in localStorage. Storage can be missing or blocked (private windows,
// embedded previews), so every access is guarded and the page works from defaults.

const KEY = "asobo-minna:v1";
const START_CREDITS = 3;

function defaults() {
  return {
    credits: START_CREDITS,
    stamps: {},
    drinks: [],
    coins: [],
    sound: false,
    lang: null
  };
}

function sanitize(raw) {
  const base = defaults();
  if (!raw || typeof raw !== "object") {
    return base;
  }
  if (Number.isInteger(raw.credits) && raw.credits >= 0) {
    base.credits = Math.min(raw.credits, 99);
  }
  if (raw.stamps && typeof raw.stamps === "object") {
    base.stamps = { ...raw.stamps };
  }
  for (const key of ["drinks", "coins"]) {
    if (Array.isArray(raw[key])) {
      base[key] = raw[key].slice(0, 32);
    }
  }
  base.sound = raw.sound === true;
  base.lang = raw.lang === "ja" || raw.lang === "zh" ? raw.lang : null;
  return base;
}

function load() {
  try {
    const text = localStorage.getItem(KEY);
    return sanitize(text ? JSON.parse(text) : null);
  } catch {
    return defaults();
  }
}

const state = load();
const listeners = new Map();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Progress simply is not remembered when storage is unavailable.
  }
}

export const store = {
  get(key) {
    return state[key];
  },

  set(key, value) {
    state[key] = value;
    save();
    for (const fn of listeners.get(key) ?? []) {
      fn(value);
    }
  },

  update(key, fn) {
    this.set(key, fn(state[key]));
  },

  on(key, fn) {
    if (!listeners.has(key)) {
      listeners.set(key, new Set());
    }
    listeners.get(key).add(fn);
  },

  addCredits(n) {
    this.update("credits", (c) => Math.max(0, Math.min(99, c + n)));
  }
};
