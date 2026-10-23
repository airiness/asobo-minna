// Coins hidden around the shop: behind a sign tile, under the vending machine and inside the
// covered cabinet. Each one is worth a credit and can be picked up once per visitor.

import { store } from "./store.js";
import { t } from "./i18n.js";
import { play } from "./sound.js";
import { award, toast } from "./stamps.js";

const COIN_IDS = ["sign", "vending", "soon"];
const buttons = new Map();

function collected(id) {
  return store.get("coins").includes(id);
}

export function revealCoin(id) {
  const btn = buttons.get(id);
  if (btn && !collected(id)) {
    btn.hidden = false;
  }
}

export function hideCoin(id) {
  const btn = buttons.get(id);
  if (btn) {
    btn.hidden = true;
  }
}

function collect(id) {
  if (collected(id)) {
    return;
  }
  store.update("coins", (list) => [...list, id]);
  store.addCredits(1);
  hideCoin(id);
  play("coin");
  toast(t("coin.found"));
  if (COIN_IDS.every(collected)) {
    award("coins");
  }
}

export function initCoins() {
  for (const btn of document.querySelectorAll("button.coin[data-coin]")) {
    const id = btn.dataset.coin;
    buttons.set(id, btn);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      collect(id);
    });
  }
}
