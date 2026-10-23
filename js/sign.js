// The neon signboard. Tiles light up on load; tapping one loosens it, then it hangs from one
// screw, then it falls onto the sidewalk and becomes a physical block that can be dragged and
// thrown. After a few tiles fall the whole sign gives out. "Repair" puts everything back.

import { World, Body, MouseJoint } from "./physics.js";
import { play } from "./sound.js";
import { award } from "./stamps.js";
import { t } from "./i18n.js";
import { revealCoin, hideCoin } from "./coins.js";

const street = document.getElementById("street");
const canvas = document.getElementById("toybox");
const ctx = canvas.getContext("2d");
const repairBtn = document.getElementById("repair");
const hint = document.getElementById("hint");
const openSign = document.getElementById("open-sign");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

const COLORS = {
  "c-pink": "#ff4fa3",
  "c-cyan": "#3ef0ff",
  "c-acid": "#d8ff4f",
  "c-orange": "#ff7a3d",
  "c-gold": "#ffd166"
};
const GOLD = "#ffd166";
const TILE_FILL = 0.96;
const SIDEWALK_PX = 20;
const STEP = 1 / 60;
const CASCADE_AT = 3;

const tiles = [...document.querySelectorAll("#sign .slot")].map((slot, i) => {
  const el = slot.querySelector(".tile");
  const colorClass = [...el.classList].find((c) => c in COLORS);
  return {
    i,
    slot,
    el,
    dot: el.classList.contains("dot"),
    label: el.textContent.trim(),
    color: COLORS[colorClass] ?? COLORS["c-pink"],
    flaky: el.classList.contains("flaky"),
    hits: 0,
    state: "lit",
    tilt: 0,
    pivot: [0.5, 0.08],
    body: null,
    tween: null
  };
});

const world = new World(30);
let statics = [];
let scale = 80;
let widthM = 10;
let floorY = 6;
let dpr = 1;
let cssW = 0;
let cssH = 0;
let raf = 0;
let last = 0;
let acc = 0;
let visible = true;
let drag = null;
let suppressClick = false;
let cascading = false;
let cascadeRun = 0;
let checkTimer = 0;
const sprites = new Map();

function fallenTiles() {
  return tiles.filter((tile) => tile.body);
}

function setHintKey(key) {
  hint.dataset.i18n = key;
  hint.textContent = t(key);
}

function setOpenSignKey(key) {
  openSign.dataset.i18n = key;
  openSign.textContent = t(key);
}

// ---------- layout and world bounds ----------

function measure() {
  const rect = street.getBoundingClientRect();
  cssW = rect.width;
  cssH = rect.height;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  scale = tiles[0].slot.getBoundingClientRect().width || 80;
  widthM = cssW / scale;
  floorY = (cssH - SIDEWALK_PX) / scale;

  for (const b of statics) {
    world.remove(b);
  }
  const floor = new Body(widthM + 20, 4);
  floor.x = widthM / 2;
  floor.y = floorY + 2;
  floor.friction = 0.7;
  const left = new Body(4, 200);
  left.x = -2;
  left.y = floorY - 100;
  const right = new Body(4, 200);
  right.x = widthM + 2;
  right.y = floorY - 100;
  statics = [floor, left, right];
  for (const b of statics) {
    world.add(b);
  }

  for (const tile of fallenTiles()) {
    const b = tile.body;
    b.x = Math.min(Math.max(b.x, 0.6), widthM - 0.6);
    b.y = Math.min(b.y, floorY - 0.55);
  }
  sprites.clear();
  draw();
}

function slotCenter(tile) {
  const s = street.getBoundingClientRect();
  const r = tile.slot.getBoundingClientRect();
  return { x: (r.left - s.left + r.width / 2) / scale, y: (r.top - s.top + r.height / 2) / scale };
}

// ---------- tapping the sign ----------

function flicker(tile, times = 2) {
  if (reduceMotion.matches) {
    return;
  }
  let n = 0;
  const id = setInterval(() => {
    tile.el.classList.toggle("lit");
    if (++n >= times * 2) {
      clearInterval(id);
      tile.el.classList.add("lit");
    }
  }, 60);
}

function jolt(tile) {
  tile.el.classList.remove("jolt");
  void tile.el.offsetWidth;
  tile.el.classList.add("jolt");
}

