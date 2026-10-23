// The lounge vending machine: six buttons, two drinks that only drop "by mistake", a 4-digit
// lottery that pays out on 7777, and a coin that rolled underneath.

import { store } from "./store.js";
import { t, onLangChange } from "./i18n.js";
import { play } from "./sound.js";
import { award } from "./stamps.js";
import { revealCoin } from "./coins.js";

const DRINKS = [
  { can: "#7ec8ff", band: "#ffd7e8", hot: false },
  { can: "#20231f", band: "#d8ff4f", hot: false },
  { can: "#bfefff", band: "#3a7bd5", hot: false },
  { can: "#2fbf71", band: "#e9ffe0", hot: false },
  { can: "#6b3e26", band: "#ffd166", hot: true },
  { can: "#8a3b4a", band: "#f5e1c8", hot: true },
  { can: "#1a1a26", band: "#8a8aa0", hot: false },
  { can: "#d8343f", band: "#ffffff", hot: false }
];
const ON_SALE = 6;
const WRONG_CHANCE = 0.3;
const WIN_CHANCE = 1 / 8;

const windowEl = document.getElementById("vm-window");
const roulette = document.getElementById("vm-roulette");
const canBtn = document.getElementById("vm-can");
const under = document.getElementById("vm-under");
const result = document.getElementById("vm-result");
const nameEl = document.getElementById("vm-result-name");
const flavorEl = document.getElementById("vm-result-flavor");
const countEl = document.getElementById("vm-result-count");

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
let busy = false;
let lastResult = null;

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function buildButtons() {
  for (let i = 0; i < ON_SALE; i++) {
    const d = DRINKS[i];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "vm-item";
    btn.dataset.drink = String(i);

    const can = document.createElement("span");
    can.className = "can";
    can.style.setProperty("--can", d.can);
    can.style.setProperty("--band", d.band);

    const price = document.createElement("span");
    price.className = "vm-price px";
    price.textContent = "100";

    const temp = document.createElement("span");
    temp.className = `vm-temp${d.hot ? " hot" : ""}`;
    temp.dataset.i18n = d.hot ? "vm.hot" : "vm.cold";
    temp.textContent = t(temp.dataset.i18n);

    const light = document.createElement("span");
    light.className = "vm-light";

    btn.append(can, price, temp, light);
    windowEl.append(btn);
  }
}

function renderResult() {
  const owned = store.get("drinks");
  if (!lastResult) {
    return;
  }
  const { drink, wrong, win } = lastResult;
  result.classList.toggle("atari", win);
  nameEl.removeAttribute("data-i18n");
  nameEl.textContent = win ? t("vm.atari") : t(`drink.${drink}.name`);
  flavorEl.textContent = wrong && !win
    ? `${t("vm.wrong")} ${t(`drink.${drink}.name`)}：${t(`drink.${drink}.flavor`)}`
    : t(`drink.${drink}.flavor`);
  countEl.textContent = t("vm.collection", { n: owned.length, total: DRINKS.length });
}

function giveDrink(index) {
  const d = DRINKS[index];
  canBtn.hidden = false;
  canBtn.style.setProperty("--can", d.can);
  canBtn.style.setProperty("--band", d.band);
  canBtn.setAttribute("aria-label", t(`drink.${index}.name`));
  canBtn.classList.remove("fizz");
  canBtn.style.animation = "none";
  void canBtn.offsetWidth;
  canBtn.style.animation = "";
  if (!store.get("drinks").includes(index)) {
    store.update("drinks", (list) => [...list, index]);
  }
  if (store.get("drinks").length === DRINKS.length) {
    award("drinks");
  }
}

function spinRoulette(done) {
  const win = Math.random() < WIN_CHANCE;
  let final;
  if (win) {
    final = "7777";
  } else if (Math.random() < 0.35) {
    final = `777${Math.floor(Math.random() * 7)}`;
  } else {
    final = String(Math.floor(Math.random() * 10000)).padStart(4, "0").replace("7777", "7776");
  }
  roulette.classList.remove("win");
  const ticks = reduceMotion.matches ? 0 : 14;
  let n = 0;
  const id = setInterval(() => {
    if (n >= ticks) {
      clearInterval(id);
      roulette.textContent = final;
      if (win) {
        roulette.classList.add("win");
      }
      done(win, final);
      return;
    }
    // Reveal digits left to right during the last ticks, like the real thing.
    const fixed = Math.max(0, n - (ticks - 4));
    let digits = final.slice(0, fixed);
    while (digits.length < 4) {
      digits += Math.floor(Math.random() * 10);
    }
    roulette.textContent = digits;
    play("tick");
    n += 1;
  }, 80);
}

function press(btn) {
  if (busy) {
    return;
  }
  busy = true;
  const chosen = Number(btn.dataset.drink);
  btn.classList.add("pressed");
  play("blip");

  let drink = chosen;
  let wrong = false;
  if (Math.random() < WRONG_CHANCE) {
    wrong = true;
    const owned = store.get("drinks");
    const secrets = [6, 7].filter((i) => !owned.includes(i));
    drink = secrets.length && Math.random() < 0.6
      ? pick(secrets)
      : pick(DRINKS.map((_, i) => i).filter((i) => i !== chosen));
  }

  setTimeout(() => {
    btn.classList.remove("pressed");
    play("gacon");
    giveDrink(drink);
    lastResult = { drink, wrong, win: false };
    renderResult();
    spinRoulette((win) => {
      if (win) {
        play("win");
        award("atari");
        store.addCredits(1);
        const bonus = pick(DRINKS.map((_, i) => i));
        setTimeout(() => {
          play("gacon");
          giveDrink(bonus);
          lastResult = { drink: bonus, wrong: false, win: true };
          renderResult();
        }, 500);
      }
      busy = false;
    });
  }, reduceMotion.matches ? 0 : 260);
}

export function initVending() {
  buildButtons();
  windowEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".vm-item");
    if (btn) {
      press(btn);
    }
  });
  canBtn.addEventListener("click", () => {
    play("fizz");
    canBtn.classList.add("fizz");
    flavorEl.textContent = `${t("vm.open")}！ ${flavorEl.textContent}`;
    setTimeout(() => {
      canBtn.hidden = true;
    }, 500);
  });
  under.addEventListener("click", () => {
    if (!store.get("coins").includes("vending")) {
      under.classList.add("found");
      revealCoin("vending");
      play("pop");
    } else {
      play("blip");
    }
  });
  if (store.get("coins").includes("vending")) {
    under.classList.add("found");
  }
  onLangChange(renderResult);
}
