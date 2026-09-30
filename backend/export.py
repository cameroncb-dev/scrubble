"""Render tracking frames to images and export clips as GIF/MP4.

The picture matches the live canvas: pitch green, readable team kits,
jersey numbers, a cyan ring on the player on the ball, and a possession line.
"""

import math
from pathlib import Path

import imageio.v3 as iio
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from frame_reader import FrameReader

# Same pitch fill as the canvas (`#1a5c2e`).
PITCH: tuple[int, int, int] = (26, 92, 46)
LINE = (255, 255, 255)
HEADER_BG = (15, 20, 25)
HEADER_MUTED = (148, 163, 184)
RING = (103, 232, 249)  # #67e8f9
INK_BLACK = (17, 17, 17)
INK_WHITE = (255, 255, 255)

WIDTH = 1050
PITCH_H = 680
HEADER_H = 78
HEIGHT = HEADER_H + PITCH_H
MARGIN = 20

MIN_PITCH_CONTRAST = 3.0
FALLBACKS: list[tuple[int, int, int]] = [
    (255, 196, 46),
    (64, 214, 255),
    (255, 92, 138),
    (186, 255, 92),
    (255, 122, 46),
]

LOOSE_METERS = 3.5
TEAM_NAMED_METERS = 6.5

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

Rgb = tuple[int, int, int]


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    path = FONT_BOLD if bold else FONT_REGULAR
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default(size)


def _js_mod(n: float, m: float) -> float:
    return n - m * math.trunc(n / m)


def _channel(c: int) -> float:
    x = c / 255
    if x <= 0.04045:
        return x / 12.92
    return ((x + 0.055) / 1.055) ** 2.4


def _luminance(rgb: Rgb) -> float:
    return 0.2126 * _channel(rgb[0]) + 0.7152 * _channel(rgb[1]) + 0.0722 * _channel(rgb[2])


def _contrast(a: Rgb, b: Rgb) -> float:
    hi = max(_luminance(a), _luminance(b))
    lo = min(_luminance(a), _luminance(b))
    return (hi + 0.05) / (lo + 0.05)


def _rgb_to_hsl(rgb: Rgb) -> tuple[float, float, float]:
    r, g, b = (c / 255 for c in rgb)
    mx, mn = max(r, g, b), min(r, g, b)
    lightness = (mx + mn) / 2
    if mx == mn:
        return 0.0, 0.0, lightness
    d = mx - mn
    saturation = d / (2 - mx - mn) if lightness > 0.5 else d / (mx + mn)
    if mx == r:
        hue = _js_mod((g - b) / d, 6)
    elif mx == g:
        hue = (b - r) / d + 2
    else:
        hue = (r - g) / d + 4
    return (_js_mod(hue * 60, 360) + 360) % 360, saturation, lightness


def _hsl_to_rgb(h: float, s: float, lightness: float) -> Rgb:
    c = (1 - abs(2 * lightness - 1)) * s
    hp = _js_mod(h, 360) / 60
    if hp < 0:
        hp += 6
    x = c * (1 - abs((hp % 2) - 1))
    if hp < 1:
        r, g, b = c, x, 0.0
    elif hp < 2:
        r, g, b = x, c, 0.0
    elif hp < 3:
        r, g, b = 0.0, c, x
    elif hp < 4:
        r, g, b = 0.0, x, c
    elif hp < 5:
        r, g, b = x, 0.0, c
    else:
        r, g, b = c, 0.0, x
    m = lightness - c / 2
    return (
        int(math.floor((r + m) * 255 + 0.5)),
        int(math.floor((g + m) * 255 + 0.5)),
        int(math.floor((b + m) * 255 + 0.5)),
    )


