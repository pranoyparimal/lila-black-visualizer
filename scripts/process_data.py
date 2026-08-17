"""
Data Processing Script for LILA BLACK Player Journey Visualization Tool
========================================================================
Reads all parquet files across 5 days, cleans + transforms the data,
converts world coordinates to minimap pixel coordinates, and outputs
optimized JSON files for the web frontend.
"""

import pyarrow.parquet as pq
import pandas as pd
import os
import json
import re
import sys
from collections import defaultdict

# ─── Configuration ───────────────────────────────────────────────────────────

DATA_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # player_data/
OUTPUT_DIR = os.path.join(DATA_DIR, "processed_data")

DAY_FOLDERS = ["February_10", "February_11", "February_12", "February_13", "February_14"]

# Map configuration from README — used for world-to-minimap coordinate conversion
MAP_CONFIG = {
    "AmbroseValley": {"scale": 900, "origin_x": -370, "origin_z": -473},
    "GrandRift":     {"scale": 581, "origin_x": -290, "origin_z": -290},
    "Lockdown":      {"scale": 1000, "origin_x": -500, "origin_z": -500},
}

MINIMAP_SIZE = 1024  # All minimaps are 1024x1024 pixels

# UUID regex for identifying human players vs bots
UUID_PATTERN = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE
)


# ─── Helper Functions ────────────────────────────────────────────────────────

def is_human(user_id: str) -> bool:
    """Human players have UUID user_ids; bots have short numeric IDs."""
    return bool(UUID_PATTERN.match(user_id))


def world_to_minimap(x: float, z: float, map_id: str) -> tuple:
    """
    Convert world coordinates (x, z) to minimap pixel coordinates.
    
    Formula from README:
        u = (x - origin_x) / scale
        v = (z - origin_z) / scale
        pixel_x = u * 1024
        pixel_y = (1 - v) * 1024   ← Y is flipped (image origin is top-left)
    
    The 'y' column in the data is elevation/height, not used for 2D mapping.
    """
    config = MAP_CONFIG.get(map_id)
    if config is None:
        return (None, None)
    
    u = (x - config["origin_x"]) / config["scale"]
    v = (z - config["origin_z"]) / config["scale"]
    
    pixel_x = round(u * MINIMAP_SIZE, 1)
    pixel_y = round((1 - v) * MINIMAP_SIZE, 1)
    
    return (pixel_x, pixel_y)


def ts_to_seconds(ts_value) -> float:
    """
    Convert the timestamp to a raw millisecond integer.
    
    The ts column stores time elapsed within the match, encoded as milliseconds
    since epoch. We extract the raw ms value so the frontend can compute
    relative elapsed time per match (max_ts - min_ts = match duration in ms).
    """
    if pd.isna(ts_value):
        return 0
    # Get the raw milliseconds since epoch
    epoch = pd.Timestamp("1970-01-01")
    delta = ts_value - epoch
    return int(delta.total_seconds() * 1000)


# ─── Main Processing ────────────────────────────────────────────────────────

def load_all_data() -> pd.DataFrame:
    """Load all parquet files from all day folders into a single DataFrame."""
    all_frames = []
    file_count = 0
    
    for day_folder in DAY_FOLDERS:
        folder_path = os.path.join(DATA_DIR, day_folder)
        if not os.path.isdir(folder_path):
            print(f"  ⚠ Skipping missing folder: {day_folder}")
            continue
        
        day_files = 0
        for filename in os.listdir(folder_path):
            filepath = os.path.join(folder_path, filename)
            try:
                table = pq.read_table(filepath)
                df = table.to_pandas()
                # Decode event column from bytes to string
                df['event'] = df['event'].apply(
                    lambda x: x.decode('utf-8') if isinstance(x, bytes) else x
                )
                # Tag with the day folder for date filtering
                df['date'] = day_folder
                all_frames.append(df)
                day_files += 1
            except Exception as e:
                # Skip non-parquet files like .DS_Store
                continue
        
        file_count += day_files
        print(f"  ✓ {day_folder}: {day_files} files loaded")
    
    print(f"\n  Total files loaded: {file_count}")
    combined = pd.concat(all_frames, ignore_index=True)
    print(f"  Total event rows: {len(combined):,}")
    return combined


