#!/usr/bin/env python3
"""
Mascot image pipeline: swap white background to dark, then remove.

Strategy (per user's insight):
1. Load original JPEG (white background)
2. Flood-fill from edges to find white background
3. Replace those pixels with site's dark bg color (#0C1117)
4. Now flood-fill the dark background to make it transparent
5. Edge pixels naturally have dark tones → blend perfectly on the dark site

Cat images face LEFT (towards center of screen, since cat is on bottom-right).
Dog images face RIGHT (towards center, since dog is on bottom-left).
Original orientations are already correct → no flipping needed.
"""

from PIL import Image
import numpy as np
from scipy import ndimage
from collections import deque
import os

ARTIFACTS_DIR = '/Users/dayelee/.gemini/antigravity/brain/db5c3898-4a39-46fd-adfd-d3c36e142e25'
MASCOTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'mascots')

# Site background color
DARK_BG = np.array([12, 17, 23])  # #0C1117

# Original JPEG sources: (artifact_filename, needs_flip)
SOURCES = {
    'dog-idle.png':  ('dog_idle_1771795767183.png', False),
    'dog-hover.png': ('dog_hover_1771795781942.png', False),
    'dog-bark.png':  ('dog_bark_1771795796193.png', False),
    'cat-idle.png':  ('cat_idle_1771795826812.png', True),   # flip to face left
    'cat-hover.png': ('cat_hover_1771795844367.png', True),  # flip to face left
    'cat-meow.png':  ('cat_meow_1771795858687.png', True),   # flip to face left
}


def flood_fill_white(rgb, tolerance=45, min_brightness=180):
    """Flood fill from edges to find white/light background pixels."""
    h, w = rgb.shape[:2]
    visited = np.zeros((h, w), dtype=bool)
    bg_mask = np.zeros((h, w), dtype=bool)

    seeds = set()
    for x in range(w):
        seeds.add((0, x))
        seeds.add((h-1, x))
    for y in range(h):
        seeds.add((y, 0))
        seeds.add((y, w-1))

    for sy, sx in seeds:
        if visited[sy, sx]:
            continue
        seed_color = rgb[sy, sx].astype(int)
        if np.min(seed_color) < min_brightness:
            visited[sy, sx] = True
            continue

        queue = deque([(sy, sx)])
        visited[sy, sx] = True
        while queue:
            y, x = queue.popleft()
            bg_mask[y, x] = True
            for dy, dx in [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)]:
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx]:
                    visited[ny, nx] = True
                    pixel = rgb[ny, nx].astype(int)
                    diff = np.max(np.abs(pixel - seed_color))
                    if diff < tolerance and np.min(pixel) > 140:
                        queue.append((ny, nx))

    return bg_mask


