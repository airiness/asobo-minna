// The sidewalk toy box. Fallen sign tiles become physical blocks made of their color's material
// (js/materials.js). Blocks can be dragged and thrown, same-colored blocks stick together and a
// hard slam splits them again, the hoop keeps score, and a block dropped on an empty slot of the
// signboard is handed back to the sign through the hooks passed to initToybox().

import { World, Body, MouseJoint } from "./physics.js";
import { MATERIALS, applyMaterial } from "./materials.js";
import { Hoop } from "./hoop.js";
import { play } from "./sound.js";
import { award } from "./stamps.js";
import { t, currentLang } from "./i18n.js";
import { store } from "./store.js";

const street = document.getElementById("street");
const inner = street.querySelector(".street-inner");
const canvas = document.getElementById("toybox");
const ctx = canvas.getContext("2d");

const GOLD = "#ffd166";
const TILE = 0.96;
const WELD_GAP = 0.97;
const SIDEWALK_PX = 20;
const STEP = 1 / 60;
const BREAK_SPEED = 12;
const WELD_MAX_SPEED = 3;
const SNAP_RADIUS = 0.7;
const PIXEL_FONT = '"Asobo Dot", ui-monospace, monospace';

const world = new World(30);
const hoop = new Hoop(world);
const order = [];
const flights = new Map();
const welds = new Map();
const pops = [];
const sparks = [];
const sprites = new Map();

let hooks = null;
let walls = [];
let scale = 80;
let widthM = 10;
let floorY = 6;
let dpr = 1;
let raf = 0;
let last = 0;
let acc = 0;
let clock = 0;
let restTime = 0;
let checkTimer = 0;
let visible = true;
let drag = null;
let snapSlot = null;
let suppressClick = false;

// ---------- layout ----------

function measure() {
  const rect = street.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  scale = hooks.tileSize() || 80;
  widthM = rect.width / scale;
  floorY = (rect.height - SIDEWALK_PX) / scale;

  for (const b of walls) {
    world.remove(b);
  }
  const floor = box(widthM + 20, 4, widthM / 2, floorY + 2);
  floor.friction = 0.7;
  const left = box(4, 200, -2, floorY - 100);
  const right = box(4, 200, widthM + 2, floorY - 100);
  const ceiling = box(widthM + 20, 4, widthM / 2, -2.6);
  walls = [floor, left, right, ceiling];
  for (const b of walls) {
    world.add(b);
  }

  // The hoop hangs in the open space below the shop text: its height follows the room the
  // street leaves for the sidewalk.
  const zone = parseFloat(getComputedStyle(inner).paddingBottom) / scale;
  hoop.layout(widthM, floorY, Math.min(2.8, Math.max(1.6, zone - 1.05)));

  for (const tile of order) {
    const b = tile.body;
    if (b) {
      b.x = Math.min(Math.max(b.x, 0.6), widthM - 0.6);
      b.y = Math.min(b.y, floorY - 0.55);
    }
  }
  sprites.clear();
  draw();
  start();
}

function box(w, h, x, y) {
  const b = new Body(w, h);
  b.x = x;
  b.y = y;
  return b;
}

export function rectCenter(el) {
  const s = street.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: (r.left - s.left + r.width / 2) / scale, y: (r.top - s.top + r.height / 2) / scale };
}

// ---------- tiles entering and leaving the world ----------

export function spawn(tile, pose) {
  const material = MATERIALS[tile.colorKey];
  const body = new Body(TILE, TILE, material.mass);
  applyMaterial(body, material);
  Object.assign(body, { x: pose.x, y: pose.y, rot: pose.rot, vx: pose.vx ?? 0, vy: pose.vy ?? 0, av: pose.av ?? 0 });
  body.data = tile;
  world.add(body);
  tile.body = body;
  tile.weldCooldown = clock + 0.6;
  tile.releasedAt = null;
  bringToFront(tile);
  start();
}

export function removeBody(tile) {
  const b = tile.body;
  if (!b) {
    return null;
  }
  if (drag?.tile === tile) {
    release(false);
  }
  unweld(tile, false);
  world.remove(b);
  tile.body = null;
  forget(tile);
  return { x: b.x, y: b.y, rot: b.rot };
}

