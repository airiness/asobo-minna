// ↑↑↓↓←→←→BA from the keyboard or any cabinet's stick and buttons.

const SEQUENCE = ["up", "up", "down", "down", "left", "right", "left", "right", "b", "a"];
const KEYS = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  b: "b",
  B: "b",
  a: "a",
  A: "a"
};

const recent = [];
let onSuccess = () => {};

export function pushInput(token) {
  recent.push(token);
  if (recent.length > SEQUENCE.length) {
    recent.shift();
  }
  if (recent.length === SEQUENCE.length && recent.every((v, i) => v === SEQUENCE[i])) {
    recent.length = 0;
    onSuccess();
  }
}

export function initKonami(callback) {
  onSuccess = callback;
  document.addEventListener("keydown", (e) => {
    const target = e.target;
    if (target instanceof HTMLElement && target.matches("input, textarea, select")) {
      return;
    }
    const token = KEYS[e.key];
    if (token) {
      pushInput(token);
    }
  });
}
