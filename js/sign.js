// The neon signboard. Tiles light up on load; tapping one loosens it, then it hangs from one
// screw, then it falls onto the sidewalk and becomes a block in the toy box (js/toybox.js).
// After a few tiles fall the whole sign gives out. A block dropped on any empty slot is mounted
// there, so the sign can spell other words. "Repair" sends every tile back to its own slot.

import { play } from "./sound.js";
import { award, toast } from "./stamps.js";
import { t } from "./i18n.js";
import { store } from "./store.js";
import { revealCoin, hideCoin } from "./coins.js";
import {
  initToybox,
  spawn,
  removeBody,
  fly,
  cancelFly,
  cancelDrag,
  rectCenter,
  refreshSprites as refreshToybox
} from "./toybox.js";

const street = document.getElementById("street");
const repairBtn = document.getElementById("repair");
const hint = document.getElementById("hint");
const openSign = document.getElementById("open-sign");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

const COLORS = {
  pink: "#ff4fa3",
  cyan: "#3ef0ff",
  acid: "#d8ff4f",
  orange: "#ff7a3d",
  gold: "#ffd166"
};
const CASCADE_AT = 3;
// Words the eight tiles can spell, longest first. Meanings live in js/strings.js ("word.<kana>").
const WORDS = ["なんぼ", "あんな", "そんな", "みそ", "なみ", "あみ", "そぼ", "ぼん", "あん", "みな", "なん"];
const WORD_STAMP_AT = 3;

const slots = [...document.querySelectorAll("#sign .slot")].map((el, index) => ({
  el,
  index,
  tile: null,
  pending: null
}));

const tiles = slots.map((slot, i) => {
  const el = slot.el.querySelector(".tile");
  const colorKey = Object.keys(COLORS).find((c) => el.classList.contains(`c-${c}`)) ?? "pink";
  const tile = {
    i,
    home: slot,
    slot,
    el,
    colorKey,
    color: COLORS[colorKey],
    dot: el.classList.contains("dot"),
    label: el.textContent.trim(),
    flaky: el.classList.contains("flaky"),
    hits: 0,
    state: "lit",
    tilt: 0,
    pivot: [0.5, 0.08],
    body: null
  };
  slot.tile = tile;
  return tile;
});

const coinSlot = slots.find((slot) => slot.el.querySelector('[data-coin="sign"]'));

let cascading = false;
let cascadeRun = 0;
let thrownOnce = false;

function setHintKey(key) {
  if (hint.dataset.i18n !== key) {
    hint.dataset.i18n = key;
    hint.textContent = t(key);
  }
}