export function fly(tile, from, to, done, delay = 0) {
  const r0 = from.rot - Math.round(from.rot / (2 * Math.PI)) * 2 * Math.PI;
  flights.set(tile, { x0: from.x, y0: from.y, r0, x1: to.x, y1: to.y, t: -delay, dur: 0.5, done });
  bringToFront(tile);
  start();
}

export function cancelFly(tile) {
  const f = flights.get(tile);
  if (!f) {
    return null;
  }
  flights.delete(tile);
  forget(tile);
  return flightPose(f);
}

export function cancelDrag() {
  if (drag) {
    release(false);
  }
}

export function refreshSprites() {
  sprites.clear();
  draw();
}

function bringToFront(tile) {
  forget(tile);
  order.push(tile);
}

function forget(tile) {
  const i = order.indexOf(tile);
  if (i >= 0) {
    order.splice(i, 1);
  }
}

function flightPose(f) {
  const k = easeOutBack(Math.min(1, Math.max(0, f.t) / f.dur));
  return { x: f.x0 + (f.x1 - f.x0) * k, y: f.y0 + (f.y1 - f.y0) * k, rot: f.r0 * (1 - Math.min(1, k)) };
}

function easeOutBack(x) {
  const c1 = 1.4;
  return 1 + (c1 + 1) * (x - 1) ** 3 + c1 * (x - 1) ** 2;
}

// ---------- same-color welding ----------

function tryWeld() {
  for (const arb of world.arbiters.values()) {
    const ta = arb.a.data;
    const tb = arb.b.data;
    if (!ta || !tb || ta.colorKey !== tb.colorKey || welds.has(ta) || welds.has(tb)) {
      continue;
    }
    if (arb.contacts.length < 2 || ta.weldCooldown > clock || tb.weldCooldown > clock) {
      continue;
    }
    if (Math.hypot(arb.a.vx - arb.b.vx, arb.a.vy - arb.b.vy) > WELD_MAX_SPEED) {
      continue;
    }
    weld(ta, tb);
    return;
  }
}

function weld(ta, tb) {
  const a = ta.body;
  const b = tb.body;
  // Square the pair up face to face, like two magnets clicking together.
  const quarter = Math.PI / 2;
  b.rot = a.rot + Math.round((b.rot - a.rot) / quarter) * quarter;
  const c = Math.cos(a.rot);
  const s = Math.sin(a.rot);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let lx = c * dx + s * dy;
  let ly = -s * dx + c * dy;
  if (Math.abs(lx) >= Math.abs(ly)) {
    lx = Math.sign(lx) * WELD_GAP;
    ly = 0;
  } else {
    ly = Math.sign(ly) * WELD_GAP;
    lx = 0;
  }
  b.x = a.x + c * lx - s * ly;
  b.y = a.y + s * lx + c * ly;
  const ma = 1 / a.invMass;
  const mb = 1 / b.invMass;
  const vx = (ma * a.vx + mb * b.vx) / (ma + mb);
  const vy = (ma * a.vy + mb * b.vy) / (ma + mb);
  a.vx = b.vx = vx;
  a.vy = b.vy = vy;
  a.av = b.av = (a.av + b.av) / 2;

  const joint = world.weld(a, b);
  welds.set(ta, { joint, partner: tb });
  welds.set(tb, { joint, partner: ta });
  burst((a.x + b.x) / 2, (a.y + b.y) / 2, ta.color, 10, 1.5);
  pop((a.x + b.x) / 2, Math.min(a.y, b.y) - 0.7, t("weld.stick"), ta.color, "display");
  play("snap");
  award("weld");
}

function unweld(tile, smash) {
  const w = welds.get(tile);
  if (!w) {
    return;
  }
  world.removeJoint(w.joint);
  welds.delete(tile);
  welds.delete(w.partner);
  tile.weldCooldown = clock + 1.5;
  w.partner.weldCooldown = clock + 1.5;
  if (!smash || !tile.body || !w.partner.body) {
    return;
  }
  const a = tile.body;
  const b = w.partner.body;
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = (b.x - a.x) / d;
  const ny = (b.y - a.y) / d;
  a.vx -= nx * 3;
  a.vy -= ny * 3 + 2;
  b.vx += nx * 3;
  b.vy += ny * 3 - 2;
  a.av -= 4;
  b.av += 4;
  burst((a.x + b.x) / 2, (a.y + b.y) / 2, "#ffffff", 16, 3);
  pop((a.x + b.x) / 2, Math.min(a.y, b.y) - 0.7, t("weld.break"), "#ffffff", "display");
  play("crack");
}

