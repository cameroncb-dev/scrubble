#!/usr/bin/env python3
"""Download and prepare a SkillCorner match for Scrubble.

Usage: python prepare_match.py <match_id>
Example: python prepare_match.py 1886347
"""

import argparse
import json
import sys
from pathlib import Path

import httpx
import pandas as pd

BASE_URL = "https://media.githubusercontent.com/media/SkillCorner/opendata/master"
RAW_URL = "https://raw.githubusercontent.com/SkillCorner/opendata/master"
DATA_DIR = Path(__file__).parent.parent / "data" / "matches"


def download_file(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        print(f"  Already exists: {dest.name}")
        return

    print(f"  Downloading {dest.name}...")
    with httpx.stream("GET", url, follow_redirects=True, timeout=600) as response:
        response.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in response.iter_bytes(chunk_size=1024 * 1024):
                f.write(chunk)
    print(f"  Saved {dest.name} ({dest.stat().st_size / 1_000_000:.1f} MB)")


def build_frame_index(tracking_path: Path) -> list[int]:
    offsets: list[int] = []
    with open(tracking_path, "rb") as f:
        while True:
            offset = f.tell()
            line = f.readline()
            if not line:
                break
            offsets.append(offset)
    return offsets


def hex_to_rgb(hex_color: str) -> list[int]:
    hex_color = hex_color.lstrip("#")
    return [int(hex_color[i : i + 2], 16) for i in (0, 2, 4)]


def build_players_lookup(match_data: dict) -> dict[str, dict]:
    lookup: dict[str, dict] = {}
    home_id = match_data["home_team"]["id"]
    away_id = match_data["away_team"]["id"]

    for player in match_data.get("players", []):
        trackable = player.get("trackable_object")
        if trackable is None:
            continue
        team = "home" if player.get("team_id") == home_id else "away"
        lookup[str(trackable)] = {
            "id": player["id"],
            "number": player.get("number"),
            "name": player.get("short_name") or f"{player.get('first_name', '')} {player.get('last_name', '')}".strip(),
            "team": team,
            "position": player.get("player_role", {}).get("acronym", ""),
        }
    return lookup


def build_key_moments(match_dir: Path, match_id: str) -> list[dict]:
    from events import load_key_moments

    return load_key_moments(match_dir)


def prepare_match(match_id: str) -> Path:
    match_dir = DATA_DIR / str(match_id)
    match_dir.mkdir(parents=True, exist_ok=True)

    files = {
        f"{match_id}_match.json": f"{RAW_URL}/data/matches/{match_id}/{match_id}_match.json",
        f"{match_id}_tracking_extrapolated.jsonl": (
            f"{BASE_URL}/data/matches/{match_id}/{match_id}_tracking_extrapolated.jsonl"
        ),
        f"{match_id}_dynamic_events.csv": f"{RAW_URL}/data/matches/{match_id}/{match_id}_dynamic_events.csv",
    }

    print(f"Preparing match {match_id}...")
    for filename, url in files.items():
        download_file(url, match_dir / filename)

    tracking_path = match_dir / f"{match_id}_tracking_extrapolated.jsonl"
    print("  Building frame index...")
    offsets = build_frame_index(tracking_path)
    index_path = match_dir / "frame_index.json"
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(offsets, f)
    print(f"  Indexed {len(offsets)} frames")

    with open(match_dir / f"{match_id}_match.json", encoding="utf-8") as f:
        match_data = json.load(f)

    home_kit = match_data.get("home_team_kit", {})
    away_kit = match_data.get("away_team_kit", {})
    home_color = hex_to_rgb(home_kit.get("jersey_color", "#2800f0"))
    away_color = hex_to_rgb(away_kit.get("jersey_color", "#ffcc00"))

    meta = {
        "match_id": match_id,
        "frame_count": len(offsets),
        "fps": 10,
        "pitch_length": match_data.get("pitch_length", 105),
        "pitch_width": match_data.get("pitch_width", 68),
        "home_team": match_data["home_team"]["short_name"],
        "away_team": match_data["away_team"]["short_name"],
        "home_score": match_data.get("home_team_score", 0),
        "away_score": match_data.get("away_team_score", 0),
        "date": match_data.get("date_time", ""),
        "stadium": match_data.get("stadium", {}).get("name", ""),
        "home_color": home_color,
        "away_color": away_color,
        "players": build_players_lookup(match_data),
        "key_moments": build_key_moments(match_dir, match_id),
    }

    meta_path = match_dir / "meta.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print(f"  Match ready: {match_dir}")
    print(f"  {meta['home_team']} {meta['home_score']} - {meta['away_score']} {meta['away_team']}")
    print(f"  {len(offsets)} frames @ {meta['fps']} fps ({len(offsets) / meta['fps'] / 60:.1f} min)")
    print(f"  {len(meta['key_moments'])} key moments found")
    return match_dir


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare a SkillCorner match for the scrubber app")
    parser.add_argument("match_id", type=str, help="SkillCorner match ID (e.g. 1886347)")
    args = parser.parse_args()

    try:
        prepare_match(args.match_id)
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
