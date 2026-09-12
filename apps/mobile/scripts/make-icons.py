#!/usr/bin/env python3
"""
Draws the app icon, the Android adaptive layers, the splash mark and the favicon.

The mark is one cell of the lattice the app draws on every event cover: a
diamond holding a smaller diamond. It is the celosía you see on a wall in any
Andalusian town, and it is also the shape of a day in a grid, which is what
the product is. Drawn rather than exported so the whole set regenerates from
one source when the colours move.

    python3 apps/mobile/scripts/make-icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

INK = (18, 18, 17, 255)
CHALK = (244, 243, 240, 255)

# Everything is drawn at four times the target and scaled down: Pillow has no
# antialiased polygon, and a jagged diamond is worse than no icon at all.
SUPERSAMPLE = 4

OUT = Path(__file__).resolve().parent.parent / "assets" / "images"


def diamond(centre: float, half: float) -> list[tuple[float, float]]:
    return [
        (centre, centre - half),
        (centre + half, centre),
        (centre, centre + half),
        (centre - half, centre),
    ]


def draw_mark(size: int, background, mark, scale: float) -> Image.Image:
    """`scale` is the outer diamond's half-diagonal as a fraction of the side."""
    side = size * SUPERSAMPLE
    image = Image.new("RGBA", (side, side), background)
    canvas = ImageDraw.Draw(image)

    centre = side / 2
    outer = side * scale
    stroke = max(2, round(side * scale * 0.17))

    canvas.polygon(diamond(centre, outer), outline=mark, width=stroke)
    canvas.polygon(diamond(centre, outer * 0.36), fill=mark)

    return image.resize((size, size), Image.LANCZOS)


def write(name: str, image: Image.Image) -> None:
    path = OUT / name
    image.save(path)
    print(f"{path.relative_to(OUT.parents[3])}  {image.size[0]}x{image.size[1]}")


def main() -> None:
    transparent = (0, 0, 0, 0)

    write("icon.png", draw_mark(1024, INK, CHALK, 0.30))
    write("splash-icon.png", draw_mark(1024, transparent, CHALK, 0.30))
    write("favicon.png", draw_mark(196, INK, CHALK, 0.30))

    # Android masks the adaptive foreground to a circle or a squircle and may
    # crop to the middle two thirds, so the mark sits well inside it.
    write("android-icon-foreground.png", draw_mark(1024, transparent, CHALK, 0.21))
    write("android-icon-background.png", Image.new("RGBA", (1024, 1024), INK))
    write("android-icon-monochrome.png", draw_mark(1024, transparent, CHALK, 0.21))


if __name__ == "__main__":
    main()
