import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RASTER = os.path.join(ROOT, "art", "raster")
STATIC = os.path.join(ROOT, "web", "static", "art")

TARGETS = {
    "field": ("field-render.png", [("field-1600", 1600), ("field-800", 800)]),
    "perch": ("perch-render.png", [("perch-700", 700)]),
    "dial": ("dial-plate-render.png", [("dial-plate-1024", 1024), ("dial-plate-512", 512)]),
}


def export(name):
    source, outputs = TARGETS[name]
    image = Image.open(os.path.join(RASTER, source))
    for stem, width in outputs:
        height = round(image.height * width / image.width)
        sized = image if image.width == width else image.resize((width, height), Image.LANCZOS)
        webp = os.path.join(STATIC, f"{stem}.webp")
        sized.save(webp, "WEBP", quality=76, method=6)
        avif = os.path.join(STATIC, f"{stem}.avif")
        sized.save(avif, "AVIF", quality=52, speed=4)
        for path in (webp, avif):
            print(os.path.relpath(path, ROOT), sized.size, os.path.getsize(path) // 1024, "KB")


for name in sys.argv[1:] or list(TARGETS):
    export(name)