def process_image(output_name, artifact_name, needs_flip=False):
    """Full pipeline: white → dark → transparent, optionally flip."""
    src = os.path.join(ARTIFACTS_DIR, artifact_name)
    dst = os.path.join(MASCOTS_DIR, output_name)

    if not os.path.exists(src):
        print(f"  ⚠ Not found: {artifact_name}")
        return

    img = Image.open(src).convert('RGB')
    data = np.array(img)

    # Step 1: Flood fill from edges to find white background
    bg_mask = flood_fill_white(data)

    # Step 1b: Second pass — catch JPEG artifacts the flood fill missed
    # Any bright/white-ish pixel within 10px of existing background = also background
    near_bg = ndimage.binary_dilation(bg_mask, iterations=10) & ~bg_mask
    for y, x in zip(*np.where(near_bg)):
        r, g, b = int(data[y, x, 0]), int(data[y, x, 1]), int(data[y, x, 2])
        # White-ish: all channels high
        if r > 190 and g > 190 and b > 190:
            bg_mask[y, x] = True
        # Light grey: all channels similar and bright
        elif min(r, g, b) > 150 and max(abs(r-g), abs(g-b), abs(r-b)) < 30:
            bg_mask[y, x] = True

    # Step 2: Expand the background mask to eat into edge speckles
    # Dilate bg = erode subject edge by 1px, cleaning up JPEG block artifacts
    bg_expanded = ndimage.binary_dilation(bg_mask, iterations=1)

    # Smooth the expanded bg boundary with Gaussian for clean edges
    bg_smooth = ndimage.gaussian_filter(bg_expanded.astype(float), sigma=1.0)
    bg_clean = bg_smooth > 0.5

    subject_mask = ~bg_clean

    # Keep only the single largest connected component (the mascot)
    labeled, num = ndimage.label(subject_mask)
    if num > 1:
        sizes = ndimage.sum(subject_mask, labeled, range(1, num + 1))
        largest = np.argmax(sizes) + 1
        subject_mask = labeled == largest
    bg_clean = ~subject_mask

    # Step 3: Replace background with dark site color
    data[bg_clean] = DARK_BG

    # Step 4: Darken edge pixels that have residual white from JPEG compression
    edge_zone = ndimage.binary_dilation(bg_clean, iterations=3) & subject_mask

    edge_coords = np.argwhere(edge_zone)
    for y, x in edge_coords:
        pixel = data[y, x].astype(float)
        whiteness = max(0, (np.min(pixel) - 120) / (255 - 120))
        whiteness = whiteness ** 0.4
        data[y, x] = (pixel * (1 - whiteness) + DARK_BG * whiteness).astype(np.uint8)

    # Step 5: Kill grey-ish artifacts in the outermost 2px of subject
    outer_ring = ndimage.binary_dilation(bg_clean, iterations=2) & subject_mask
    ring_coords = np.argwhere(outer_ring)
    for y, x in ring_coords:
        r, g, b = int(data[y, x, 0]), int(data[y, x, 1]), int(data[y, x, 2])
        brightness = r + g + b
        max_channel_diff = max(abs(r-g), abs(g-b), abs(r-b))
        # Grey artifact: low saturation + mid brightness
        if max_channel_diff < 25 and 80 < brightness < 450:
            data[y, x] = DARK_BG

    # Step 6: Build RGBA with anti-aliased alpha
    rgba = np.zeros((*data.shape[:2], 4), dtype=np.uint8)
    rgba[:, :, :3] = data
    rgba[:, :, 3] = 255

    dist = ndimage.distance_transform_edt(subject_mask)
    FEATHER = 1.5
    alpha = np.zeros(data.shape[:2], dtype=float)
    alpha[dist > FEATHER] = 255.0
    feather_zone = (dist > 0) & (dist <= FEATHER)
    alpha[feather_zone] = (dist[feather_zone] / FEATHER) * 255.0
    alpha[bg_clean] = 0.0
    rgba[:, :, 3] = np.clip(alpha, 0, 255).astype(np.uint8)

    # Step 7: Final cleanup — remove ALL components except the largest
    any_visible = rgba[:, :, 3] > 0
    labeled2, num2 = ndimage.label(any_visible)
    if num2 > 1:
        sizes2 = ndimage.sum(any_visible, labeled2, range(1, num2 + 1))
        keep = np.argmax(sizes2) + 1
        for i in range(1, num2 + 1):
            if i != keep:
                rgba[labeled2 == i, 3] = 0

    result = Image.fromarray(rgba)
    if needs_flip:
        result = result.transpose(Image.FLIP_LEFT_RIGHT)
    result.save(dst)

    final_a = np.array(result)[:, :, 3]
    opaque = np.sum(final_a == 255)
    partial = np.sum((final_a > 0) & (final_a < 255))
    flip_str = ' (flipped)' if needs_flip else ''
    print(f"  ✅ {output_name}{flip_str}: {opaque} opaque, {partial} AA")


def main():
    print("🎨 Processing mascots: white BG → dark BG → transparent\n")

    for output_name, (artifact_name, needs_flip) in SOURCES.items():
        process_image(output_name, artifact_name, needs_flip)

    print("\n✨ Done! Edge pixels now blend dark instead of white.")


if __name__ == '__main__':
    main()