function onImpact(speed, a, b) {
  const ta = a.data;
  const tb = b.data;
  if (speed > BREAK_SPEED) {
    const welded = [ta, tb].find((tile) => tile && welds.has(tile));
    if (welded) {
      unweld(welded, true);
    }
  }
  const tile = ta ?? tb;
  if (tile && speed > 1.5) {
    play(MATERIALS[tile.colorKey].sound, Math.min(1, speed / 12), 0.05);
  }
}

// ---------- the hoop ----------

function score(tile) {
  const b = tile.body;
  const w = welds.get(tile);
  let label;
  let points;
  if (drag?.tile === tile || (w && drag?.tile === w.partner)) {
    label = "DUNK!";
    points = 2;
  } else if (tile.releasedAt !== null && clock - tile.releasedAt < 6) {
    const far = Math.abs(tile.releaseX - hoop.rimCenter) >= Math.max(3, widthM * 0.42);
    label = far ? "3PT!" : "NICE!";
    points = far ? 3 : 2;
    if (far) {
      award("three");
    }
  } else {
    label = "LUCKY!";
    points = 1;
  }
  tile.lastScoreAt = clock;
  if (w) {
    points *= 2;
    label = `${label} x2`;
    w.partner.lastScoreAt = clock;
  }
  hoop.add(points);
  if (hoop.best > store.get("hoopBest")) {
    store.set("hoopBest", hoop.best);
  }
  pop(hoop.rimCenter, hoop.rimY - 0.5, `${label} +${points}`, "#d8ff4f", "pixel");
  burst(hoop.rimCenter, hoop.rimY + 0.4, "#d8ff4f", 14, 2.5);
  play("swish");
  award("basket");
  if (b) {
    b.vx *= 0.6;
  }
}

// ---------- effects ----------

function pop(x, y, text, color, font) {
  pops.push({ x, y, text, color, font, life: 1.4, max: 1.4 });
  start();
}

function burst(x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.8);
    sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 0.5 + Math.random() * 0.4, color });
  }
  start();
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
  const size = scale * TILE * dpr;
  const pad = scale * 0.45 * dpr;
  img = document.createElement("canvas");
  img.width = img.height = Math.ceil(size + pad * 2);
  const g = img.getContext("2d");
  const c = img.width / 2;
  const line = Math.max(2, 3 * dpr);

  g.shadowColor = color;
  g.shadowBlur = 18 * dpr;
  g.fillStyle = "rgba(9, 7, 26, 0.94)";
  g.strokeStyle = color;
  g.lineWidth = line;
  g.beginPath();
  g.roundRect(c - size / 2 + line / 2, c - size / 2 + line / 2, size - line, size - line, size * 0.2);
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

function hexAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function drawTile(tile, x, y, rot) {
  const k = scale * dpr;
  const img = sprite(tile);
  const px = x * k;
  const py = y * k;
  const dist = floorY - y;
  if (dist < 2.2) {
    const fy = floorY * k;
    const grad = ctx.createRadialGradient(px, fy, 0, px, fy, 1.2 * k);
    grad.addColorStop(0, hexAlpha(tile.color, (1 - dist / 2.2) * 0.32));
    grad.addColorStop(1, hexAlpha(tile.color, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(px - 1.2 * k, fy - 0.5 * k, 2.4 * k, k);
  }
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(rot);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}

// A short glowing seam with two rivets where a welded pair touches.
function drawSeams(k) {
  const seen = new Set();
  for (const [tile, w] of welds) {
    if (seen.has(w.joint) || !tile.body || !w.partner.body) {
      continue;
    }
    seen.add(w.joint);
    const a = tile.body;
    const b = w.partner.body;
    const mx = ((a.x + b.x) / 2) * k;
    const my = ((a.y + b.y) / 2) * k;
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const px = -(b.y - a.y) / d;
    const py = (b.x - a.x) / d;
    const half = 0.32 * k;
    ctx.save();
    ctx.shadowColor = tile.color;
    ctx.shadowBlur = 12 * dpr;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(2, 0.05 * k);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(mx - px * half, my - py * half);
    ctx.lineTo(mx + px * half, my + py * half);
    ctx.stroke();
    ctx.fillStyle = tile.color;
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(mx + px * half * sgn, my + py * half * sgn, 0.06 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function displayFont(sizePx) {
  const family = currentLang() === "zh" ? '"Asobo QingKe", "Asobo Dela"' : '"Asobo Dela"';
  return `${Math.round(sizePx)}px ${family}, sans-serif`;
}

function draw() {
  const k = scale * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  hoop.drawBack(ctx, k, PIXEL_FONT);

  for (const tile of order) {
    if (tile.body) {
      drawTile(tile, tile.body.x, tile.body.y, tile.body.rot);
    } else if (flights.has(tile) && flights.get(tile).t > 0) {
      const p = flightPose(flights.get(tile));
      drawTile(tile, p.x, p.y, p.rot);
    }
  }
  drawSeams(k);
  hoop.drawFront(ctx, k);

  for (const s of sparks) {
    ctx.globalAlpha = Math.min(1, s.life * 2);
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x * k - 2 * dpr, s.y * k - 2 * dpr, 4 * dpr, 4 * dpr);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const p of pops) {
    const age = p.max - p.life;
    ctx.globalAlpha = Math.min(1, p.life * 1.5);
    ctx.font = p.font === "pixel" ? `${Math.round(0.34 * k)}px ${PIXEL_FONT}` : displayFont(0.32 * k);
    ctx.lineWidth = 4 * dpr;
    ctx.strokeStyle = "rgba(5, 4, 14, 0.85)";
    const y = (p.y - age * 0.6) * k;
    const x = Math.min(Math.max(p.x * k, 1.2 * k), (widthM - 1.2) * k);
    ctx.strokeText(p.text, x, y);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, x, y);
  }
  ctx.globalAlpha = 1;
}

// ---------- simulation loop ----------

function busy() {
  return Boolean(drag) || flights.size > 0 || pops.length > 0 || sparks.length > 0 || hoop.animating();
}

function start() {
  restTime = 0;
  if (!raf && visible) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
}

function frame(now) {
  raf = 0;
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;
  clock += dt;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    for (const tile of order) {
      if (tile.body) {
        tile.body.prevY = tile.body.y;
      }
    }
    world.step(STEP);
    for (const tile of order) {
      const b = tile.body;
      if (b && hoop.passed(b, b.prevY, clock)) {
        score(tile);
      }
    }
    tryWeld();
    acc -= STEP;
    steps += 1;
  }
  if (steps === 5) {
    acc = 0;
  }
  // The held block trails the pointer, so the slot under it is re-checked every frame.
  updateSnap();

  for (const [tile, f] of [...flights]) {
    f.t += dt;
    if (f.t >= f.dur) {
      flights.delete(tile);
      forget(tile);
      f.done();
    }
  }
  for (const tile of order) {
    const b = tile.body;
    if (b && b.y > floorY + 3) {
      // Tunnelled through the floor after a wild throw: put it back on the sidewalk.
      b.y = floorY - 2;
      b.vy = 0;
    }
  }
  hoop.step(dt);
  for (const s of sparks) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vy += 6 * dt;
    s.life -= dt;
  }
  for (const p of pops) {
    p.life -= dt;
  }
  removeDead(sparks);
  removeDead(pops);
  draw();

  checkTimer += dt;
  if (checkTimer > 0.5) {
    checkTimer = 0;
    checkShapes();
  }

  const moving = order.some((tile) => {
    const b = tile.body;
    return b && (Math.hypot(b.vx, b.vy) > 0.05 || Math.abs(b.av) > 0.05);
  });
  restTime = moving || busy() ? 0 : restTime + dt;
  // Everything has settled: stop drawing until the next touch, throw or falling tile.
  if (visible && (order.length > 0 || busy()) && restTime < 1) {
    raf = requestAnimationFrame(frame);
  }
}

function removeDead(list) {
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].life <= 0) {
      list.splice(i, 1);
    }
  }
}

