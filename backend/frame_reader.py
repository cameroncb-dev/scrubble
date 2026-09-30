"""Read tracking frames from JSONL using a byte-offset index for fast seeking."""

import json
from pathlib import Path
from typing import Any


class FrameReader:
    """Stream frames from a SkillCorner tracking JSONL file line by line."""

    def __init__(self, match_dir: Path) -> None:
        self.match_dir = match_dir
        self.match_id = match_dir.name
        self.tracking_path = match_dir / f"{self.match_id}_tracking_extrapolated.jsonl"
        self.index_path = match_dir / "frame_index.json"

        if not self.tracking_path.exists():
            raise FileNotFoundError(f"Tracking file not found: {self.tracking_path}")
        if not self.index_path.exists():
            raise FileNotFoundError(f"Frame index not found: {self.index_path}")

        with open(self.index_path, encoding="utf-8") as f:
            self.offsets: list[int] = json.load(f)

    @property
    def frame_count(self) -> int:
        return len(self.offsets)

    def get_frame(self, frame_number: int) -> dict[str, Any]:
        if frame_number < 0 or frame_number >= self.frame_count:
            raise IndexError(f"Frame {frame_number} out of range (0-{self.frame_count - 1})")

        with open(self.tracking_path, "rb") as f:
            f.seek(self.offsets[frame_number])
            line = f.readline()
        return json.loads(line)

    def get_frames(self, start: int, end: int) -> list[dict[str, Any]]:
        start = max(0, start)
        end = min(self.frame_count, end)
        frames: list[dict[str, Any]] = []

        with open(self.tracking_path, "rb") as f:
            for i in range(start, end):
                f.seek(self.offsets[i])
                frames.append(json.loads(f.readline()))

        return frames
