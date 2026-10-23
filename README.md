# あそぼ.みんな

Small web games at **[あそぼ.みんな](https://あそぼ.みんな/)**.

This repository is the static portal for the game collection: a small night arcade. Individual
games live in their own repositories and are routed through subdomains.

## Current routes

- `あそぼ.みんな` — game portal (this repository)
- `coop.あそぼ.みんな` — スターコア・ガーディアン / game-coop-defense
- `box.あそぼ.みんな` — 星くずボックス / game-blind-box

## What is on the page

- **Neon sign.** Each character of あそぼ。みんな。 is a neon tile. Tapping a tile loosens it,
  then it hangs from one screw, then it falls onto the sidewalk. After three tiles fall the
  whole sign gives out. "Repair" sends every tile back to its own slot.
- **Sidewalk toy box** (`js/toybox.js`, `js/physics.js`). Fallen tiles are physical blocks that
  can be dragged, thrown and stacked. Each color is a material (`js/materials.js`): pink is
  bouncy, cyan slides like ice, acid green floats, orange is heavy, gold is hard metal.
  Same-colored blocks stick together when they touch and split apart when slammed hard.
- **Hoop** (`js/hoop.js`). Blocks thrown through the rim score: dunks, long-range 3-pointers and
  doubled points for a stuck-together pair. The best score is remembered.
- **Spelling.** A block dropped on an empty slot of the signboard is mounted there, so the sign
  can spell other words (なみ, そんな, なんぼ…); each new word shows its meaning.
- **Game floor.** One cabinet per game with an attract-mode demo drawn in code
  (`js/attract.js`). The stick and A/B buttons nudge the demo. The play button inserts a coin
  and then opens the game. The covered cabinet is the next game slot.
- **Lounge.** A vending machine with a 7777 lottery and two drinks that only drop by mistake,
  and a stamp card with sixteen achievements.
- **Japanese and Simplified Chinese.** The top bar switches language. Japanese is the default
  unless the browser prefers Chinese.
- **Sound** is synthesized with Web Audio and off until the visitor turns it on.

Progress (credits, stamps, drinks, coins, words, best hoop score, language and sound) stays in
the visitor's `localStorage` only. Without JavaScript the page is still a working list of game
links.

## Stack

Plain HTML, CSS and JavaScript modules. No build step, runtime, framework or package manager is
needed to serve the site: every file in the repository is served as it is.

```text
index.html            page markup; static Japanese copy lives here
styles.css            all styles
js/main.js            entry point
js/strings.js         Japanese strings used only in script, and all Chinese strings
js/sign.js            neon sign: tapping, falling, putting tiles back, spelling
js/toybox.js          sidewalk physics playground: dragging, welding, drawing
js/hoop.js            basketball hoop and scoring
js/materials.js       per-color block materials
js/physics.js         2D box physics (Box2D-Lite port with restitution and a weld joint)
js/attract.js         cabinet demos
js/cabinets.js        cabinet controls and the play button
js/vending.js         vending machine
js/stamps.js          stamp card and toasts
js/coins.js           hidden coins
js/konami.js          hidden command
js/i18n.js, js/sound.js, js/store.js
fonts/                font subsets and their licenses
404.html              not-found page (needs the Caddy `handle_errors` block below)
og.png, favicon.*, apple-touch-icon.png
tools/                maintenance helpers, not used by the page
```

## Adding a game

1. Copy a `<article class="cabinet">` block in `index.html`, set `data-game`, the link, the
   marquee title and the copy, and use new `data-i18n` keys.
2. Add the Chinese strings for those keys to `js/strings.js` (`zh`).
3. Optionally add a demo for the new `data-demo` value in `js/attract.js`; unknown values fall
   back to a "NOW LOADING" screen.
4. Update the "稼働中" count, then run `python tools/fetch-fonts.py` so the display fonts include
   any new characters.

## Fonts

Display fonts are subsets fetched from Google Fonts and served from this repository, so the page
makes no third-party requests. After changing copy in `index.html` or `js/strings.js`, run:

```bash
python tools/fetch-fonts.py
```

It needs only the Python standard library. Licenses are listed in `THIRD_PARTY_NOTICES.md`.

The share image and icons are drawn by `tools/render-images.html`; open it from a local server at
the repository root to save new copies.

## Local preview

Serve the repository root with any static server, for example:

```bash
python -m http.server 8000
```

## Deployment

The production site is served directly by Caddy on the VPS from a checkout of this repository at
`/var/www/asobo-minna`; `scripts/deploy-asobo.sh` in gglab-infra runs `git pull --ff-only`, and
the new files are live immediately.

```caddy
あそぼ.みんな {
    root * /var/www/asobo-minna
    file_server
}
```

The full block lives in gglab-infra at `caddy/asobo-minna.caddy`. Because the web root is a Git
checkout, it must hide dotfiles so the `.git` directory is never served; it also revalidates files
on each visit so a deploy shows up at once (the JavaScript modules have stable names), and serves
`404.html` with a real 404 status:

```caddy
あそぼ.みんな {
    root * /var/www/asobo-minna
    encode zstd gzip
    header Cache-Control "no-cache"
    file_server {
        hide .*
    }

    handle_errors {
        @not_found expression {err.status_code} == 404
        handle @not_found {
            root * /var/www/asobo-minna
            rewrite * /404.html
            file_server
        }
    }
}
```