def _distinct(a: Rgb, b: Rgb) -> bool:
    if _contrast(a, b) >= 3:
        return True
    h1, s1, l1 = _rgb_to_hsl(a)
    h2, s2, l2 = _rgb_to_hsl(b)
    white_a = s1 < 0.18 and l1 > 0.82
    white_b = s2 < 0.18 and l2 > 0.82
    if white_a and s2 >= 0.7 and l2 <= 0.7:
        return True
    if white_b and s1 >= 0.7 and l1 <= 0.7:
        return True
    hue_delta = min(abs(h1 - h2), 360 - abs(h1 - h2))
    return hue_delta >= 35 and s1 >= 0.45 and s2 >= 0.45


def _lighten(rgb: Rgb) -> list[Rgb]:
    h, s, lightness = _rgb_to_hsl(rgb)
    steps: list[Rgb] = []
    for i in range(1, 15):
        steps.append(_hsl_to_rgb(h, max(s, 0.72), min(0.72, lightness + i * 0.035)))
    return steps


def _pick_fallback(other: Rgb | None) -> Rgb:
    for color in FALLBACKS:
        if _contrast(color, PITCH) < MIN_PITCH_CONTRAST:
            continue
        if other is not None and not _distinct(color, other):
            continue
        return color
    return FALLBACKS[0]


def _fit(rgb: Rgb, other: Rgb | None) -> Rgb:
    for color in (rgb, *_lighten(rgb)):
        if _contrast(color, PITCH) < MIN_PITCH_CONTRAST:
            continue
        if other is not None and not _distinct(color, other):
            continue
        return color
    return _pick_fallback(other)


def _ink(rgb: Rgb) -> Rgb:
    if _contrast(rgb, INK_WHITE) >= _contrast(rgb, INK_BLACK):
        return INK_WHITE
    return INK_BLACK


def team_kits(home_in: Rgb, away_in: Rgb) -> dict[str, Rgb]:
    """Keep a metadata kit when it reads on the dark pitch; otherwise substitute."""
    if _contrast(home_in, PITCH) >= _contrast(away_in, PITCH):
        home = _fit(home_in, None)
        away = _fit(away_in, home)
    else:
        away = _fit(away_in, None)
        home = _fit(home_in, away)
    return {"home": home, "away": away, "home_ink": _ink(home), "away_ink": _ink(away)}


def _player_index(meta: dict) -> dict[int, dict]:
    """Tracking ids are the roster `id`, not the metadata dictionary key."""
    index: dict[int, dict] = {}
    for key, info in meta.get("players", {}).items():
        try:
            index[int(key)] = info
        except (TypeError, ValueError):
            continue
    for info in meta.get("players", {}).values():
        try:
            index[int(info["id"])] = info
        except (TypeError, ValueError, KeyError):
            continue
    return index


def _team_from_group(group: str | None) -> str | None:
    if not group:
        return None
    value = group.lower()
    if "home" in value:
        return "home"
    if "away" in value:
        return "away"
    return None


def _team_name(meta: dict, team: str | None) -> str:
    if team == "home":
        return str(meta.get("home_team") or "Home")
    if team == "away":
        return str(meta.get("away_team") or "Away")
    return "Unknown team"


def _nearest(
    frame: dict,
    players: dict[int, dict],
    x: float,
    y: float,
    team: str | None,
) -> tuple[float, dict] | None:
    best: tuple[float, dict] | None = None
    for player in frame.get("player_data", []):
        info = players.get(int(player["player_id"]))
        if info is None:
            continue
        if team is not None and info.get("team") != team:
            continue
        dist = math.hypot(player["x"] - x, player["y"] - y)
        if best is None or dist < best[0]:
            best = (dist, info)
    return best