function hit(tile) {
  if (tile.state === "fallen" || tile.state === "returning" || cascading) {
    return;
  }
  tile.hits += 1;
  if (hint.dataset.i18n === "hero.hint") {
    hint.style.opacity = "0.5";
  }
  if (tile.hits === 1) {
    tile.state = "loose";
    tile.tilt = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 3);
    tile.pivot = [0.5, 0.08];
    tile.slot.style.setProperty("--loose", `${tile.tilt}deg`);
    tile.el.style.setProperty("--pivot", "50% 8%");
    tile.slot.classList.add("loose");
    jolt(tile);
    flicker(tile);
    play("buzz");
  } else if (tile.hits === 2) {
    tile.state = "hang";
    const fromLeft = tile.tilt >= 0;
    tile.tilt = fromLeft ? 34 : -34;
    tile.pivot = fromLeft ? [0.1, 0.1] : [0.9, 0.1];
    tile.el.style.setProperty("--pivot", fromLeft ? "10% 10%" : "90% 10%");
    tile.slot.style.setProperty("--hang", `${tile.tilt}deg`);
    tile.slot.classList.remove("loose");
    tile.slot.classList.add("hang");
    play("clank");
  } else {
    drop(tile, true);
  }
}

function drop(tile, pushed) {
  const s = street.getBoundingClientRect();
  const r = tile.slot.getBoundingClientRect();
  const size = r.width;
  const theta = ((tile.state === "lit" ? 0 : tile.tilt) * Math.PI) / 180;
  const px = tile.pivot[0] * size;
  const py = tile.pivot[1] * size;
  const ox = size / 2 - px;
  const oy = size / 2 - py;
  const cx = r.left - s.left + px + Math.cos(theta) * ox - Math.sin(theta) * oy;
  const cy = r.top - s.top + py + Math.sin(theta) * ox + Math.cos(theta) * oy;

  const body = new Body(TILE_FILL, TILE_FILL, 1);
  body.x = cx / scale;
  body.y = cy / scale;
  body.rot = theta;
  body.vx = (Math.random() - 0.5) * (pushed ? 2 : 1);
  body.vy = pushed ? -1.5 : 0;
  body.av = (Math.random() - 0.5) * 3;
  body.data = tile;
  world.add(body);

  tile.body = body;
  tile.state = "fallen";
  tile.hits = 0;
  tile.slot.classList.remove("loose", "hang");
  tile.slot.classList.add("gone");
  tile.el.classList.remove("jolt");
  if (tile.flaky) {
    revealCoin("sign");
  }

  play("clank");
  award("knock");
  repairBtn.hidden = false;
  setHintKey("hero.drag");
  hint.style.opacity = "";

  const fallen = fallenTiles().length;
  if (fallen === tiles.length) {
    blackout();
  } else if (fallen >= CASCADE_AT && !cascading) {
    cascade();
  }
  start();
}

function cascade() {
  cascading = true;
  const run = ++cascadeRun;
  const rest = tiles.filter((tile) => tile.state !== "fallen");
  play("powerdown");
  for (const tile of rest) {
    flicker(tile, 4);
  }
  const delay = reduceMotion.matches ? 0 : 700;
  setTimeout(() => {
    if (run !== cascadeRun) {
      return;
    }
    rest.forEach((tile, k) => {
      setTimeout(() => {
        if (run !== cascadeRun) {
          return;
        }
        if (tile.state !== "fallen" && tile.state !== "returning") {
          drop(tile, false);
        }
        if (k === rest.length - 1) {
          cascading = false;
        }
      }, reduceMotion.matches ? 0 : k * 130);
    });
    if (rest.length === 0) {
      cascading = false;
    }
  }, delay);
}

function blackout() {
  street.classList.add("blackout");
  setOpenSignKey("hero.blackout");
  award("blackout");
}

// ---------- repair ----------

function repair() {
  const items = fallenTiles();
  if (!items.length) {
    return;
  }
  if (drag) {
    release();
  }
  // A repair during the power cut cancels the tiles that were still about to fall.
  cascadeRun += 1;
  cascading = false;
  play("powerup");
  items.forEach((tile, k) => {
    const b = tile.body;
    world.remove(b);
    tile.body = null;
    tile.state = "returning";
    const target = slotCenter(tile);
    const r0 = b.rot - Math.round(b.rot / (2 * Math.PI)) * 2 * Math.PI;
    tile.tween = { x0: b.x, y0: b.y, r0, x1: target.x, y1: target.y, t: -k * 0.06, dur: 0.6 };
  });
  for (const tile of tiles) {
    if (tile.state === "loose" || tile.state === "hang") {
      tile.state = "lit";
      tile.hits = 0;
      tile.slot.classList.remove("loose", "hang");
    }
    if (tile.state === "lit") {
      tile.el.classList.add("lit");
    }
  }
  repairBtn.hidden = true;
  street.classList.remove("blackout");
  setOpenSignKey("hero.open");
  setHintKey("hero.hint");
  hideCoin("sign");
  award("repair");
  start();
}

function finishTween(tile) {
  tile.tween = null;
  tile.state = "lit";
  tile.hits = 0;
  tile.slot.classList.remove("gone");
  tile.el.classList.add("lit");
  tile.el.classList.remove("relight");
  void tile.el.offsetWidth;
  tile.el.classList.add("relight");
}

