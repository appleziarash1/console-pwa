#!/usr/bin/env python3
"""Generate the PWA icon set (ink + amber terminal-caret mark)."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ICON_DIR = ROOT / "src" / "icons"
ICON_DIR.mkdir(parents=True, exist_ok=True)

INK = (18, 16, 15, 255)
INK_DEEP = (9, 8, 8, 255)
AMBER = (242, 176, 61, 255)
CREAM = (247, 242, 233, 255)
S = 1024  # master size


def rounded_mask(size: int, radius_ratio: float) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    r = int(size * radius_ratio)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)
    return mask


def chevron(draw: ImageDraw.ImageDraw, cx: float, cy: float, w: float, h: float,
            thickness: int, color: tuple) -> None:
    """A bold '>' prompt chevron."""
    left = (cx - w / 2, cy - h / 2)
    mid = (cx + w / 2, cy)
    bottom = (cx - w / 2, cy + h / 2)
    draw.line([left, mid, bottom], fill=color, width=thickness, joint="curve")
    for pt in (left, mid, bottom):
        draw.ellipse(
            [pt[0] - thickness / 2, pt[1] - thickness / 2,
             pt[0] + thickness / 2, pt[1] + thickness / 2],
            fill=color,
        )


def build_master(scale: float = 1.0, radius_ratio: float = 0.22) -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # deep radial-ish background: base plate + soft warm glow behind the mark
    plate = Image.new("RGBA", (S, S), INK)
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([S * 0.06, S * 0.10, S * 0.94, S * 0.98], fill=(242, 176, 61, 96))
    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.16))
    img.alpha_composite(plate)
    img.alpha_composite(glow)

    # subtle scanline texture for a "terminal paper" feel
    lines = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lines)
    for y in range(0, S, int(S * 0.035)):
        ld.line([(0, y), (S, y)], fill=(255, 255, 255, 10), width=max(1, S // 512))
    img.alpha_composite(lines)

    # mark: chevron + caret, centred and scaled around the optical centre
    chevron(draw, S * 0.40 * scale, S * 0.50, S * 0.30 * scale, S * 0.40 * scale,
            int(S * 0.085 * scale), CREAM)
    bar_w = S * 0.075 * scale
    bar_h = S * 0.30 * scale
    x0 = S * 0.60 * scale
    y0 = S * 0.50 - bar_h / 2
    draw.rounded_rectangle([x0, y0, x0 + bar_w, y0 + bar_h],
                           radius=bar_w / 2, fill=AMBER)

    return img


def save(img: Image.Image, name: str, size: int) -> None:
    out = img.resize((size, size), Image.LANCZOS)
    out.save(ICON_DIR / name, "PNG", optimize=True)
    print(f"  {name}  {size}x{size}  {(ICON_DIR / name).stat().st_size / 1024:.1f} KiB")


def main() -> None:
    master = build_master()
    rounded = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    rounded.paste(master, (0, 0), rounded_mask(S, 0.22))
    print("standard icons:")
    for size in (192, 512):
        save(rounded, f"icon-{size}.png", size)

    print("maskable (full bleed, safe-zone mark):")
    maskable = build_master(scale=0.72)
    for size in (192, 512):
        save(maskable, f"maskable-{size}.png", size)

    print("platform icons:")
    save(master, "apple-touch-icon.png", 180)
    save(rounded, "favicon-32.png", 32)
    save(maskable, "badge-96.png", 96)

    # monochrome mark for notification badges / Android themed icons
    mono = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    md = ImageDraw.Draw(mono)
    chevron(md, S * 0.40, S * 0.50, S * 0.30, S * 0.40, int(S * 0.085), (255, 255, 255, 255))
    md.rounded_rectangle([S * 0.60, S * 0.35, S * 0.60 + S * 0.075, S * 0.65],
                         radius=S * 0.037, fill=(255, 255, 255, 255))
    save(mono, "monochrome-512.png", 512)

    master.resize((256, 256), Image.LANCZOS).save(ICON_DIR / "icon-preview.png")


if __name__ == "__main__":
    main()
