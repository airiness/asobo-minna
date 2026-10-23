// Stamp card (achievements) and the toast that announces new stamps and finds.

import { store } from "./store.js";
import { t, onLangChange } from "./i18n.js";
import { play } from "./sound.js";

export const STAMP_IDS = [
  "coin",
  "knock",
  "blackout",
  "tower",
  "anagram",
  "repair",
  "atari",
  "drinks",
  "peek",
  "coins",
  "konami",
  "midnight"
];

const grid = document.getElementById("stamp-grid");
const hint = document.getElementById("stamp-hint");
const counter = document.getElementById("stamp-count");
const badge = document.getElementById("regular-badge");
const toastEl = document.getElementById("toast");
const toastStamp = document.getElementById("toast-stamp");
const toastTitle = document.getElementById("toast-title");
const toastSub = document.getElementById("toast-sub");

let toastTimer = 0;
const toastQueue = [];
let selected = null;
let fresh = null;

export function toast(title, sub = "", glyph = "") {
  toastQueue.push({ title, sub, glyph });
  if (toastQueue.length === 1) {
    showNextToast();
  }
}

function showNextToast() {
  const next = toastQueue[0];
  if (!next) {
    toastEl.hidden = true;
    return;
  }
  toastStamp.textContent = next.glyph;
  toastTitle.textContent = next.title;
  toastSub.textContent = next.sub;
  toastEl.hidden = false;
  // Restart the entrance animation for back-to-back toasts.
  toastEl.style.animation = "none";
  void toastEl.offsetWidth;
  toastEl.style.animation = "";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastQueue.shift();
    showNextToast();
  }, 2600);
}

export function hasStamp(id) {
  return Boolean(store.get("stamps")[id]);
}

function stampCount() {
  const got = store.get("stamps");
  return STAMP_IDS.filter((id) => got[id]).length;
}

export function award(id) {
  if (hasStamp(id) || !STAMP_IDS.includes(id)) {
    return false;
  }
  store.update("stamps", (s) => ({ ...s, [id]: Date.now() }));
  fresh = id;
  play("stamp");
  toast(t("stamp.got"), t(`stamp.${id}.name`), t(`stamp.${id}.glyph`));
  render();
  if (stampCount() === STAMP_IDS.length) {
    document.documentElement.classList.add("regular");
    setTimeout(() => toast(t("stamps.regular"), t("stamps.regularToast"), "★"), 400);
  }
  return true;
}

function render() {
  const got = store.get("stamps");
  grid.replaceChildren();
  STAMP_IDS.forEach((id, i) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "stamp";
    btn.dataset.id = id;
    btn.setAttribute("aria-expanded", String(selected === id));
    btn.classList.toggle("got", Boolean(got[id]));
    btn.classList.toggle("fresh", fresh === id);
    btn.style.setProperty("--r", `${((i * 37) % 21) - 12}deg`);

    const mark = document.createElement("span");
    mark.className = "stamp-mark display";
    mark.textContent = got[id] ? t(`stamp.${id}.glyph`) : "？";

    const name = document.createElement("span");
    name.className = "stamp-name";
    name.textContent = t(`stamp.${id}.name`);

    btn.append(mark, name);
    li.append(btn);
    grid.append(li);
  });
  fresh = null;
  const n = stampCount();
  counter.textContent = `${n}/${STAMP_IDS.length}`;
  badge.hidden = n < STAMP_IDS.length;
  badge.textContent = t("stamps.regular");
  hint.textContent = selected ? t("stamps.hint", { hint: t(`stamp.${selected}.hint`) }) : t("stamps.tap");
}

export function initStamps() {
  grid.addEventListener("click", (e) => {
    const btn = e.target.closest(".stamp");
    if (!btn) {
      return;
    }
    const id = btn.dataset.id;
    selected = selected === id ? null : id;
    play("blip");
    render();
    grid.querySelector(`[data-id="${id}"]`)?.focus();
  });
  onLangChange(render);
  if (stampCount() === STAMP_IDS.length) {
    document.documentElement.classList.add("regular");
  }
  render();
}
