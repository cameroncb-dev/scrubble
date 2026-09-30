"""SQLite storage for user-created clips."""

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).parent.parent / "data" / "clips.db"


def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS clips (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                tags TEXT DEFAULT '[]',
                notes TEXT DEFAULT '',
                start_frame INTEGER NOT NULL,
                end_frame INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.commit()


def create_clip(
    title: str,
    start_frame: int,
    end_frame: int,
    tags: list[str] | None = None,
    notes: str = "",
) -> dict[str, Any]:
    clip_id = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc).isoformat()
    tags_json = json.dumps(tags or [])

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO clips (id, title, tags, notes, start_frame, end_frame, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (clip_id, title, tags_json, notes, start_frame, end_frame, now),
        )
        conn.commit()

    return get_clip(clip_id)


def get_clip(clip_id: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM clips WHERE id = ?", (clip_id,)).fetchone()
    if row is None:
        return None
    return _row_to_dict(row)


def list_clips() -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM clips ORDER BY created_at DESC").fetchall()
    return [_row_to_dict(row) for row in rows]


def delete_clip(clip_id: str) -> bool:
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM clips WHERE id = ?", (clip_id,))
        conn.commit()
    return cursor.rowcount > 0


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "tags": json.loads(row["tags"]),
        "notes": row["notes"],
        "start_frame": row["start_frame"],
        "end_frame": row["end_frame"],
        "created_at": row["created_at"],
    }
