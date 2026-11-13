"""
High-precision studio garment background removal with:
1. Border-connected BFS flood-fill (keeps interior white prints intact)
2. 2px Edge Color Decontamination (replaces white-blended fringe RGB with interior fabric RGB)
3. Smooth anti-aliased alpha feathering for natural, non-cutout studio edges
4. Multi-colorway studio variants
"""
import os
import sys
import colorsys
from collections import deque
from PIL import Image, ImageFilter

ART_DIR = r"C:\Users\youse\.gemini\antigravity\brain\5aeceb40-91d6-4920-8f9b-4880d9e8bdfa"
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "garments")

SOURCE_MAP = {
    "hoodie_front_1794579205091.jpg": "hoodie_front.png",
    "tank_black_front_1794579204461.jpg": "tank_black_front.png",
    "tank_black_back_1794579216565.jpg": "tank_black_back.png",
    "tank_blue_front_1794579216213.jpg": "tank_blue_front.png",
    "tank_blue_back_1794579227221.jpg": "tank_blue_back.png",
    "jacket_noir_front_clean_1794579262576.jpg": "jacket_noir_front.png",
    "crimson_motorsport_oversized_tee_1794579273440.jpg": "tee_red_front.png",
    "tee_red_back_1794579243058.jpg": "tee_red_back.png",
}


def is_bg_pixel(r, g, b, threshold=218, max_diff=22):
    return (
        r >= threshold
        and g >= threshold
        and b >= threshold
        and (max(r, g, b) - min(r, g, b)) <= max_diff
    )


