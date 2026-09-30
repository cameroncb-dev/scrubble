"""FastAPI backend for the SkillCorner tracking scrubber."""

import json
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from db import create_clip, delete_clip, get_clip, init_db, list_clips
from export import export_clip
from frame_reader import FrameReader

DATA_DIR = Path(__file__).parent.parent / "data" / "matches"
EXPORT_DIR = Path(__file__).parent / "exports"
MATCH_ID = os.environ.get("MATCH_ID", "1886347")

app = FastAPI(title="SkillCorner Tracking Scrubber", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ClipCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    start_frame: int = Field(..., ge=0)
    end_frame: int = Field(..., ge=0)
    tags: list[str] = Field(default_factory=list)
    notes: str = ""


def _match_dir() -> Path:
    return DATA_DIR / MATCH_ID


def _load_meta() -> dict:
    meta_path = _match_dir() / "meta.json"
    if not meta_path.exists():
        raise HTTPException(
            status_code=503,
            detail=f"Match {MATCH_ID} not prepared. Run: python prepare_match.py {MATCH_ID}",
        )
    with open(meta_path, encoding="utf-8") as f:
        return json.load(f)


_reader_instance: FrameReader | None = None


def _reader() -> FrameReader:
    """Reuse one reader so each request does not re-parse the frame index."""
    global _reader_instance
    if _reader_instance is None:
        try:
            _reader_instance = FrameReader(_match_dir())
        except FileNotFoundError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
    return _reader_instance


@app.on_event("startup")
def startup() -> None:
    init_db()
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/api/health")
def health() -> dict:
    meta_path = _match_dir() / "meta.json"
    return {"status": "ok", "match_id": MATCH_ID, "prepared": meta_path.exists()}


@app.get("/api/meta")
def get_meta() -> dict:
    return _load_meta()


@app.get("/api/frames/batch")
def get_frames_batch(
    start: int = Query(..., ge=0),
    end: int = Query(..., ge=0),
) -> list[dict]:
    # This route must be registered before /frames/{frame_number}. Starlette
    # does not fall through when "batch" fails integer parsing, so the static
    # path would otherwise 422 and prefetch would never fill.
    reader = _reader()
    if end < start:
        raise HTTPException(status_code=400, detail="end must be >= start")
    if end - start > 200:
        raise HTTPException(status_code=400, detail="Batch size limited to 200 frames")
    return reader.get_frames(start, end + 1)


@app.get("/api/frames/{frame_number}")
def get_frame(frame_number: int) -> dict:
    reader = _reader()
    try:
        return reader.get_frame(frame_number)
    except IndexError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/clips")
def get_clips() -> list[dict]:
    clips = list_clips()
    meta = _load_meta()
    fps = meta["fps"]
    for clip in clips:
        clip["start_time"] = clip["start_frame"] / fps
        clip["end_time"] = clip["end_frame"] / fps
        clip["duration"] = (clip["end_frame"] - clip["start_frame"]) / fps
    return clips


@app.post("/api/clips")
def post_clip(body: ClipCreate) -> dict:
    meta = _load_meta()
    fps = meta["fps"]
    max_frames = 10 * fps

    if body.end_frame <= body.start_frame:
        raise HTTPException(status_code=400, detail="end_frame must be greater than start_frame")
    if body.end_frame - body.start_frame > max_frames:
        raise HTTPException(status_code=400, detail="Clips must be 10 seconds or shorter")
    if body.end_frame >= meta["frame_count"]:
        raise HTTPException(status_code=400, detail="end_frame exceeds match length")

    clip = create_clip(body.title, body.start_frame, body.end_frame, body.tags, body.notes)
    clip["start_time"] = clip["start_frame"] / fps
    clip["end_time"] = clip["end_frame"] / fps
    clip["duration"] = (clip["end_frame"] - clip["start_frame"]) / fps
    return clip


@app.get("/api/clips/{clip_id}")
def get_clip_by_id(clip_id: str) -> dict:
    clip = get_clip(clip_id)
    if clip is None:
        raise HTTPException(status_code=404, detail="Clip not found")
    meta = _load_meta()
    fps = meta["fps"]
    clip["start_time"] = clip["start_frame"] / fps
    clip["end_time"] = clip["end_frame"] / fps
    clip["duration"] = (clip["end_frame"] - clip["start_frame"]) / fps
    return clip


@app.delete("/api/clips/{clip_id}")
def remove_clip(clip_id: str) -> dict:
    if not delete_clip(clip_id):
        raise HTTPException(status_code=404, detail="Clip not found")
    return {"deleted": True}


@app.get("/api/clips/{clip_id}/export/{fmt}")
def export_clip_file(clip_id: str, fmt: str) -> FileResponse:
    if fmt not in ("gif", "mp4"):
        raise HTTPException(status_code=400, detail="Format must be gif or mp4")

    clip = get_clip(clip_id)
    if clip is None:
        raise HTTPException(status_code=404, detail="Clip not found")

    meta = _load_meta()
    output_path = EXPORT_DIR / f"{clip_id}.{fmt}"

    if not output_path.exists():
        export_clip(
            _match_dir(),
            meta,
            clip["start_frame"],
            clip["end_frame"],
            output_path,
            fmt=fmt,
            fps=meta["fps"],
        )

    media_type = "image/gif" if fmt == "gif" else "video/mp4"
    return FileResponse(output_path, media_type=media_type, filename=f"{clip['title']}.{fmt}")