def process_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Apply all transformations to the raw combined DataFrame."""
    
    # 1. Classify human vs bot
    df['is_human'] = df['user_id'].apply(is_human)
    
    # 2. Convert world coordinates to minimap pixel coordinates
    pixel_coords = df.apply(
        lambda row: world_to_minimap(row['x'], row['z'], row['map_id']),
        axis=1
    )
    df['pixel_x'] = pixel_coords.apply(lambda c: c[0])
    df['pixel_y'] = pixel_coords.apply(lambda c: c[1])
    
    # 3. Convert timestamps to seconds (for timeline slider)
    df['ts_seconds'] = df['ts'].apply(ts_to_seconds)
    
    # 4. Clean up match_id — strip the .nakama-0 suffix for cleaner display
    df['match_id_short'] = df['match_id'].apply(
        lambda m: m.replace('.nakama-0', '') if isinstance(m, str) else m
    )
    
    return df


def build_match_index(df: pd.DataFrame) -> list:
    """
    Build a match index — metadata about each match for the filter dropdowns.
    This is a small file the frontend loads first for the UI controls.
    """
    matches = []
    grouped = df.groupby('match_id_short')
    
    for match_id, group in grouped:
        humans = group[group['is_human']]
        bots = group[~group['is_human']]
        
        events = group['event'].value_counts().to_dict()
        
        matches.append({
            "match_id": match_id,
            "map_id": group['map_id'].iloc[0],
            "date": group['date'].iloc[0],
            "human_count": int(humans['user_id'].nunique()),
            "bot_count": int(bots['user_id'].nunique()),
            "total_events": int(len(group)),
            "duration_seconds": round(float(group['ts_seconds'].max() - group['ts_seconds'].min()), 1),
            "kills": int(events.get('Kill', 0)),
            "bot_kills": int(events.get('BotKill', 0)),
            "deaths": int(events.get('Killed', 0)),
            "bot_deaths": int(events.get('BotKilled', 0)),
            "storm_deaths": int(events.get('KilledByStorm', 0)),
            "loots": int(events.get('Loot', 0)),
        })
    
    # Sort by date then match_id
    matches.sort(key=lambda m: (m['date'], m['match_id']))
    return matches


def build_match_data(df: pd.DataFrame, match_id: str) -> dict:
    """
    Build the full event data for a single match.
    This is what gets loaded when a user selects a specific match.
    """
    match_df = df[df['match_id_short'] == match_id].copy()
    match_df = match_df.sort_values('ts_seconds')
    
    # Group events by player
    players = {}
    for user_id, player_group in match_df.groupby('user_id'):
        player_events = []
        for _, row in player_group.iterrows():
            player_events.append({
                "x": round(float(row['pixel_x']), 1) if row['pixel_x'] is not None else None,
                "y": round(float(row['pixel_y']), 1) if row['pixel_y'] is not None else None,
                "t": float(row['ts_seconds']),
                "e": row['event'],
            })
        
        players[user_id] = {
            "is_human": bool(player_group['is_human'].iloc[0]),
            "events": player_events,
        }
    
    return {
        "match_id": match_id,
        "map_id": match_df['map_id'].iloc[0],
        "date": match_df['date'].iloc[0],
        "players": players,
    }


def build_heatmap_data(df: pd.DataFrame) -> dict:
    """
    Build aggregated heatmap data per map.
    Pre-computes binned counts for kill zones, death zones, and traffic.
    Uses a 32x32 grid over the 1024x1024 minimap (each cell = 32x32 pixels).
    """
    GRID_SIZE = 32  # 32x32 grid
    CELL_SIZE = MINIMAP_SIZE / GRID_SIZE  # 32 pixels per cell
    
    heatmaps = {}
    
    for map_id in MAP_CONFIG.keys():
        map_df = df[df['map_id'] == map_id].copy()
        
        if map_df.empty:
            continue
        
        # Filter out rows with invalid pixel coords
        map_df = map_df.dropna(subset=['pixel_x', 'pixel_y'])
        
        # Compute grid cell for each event
        map_df['grid_x'] = (map_df['pixel_x'] / CELL_SIZE).astype(int).clip(0, GRID_SIZE - 1)
        map_df['grid_y'] = (map_df['pixel_y'] / CELL_SIZE).astype(int).clip(0, GRID_SIZE - 1)
        
        # Traffic heatmap (Position + BotPosition events)
        traffic_df = map_df[map_df['event'].isin(['Position', 'BotPosition'])]
        traffic_grid = traffic_df.groupby(['grid_x', 'grid_y']).size().reset_index(name='count')
        
        # Kill heatmap (Kill + BotKill events)
        kill_df = map_df[map_df['event'].isin(['Kill', 'BotKill'])]
        kill_grid = kill_df.groupby(['grid_x', 'grid_y']).size().reset_index(name='count')
        
        # Death heatmap (Killed + BotKilled + KilledByStorm events)
        death_df = map_df[map_df['event'].isin(['Killed', 'BotKilled', 'KilledByStorm'])]
        death_grid = death_df.groupby(['grid_x', 'grid_y']).size().reset_index(name='count')
        
        def grid_to_list(grid_df):
            return [
                {"x": int(row['grid_x']), "y": int(row['grid_y']), "v": int(row['count'])}
                for _, row in grid_df.iterrows()
            ]
        
        heatmaps[map_id] = {
            "grid_size": GRID_SIZE,
            "cell_size": CELL_SIZE,
            "traffic": grid_to_list(traffic_grid),
            "kills": grid_to_list(kill_grid),
            "deaths": grid_to_list(death_grid),
        }
    
    return heatmaps


def build_global_stats(df: pd.DataFrame) -> dict:
    """Build summary statistics for the dashboard."""
    events = df['event'].value_counts().to_dict()
    
    return {
        "total_events": int(len(df)),
        "unique_players": int(df[df['is_human']]['user_id'].nunique()),
        "unique_bots": int(df[~df['is_human']]['user_id'].nunique()),
        "unique_matches": int(df['match_id_short'].nunique()),
        "date_range": DAY_FOLDERS,
        "maps": list(MAP_CONFIG.keys()),
        "events_by_type": {k: int(v) for k, v in events.items()},
        "matches_per_map": df.groupby('map_id')['match_id_short'].nunique().to_dict(),
        "matches_per_date": df.groupby('date')['match_id_short'].nunique().to_dict(),
    }


# ─── Main Entrypoint ────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("LILA BLACK — Data Processing Pipeline")
    print("=" * 60)
    
    # Step 1: Load all data
    print("\n[1/5] Loading all parquet files...")
    df = load_all_data()
    
    # Step 2: Transform
    print("\n[2/5] Processing data (coordinates, timestamps, classification)...")
    df = process_dataframe(df)
    print(f"  ✓ Humans: {df[df['is_human']]['user_id'].nunique()}")
    print(f"  ✓ Bots: {df[~df['is_human']]['user_id'].nunique()}")
    print(f"  ✓ Matches: {df['match_id_short'].nunique()}")
    
    # Step 3: Create output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Step 4: Build and save match index
    print("\n[3/5] Building match index...")
    match_index = build_match_index(df)
    with open(os.path.join(OUTPUT_DIR, "match_index.json"), "w") as f:
        json.dump(match_index, f)
    print(f"  ✓ {len(match_index)} matches indexed")
    
    # Step 5: Build and save individual match data files
    print("\n[4/5] Building individual match data files...")
    matches_dir = os.path.join(OUTPUT_DIR, "matches")
    os.makedirs(matches_dir, exist_ok=True)
    
    match_ids = df['match_id_short'].unique()
    for i, match_id in enumerate(match_ids):
        match_data = build_match_data(df, match_id)
        # Use match_id as filename (safe for filesystem)
        safe_name = match_id.replace('.', '_')
        with open(os.path.join(matches_dir, f"{safe_name}.json"), "w") as f:
            json.dump(match_data, f)
        
        if (i + 1) % 100 == 0 or (i + 1) == len(match_ids):
            print(f"  ✓ {i + 1}/{len(match_ids)} matches exported")
    
    # Step 6: Build and save heatmap data
    print("\n[5/5] Building heatmap data...")
    heatmaps = build_heatmap_data(df)
    with open(os.path.join(OUTPUT_DIR, "heatmaps.json"), "w") as f:
        json.dump(heatmaps, f)
    print(f"  ✓ Heatmaps generated for {len(heatmaps)} maps")
    
    # Save global stats
    stats = build_global_stats(df)
    with open(os.path.join(OUTPUT_DIR, "stats.json"), "w") as f:
        json.dump(stats, f, indent=2)
    print(f"  ✓ Global stats saved")
    
    # Summary
    print("\n" + "=" * 60)
    print("Processing complete!")
    print(f"Output directory: {OUTPUT_DIR}")
    print(f"Files created:")
    for f_name in sorted(os.listdir(OUTPUT_DIR)):
        f_path = os.path.join(OUTPUT_DIR, f_name)
        if os.path.isfile(f_path):
            size_kb = os.path.getsize(f_path) / 1024
            print(f"  • {f_name} ({size_kb:.1f} KB)")
        elif os.path.isdir(f_path):
            count = len(os.listdir(f_path))
            print(f"  • {f_name}/ ({count} files)")
    print("=" * 60)


if __name__ == "__main__":
    main()

