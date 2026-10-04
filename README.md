# あそぼ.みんな

Small web games at **[あそぼ.みんな](https://あそぼ.みんな/)**.

This repository is the lightweight static portal for the game collection. Individual games live in their own repositories and are routed through subdomains.

## Current routes

- `あそぼ.みんな` — game portal (this repository)
- `coop.あそぼ.みんな` — スターコア・ガーディアン / game-coop-defense
- `box.あそぼ.みんな` — 星くずボックス / game-blind-box

スターコア・ガーディアン supports solo play, same-screen co-op on one device, and private online rooms for two devices. Choose 「友だちと遊ぶ」, create a room, and invite a friend by QR code, link, or six-character room code. No account or shared Wi-Fi is required. Solo and same-screen games remain local; online rooms use the game's own server. Japanese is the default language.

## Stack

Plain HTML + CSS. No build step, runtime, framework, or package manager is required.

## Deployment

The production site is served directly by Caddy on the VPS.

```caddy
あそぼ.みんな {
    root * /var/www/asobo-minna
    file_server
}
```

A simple deployment can clone or pull this repository into `/var/www/asobo-minna`.
