import json
import math
import os
import random

import numpy as np
from PIL import Image

N = 1024
EXTENT = 200.0
HERE = os.path.dirname(os.path.abspath(__file__))
random.seed(4127)
rng = np.random.default_rng(4127)


def octave(freq, size=N):
    grid = rng.random((freq, freq)).astype(np.float32)
    img = Image.fromarray((grid * 255).astype(np.uint8), "L").resize((size, size), Image.BICUBIC)
    return np.asarray(img, dtype=np.float32) / 255.0


def world_to_uv(x, y):
    return (x / EXTENT + 0.5), (y / EXTENT + 0.5)


def bowl(u0, v0, radius, softness):
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    d = np.sqrt(((xx / N) - u0) ** 2 + ((yy / N) - v0) ** 2) / radius
    return np.clip(1.0 - d, 0.0, 1.0) ** softness


height = np.zeros((N, N), dtype=np.float32)
for freq, amp in ((3, 1.0), (6, 0.48), (12, 0.24), (24, 0.11), (48, 0.05), (96, 0.022)):
    height += octave(freq) * amp
height = (height - height.min()) / (height.max() - height.min())

yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
v = yy / N

bank = np.clip((0.52 - v) / 0.52, 0.0, 1.0) ** 1.25
height = height * 0.62 + bank * 0.46
height -= bowl(*world_to_uv(30.0, 16.0), 0.150, 1.5) * 0.50
height += bowl(*world_to_uv(62.0, 34.0), 0.115, 2.2) * 0.55
height += bowl(*world_to_uv(-42.0, 2.0), 0.150, 1.8) * 0.34
shelf = np.clip((v - 0.74) / 0.16, 0.0, 1.0)
height = height * (1.0 - shelf) - shelf * 0.30

height = (height - height.min()) / (height.max() - height.min())
Image.fromarray(np.flipud(height * 65535).astype(np.uint16)).save(os.path.join(HERE, "heightmap.png"))

AMPLITUDE = 26.0
WATER_Z = 0.0


def sample(x, y):
    u, w = world_to_uv(x, y)
    i = int(np.clip(w * (N - 1), 0, N - 1))
    j = int(np.clip(u * (N - 1), 0, N - 1))
    return float(height[i, j]) * AMPLITUDE


ring_in, ring_out = [], []
for a in range(0, 360, 6):
    for r, bucket in ((14.0, ring_in), (30.0, ring_out)):
        bucket.append(sample(30.0 + r * math.cos(math.radians(a)), 16.0 + r * math.sin(math.radians(a))))
basin = min(ring_in + [sample(30.0, 16.0)])
rim = float(np.percentile(np.array(ring_out), 35))
water_level = basin + 0.42 * max(rim - basin, 1.2)
print(f"basin {basin:.2f} rim {rim:.2f} water {water_level:.2f}")
for label, (px, py) in (("near-fg", (0.0, -70.0)), ("mid", (0.0, -20.0)), ("pond", (30.0, 16.0)), ("tower", (-42.0, 2.0)), ("far", (0.0, 70.0))):
    print(f"  {label:8s} z={sample(px, py):6.2f}")
tower = (-42.0, 2.0)
outcrop = (62.0, 34.0)

trees, rocks, tufts = [], [], []
for _ in range(4200):
    x = random.uniform(-100, 100)
    y = random.uniform(-34, 96)
    z = sample(x, y)
    if z < water_level + 0.8:
        continue
    if math.dist((x, y), (30.0, 16.0)) < 32.0:
        continue
    if math.dist((x, y), tower) < 22 or math.dist((x, y), outcrop) < 20:
        continue
    slope = abs(sample(x + 1.4, y) - z) + abs(sample(x, y + 1.4) - z)
    near = math.dist((x, y), (0, -86))
    if slope < 0.9 and len(trees) < 105 and random.random() < 0.5 and near > 58 and y > -8:
        trees.append([round(x, 2), round(y, 2), round(z, 3), round(random.uniform(0.7, 1.55), 3), round(random.uniform(0, 6.28), 3)])
    elif slope > 1.1 and len(rocks) < 80 and random.random() < 0.22:
        rocks.append([round(x, 2), round(y, 2), round(z, 3), round(random.uniform(0.5, 1.5), 3), round(random.uniform(0, 6.28), 3)])
    elif len(tufts) < 1400 and y < 46:
        tufts.append([round(x, 2), round(y, 2), round(z, 3), round(random.uniform(0.6, 1.4), 3), round(random.uniform(0, 6.28), 3)])

meta = {
    "extent": EXTENT,
    "amplitude": AMPLITUDE,
    "water_level": round(water_level, 3),
    "tower": [tower[0], tower[1], round(sample(*tower), 3)],
    "outcrop": [outcrop[0], outcrop[1], round(sample(*outcrop), 3)],
    "trees": trees,
    "rocks": rocks,
    "tufts": tufts,
}
with open(os.path.join(HERE, "terrain.json"), "w") as fh:
    json.dump(meta, fh)
print(f"heightmap {N}x{N}; trees {len(trees)} rocks {len(rocks)} tufts {len(tufts)}")
print(f"water {meta['water_level']} tower_z {meta['tower'][2]} outcrop_z {meta['outcrop'][2]}")
