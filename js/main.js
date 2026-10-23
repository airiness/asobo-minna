// Entry point: wires language, sound, progress and every toy on the page.

import { store } from "./store.js";
import { applyLang, currentLang, detectLang, t, onLangChange } from "./i18n.js";
import { play, setSoundEnabled } from "./sound.js";
import { initStamps, award, toast } from "./stamps.js";
import { initCoins } from "./coins.js";
import { initSign, refreshSprites } from "./sign.js";
import { initCabinets } from "./cabinets.js";
import { initVending } from "./vending.js";
import { initKonami } from "./konami.js";

const langBtn = document.getElementById("lang-toggle");
const soundBtn = document.getElementById("sound-toggle");

function syncLangButton() {
  langBtn.textContent = t("hud.lang");
  langBtn.setAttribute("aria-label", t("hud.langAria"));
  langBtn.lang = currentLang() === "ja" ? "zh-Hans" : "ja";
}

function syncSoundButton() {
  const on = store.get("sound");
  soundBtn.setAttribute("aria-pressed", String(on));
  soundBtn.setAttribute("aria-label", t(on ? "hud.soundOn" : "hud.soundOff"));
}

function initHud() {
  langBtn.addEventListener("click", () => {
    const next = currentLang() === "ja" ? "zh" : "ja";
    store.set("lang", next);
    applyLang(next);
    play("blip");
  });
  soundBtn.addEventListener("click", () => {
    const on = !store.get("sound");
    store.set("sound", on);
    setSoundEnabled(on);
    syncSoundButton();
    play("coin");
  });
  onLangChange(() => {
    syncLangButton();
    syncSoundButton();
  });
}

function rainbow() {
  const root = document.documentElement;
  root.classList.add("rainbow");
  play("jingle");
  toast(t("konami.toast"), "↑↑↓↓←→←→BA");
  award("konami");
  clearTimeout(rainbow.timer);
  rainbow.timer = setTimeout(() => root.classList.remove("rainbow"), 12000);
}

function main() {
  setSoundEnabled(false);
  initHud();
  initStamps();
  initCoins();
  initSign();
  initCabinets();
  initVending();
  initKonami(rainbow);

  applyLang(detectLang(store.get("lang")));

  // The browser only allows audio after a gesture; remembered "sound on" resumes on the first tap.
  if (store.get("sound")) {
    const resume = () => setSoundEnabled(true);
    window.addEventListener("pointerdown", resume, { once: true, capture: true });
    window.addEventListener("keydown", resume, { once: true, capture: true });
  }

  const hour = new Date().getHours();
  if (hour < 4) {
    award("midnight");
  }

  new MutationObserver(() => refreshSprites()).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"]
  });
}

main();