function easeOutBack(x) {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
}

// ---------- drawing ----------

function sprite(tile) {
  const gold = document.documentElement.classList.contains("regular");
  const color = gold ? GOLD : tile.color;
  const key = `${tile.i}|${color}|${scale}|${dpr}`;
  let img = sprites.get(key);
  if (img) {
    return img;
  }
  const size = scale * TILE_FILL * dpr;
  const pad = scale * 0.45 * dpr;
  img = document.createElement("canvas");
  img.width = img.height = Math.ceil(size + pad * 2);
  const g = img.getContext("2d");
  const c = img.width / 2;
  const radius = size * 0.2;
  const line = Math.max(2, 3 * dpr);

  g.shadowColor = color;
  g.shadowBlur = 18 * dpr;
  g.fillStyle = "rgba(9, 7, 26, 0.94)";
  g.strokeStyle = color;
  g.lineWidth = line;
  g.beginPath();
  g.roundRect(c - size / 2 + line / 2, c - size / 2 + line / 2, size - line, size - line, radius);
  g.fill();
  g.stroke();
  g.shadowBlur = 6 * dpr;
  g.stroke();

  g.shadowBlur = 16 * dpr;
  if (tile.dot) {
    g.strokeStyle = "#fff";
    g.lineWidth = scale * 0.075 * dpr;
    g.beginPath();
    g.arc(c, c, size * 0.15, 0, Math.PI * 2);
    g.stroke();
  } else {
    g.fillStyle = "#fff";
    g.font = `800 ${Math.round(scale * 0.6 * dpr)}px "Asobo Neon", "Hiragino Maru Gothic ProN", sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    const m = g.measureText(tile.label);
    const asc = m.actualBoundingBoxAscent || size * 0.42;
    const desc = m.actualBoundingBoxDescent || size * 0.06;
    g.fillText(tile.label, c, c + (asc - desc) / 2);
    g.shadowBlur = 4 * dpr;
    g.fillText(tile.label, c, c + (asc - desc) / 2);
  }
  sprites.set(key, img);
  return img;
}

function drawTile(tile, x, y, rot) {
  const img = sprite(tile);
  const px = x * scale * dpr;
  const py = y * scale * dpr;
  // Light spill on the sidewalk under blocks that rest near it.
  const dist = floorY - y;
  if (dist < 2.2) {
    const glow = (1 - dist / 2.2) * 0.32;
    const fy = floorY * scale * dpr;
    const grad = ctx.createRadialGradient(px, fy, 0, px, fy, scale * 1.2 * dpr);
    grad.addColorStop(0, hexAlpha(tile.color, glow));
    grad.addColorStop(1, hexAlpha(tile.color, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(px - scale * 1.2 * dpr, fy - scale * 0.5 * dpr, scale * 2.4 * dpr, scale * dpr);
  }
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(rot);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}

function hexAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const tile of tiles) {
    if (tile.body) {
      drawTile(tile, tile.body.x, tile.body.y, tile.body.rot);
    } else if (tile.tween && tile.tween.t > 0) {
      const tw = tile.tween;
      const k = easeOutBack(Math.min(1, tw.t / tw.dur));
      drawTile(
        tile,
        tw.x0 + (tw.x1 - tw.x0) * k,
        tw.y0 + (tw.y1 - tw.y0) * k,
        tw.r0 * (1 - Math.min(1, k))
      );
    }
  }
}

// ---------- simulation loop ----------

function active() {
  return fallenTiles().length > 0 || tiles.some((tile) => tile.tween);
}

function start() {
  if (!raf && visible) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
}

function frame(now) {
  raf = 0;
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    world.step(STEP);
    acc -= STEP;
    steps += 1;
  }
  if (steps === 5) {
    acc = 0;
  }
  for (const tile of tiles) {
    if (tile.tween) {
      tile.tween.t += dt;
      if (tile.tween.t >= tile.tween.dur) {
        finishTween(tile);
      }
    } else if (tile.body && tile.body.y > floorY + 3) {
      // Tunnelled through the floor after a wild throw: put it back on the sidewalk.
      tile.body.y = floorY - 2;
      tile.body.vy = 0;
    }
  }
  draw();
  checkTimer += dt;
  if (checkTimer > 0.5) {
    checkTimer = 0;
    checkShapes();
  }
  if (active() && visible) {
    raf = requestAnimationFrame(frame);
  } else {
    draw();
  }
}

// ---------- shapes on the sidewalk ----------

function halfHeight(b) {
  return (Math.abs(Math.sin(b.rot)) * b.w + Math.abs(Math.cos(b.rot)) * b.h) / 2;
}

function checkShapes() {
  const bodies = fallenTiles().map((tile) => tile.body);
  if (!bodies.length || drag) {
    return;
  }
  const still = bodies.every((b) => Math.hypot(b.vx, b.vy) < 0.25 && Math.abs(b.av) < 0.4);
  if (!still) {
    return;
  }
  const top = Math.min(...bodies.map((b) => b.y - halfHeight(b)));
  if (bodies.length >= 4 && floorY - top >= 3.7) {
    award("tower");
  }

  const upright = bodies
    .filter((b) => {
      const angle = Math.atan2(Math.sin(b.rot), Math.cos(b.rot));
      return !b.data.dot && Math.abs(angle) < 0.4 && b.y + halfHeight(b) > floorY - 0.15;
    })
    .sort((a, b) => a.x - b.x);
  let run = "";
  for (let i = 0; i < upright.length; i++) {
    if (i > 0 && upright[i].x - upright[i - 1].x > 1.5) {
      run += " ";
    }
    run += upright[i].data.label;
  }
  if (run.includes("みんなあそぼ")) {
    award("anagram");
  }
}

// ---------- dragging ----------

function toWorld(e) {
  const r = street.getBoundingClientRect();
  return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
}

function pick(p) {
  const list = fallenTiles();
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i].body;
    if (b.contains(p.x, p.y)) {
      return list[i];
    }
  }
  return null;
}

function release() {
  if (!drag) {
    return;
  }
  world.joints.delete(drag.joint);
  street.classList.remove("grabbing");
  drag = null;
  setTimeout(() => {
    suppressClick = false;
  }, 300);
}

function onPointerDown(e) {
  if (e.pointerType === "mouse" && e.button !== 0) {
    return;
  }
  const tile = fallenTiles().length ? pick(toWorld(e)) : null;
  if (!tile) {
    suppressClick = false;
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  suppressClick = true;
  if (drag) {
    release();
  }
  // Draw the grabbed block on top.
  tiles.push(tiles.splice(tiles.indexOf(tile), 1)[0]);
  const p = toWorld(e);
  const joint = new MouseJoint(tile.body, p.x, p.y, { hz: 6, damping: 0.75, maxForce: 600 });
  world.joints.add(joint);
  drag = { id: e.pointerId, joint };
  try {
    street.setPointerCapture(e.pointerId);
  } catch {
    // Synthetic or already-released pointers cannot be captured; dragging still works.
  }
  street.classList.add("grabbing");
  start();
}

function onPointerMove(e) {
  if (drag && e.pointerId === drag.id) {
    const p = toWorld(e);
    drag.joint.setTarget(p.x, p.y);
    start();
  } else if (e.pointerType === "mouse" && fallenTiles().length) {
    street.style.cursor = pick(toWorld(e)) ? "grab" : "";
  }
}

function onPointerUp(e) {
  if (drag && e.pointerId === drag.id) {
    release();
  }
}

// ---------- setup ----------

function powerOn() {
  if (reduceMotion.matches) {
    for (const tile of tiles) {
      tile.el.classList.add("lit");
    }
    return;
  }
  const order = tiles.map((tile) => tile).sort(() => Math.random() - 0.5);
  order.forEach((tile, k) => {
    setTimeout(() => {
      tile.el.classList.add("lit");
      flicker(tile, 1 + (k % 2));
    }, 250 + k * 110);
  });
}

export function initSign() {
  for (const tile of tiles) {
    tile.el.addEventListener("click", () => hit(tile));
  }
  repairBtn.addEventListener("click", repair);
  street.addEventListener("pointerdown", onPointerDown, { capture: true });
  street.addEventListener("pointermove", onPointerMove);
  street.addEventListener("pointerup", onPointerUp);
  street.addEventListener("pointercancel", onPointerUp);
  street.addEventListener(
    "touchstart",
    (e) => {
      if (fallenTiles().length && e.touches.length === 1 && pick(toWorld(e.touches[0]))) {
        e.preventDefault();
      }
    },
    { passive: false }
  );
  street.addEventListener(
    "click",
    (e) => {
      if (suppressClick) {
        e.preventDefault();
        e.stopPropagation();
        suppressClick = false;
      }
    },
    { capture: true }
  );

  world.onImpact = (speed) => {
    if (speed > 1.5) {
      play("thud", speed / 10, 0.05);
    }
  };

  new ResizeObserver(() => measure()).observe(street);
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible && active()) {
      start();
    }
  }).observe(street);
  document.fonts?.load('800 40px "Asobo Neon"').then(() => {
    sprites.clear();
    draw();
  });

  measure();
  powerOn();
}

// Called when the regular (gold) look switches on so falling blocks match the sign.
export function refreshSprites() {
  sprites.clear();
  draw();
}