def describe_possession(meta: dict, frame: dict, players: dict[int, dict]) -> tuple[str, int | None]:
    """Same rules as the on-screen possession line. Returns text and player id."""
    ball = frame.get("ball_data") or {}
    ball_x, ball_y = ball.get("x"), ball.get("y")
    has_ball = ball_x is not None and ball_y is not None
    possession = frame.get("possession") or {}
    group_team = _team_from_group(possession.get("group"))
    player_id = possession.get("player_id")

    if player_id is not None:
        info = players.get(int(player_id))
        team = (info or {}).get("team") or group_team
        name = (info or {}).get("name") or f"Player {player_id}"
        tracked = int(info["id"]) if info and info.get("id") is not None else int(player_id)
        return f"{_team_name(meta, team)} · {name}", tracked

    if group_team:
        label = _team_name(meta, group_team)
        if has_ball:
            near = _nearest(frame, players, float(ball_x), float(ball_y), group_team)
            if near is not None and near[0] <= TEAM_NAMED_METERS:
                return f"{label} · {near[1].get('name')}", int(near[1]["id"])
        return f"{label} in possession", None

    if not has_ball:
        return "Loose ball", None

    near = _nearest(frame, players, float(ball_x), float(ball_y), None)
    if near is not None and near[0] <= LOOSE_METERS:
        info = near[1]
        return f"{_team_name(meta, info.get('team'))} · {info.get('name')}", int(info["id"])
    return "Loose ball", None


def _world_to_canvas(x: float, y: float, pitch_w: float, pitch_h: float) -> tuple[int, int]:
    px = MARGIN + (x + pitch_w / 2) / pitch_w * (WIDTH - 2 * MARGIN)
    py = HEADER_H + MARGIN + (pitch_h / 2 - y) / pitch_h * (PITCH_H - 2 * MARGIN)
    return int(px), int(py)


def _draw_pitch(draw: ImageDraw.ImageDraw, pitch_w: float, pitch_h: float) -> None:
    x0, y0 = _world_to_canvas(-pitch_w / 2, pitch_h / 2, pitch_w, pitch_h)
    x1, y1 = _world_to_canvas(pitch_w / 2, -pitch_h / 2, pitch_w, pitch_h)
    draw.rectangle([x0, y0, x1, y1], outline=LINE, width=2)

    cx, _ = _world_to_canvas(0, 0, pitch_w, pitch_h)
    draw.line([(cx, y0), (cx, y1)], fill=LINE, width=2)

    ccx, ccy = _world_to_canvas(0, 0, pitch_w, pitch_h)
    draw.ellipse([ccx - 50, ccy - 50, ccx + 50, ccy + 50], outline=LINE, width=2)

    box_w = pitch_w * 0.16
    box_h = pitch_h * 0.6
    for side in (-1, 1):
        bx = side * pitch_w / 2
        x_near = bx - side * box_w
        x_far = bx
        c1 = _world_to_canvas(min(x_near, x_far), box_h / 2, pitch_w, pitch_h)
        c2 = _world_to_canvas(max(x_near, x_far), -box_h / 2, pitch_w, pitch_h)
        draw.rectangle([c1[0], c1[1], c2[0], c2[1]], outline=LINE, width=2)


def _draw_header(
    draw: ImageDraw.ImageDraw,
    meta: dict,
    kits: dict[str, Rgb],
    possession_text: str,
) -> None:
    draw.rectangle([0, 0, WIDTH, HEADER_H], fill=HEADER_BG)
    draw.line([(0, HEADER_H - 1), (WIDTH, HEADER_H - 1)], fill=(42, 52, 65), width=1)

    label_font = _font(13, bold=True)
    line_font = _font(22, bold=True)
    legend_font = _font(18, bold=False)

    draw.text((20, 10), "POSSESSION", fill=HEADER_MUTED, font=label_font)
    draw.text((20, 32), possession_text, fill=INK_WHITE, font=line_font)

    items = (
        (kits["away"], str(meta.get("away_team") or "Away")),
        (kits["home"], str(meta.get("home_team") or "Home")),
    )
    x = WIDTH - 20
    for color, name in items:
        text_box = draw.textbbox((0, 0), name, font=legend_font)
        text_w = text_box[2] - text_box[0]
        swatch_r = 9
        cx = x - text_w - 16
        cy = HEADER_H // 2 + 6
        draw.ellipse(
            [cx - swatch_r, cy - swatch_r, cx + swatch_r, cy + swatch_r],
            fill=color,
            outline=INK_BLACK,
            width=1,
        )
        draw.text((x - text_w, cy - 11), name, fill=(226, 232, 240), font=legend_font)
        x = cx - swatch_r - 22


