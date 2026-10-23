// Cabinets on the game floor: attract demos, the stick and A/B buttons, inserting a coin before
// leaving for a game, and the covered cabinet that can be peeked under.

import { createDemo } from "./attract.js";
import { store } from "./store.js";
import { play } from "./sound.js";
import { award } from "./stamps.js";
import { t } from "./i18n.js";
import { revealCoin } from "./coins.js";
import { pushInput } from "./konami.js";

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const screens = [];
let raf = 0;
let last = 0;

function fit(canvas) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { w, h };
}

function render(entry, time) {
  const { w, h } = fit(entry.canvas);
  entry.demo.draw(entry.ctx, w, h, time);
}

function frame(now) {
  raf = 0;
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  const turbo = document.documentElement.classList.contains("rainbow") ? 2 : 1;
  let any = false;
  for (const entry of screens) {
    if (!entry.visible) {
      continue;
    }
    any = true;
    entry.demo.step(dt * turbo);
    render(entry, now / 1000);
  }
  if (any && !document.hidden) {
    raf = requestAnimationFrame(frame);
  }
}

function startLoop() {
  if (!raf && !reduceMotion.matches) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
}

function addScreen(canvas) {
  const demo = createDemo(canvas.dataset.demo);
  const entry = { canvas, ctx: canvas.getContext("2d"), demo, visible: false };
  // Run the demo for a few seconds up front so the first frame already shows play.
  for (let i = 0; i < 180; i++) {
    demo.step(1 / 60);
  }
  screens.push(entry);
  return entry;
}

function wireStick(stick, entry) {
  const knob = stick.querySelector(".stick-knob");
  let id = null;
  let dir = null;

  const move = (e) => {
    const r = stick.getBoundingClientRect();
    const max = r.width * 0.32;
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx *= max / len;
      dy *= max / len;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const v = { x: dx / max, y: dy / max };
    entry.demo.input("stick", v);
    const mag = Math.hypot(v.x, v.y);
    let next = null;
    if (mag > 0.6) {
      next = Math.abs(v.x) > Math.abs(v.y) ? (v.x > 0 ? "right" : "left") : v.y > 0 ? "down" : "up";
    } else if (mag < 0.3) {
      next = null;
    } else {
      next = dir;
    }
    if (next && next !== dir) {
      pushInput(next);
      play("tick");
    }
    dir = next;
  };

  stick.addEventListener("pointerdown", (e) => {
    id = e.pointerId;
    stick.setPointerCapture(id);
    stick.classList.add("held");
    move(e);
    startLoop();
  });
  stick.addEventListener("pointermove", (e) => {
    if (e.pointerId === id) {
      move(e);
    }
  });
  const end = (e) => {
    if (e.pointerId !== id) {
      return;
    }
    id = null;
    dir = null;
    stick.classList.remove("held");
    knob.style.transform = "";
    entry.demo.input("stick", { x: 0, y: 0 });
  };
  stick.addEventListener("pointerup", end);
  stick.addEventListener("pointercancel", end);
}

function wirePads(cabinet, entry) {
  for (const pad of cabinet.querySelectorAll(".pad")) {
    pad.addEventListener("click", () => {
      const key = pad.dataset.pad;
      const effect = entry.demo.input(key);
      play("pad", key === "b" ? 1 : 0);
      if (effect) {
        play(effect);
      }
      pushInput(key);
      if (reduceMotion.matches) {
        entry.demo.step(0.5);
        render(entry, performance.now() / 1000);
      }
    });
  }
}

function updateCreditLabel() {
  const credits = store.get("credits");
  document.getElementById("credit-word").textContent = credits > 0 ? "CREDIT" : "FREE";
  document.getElementById("credit").textContent =
    credits > 0 ? String(credits).padStart(2, "0") : "PLAY";
}

function wirePlay(cabinet) {
  const link = cabinet.querySelector(".play");
  const msg = cabinet.querySelector(".screen-msg");
  link.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    if (cabinet.classList.contains("starting")) {
      return;
    }
    if (store.get("credits") > 0) {
      store.addCredits(-1);
    }
    award("coin");
    play("coin");
    cabinet.classList.add("starting");
    msg.textContent = "GAME START!";
    setTimeout(() => location.assign(link.href), reduceMotion.matches ? 0 : 650);
  });
}

function wireSoon() {
  const cabinet = document.getElementById("soon");
  const btn = document.getElementById("peek");
  btn.addEventListener("click", () => {
    const open = !cabinet.classList.contains("peeking");
    cabinet.classList.toggle("peeking", open);
    btn.setAttribute("aria-pressed", String(open));
    btn.dataset.i18n = open ? "soon.unpeek" : "soon.peek";
    btn.textContent = t(btn.dataset.i18n);
    play(open ? "pop" : "blip");
    if (open) {
      award("peek");
      revealCoin("soon");
      startLoop();
    }
  });
}

export function initCabinets() {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const entry = screens.find((s) => s.canvas === e.target);
      if (entry) {
        entry.visible = e.isIntersecting;
      }
    }
    for (const entry of screens) {
      if (entry.visible) {
        render(entry, performance.now() / 1000);
      }
    }
    startLoop();
  });

  for (const canvas of document.querySelectorAll("canvas.attract")) {
    const entry = addScreen(canvas);
    io.observe(canvas);
    const cabinet = canvas.closest(".cabinet");
    if (cabinet?.dataset.game) {
      wireStick(cabinet.querySelector(".stick"), entry);
      wirePads(cabinet, entry);
      wirePlay(cabinet);
    }
  }
  wireSoon();

  document.fonts?.ready.then(() => {
    for (const entry of screens) {
      render(entry, performance.now() / 1000);
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      startLoop();
    }
  });
  // Coming back with the back button restores the page from cache mid-animation.
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      for (const cabinet of document.querySelectorAll(".cabinet.starting")) {
        cabinet.classList.remove("starting");
        cabinet.querySelector(".screen-msg").textContent = "INSERT COIN";
      }
      startLoop();
    }
  });

  store.on("credits", updateCreditLabel);
  updateCreditLabel();
}
