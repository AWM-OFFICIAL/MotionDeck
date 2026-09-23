"""Build the MotionDeck launch icon from the existing mark."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
MARK = ROOT / "public" / "logo-mark.png"
OUT = ROOT / "src-tauri" / "icons"
SIZE = 1024


def gradient_tile() -> Image.Image:
    bg = Image.new("RGBA", (SIZE, SIZE))
    pixels = bg.load()
    for y in range(SIZE):
        t = y / (SIZE - 1)
        color = (
            int(28 * (1 - t) + 10 * t),
            int(34 * (1 - t) + 13 * t),
            int(42 * (1 - t) + 16 * t),
            255,
        )
        for x in range(SIZE):
            pixels[x, y] = color

    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((150, 240, 890, 840), fill=(34, 211, 238, 58))
    bg = Image.alpha_composite(bg, glow.filter(ImageFilter.GaussianBlur(88)))

    sheen = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(sheen).polygon(
        [(0, 0), (SIZE, 0), (SIZE, 260), (0, 440)],
        fill=(255, 255, 255, 16),
    )
    bg = Image.alpha_composite(bg, sheen.filter(ImageFilter.GaussianBlur(22)))

    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, SIZE - 1, SIZE - 1), radius=228, fill=255)
    bg.putalpha(mask)

    stroke = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(stroke).rounded_rectangle(
        (12, 12, SIZE - 13, SIZE - 13),
        radius=216,
        outline=(34, 211, 238, 64),
        width=4,
    )
    return Image.alpha_composite(bg, stroke)


def main() -> None:
    tile = gradient_tile()
    mark = Image.open(MARK).convert("RGBA")
    box = mark.getbbox()
    if box:
        mark = mark.crop(box)

    target_w = int(SIZE * 0.66)
    scale = target_w / mark.width
    mark = mark.resize((target_w, max(1, int(mark.height * scale))), Image.Resampling.LANCZOS)
    tile.alpha_composite(
        mark,
        ((SIZE - mark.width) // 2, (SIZE - mark.height) // 2 - 4),
    )

    OUT.mkdir(parents=True, exist_ok=True)
    source = OUT / "icon-source.png"
    tile.save(source)

    sizes = {
        "32x32.png": 32,
        "128x128.png": 128,
        "128x128@2x.png": 256,
        "icon.png": 512,
    }
    for name, size in sizes.items():
        tile.resize((size, size), Image.Resampling.LANCZOS).save(OUT / name)

    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    tile.save(OUT / "icon.ico", format="ICO", sizes=ico_sizes)
    print(f"wrote {source} and launch icons in {OUT}")


if __name__ == "__main__":
    main()
