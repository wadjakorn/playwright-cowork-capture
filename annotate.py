#!/usr/bin/env python3
"""
annotate.py — Numbered-pin overlays for user-manual-style screenshots.

Renders at 3x SSAA and downsamples with LANCZOS — circles, text, and bezier
connectors all anti-aliased without relying on PIL's (jaggy) shape primitives.

Schema (pins.json) — top-level array of specs:

[
  {
    "shot": "shots/03_docker.png",
    "out":  "shots/annotated/03_docker.png",
    "title": "Step 2 — /docker selected",
    "pins": [
      {
        "n": 1,
        "x": 115, "y": 129,             # pin center (CSS px, viewport scale)
        "bbox": [12, 115, 207, 28],     # optional: outline the target element
        "label": "Currently at /docker",
        "placement": "auto",            # auto | right | left | above | below
        "offset_extra": [0, 0],         # optional fine-tune on top of placement
        "connector": "curve"            # curve | line | none
      }
    ]
  }
]

CLI:
    python3 annotate.py pins.json
"""

import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ---- pin design -----------------------------------------------------------
PIN_R = 19
PIN_FILL = (242, 101, 34, 255)        # #F26522
PIN_BORDER = (255, 255, 255, 255)
PIN_BORDER_W = 4
PIN_SHADOW = (0, 0, 0, 110)
PIN_SHADOW_OFFSET = 4
PIN_SHADOW_BLUR = 6

NUMBER_FONT_SIZE = 20
LABEL_FONT_SIZE = 13
LABEL_FILL = (255, 255, 255, 255)
LABEL_BG = (33, 41, 92, 235)          # navy #21295C
LABEL_PAD = 10
LABEL_RADIUS = 8

BBOX_STROKE = (242, 101, 34, 220)
BBOX_STROKE_W = 3
BBOX_RADIUS = 6
BBOX_PAD = 4                          # outset the rect a few px from element edge

CONNECTOR_COLOR = (242, 101, 34, 230)
CONNECTOR_W = 3
CONNECTOR_BEZIER_SAMPLES = 36

# SSAA factor — render overlay at SCALE× then LANCZOS downsample
SSAA = 3

# Distance from pin center to label-box anchor (before SSAA)
CALLOUT_GAP = 30


def load_font(size: int):
    """Cross-platform font fallback chain.

    Order: macOS (Helvetica/Arial) → Linux (DejaVu) → Windows (Segoe UI/Arial Bold).
    Falls back to PIL's bitmap default font (low-res) if nothing matches.
    """
    candidates = [
        # macOS
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        # Linux
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        # Windows
        "C:/Windows/Fonts/segoeuib.ttf",        # Segoe UI Bold
        "C:/Windows/Fonts/segoeui.ttf",          # Segoe UI
        "C:/Windows/Fonts/arialbd.ttf",          # Arial Bold
        "C:/Windows/Fonts/arial.ttf",
    ]
    for p in candidates:
        if Path(p).exists():
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


# ---- placement -----------------------------------------------------------
def _box_for_placement(pin_x, pin_y, placement, box_w, box_h, gap):
    """Anchor point + connector-target side for a given placement.

    Returns (label_top_left_x, label_top_left_y, conn_from_pin_side).
    """
    if placement == "right":
        return pin_x + gap, pin_y - box_h / 2, "right"
    if placement == "left":
        return pin_x - gap - box_w, pin_y - box_h / 2, "left"
    if placement == "above":
        return pin_x - box_w / 2, pin_y - gap - box_h, "above"
    if placement == "below":
        return pin_x - box_w / 2, pin_y + gap, "below"
    raise ValueError(f"bad placement: {placement!r}")


def _auto_placement(pin_x, pin_y, box_w, box_h, gap, img_w, img_h, margin=16):
    """Pick the side with the most clearance from the image edges.

    A real UI-aware collision detector would also avoid foreground elements; this
    simple version handles the common case (pin near a screen edge → flip away).
    """
    candidates = [
        ("right", img_w - (pin_x + gap + box_w)),
        ("left", (pin_x - gap - box_w)),
        ("below", img_h - (pin_y + gap + box_h)),
        ("above", (pin_y - gap - box_h)),
    ]
    # filter to placements that fit, fall back to the one with the most space if none fit
    fitting = [(p, s) for p, s in candidates if s >= margin]
    pool = fitting if fitting else candidates
    pool.sort(key=lambda x: -x[1])
    return pool[0][0]


