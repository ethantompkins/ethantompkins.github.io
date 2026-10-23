"""Shared helpers for the blog analyses.

Data comes from the public nflverse releases. Files are downloaded once into
NFL_DATA_DIR (default: analysis/.cache) and reused on later runs.
"""
import json
import os
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("NFL_DATA_DIR", ROOT / "analysis" / ".cache"))
OUT_DIR = ROOT / "assets" / "data" / "blog"

RELEASES = "https://github.com/nflverse/nflverse-data/releases/download"
SOURCES = {
    "pbp_{y}.parquet": RELEASES + "/pbp/play_by_play_{y}.parquet",
    "part_{y}.parquet": RELEASES + "/pbp_participation/pbp_participation_{y}.parquet",
    "player_stats.parquet": RELEASES + "/player_stats/player_stats.parquet",
    "games.csv": "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv",
}


def _fetch(name, url):
    path = DATA_DIR / name
    if not path.exists():
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        print(f"downloading {url}")
        urllib.request.urlretrieve(url, path)
    return path


def load_pbp(years, participation=False, columns=None):
    frames = []
    for y in years:
        pbp = pd.read_parquet(_fetch(f"pbp_{y}.parquet", SOURCES["pbp_{y}.parquet"].format(y=y)), columns=columns)
        if participation:
            part = pd.read_parquet(_fetch(f"part_{y}.parquet", SOURCES["part_{y}.parquet"].format(y=y)))
            part = part.rename(columns={"nflverse_game_id": "game_id"})
            part = part[["game_id", "play_id", "defenders_in_box", "number_of_pass_rushers",
                         "time_to_throw", "was_pressure", "offense_formation"]]
            pbp = pbp.merge(part, on=["game_id", "play_id"], how="left")
        frames.append(pbp)
    return pd.concat(frames, ignore_index=True)


def load_player_stats():
    return pd.read_parquet(_fetch("player_stats.parquet", SOURCES["player_stats.parquet"]))


def load_games():
    return pd.read_csv(_fetch("games.csv", SOURCES["games.csv"]))


def r(x, n=3):
    """Round for JSON output, passing through None/NaN as null."""
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return None
    return round(float(x), n)


def write(slug, payload):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{slug}.json"
    path.write_text(json.dumps(payload, separators=(",", ":")))
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size / 1024:.1f} KB)")
