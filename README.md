# あそぼ.みんな

Small web games at **[あそぼ.みんな](https://あそぼ.みんな/)**.

This repository is the lightweight static portal for the game collection. Individual games live in their own repositories and are routed through subdomains.

## Current routes

- `あそぼ.みんな` — game portal (this repository)
- `coop.あそぼ.みんな` — スターコア・ガーディアン / game-coop-defense
- `box.あそぼ.みんな` — 星くずボックス / game-blind-box

スターコア・ガーディアン runs locally in each visitor's browser. It supports solo play and same-screen co-op on one device (keyboard + gamepad, or two gamepads). Separate pages have independent games; there is no online or LAN matchmaking. Japanese is the default game language.

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
