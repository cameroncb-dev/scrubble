"""Render tracking frames to images and export clips as GIF/MP4."""

from pathlib import Path

import imageio.v3 as iio
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from frame_reader import FrameReader

# Pitch colors and layout
PITCH_GREEN = (34, 139, 34)
LINE_WHITE = (255, 255, 255)
BALL_COLOR = (255, 255, 255)
HOME_FALLBACK = (40, 0, 240)
AWAY_FALLBACK = (255, 200, 0)

CANVAS_W = 1050
CANVAS_H = 680
MARGIN = 20


def _world_to_canvas(x: float, y: float, pitch_w: float, pitch_h: float) -> tuple[int, int]:
    """Convert meter coordinates (center origin) to canvas pixels."""
    px = MARGIN + (x + pitch_w / 2) / pitch_w * (CANVAS_W - 2 * MARGIN)
    py = MARGIN + (pitch_h / 2 - y) / pitch_h * (CANVAS_H - 2 * MARGIN)
    return int(px), int(py)


def _draw_pitch(draw: ImageDraw.ImageDraw, pitch_w: float, pitch_h: float) -> None:
    x0, y0 = _world_to_canvas(-pitch_w / 2, pitch_h / 2, pitch_w, pitch_h)
    x1, y1 = _world_to_canvas(pitch_w / 2, -pitch_h / 2, pitch_w, pitch_h)
    draw.rectangle([x0, y0, x1, y1], outline=LINE_WHITE, width=2)

    cx, _ = _world_to_canvas(0, 0, pitch_w, pitch_h)
    draw.line([(cx, y0), (cx, y1)], fill=LINE_WHITE, width=2)

    box_w = pitch_w * 0.16
    box_h = pitch_h * 0.6
    for side in (-1, 1):
        bx = side * pitch_w / 2
        corners = [
            _world_to_canvas(bx - side * box_w, box_h / 2, pitch_w, pitch_h),
            _world_to_canvas(bx, -box_h / 2, pitch_w, pitch_h),
        ]
        draw.rectangle(corners, outline=LINE_WHITE, width=2)


def render_frame(
    frame: dict,
    meta: dict,
    ball_trail: list[tuple[float, float]] | None = None,
) -> Image.Image:
    pitch_w = meta["pitch_length"]
    pitch_h = meta["pitch_width"]
    home_color = tuple(meta["home_color"])
    away_color = tuple(meta["away_color"])
    players_lookup = meta["players"]

    img = Image.new("RGB", (CANVAS_W, CANVAS_H), PITCH_GREEN)
    draw = ImageDraw.Draw(img)
    _draw_pitch(draw, pitch_w, pitch_h)

    # Ball trail
    if ball_trail:
        for i, (bx, by) in enumerate(ball_trail):
            alpha = int(80 + 175 * (i + 1) / len(ball_trail))
            cx, cy = _world_to_canvas(bx, by, pitch_w, pitch_h)
            r = 4
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, alpha))

    # Players
    for p in frame.get("player_data", []):
        pid = p["player_id"]
        info = players_lookup.get(str(pid), {})
        team = info.get("team", "home")
        color = home_color if team == "home" else away_color
        cx, cy = _world_to_canvas(p["x"], p["y"], pitch_w, pitch_h)
        r = 12
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color, outline=LINE_WHITE, width=1)
        number = info.get("number", "")
        if number:
            draw.text((cx - 4, cy - 6), str(number), fill=LINE_WHITE)

    # Ball
    ball = frame.get("ball_data", {})
    if ball.get("x") is not None and ball.get("y") is not None:
        cx, cy = _world_to_canvas(ball["x"], ball["y"], pitch_w, pitch_h)
        r = 6
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=BALL_COLOR, outline=(0, 0, 0))

    return img


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

    images: list[np.ndarray] = []
    ball_trail: list[tuple[float, float]] = []

    for i, frame in enumerate(frames):
        ball = frame.get("ball_data", {})
        if ball.get("x") is not None:
            ball_trail.append((ball["x"], ball["y"]))
            if len(ball_trail) > 8:
                ball_trail.pop(0)

        img = render_frame(frame, meta, ball_trail=ball_trail)
        images.append(np.array(img))

    output_path.parent.mkdir(parents=True, exist_ok=True)

    if fmt == "gif":
        iio.imwrite(output_path, images, duration=1 / fps, loop=0)
    else:
        iio.imwrite(output_path, images, fps=fps, codec="libx264")

    return output_path