# ---- primitives ----------------------------------------------------------
def draw_pin_shadow(layer, x, y, r, offset, blur):
    shadow = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse(
        [x - r + offset, y - r + offset, x + r + offset, y + r + offset],
        fill=PIN_SHADOW,
    )
    layer.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(blur)))


def draw_pin(layer, x, y, n, r, border_w, font):
    d = ImageDraw.Draw(layer)
    d.ellipse(
        [x - r - border_w, y - r - border_w, x + r + border_w, y + r + border_w],
        fill=PIN_BORDER,
    )
    d.ellipse([x - r, y - r, x + r, y + r], fill=PIN_FILL)
    text = str(n)
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(
        (x - tw / 2 - bbox[0], y - th / 2 - bbox[1]),
        text,
        font=font,
        fill=(255, 255, 255, 255),
    )


def draw_label(layer, lx, ly, text, font, pad, radius):
    d = ImageDraw.Draw(layer)
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    box_w = tw + pad * 2
    box_h = th + pad * 2
    d.rounded_rectangle([lx, ly, lx + box_w, ly + box_h], radius=radius, fill=LABEL_BG)
    d.text(
        (lx + pad - bbox[0], ly + pad - bbox[1]),
        text,
        font=font,
        fill=LABEL_FILL,
    )
    return box_w, box_h


def _measure_text(text, font):
    d = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    bbox = d.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def draw_bbox_highlight(layer, bbox, stroke_w, radius, pad):
    if not bbox:
        return
    bx, by, bw, bh = bbox
    x0, y0 = bx - pad, by - pad
    x1, y1 = bx + bw + pad, by + bh + pad
    d = ImageDraw.Draw(layer)
    # double-stroke for emphasis: outer slightly thicker + transparent
    d.rounded_rectangle(
        [x0 - stroke_w, y0 - stroke_w, x1 + stroke_w, y1 + stroke_w],
        radius=radius + stroke_w,
        outline=(*BBOX_STROKE[:3], 70),
        width=stroke_w,
    )
    d.rounded_rectangle([x0, y0, x1, y1], radius=radius, outline=BBOX_STROKE, width=stroke_w)


def _connector_endpoint(label_x, label_y, label_w, label_h, side):
    """Where the connector touches the label box (mid-edge facing the pin)."""
    if side == "right":   return (label_x, label_y + label_h / 2)
    if side == "left":    return (label_x + label_w, label_y + label_h / 2)
    if side == "above":   return (label_x + label_w / 2, label_y + label_h)
    if side == "below":   return (label_x + label_w / 2, label_y)
    raise ValueError(side)


def _pin_edge(pin_x, pin_y, r, border_w, side):
    """Where the connector leaves the pin (outer edge of the white border)."""
    R = r + border_w
    if side == "right": return (pin_x + R, pin_y)
    if side == "left":  return (pin_x - R, pin_y)
    if side == "above": return (pin_x, pin_y - R)
    if side == "below": return (pin_x, pin_y + R)
    raise ValueError(side)


def draw_curve(layer, p0, p1, side, width, color, samples=CONNECTOR_BEZIER_SAMPLES):
    """Quadratic bezier from p0 (pin edge) to p1 (label edge).

    Control point is chosen to bend the curve away from the dominant axis,
    so a "right" placement gets a gentle outward-then-inward arc.
    """
    x0, y0 = p0
    x1, y1 = p1
    if side in ("right", "left"):
        # bend vertically by ~30% of vertical distance
        cx = (x0 + x1) / 2
        cy = (y0 + y1) / 2 + (y1 - y0) * 0.0 + (x1 - x0) * 0.15
    else:
        cx = (x0 + x1) / 2 + (y1 - y0) * 0.15
        cy = (y0 + y1) / 2
    pts = []
    for i in range(samples + 1):
        t = i / samples
        # B(t) = (1-t)^2 P0 + 2(1-t)t C + t^2 P1
        bx = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t ** 2 * x1
        by = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t ** 2 * y1
        pts.append((bx, by))
    d = ImageDraw.Draw(layer)
    d.line(pts, fill=color, width=width, joint="curve")