function setOpenSignKey(key) {
  openSign.dataset.i18n = key;
  openSign.textContent = t(key);
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

function restartAnimation(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function hit(tile) {
  if (!tile.slot || tile.state === "fallen" || tile.state === "flying" || cascading) {
    return;
  }
  const slotEl = tile.slot.el;
  tile.hits += 1;
  if (hint.dataset.i18n === "hero.hint") {
    hint.style.opacity = "0.5";
  }
  if (tile.hits === 1) {
    tile.state = "loose";
    tile.tilt = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 3);
    tile.pivot = [0.5, 0.08];
    slotEl.style.setProperty("--loose", `${tile.tilt}deg`);
    tile.el.style.setProperty("--pivot", "50% 8%");
    slotEl.classList.add("loose");
    restartAnimation(tile.el, "jolt");
    flicker(tile);
    play("buzz");
  } else if (tile.hits === 2) {
    tile.state = "hang";
    const fromLeft = tile.tilt >= 0;
    tile.tilt = fromLeft ? 34 : -34;
    tile.pivot = fromLeft ? [0.1, 0.1] : [0.9, 0.1];
    tile.el.style.setProperty("--pivot", fromLeft ? "10% 10%" : "90% 10%");
    slotEl.style.setProperty("--hang", `${tile.tilt}deg`);
    slotEl.classList.remove("loose");
    slotEl.classList.add("hang");
    play("clank");
  } else {
    drop(tile, true);
  }
}

function unmount(tile) {
  const slot = tile.slot;
  slot.tile = null;
  slot.el.classList.remove("loose", "hang");
  slot.el.classList.add("empty");
  tile.el.hidden = true;
  tile.el.classList.remove("jolt", "cheer");
  tile.slot = null;
}

function drop(tile, pushed) {
  const street0 = street.getBoundingClientRect();
  const r = tile.slot.el.getBoundingClientRect();
  const size = r.width;
  const theta = ((tile.state === "lit" ? 0 : tile.tilt) * Math.PI) / 180;
  const px = tile.pivot[0] * size;
  const py = tile.pivot[1] * size;
  const ox = size / 2 - px;
  const oy = size / 2 - py;
  const cx = r.left - street0.left + px + Math.cos(theta) * ox - Math.sin(theta) * oy;
  const cy = r.top - street0.top + py + Math.sin(theta) * ox + Math.cos(theta) * oy;

  unmount(tile);
  tile.state = "fallen";
  tile.hits = 0;
  spawn(tile, {
    x: cx / size,
    y: cy / size,
    rot: theta,
    vx: (Math.random() - 0.5) * (pushed ? 2 : 1),
    vy: pushed ? -1.5 : 0,
    av: (Math.random() - 0.5) * 3
  });

  play("clank");
  award("knock");
  const fallen = tiles.filter((x) => x.state === "fallen").length;
  if (fallen === tiles.length) {
    award("blackout");
  } else if (pushed && fallen >= CASCADE_AT && !cascading) {
    cascade();
  }
  afterChange();
}

function cascade() {
  cascading = true;
  const run = ++cascadeRun;
  const rest = tiles.filter((tile) => tile.slot);
  play("powerdown");
  for (const tile of rest) {
    flicker(tile, 4);
  }
  setTimeout(() => {
    if (run !== cascadeRun) {
      return;
    }
    rest.forEach((tile, k) => {
      setTimeout(() => {
        if (run !== cascadeRun) {
          return;
        }
        if (tile.slot && tile.state !== "flying") {
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
  }, reduceMotion.matches ? 0 : 700);
}

// ---------- putting tiles back ----------

function slotNear(x, y, radius) {
  let best = null;
  let bestD = radius;
  for (const slot of slots) {
    if (slot.tile || slot.pending) {
      continue;
    }
    const c = rectCenter(slot.el);
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < bestD) {
      best = slot;
      bestD = d;
    }
  }
  return best;
}

function highlight(slot) {
  for (const s of slots) {
    s.el.classList.toggle("target", s === slot);
  }
}

function sendToSlot(tile, slot, from, delay = 0, quiet = false) {
  slot.pending = tile;
  tile.state = "flying";
  fly(tile, from, rectCenter(slot.el), () => mount(tile, slot, quiet), delay);
}

function dropOnSlot(tile, slot) {
  const from = removeBody(tile);
  if (from) {
    play("pop");
    sendToSlot(tile, slot, from);
    afterChange();
  }
}

function mount(tile, slot, quiet) {
  slot.pending = null;
  slot.tile = tile;
  tile.slot = slot;
  slot.el.prepend(tile.el);
  slot.el.classList.remove("empty", "target", "loose", "hang");
  tile.el.hidden = false;
  tile.state = "lit";
  tile.hits = 0;
  tile.el.classList.add("lit");
  restartAnimation(tile.el, "relight");
  if (!quiet) {
    play("snap");
    findWords();
  }
  afterChange();
}

function repair() {
  cascadeRun += 1;
  cascading = false;
  cancelDrag();
  const moving = [];
  for (const tile of tiles) {
    if (tile.state === "fallen") {
      moving.push([tile, removeBody(tile)]);
    } else if (tile.state === "flying") {
      for (const slot of slots) {
        if (slot.pending === tile) {
          slot.pending = null;
        }
      }
      moving.push([tile, cancelFly(tile)]);
    } else if (tile.slot !== tile.home) {
      const from = { ...rectCenter(tile.slot.el), rot: 0 };
      unmount(tile);
      moving.push([tile, from]);
    } else {
      tile.state = "lit";
      tile.hits = 0;
      tile.slot.el.classList.remove("loose", "hang");
      tile.el.classList.add("lit");
    }
  }
  if (!moving.length) {
    return;
  }
  play("powerup");
  moving.forEach(([tile, from], k) => sendToSlot(tile, tile.home, from, k * 0.06, true));
  award("repair");
  afterChange();
}

// ---------- spelling ----------

function findWords() {
  const rows = [slots.slice(0, 4), slots.slice(4)];
  const known = new Set(store.get("words"));
  for (const row of rows) {
    const text = row.map((slot) => (slot.tile ? slot.tile.label : " ")).join("");
    const covered = new Set();
    for (const word of WORDS) {
      for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + 1)) {
        const cells = row.slice(at, at + word.length);
        // A word only counts when the player moved at least one of its tiles there, and a
        // shorter word inside a longer one found in the same row is not counted again.
        const moved = cells.some((slot) => slot.tile.home !== slot);
        if (!moved || cells.every((slot) => covered.has(slot))) {
          continue;
        }
        for (const slot of cells) {
          covered.add(slot);
          restartAnimation(slot.tile.el, "cheer");
        }
        if (!known.has(word)) {
          known.add(word);
          store.update("words", (list) => [...list, word]);
          toast(t("word.found", { word }), t(`word.${word}`), t("stamp.word.glyph"));
          play("word");
        }
      }
    }
  }
  if (known.size >= WORD_STAMP_AT) {
    award("word");
  }
  const all = slots.map((slot) => (slot.tile ? slot.tile.label : "")).join("").replaceAll("。", "");
  if (all.includes("みんなあそぼ")) {
    award("anagram");
  }
}

// ---------- shared state after any change ----------

function afterChange() {
  const mounted = tiles.filter((tile) => tile.slot).length;
  const fallen = tiles.some((tile) => tile.state === "fallen");
  const flying = tiles.some((tile) => tile.state === "flying");
  const dark = mounted === 0 && !flying;
  street.classList.toggle("blackout", dark);
  setOpenSignKey(dark ? "hero.blackout" : "hero.open");

  const intact = tiles.every((tile) => tile.slot === tile.home && tile.state === "lit");
  repairBtn.hidden = intact;
  if (fallen) {
    setHintKey(thrownOnce ? "hero.putback" : "hero.drag");
    hint.style.opacity = "";
  } else if (intact) {
    setHintKey("hero.hint");
  }

  if (coinSlot.tile || coinSlot.pending) {
    hideCoin("sign");
  } else {
    revealCoin("sign");
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
  const order = [...tiles].sort(() => Math.random() - 0.5);
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
  initToybox({
    tileSize: () => slots[0].el.getBoundingClientRect().width,
    slotNear,
    highlight,
    dropOnSlot,
    thrown() {
      if (!thrownOnce) {
        thrownOnce = true;
        afterChange();
      }
    }
  });
  powerOn();
}

// Called when the regular (gold) look switches on so falling blocks match the sign.
export function refreshSprites() {
  refreshToybox();
}
