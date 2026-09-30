"""Parse SkillCorner dynamic events into key moments for the timeline."""

from pathlib import Path

import pandas as pd


def load_key_moments(match_dir: Path) -> list[dict]:
    match_id = match_dir.name
    events_path = match_dir / f"{match_id}_dynamic_events.csv"
    if not events_path.exists():
        return []

    df = pd.read_csv(events_path, low_memory=False)
    df = df.sort_values("frame_start")
    moments: list[dict] = []
    seen_frames: set[int] = set()

    # Goals from score changes — one marker per new score value
    if "team_score" in df.columns:
        df["prev_score"] = df["team_score"].shift(1)
        goals = df[(df["team_score"] > df["prev_score"]) & df["team_score"].notna()]
        goals = goals.drop_duplicates(subset=["team_score", "team_id"], keep="first")
        for _, row in goals.iterrows():
            frame = int(row["frame_start"])
            if frame not in seen_frames:
                seen_frames.add(frame)
                moments.append(
                    {
                        "frame": frame,
                        "type": "goal",
                        "label": f"Goal — {row.get('player_name', 'Unknown')} ({row.get('team_shortname', '')})",
                        "time": str(row.get("time_start", "")),
                    }
                )

    # Shots from possession end_type
    shot_mask = pd.Series(False, index=df.index)
    if "end_type" in df.columns:
        shot_mask |= df["end_type"] == "shot"

    for _, row in df[shot_mask].iterrows():
        frame = int(row["frame_start"])
        if frame in seen_frames:
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
