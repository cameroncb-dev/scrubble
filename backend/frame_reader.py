"""Read tracking frames from JSONL using a byte-offset index for fast seeking."""

import json
import threading
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

        # One handle, guarded by a lock: sync FastAPI routes run in a threadpool.
        self._fh = open(self.tracking_path, "rb")
        self._lock = threading.Lock()

    @property
    def frame_count(self) -> int:
        return len(self.offsets)

    def _read_lines(self, start: int, end: int) -> list[bytes]:
        """Read [start, end) as contiguous JSONL lines. Caller does not hold the lock."""
        with self._lock:
            self._fh.seek(self.offsets[start])
            return [self._fh.readline() for _ in range(end - start)]

    def get_frame(self, frame_number: int) -> dict[str, Any]:
        if frame_number < 0 or frame_number >= self.frame_count:
            raise IndexError(f"Frame {frame_number} out of range (0-{self.frame_count - 1})")

        line = self._read_lines(frame_number, frame_number + 1)[0]
        return json.loads(line)

    def get_frames(self, start: int, end: int) -> list[dict[str, Any]]:
        start = max(0, start)
        end = min(self.frame_count, end)
        if start >= end:
            return []

        # Parse outside the lock so overlapping batch requests can decode in parallel.
        lines = self._read_lines(start, end)
        return [json.loads(line) for line in lines]