def render_frame(
    frame: dict,
    meta: dict,
    ball_trail: list[tuple[float, float]] | None = None,
    players: dict[int, dict] | None = None,
    kits: dict[str, Rgb] | None = None,
) -> Image.Image:
    pitch_w = float(meta["pitch_length"])
    pitch_h = float(meta["pitch_width"])
    if players is None:
        players = _player_index(meta)
    if kits is None:
        kits = team_kits(tuple(meta["home_color"]), tuple(meta["away_color"]))

    possession_text, possessor_id = describe_possession(meta, frame, players)
    number_font = _font(14, bold=True)

    img = Image.new("RGB", (WIDTH, HEIGHT), PITCH)
    draw = ImageDraw.Draw(img)
    _draw_header(draw, meta, kits, possession_text)
    _draw_pitch(draw, pitch_w, pitch_h)

    if ball_trail:
        for i, (bx, by) in enumerate(ball_trail):
            shade = int(90 + 165 * (i + 1) / len(ball_trail))
            cx, cy = _world_to_canvas(bx, by, pitch_w, pitch_h)
            r = 4
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(shade, shade, shade))

    for player in frame.get("player_data", []):
        pid = int(player["player_id"])
        info = players.get(pid, {})
        away = info.get("team") == "away"
        color = kits["away"] if away else kits["home"]
        ink = kits["away_ink"] if away else kits["home_ink"]
        cx, cy = _world_to_canvas(player["x"], player["y"], pitch_w, pitch_h)
        r = 12
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color, outline=ink, width=2)
        if possessor_id is not None and pid == possessor_id:
            draw.ellipse([cx - 16, cy - 16, cx + 16, cy + 16], outline=RING, width=3)
        number = info.get("number")
        if number:
            draw.text((cx, cy), str(number), fill=ink, font=number_font, anchor="mm")

    ball = frame.get("ball_data") or {}
    if ball.get("x") is not None and ball.get("y") is not None:
        cx, cy = _world_to_canvas(ball["x"], ball["y"], pitch_w, pitch_h)
        r = 6
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=LINE, outline=(0, 0, 0), width=1)

    return _pad_for_video(img)


def _pad_for_video(img: Image.Image) -> Image.Image:
    """Pad to a multiple of 16 so ffmpeg does not rescale and blur the type."""
    w, h = img.size
    nw = (w + 15) // 16 * 16
    nh = (h + 15) // 16 * 16
    if nw == w and nh == h:
        return img
    padded = Image.new("RGB", (nw, nh), PITCH)
    padded.paste(img, (0, 0))
    if nw > w:
        ImageDraw.Draw(padded).rectangle([w, 0, nw - 1, HEADER_H - 1], fill=HEADER_BG)
    return padded


def export_clip(
    match_dir: Path,
    meta: dict,
    start_frame: int,
    end_frame: int,
    output_path: Path,
    fmt: str = "gif",
    fps: int = 10,
) -> Path:
    reader = FrameReader(match_dir)
    frames = reader.get_frames(start_frame, end_frame + 1)
    players = _player_index(meta)
    kits = team_kits(tuple(meta["home_color"]), tuple(meta["away_color"]))

    images: list[np.ndarray] = []
    ball_trail: list[tuple[float, float]] = []

    for frame in frames:
        ball = frame.get("ball_data") or {}
        if ball.get("x") is not None and ball.get("y") is not None:
            ball_trail.append((float(ball["x"]), float(ball["y"])))
            if len(ball_trail) > 12:
                ball_trail.pop(0)

        img = render_frame(frame, meta, ball_trail=ball_trail, players=players, kits=kits)
        images.append(np.array(img))

    output_path.parent.mkdir(parents=True, exist_ok=True)

    if fmt == "gif":
        iio.imwrite(output_path, images, duration=1 / fps, loop=0)
    else:
        iio.imwrite(output_path, images, fps=fps, codec="libx264")

    return output_path