def remove_background(input_path, output_path, body_threshold=218):
    img = Image.open(input_path).convert("RGBA")
    w, h = img.size
    pixels = img.load()
    hook_protect_y = int(h * 0.14)

    def check_bg(x, y):
        r, g, b, _ = pixels[x, y]
        thr = 224 if y < hook_protect_y else body_threshold
        return is_bg_pixel(r, g, b, threshold=thr, max_diff=22)

    visited = bytearray(w * h)
    bg_mask = bytearray(w * h)
    q = deque()

    # Seed BFS from all 4 borders
    for x in range(w):
        for y in (0, h - 1):
            idx = y * w + x
            if not visited[idx] and check_bg(x, y):
                visited[idx] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            idx = y * w + x
            if not visited[idx] and check_bg(x, y):
                visited[idx] = 1
                q.append((x, y))

    while q:
        cx, cy = q.popleft()
        bg_mask[cy * w + cx] = 1
        for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
            if 0 <= nx < w and 0 <= ny < h:
                nidx = ny * w + nx
                if not visited[nidx] and check_bg(nx, ny):
                    visited[nidx] = 1
                    q.append((nx, ny))

    # Build initial binary alpha
    alpha = Image.new("L", (w, h), 255)
    apix = alpha.load()
    for y in range(h):
        row_off = y * w
        for x in range(w):
            if bg_mask[row_off + x]:
                apix[x, y] = 0

    # Identify 1px & 2px boundary ring (foreground pixels near background)
    ring1 = []
    ring2 = []
    for y in range(2, h - 2):
        for x in range(2, w - 2):
            if apix[x, y] == 255:
                near1 = (
                    apix[x - 1, y] == 0
                    or apix[x + 1, y] == 0
                    or apix[x, y - 1] == 0
                    or apix[x, y + 1] == 0
                )
                if near1:
                    ring1.append((x, y))
                else:
                    near2 = (
                        apix[x - 2, y] == 0
                        or apix[x + 2, y] == 0
                        or apix[x, y - 2] == 0
                        or apix[x, y + 2] == 0
                    )
                    if near2:
                        ring2.append((x, y))

    ring1_set = set(ring1)

    # Color decontamination: replace white-contaminated edge RGB with deep interior RGB
    def get_interior_avg(cx, cy):
        sr, sg, sb, cnt = 0, 0, 0, 0
        for dy in range(-3, 4):
            for dx in range(-3, 4):
                nx, ny = cx + dx, cy + dy
                if 0 <= nx < w and 0 <= ny < h:
                    if apix[nx, ny] == 255 and (nx, ny) not in ring1_set:
                        rr, gg, bb, _ = pixels[nx, ny]
                        sr += rr
                        sg += gg
                        sb += bb
                        cnt += 1
        if cnt > 0:
            return (sr // cnt, sg // cnt, sb // cnt)
        return None

    for x, y in ring2:
        r, g, b, _ = pixels[x, y]
        lum = (r + g + b) / 3.0
        avg = get_interior_avg(x, y)
        if avg:
            alum = (avg[0] + avg[1] + avg[2]) / 3.0
            if lum > alum + 18 and lum > 160:
                pixels[x, y] = (avg[0], avg[1], avg[2], 255)

    for x, y in ring1:
        r, g, b, _ = pixels[x, y]
        lum = (r + g + b) / 3.0
        avg = get_interior_avg(x, y)
        if avg:
            alum = (avg[0] + avg[1] + avg[2]) / 3.0
            # Decontaminate white fringe
            if lum > alum + 12:
                pixels[x, y] = (avg[0], avg[1], avg[2], 255)
            # Soften alpha proportionally if pixel was partially blended with white
            if lum > 190 and alum < 175:
                apix[x, y] = max(40, int(255 - (lum - 175) * 2.5))
            else:
                apix[x, y] = 200

    # Smooth anti-aliased edge feathering
    alpha_blurred = alpha.filter(ImageFilter.GaussianBlur(radius=0.85))
    ab_pix = alpha_blurred.load()
    for y in range(h):
        for x in range(w):
            if apix[x, y] == 0:
                ab_pix[x, y] = 0
            elif apix[x, y] == 255 and ab_pix[x, y] > 220:
                ab_pix[x, y] = 255

    img.putalpha(alpha_blurred)

    # Crop cleanly & normalize height to 900px
    bbox = img.getbbox()
    if bbox:
        pad = 6
        x0 = max(0, bbox[0] - pad)
        y0 = max(0, bbox[1] - 2)
        x1 = min(w, bbox[2] + pad)
        y1 = min(h, bbox[3] + pad)
        img = img.crop((x0, y0, x1, y1))

    target_h = 900
    nw = max(1, int(img.width * (target_h / img.height)))
    img = img.resize((nw, target_h), Image.Resampling.LANCZOS)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img.save(output_path, "PNG", optimize=True)
    print(f"Processed {os.path.basename(input_path)} -> {output_path} ({nw}x{target_h})")


def recolor_garment(src_png, out_png, mode, hue_target=0.0, sat_scale=1.0, val_scale=1.0):
    """Recolor fabric pixels while preserving wooden hanger and white graphics."""
    img = Image.open(src_png).convert("RGBA")
    px = img.load()
    w, h = img.size

    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue

            if mode == "from_blue":
                if b > r + 10:
                    _, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
                    nr, ng, nb = colorsys.hsv_to_rgb(
                        hue_target,
                        min(1.0, s * sat_scale),
                        min(1.0, v * val_scale),
                    )
                    px[x, y] = (int(nr * 255), int(ng * 255), int(nb * 255), a)
            elif mode == "from_red":
                if y < int(h * 0.08):
                    continue
                if r > b + 16 and r > g + 12:
                    _, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
                    nr, ng, nb = colorsys.hsv_to_rgb(
                        hue_target,
                        min(1.0, s * sat_scale),
                        min(1.0, v * val_scale),
                    )
                    px[x, y] = (int(nr * 255), int(ng * 255), int(nb * 255), a)
            elif mode == "from_noir":
                lum = (r + g + b) / 3.0
                if lum < 95 and y > int(h * 0.19):
                    nr, ng, nb = colorsys.hsv_to_rgb(
                        hue_target,
                        sat_scale,
                        min(1.0, (lum / 255.0) * val_scale + 0.08),
                    )
                    px[x, y] = (int(nr * 255), int(ng * 255), int(nb * 255), a)

    img.save(out_png, "PNG", optimize=True)
    print(f"Created variant -> {os.path.basename(out_png)}")


def main():
    for src_name, dst_name in SOURCE_MAP.items():
        in_p = os.path.join(ART_DIR, src_name)
        out_p = os.path.join(OUT_DIR, dst_name)
        if os.path.exists(in_p):
            thr = 185 if dst_name.startswith("tee_red_") else 212
            remove_background(in_p, out_p, body_threshold=thr)

    hoodie = os.path.join(OUT_DIR, "hoodie_front.png")
    if os.path.exists(hoodie):
        recolor_garment(hoodie, os.path.join(OUT_DIR, "hoodie_sandstone_front.png"), "from_blue", hue_target=0.09, sat_scale=0.62, val_scale=1.08)
        recolor_garment(hoodie, os.path.join(OUT_DIR, "hoodie_charcoal_front.png"), "from_blue", hue_target=0.60, sat_scale=0.12, val_scale=0.58)
        recolor_garment(hoodie, os.path.join(OUT_DIR, "hoodie_forest_front.png"), "from_blue", hue_target=0.39, sat_scale=0.65, val_scale=0.72)

    tank_blue_f = os.path.join(OUT_DIR, "tank_blue_front.png")
    tank_blue_b = os.path.join(OUT_DIR, "tank_blue_back.png")
    if os.path.exists(tank_blue_f):
        recolor_garment(tank_blue_f, os.path.join(OUT_DIR, "tank_crimson_front.png"), "from_blue", hue_target=0.98, sat_scale=0.95, val_scale=0.92)
    if os.path.exists(tank_blue_b):
        recolor_garment(tank_blue_b, os.path.join(OUT_DIR, "tank_crimson_back.png"), "from_blue", hue_target=0.98, sat_scale=0.95, val_scale=0.92)

    tee_f = os.path.join(OUT_DIR, "tee_red_front.png")
    tee_b = os.path.join(OUT_DIR, "tee_red_back.png")
    if os.path.exists(tee_f):
        recolor_garment(tee_f, os.path.join(OUT_DIR, "tee_navy_front.png"), "from_red", hue_target=0.61, sat_scale=0.72, val_scale=0.72)
        recolor_garment(tee_f, os.path.join(OUT_DIR, "tee_olive_front.png"), "from_red", hue_target=0.25, sat_scale=0.45, val_scale=0.75)
    if os.path.exists(tee_b):
        recolor_garment(tee_b, os.path.join(OUT_DIR, "tee_navy_back.png"), "from_red", hue_target=0.61, sat_scale=0.72, val_scale=0.72)
        recolor_garment(tee_b, os.path.join(OUT_DIR, "tee_olive_back.png"), "from_red", hue_target=0.25, sat_scale=0.45, val_scale=0.75)

    jacket = os.path.join(OUT_DIR, "jacket_noir_front.png")
    if os.path.exists(jacket):
        recolor_garment(jacket, os.path.join(OUT_DIR, "jacket_slate_front.png"), "from_noir", hue_target=0.59, sat_scale=0.42, val_scale=1.45)


if __name__ == "__main__":
    main()
