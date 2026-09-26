# あそぼ.みんな

Small web games at **[あそぼ.みんな](https://あそぼ.みんな/)**.

This repository is the lightweight static portal for the game collection. Individual games live in their own repositories and are routed through subdomains.

## Current routes

- `あそぼ.みんな` — game portal (this repository)
- `coop.あそぼ.みんな` — 星核守卫 / game-coop-defense

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
