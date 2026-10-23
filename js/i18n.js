// Japanese / Simplified Chinese switching. Japanese text written in index.html is captured at
// startup so the markup stays the single source for static Japanese copy.

import { STRINGS } from "./strings.js";

const listeners = new Set();
const captured = { ja: {}, zh: {} };
let lang = "ja";

function capture() {
  for (const el of document.querySelectorAll("[data-i18n]")) {
    captured.ja[el.dataset.i18n] ??= el.textContent.trim();
  }
  for (const el of document.querySelectorAll("[data-i18n-aria]")) {
    captured.ja[el.dataset.i18nAria] ??= el.getAttribute("aria-label") ?? "";
  }
}

export function t(key, vars) {
  let text = STRINGS[lang]?.[key] ?? STRINGS.ja[key] ?? captured.ja[key] ?? "";
  if (vars) {
    text = text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
  }
  return text;
}

export function currentLang() {
  return lang;
}

export function onLangChange(fn) {
  listeners.add(fn);
}

export function detectLang(saved) {
  if (saved === "ja" || saved === "zh") {
    return saved;
  }
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language || "ja"];
  for (const pref of prefs) {
    const p = pref.toLowerCase();
    if (p.startsWith("ja")) {
      return "ja";
    }
    if (p.startsWith("zh")) {
      return "zh";
    }
  }
  return "ja";
}

export function applyLang(next) {
  lang = next === "zh" ? "zh" : "ja";
  document.documentElement.lang = lang === "zh" ? "zh-Hans" : "ja";
  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of document.querySelectorAll("[data-i18n-aria]")) {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  }
  document.title = t("meta.title");
  document.querySelector('meta[name="description"]')?.setAttribute("content", t("meta.desc"));
  for (const fn of listeners) {
    fn(lang);
  }
}

capture();