def draw_line(layer, p0, p1, width, color):
    ImageDraw.Draw(layer).line([p0, p1], fill=color, width=width)


# ---- main loop -----------------------------------------------------------
def annotate_one(spec, root):
    src = root / spec["shot"]
    out = root / spec.get("out", spec["shot"].replace("shots/", "shots/annotated/"))
    out.parent.mkdir(parents=True, exist_ok=True)

    base = Image.open(src).convert("RGBA")
    W, H = base.size
    s = SSAA
    overlay = Image.new("RGBA", (W * s, H * s), (0, 0, 0, 0))

    nf = load_font(NUMBER_FONT_SIZE * s)
    lf = load_font(LABEL_FONT_SIZE * s)

    for pin in spec.get("pins", []):
        x = int(pin["x"]) * s
        y = int(pin["y"]) * s
        n = pin["n"]
        connector = pin.get("connector", "curve")
        placement = pin.get("placement", "auto")

        # Pre-measure label box at SSAA scale
        if pin.get("label"):
            tw, th = _measure_text(pin["label"], lf)
            box_w = tw + (LABEL_PAD * s) * 2
            box_h = th + (LABEL_PAD * s) * 2
        else:
            box_w = box_h = 0

        # Auto-pick placement based on image edges
        if placement == "auto" and pin.get("label"):
            placement = _auto_placement(
                x, y, box_w, box_h, CALLOUT_GAP * s, W * s, H * s, margin=16 * s
            )
        elif placement == "auto":
            placement = "right"

        # bbox highlight first (so pin sits on top)
        if pin.get("bbox"):
            bx, by, bw, bh = pin["bbox"]
            draw_bbox_highlight(
                overlay,
                (bx * s, by * s, bw * s, bh * s),
                BBOX_STROKE_W * s, BBOX_RADIUS * s, BBOX_PAD * s,
            )

        # Label box
        label_x = label_y = None
        if pin.get("label"):
            lx, ly, _ = _box_for_placement(x, y, placement, box_w, box_h, CALLOUT_GAP * s)
            # Fine-tune offset
            ox_extra, oy_extra = pin.get("offset_extra", (0, 0))
            lx += ox_extra * s
            ly += oy_extra * s
            label_x, label_y = lx, ly
            # Connector first (under label edge)
            if connector != "none":
                p0 = _pin_edge(x, y, PIN_R * s, PIN_BORDER_W * s, placement)
                p1 = _connector_endpoint(lx, ly, box_w, box_h, placement)
                if connector == "curve":
                    draw_curve(overlay, p0, p1, placement, CONNECTOR_W * s, CONNECTOR_COLOR)
                else:
                    draw_line(overlay, p0, p1, CONNECTOR_W * s, CONNECTOR_COLOR)
            draw_label(overlay, lx, ly, pin["label"], lf, LABEL_PAD * s, LABEL_RADIUS * s)

        # Shadow + pin on top
        draw_pin_shadow(
            overlay, x, y, PIN_R * s, PIN_SHADOW_OFFSET * s, PIN_SHADOW_BLUR * s
        )
        draw_pin(overlay, x, y, n, PIN_R * s, PIN_BORDER_W * s, nf)

    # Downsample for AA
    overlay_aa = overlay.resize((W, H), Image.LANCZOS)
    composed = Image.alpha_composite(base, overlay_aa)
    composed.convert("RGB").save(out, "PNG", optimize=True)
    print(f"wrote {out}")
    return out


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    pins_path = Path(sys.argv[1]).resolve()
    root = pins_path.parent
    for spec in json.loads(pins_path.read_text()):
        annotate_one(spec, root)


if __name__ == "__main__":
    main()