// ---------- shapes on the sidewalk ----------

function halfHeight(b) {
  return (Math.abs(Math.sin(b.rot)) * b.w + Math.abs(Math.cos(b.rot)) * b.h) / 2;
}

function checkShapes() {
  const bodies = order.filter((tile) => tile.body).map((tile) => tile.body);
  if (!bodies.length || drag) {
    return;
  }
  if (!bodies.every((b) => Math.hypot(b.vx, b.vy) < 0.25 && Math.abs(b.av) < 0.4)) {
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
  for (let i = order.length - 1; i >= 0; i--) {
    const b = order[i].body;
    if (b && b.contains(p.x, p.y)) {
      return order[i];
    }
  }
  return null;
}

function updateSnap() {
  const b = drag?.tile.body;
  const next = b ? hooks.slotNear(b.x, b.y, SNAP_RADIUS) : null;
  if (next !== snapSlot) {
    snapSlot = next;
    hooks.highlight(next);
  }
}

function release(byUser) {
  if (!drag) {
    return;
  }
  const { tile, joint } = drag;
  world.removeJoint(joint);
  street.classList.remove("grabbing");
  drag = null;
  const slot = snapSlot;
  snapSlot = null;
  hooks.highlight(null);
  setTimeout(() => {
    suppressClick = false;
  }, 300);
  if (!byUser || !tile.body) {
    return;
  }
  const w = welds.get(tile);
  for (const t2 of w ? [tile, w.partner] : [tile]) {
    t2.releasedAt = clock;
    t2.releaseX = tile.body.x;
  }
  if (slot) {
    hooks.dropOnSlot(tile, slot);
  } else {
    hooks.thrown();
  }
}

function onPointerDown(e) {
  if (e.pointerType === "mouse" && e.button !== 0) {
    return;
  }
  const tile = order.length ? pick(toWorld(e)) : null;
  if (!tile) {
    suppressClick = false;
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  suppressClick = true;
  if (drag) {
    release(false);
  }
  bringToFront(tile);
  const material = MATERIALS[tile.colorKey];
  const partner = welds.get(tile)?.partner;
  const carried = 1 / tile.body.invMass + (partner ? 1 / partner.body.invMass : 0);
  const p = toWorld(e);
  const joint = new MouseJoint(tile.body, p.x, p.y, {
    hz: material.grabHz,
    damping: 0.75,
    maxForce: 600 * carried * tile.body.invMass
  });
  world.joints.add(joint);
  drag = { id: e.pointerId, tile, joint };
  try {
    street.setPointerCapture(e.pointerId);
  } catch {
    // Synthetic or already-released pointers cannot be captured; dragging still works.
  }
  street.classList.add("grabbing");
  // Name the material the first time a block is picked up, and again after a while.
  if (!(clock - (tile.labelAt ?? -Infinity) < 8)) {
    tile.labelAt = clock;
    pop(tile.body.x, tile.body.y - 0.85, t(`mat.${material.id}`), tile.color, "display");
  }
  start();
}

function onPointerMove(e) {
  if (drag && e.pointerId === drag.id) {
    const p = toWorld(e);
    drag.joint.setTarget(p.x, p.y);
    start();
  } else if (e.pointerType === "mouse" && order.length) {
    street.style.cursor = pick(toWorld(e)) ? "grab" : "";
  }
}

function onPointerUp(e) {
  if (drag && e.pointerId === drag.id) {
    release(true);
  }
}

// ---------- setup ----------

export function initToybox(signHooks) {
  hooks = signHooks;
  hoop.best = store.get("hoopBest");
  world.onImpact = onImpact;

  street.addEventListener("pointerdown", onPointerDown, { capture: true });
  street.addEventListener("pointermove", onPointerMove);
  street.addEventListener("pointerup", onPointerUp);
  street.addEventListener("pointercancel", onPointerUp);
  street.addEventListener(
    "touchstart",
    (e) => {
      if (order.length && e.touches.length === 1 && pick(toWorld(e.touches[0]))) {
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

  new ResizeObserver(() => measure()).observe(street);
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible) {
      start();
    }
  }).observe(street);
  document.fonts?.ready.then(() => {
    sprites.clear();
    draw();
  });
  measure();
}
