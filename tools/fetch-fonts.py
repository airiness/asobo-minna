"""Download the site's font subsets from Google Fonts into fonts/.

Google Fonts returns a font that contains only the characters passed in `text=`, so each face
is subset to the characters the site actually uses. Run this from the repository root after
changing copy in index.html or js/strings.js:

    python tools/fetch-fonts.py

Only the Python standard library is needed. The fonts are licensed under the SIL Open Font
License 1.1; see THIRD_PARTY_NOTICES.md.
"""

import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "fonts"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)
ASCII = "".join(chr(c) for c in range(0x20, 0x7F))


def load_strings():
    source = (ROOT / "js" / "strings.js").read_text(encoding="utf-8")
    start = source.index("{")
    end = source.rindex("}")
    return json.loads(source[start : end + 1])


def chars_of(*texts):
    found = set()
    for text in texts:
        found.update(ch for ch in text if not ch.isspace())
    return "".join(sorted(found))


def main():
    strings = load_strings()
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    html_text = re.sub(r"<[^>]+>", " ", html)

    faces = {
        # Neon tubes on the signboard and the brand in the top bar.
        "neon": ("M+PLUS+Rounded+1c:wght@800", chars_of("あそぼ。みんな.")),
        # Japanese display type: headings, marquees, stamps.
        "display-ja": ("Dela+Gothic+One", chars_of(ASCII, html_text, *strings["ja"].values())),
        # Simplified Chinese display type.
        "display-zh": (
            "ZCOOL+QingKe+HuangYou",
            chars_of(ASCII, "，。、！？：；「」（）·…—–", *strings["zh"].values()),
        ),
        # Pixel type for credits, scores and screen messages.
        "pixel": ("DotGothic16", chars_of(ASCII, "★☆←↑→↓・…")),
    }

    FONTS.mkdir(exist_ok=True)
    for name, (family, text) in faces.items():
        query = urllib.parse.urlencode({"family": family, "text": text, "display": "swap"}, safe=":@+")
        css_url = f"https://fonts.googleapis.com/css2?{query}"
        req = urllib.request.Request(css_url, headers={"User-Agent": UA})
        css = urllib.request.urlopen(req).read().decode("utf-8")
        match = re.search(r"src:\s*url\((https://[^)]+)\)\s*format\('woff2'\)", css)
        if not match:
            sys.exit(f"no woff2 source for {name}:\n{css}")
        data = urllib.request.urlopen(urllib.request.Request(match.group(1), headers={"User-Agent": UA})).read()
        out = FONTS / f"{name}.woff2"
        out.write_bytes(data)
        print(f"{out.relative_to(ROOT)}: {len(text)} chars, {len(data) / 1024:.1f} KiB")


if __name__ == "__main__":
    main()
