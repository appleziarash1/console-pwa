#!/usr/bin/env python3
"""Download Google Fonts woff2 files and rewrite the CSS to local paths."""
import re
import urllib.request
from pathlib import Path

FONT_DIR = Path(__file__).resolve().parent.parent / "src" / "fonts"
FONT_DIR.mkdir(parents=True, exist_ok=True)

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

FAMILIES = {
    "Fraunces": "Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700",
    "Instrument Sans": "Instrument+Sans:wght@400;500;600",
    "JetBrains Mono": "JetBrains+Mono:wght@400;500",
    "Anek Bangla": "Anek+Bangla:wght@400;500;600",
}

OUT_CSS = FONT_DIR.parent / "fonts.css"

url_re = re.compile(r"url\((https://fonts\.gstatic\.com/[^)]+)\)")


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


blocks = []
seen: dict[str, str] = {}

for label, query in FAMILIES.items():
    css_url = f"https://fonts.googleapis.com/css2?family={query}&display=swap"
    css = fetch(css_url).decode("utf-8")

    def localize(match: re.Match[str]) -> str:
        remote = match.group(1)
        if remote in seen:
            return f"url({seen[remote]})"
        name = remote.rsplit("/", 1)[-1]
        slug = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")
        filename = f"{slug}-{name}"
        target = FONT_DIR / filename
        if not target.exists():
            target.write_bytes(fetch(remote))
        rel = f"./fonts/{filename}"
        seen[remote] = rel
        return f"url({rel})"

    blocks.append(f"/* {label} */\n" + url_re.sub(localize, css).strip())

OUT_CSS.write_text("\n\n".join(blocks) + "\n", encoding="utf-8")

files = sorted(FONT_DIR.glob("*.woff2"))
total = sum(f.stat().st_size for f in files)
print(f"wrote {OUT_CSS} and {len(files)} woff2 files ({total / 1024:.0f} KiB)")
