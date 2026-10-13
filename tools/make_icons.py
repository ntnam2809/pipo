"""Sinh icon PNG cho Pipo (cài như app) và nhúng dạng data URI — repo không track file ảnh.

Vẽ bằng SDF có khử răng cưa, mã hóa PNG bằng zlib thuần (không Pillow). Ghi:
- manifest.webmanifest: icons 192 · 512 (any, góc bo trong suốt) + 512 maskable (nền tràn, nội dung trong vùng an toàn 80%) + SVG.
- index.html: <link rel="apple-touch-icon"> 180 (nền vuông, iOS tự bo góc).

    python robo-pet/tools/make_icons.py
"""
import base64, json, math, pathlib, re, struct, zlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
BG, EYE, EYE_TOP, SHINE = (5, 7, 10), (53, 224, 240), (140, 244, 252), (255, 255, 255)


def sd_rrect(px, py, cx, cy, hw, hh, r):
    qx, qy = abs(px - cx) - hw + r, abs(py - cy) - hh + r
    return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r


def sd_arc(px, py, cx, cy, rad, a0, a1, half_w):
    """Cung tròn nét dày (miệng cười): khoảng cách tới cung trong [a0, a1] trừ nửa bề dày."""
    a = math.atan2(py - cy, px - cx)
    if a0 <= a <= a1: return abs(math.hypot(px - cx, py - cy) - rad) - half_w
    ends = [(cx + rad * math.cos(t), cy + rad * math.sin(t)) for t in (a0, a1)]
    return min(math.hypot(px - x, py - y) for x, y in ends) - half_w


def cover(d): return min(1.0, max(0.0, 0.5 - d))


def mix(c0, c1, k): return tuple(c0[i] + (c1[i] - c0[i]) * k for i in range(3))


def render(size, bleed):
    """bleed=True: nền tràn khung (maskable/apple); False: ô bo góc, ngoài góc trong suốt."""
    s = size / 64.0
    k = 0.8 if bleed else 1.0  # maskable: thu nội dung vào vùng an toàn
    f = lambda v: (32 + (v - 32) * k) * s  # tọa độ trên lưới 64
    eyes = [(f(21.5), f(29), 7.5 * k * s, 13 * k * s), (f(42.5), f(29), 7.5 * k * s, 13 * k * s)]
    rows = []
    for y in range(size):
        row = bytearray([0])
        py = y + 0.5
        for x in range(size):
            px = x + 0.5
            a = 1.0 if bleed else cover(sd_rrect(px, py, size / 2, size / 2, size / 2, size / 2, 14 * s))
            col = BG
            for ex, ey, hw, hh in eyes:
                c = cover(sd_rrect(px, py, ex, ey, hw, hh, hw))
                if c > 0:
                    g = min(1.0, max(0.0, (py - (ey - hh)) / (2 * hh)))
                    col = mix(col, mix(EYE_TOP, EYE, min(1.0, g * 1.6)), c)
                    sh = cover(math.hypot(px - (ex - hw * 0.35), py - (ey - hh * 0.5)) - hw * 0.32)
                    col = mix(col, SHINE, sh * 0.85)
            m = cover(sd_arc(px, py, f(32), f(43), 6.5 * k * s, math.radians(25), math.radians(155), 1.6 * k * s))
            col = mix(col, EYE, m)
            row += bytes(int(round(v)) for v in col) + bytes([int(round(a * 255))])
        rows.append(bytes(row))
    raw = b"".join(rows)
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    return "data:image/png;base64," + base64.b64encode(png).decode("ascii")


def main():
    man_p = ROOT / "manifest.webmanifest"
    man = json.loads(man_p.read_text(encoding="utf-8"))
    svg = next((i for i in man.get("icons", []) if i.get("type") == "image/svg+xml"), None)
    icons = [
        {"src": render(192, False), "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": render(512, False), "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {"src": render(512, True), "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ]
    if svg: icons.append({**svg, "purpose": "any"})
    man["icons"] = icons
    man_p.write_text(json.dumps(man, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    html_p = ROOT / "index.html"
    html = html_p.read_text(encoding="utf-8")
    link = f'<link rel="apple-touch-icon" href="{render(180, True)}">'
    html = re.sub(r'<link rel="apple-touch-icon"[^>]*>', lambda _: link, html) if 'rel="apple-touch-icon"' in html else html.replace('<link rel="manifest"', link + '\n<link rel="manifest"', 1)
    html_p.write_text(html, encoding="utf-8")
    print(f"manifest {man_p.stat().st_size} B · index.html {html_p.stat().st_size} B")


if __name__ == "__main__":
    main()
