#!/usr/bin/env python3
"""Generate SwoleMates app icons (pure stdlib — renders a tilted dumbbell
glyph with signed-distance fields, writes PNG via zlib). Run from repo root:
    python3 tools/make_icons.py
"""
import math
import os
import struct
import zlib

BG = (0xF5, 0xF1, 0xE8)
FG = (0x21, 0x1E, 0x19)
SIZE = 512
SS = 2  # supersampling factor
ANGLE = math.radians(-24)


def rrect_sdf(x, y, cx, cy, hw, hh, r):
    dx = abs(x - cx) - (hw - r)
    dy = abs(y - cy) - (hh - r)
    ax, ay = max(dx, 0.0), max(dy, 0.0)
    return math.hypot(ax, ay) + min(max(dx, dy), 0.0) - r


def dumbbell_sdf(x, y, w):
    # rotate around center
    cx = cy = w / 2.0
    ca, sa = math.cos(ANGLE), math.sin(ANGLE)
    rx = ca * (x - cx) - sa * (y - cy) + cx
    ry = sa * (x - cx) + ca * (y - cy) + cy
    u = w  # unit scale
    parts = [
        rrect_sdf(rx, ry, cx, cy, 0.30 * u, 0.030 * u, 0.030 * u),          # bar
        rrect_sdf(rx, ry, cx - 0.185 * u, cy, 0.042 * u, 0.150 * u, 0.036 * u),  # inner plates
        rrect_sdf(rx, ry, cx + 0.185 * u, cy, 0.042 * u, 0.150 * u, 0.036 * u),
        rrect_sdf(rx, ry, cx - 0.285 * u, cy, 0.030 * u, 0.100 * u, 0.028 * u),  # outer plates
        rrect_sdf(rx, ry, cx + 0.285 * u, cy, 0.030 * u, 0.100 * u, 0.028 * u),
    ]
    return min(parts)


def render(size):
    w = size * SS
    aa = 1.0 * SS
    px = bytearray()
    rows = []
    for Y in range(size):
        row = bytearray()
        for X in range(size):
            # average SS x SS samples
            r = g = b = 0.0
            for sy in range(SS):
                for sx in range(SS):
                    x = X * SS + sx + 0.5
                    y = Y * SS + sy + 0.5
                    d = dumbbell_sdf(x, y, w)
                    t = min(1.0, max(0.0, 0.5 - d / aa))
                    r += BG[0] + (FG[0] - BG[0]) * t
                    g += BG[1] + (FG[1] - BG[1]) * t
                    b += BG[2] + (FG[2] - BG[2]) * t
            n = SS * SS
            row += bytes((round(r / n), round(g / n), round(b / n)))
        rows.append(bytes(row))
    return rows


def write_png(path, rows, size):
    raw = b''.join(b'\x00' + r for r in rows)

    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c))

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', ihdr)
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)
    print(f'wrote {path} ({size}x{size})')


def main():
    out = os.path.join(os.path.dirname(__file__), '..', 'icons')
    os.makedirs(out, exist_ok=True)
    rows = render(SIZE)
    write_png(os.path.join(out, 'icon-512.png'), rows, SIZE)


if __name__ == '__main__':
    main()
