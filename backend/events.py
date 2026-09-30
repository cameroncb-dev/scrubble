"""Parse SkillCorner dynamic events into key moments for the timeline."""

from pathlib import Path

import pandas as pd


def load_key_moments(match_dir: Path) -> list[dict]:
    match_id = match_dir.name
    events_path = match_dir / f"{match_id}_dynamic_events.csv"
    if not events_path.exists():
        return []

    df = pd.read_csv(events_path, low_memory=False)
    moments: list[dict] = []
    seen_frames: set[int] = set()

    # Goals from shots that led to a goal
    if "lead_to_goal" in df.columns:
        goals = df[(df["event_type"] == "shot") & (df["lead_to_goal"] == True)]
        for _, row in goals.iterrows():
            frame = int(row["frame_start"])
            if frame not in seen_frames:
                seen_frames.add(frame)
                moments.append(
                    {
                        "frame": frame,
                        "type": "goal",
                        "label": f"Goal — {row.get('player_name', 'Unknown')}",
                        "time": str(row.get("time_start", "")),
                    }
                )

    # Shots (non-goal)
    if "event_type" in df.columns:
        shots = df[df["event_type"] == "shot"]
        for _, row in shots.iterrows():
            frame = int(row["frame_start"])
            if frame in seen_frames:
                continue
            if row.get("lead_to_goal") is True:
                continue
            seen_frames.add(frame)
            moments.append(
                {
                    "frame": frame,
                    "type": "shot",
                    "label": f"Shot — {row.get('player_name', 'Unknown')}",
                    "time": str(row.get("time_start", "")),
                }
            )

    moments.sort(key=lambda m: m["frame"])
    return moments
