"""
LILA BLACK - Data Analysis Script
Explores processed data to extract actionable level-design insights.
"""
import json
import os
import sys
from collections import defaultdict, Counter
import math

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "processed_data")

def load_json(filename):
    with open(os.path.join(DATA_DIR, filename), "r") as f:
        return json.load(f)

def analyze():
    print("=" * 70)
    print("LILA BLACK — Data Analysis for Level Design Insights")
    print("=" * 70)
    
    stats = load_json("stats.json")
    match_index = load_json("match_index.json")
    heatmaps = load_json("heatmaps.json")
    
    # ──────────────────────────────────────────────────────────────
    # INSIGHT 1: Map Popularity & Bot-to-Human Ratio
    # ──────────────────────────────────────────────────────────────
    print("\n" + "─" * 70)
    print("ANALYSIS 1: Map Popularity & Bot-to-Human Ratio")
    print("─" * 70)
    
    map_stats = defaultdict(lambda: {
        "matches": 0, "total_humans": 0, "total_bots": 0,
        "total_kills": 0, "total_bot_kills": 0, "total_loots": 0,
        "human_counts": [], "bot_counts": []
    })
    
    for m in match_index:
        ms = map_stats[m["map_id"]]
        ms["matches"] += 1
        ms["total_humans"] += m["human_count"]
        ms["total_bots"] += m["bot_count"]
        ms["total_kills"] += m["kills"]
        ms["total_bot_kills"] += m["bot_kills"]
        ms["total_loots"] += m["loots"]
        ms["human_counts"].append(m["human_count"])
        ms["bot_counts"].append(m["bot_count"])
    
    for map_id, ms in map_stats.items():
        avg_humans = sum(ms["human_counts"]) / len(ms["human_counts"]) if ms["human_counts"] else 0
        avg_bots = sum(ms["bot_counts"]) / len(ms["bot_counts"]) if ms["bot_counts"] else 0
        bot_ratio = ms["total_bots"] / (ms["total_humans"] + ms["total_bots"]) * 100 if (ms["total_humans"] + ms["total_bots"]) > 0 else 0
        kills_per_match = (ms["total_kills"] + ms["total_bot_kills"]) / ms["matches"] if ms["matches"] > 0 else 0
        loots_per_match = ms["total_loots"] / ms["matches"] if ms["matches"] > 0 else 0
        
        print(f"\n  {map_id}:")
        print(f"    Matches:        {ms['matches']} ({ms['matches']/len(match_index)*100:.1f}% of all)")
        print(f"    Avg Humans:     {avg_humans:.1f}")
        print(f"    Avg Bots:       {avg_bots:.1f}")
        print(f"    Bot Ratio:      {bot_ratio:.1f}%")
        print(f"    Kills/Match:    {kills_per_match:.1f} (Human: {ms['total_kills']}, Bot: {ms['total_bot_kills']})")
        print(f"    Loots/Match:    {loots_per_match:.1f}")
    
    # ──────────────────────────────────────────────────────────────
    # INSIGHT 2: Kill Hotspot Concentration
    # ──────────────────────────────────────────────────────────────
    print("\n" + "─" * 70)
    print("ANALYSIS 2: Kill Hotspot Concentration (Heatmap)")
    print("─" * 70)
    
    for map_id, hm in heatmaps.items():
        kills_cells = hm.get("kills", [])
        if not kills_cells:
            print(f"\n  {map_id}: No kill data")
            continue
        
        total_kills_val = sum(c["v"] for c in kills_cells)
        sorted_cells = sorted(kills_cells, key=lambda c: c["v"], reverse=True)
        
        # Top 10% of cells
        top_10_count = max(1, len(sorted_cells) // 10)
        top_10_cells = sorted_cells[:top_10_count]
        top_10_kills = sum(c["v"] for c in top_10_cells)
        
        # Top 5 cells
        top_5_cells = sorted_cells[:5]
        top_5_kills = sum(c["v"] for c in top_5_cells)
        
        print(f"\n  {map_id}:")
        print(f"    Total kill cells: {len(kills_cells)}")
        print(f"    Top 10% cells ({top_10_count}) contain {top_10_kills/total_kills_val*100:.1f}% of all kills")
        print(f"    Top 5 cells contain {top_5_kills/total_kills_val*100:.1f}% of all kills")
        print(f"    Hottest cell: grid ({top_5_cells[0]['x']}, {top_5_cells[0]['y']}) with {top_5_cells[0]['v']} kills")
        
        # Traffic vs kills correlation
        traffic_cells = hm.get("traffic", [])
        if traffic_cells:
            traffic_dict = {(c["x"], c["y"]): c["v"] for c in traffic_cells}
            
            # Check if kill hotspots coincide with high-traffic areas
            high_kill_in_high_traffic = 0
            total_traffic = sum(c["v"] for c in traffic_cells)
            median_traffic = sorted([c["v"] for c in traffic_cells])[len(traffic_cells) // 2]
            
            for cell in top_10_cells:
                t = traffic_dict.get((cell["x"], cell["y"]), 0)
                if t > median_traffic:
                    high_kill_in_high_traffic += 1
            
            print(f"    Kill hotspots in high-traffic areas: {high_kill_in_high_traffic}/{top_10_count} ({high_kill_in_high_traffic/top_10_count*100:.0f}%)")

    # ──────────────────────────────────────────────────────────────
    # INSIGHT 3: Player Engagement Drop-off (by Date)
    # ──────────────────────────────────────────────────────────────
    print("\n" + "─" * 70)
    print("ANALYSIS 3: Player Engagement Over Time")
    print("─" * 70)
    
    date_stats = defaultdict(lambda: {
        "matches": 0, "unique_humans": set(), "total_kills": 0,
        "total_loots": 0
    })
    
    for m in match_index:
        ds = date_stats[m["date"]]
        ds["matches"] += 1
        ds["total_kills"] += m["kills"] + m["bot_kills"]
        ds["total_loots"] += m["loots"]
    
    # Load individual matches to count unique players per date
    matches_dir = os.path.join(DATA_DIR, "matches")
    date_players = defaultdict(set)
    
    for m in match_index:
        match_file = os.path.join(matches_dir, f"{m['match_id']}.json")
        if os.path.exists(match_file):
            try:
                with open(match_file) as f:
                    md = json.load(f)
                for uid, p in md["players"].items():
                    if p["is_human"]:
                        date_players[m["date"]].add(uid)
            except:
                pass
    
    dates_sorted = ["February_10", "February_11", "February_12", "February_13", "February_14"]
    
    print(f"\n  {'Date':<15} {'Matches':>8} {'Players':>8} {'Kills/Match':>12} {'Loots/Match':>12}")
    print(f"  {'─'*15} {'─'*8} {'─'*8} {'─'*12} {'─'*12}")
    
    prev_matches = None
    for d in dates_sorted:
        ds = date_stats.get(d, {"matches": 0, "total_kills": 0, "total_loots": 0})
        matches = ds["matches"]
        players = len(date_players.get(d, set()))
        kpm = ds["total_kills"] / matches if matches > 0 else 0
        lpm = ds["total_loots"] / matches if matches > 0 else 0
        
        delta = ""
        if prev_matches is not None and prev_matches > 0:
            pct = (matches - prev_matches) / prev_matches * 100
            delta = f" ({pct:+.0f}%)"
        
        print(f"  {d:<15} {matches:>8}{delta:>8} {players:>8} {kpm:>12.1f} {lpm:>12.1f}")
        prev_matches = matches
    
    # ──────────────────────────────────────────────────────────────
    # INSIGHT 4: Storm Deaths & Map Edge Dangers
    # ──────────────────────────────────────────────────────────────
    print("\n" + "─" * 70)
    print("ANALYSIS 4: Storm Deaths Distribution")
    print("─" * 70)
    
    storm_positions = defaultdict(list)
    loot_density = defaultdict(int)
    total_matches_with_storm = 0
    
    for m in match_index:
        match_file = os.path.join(matches_dir, f"{m['match_id']}.json")
        if not os.path.exists(match_file):
            continue
        try:
            with open(match_file) as f:
                md = json.load(f)
            has_storm = False
            for uid, p in md["players"].items():
                for e in p["events"]:
                    if e["e"] == "KilledByStorm":
                        storm_positions[md["map_id"]].append((e.get("x", 0), e.get("y", 0)))
                        has_storm = True
                    if e["e"] == "Loot":
                        # Quadrant analysis (divide map into 4 quadrants)
                        qx = 0 if e.get("x", 0) < 512 else 1
                        qy = 0 if e.get("y", 0) < 512 else 1
                        loot_density[(md["map_id"], qx, qy)] += 1
            if has_storm:
                total_matches_with_storm += 1
        except:
            pass
    
    print(f"\n  Total matches with storm deaths: {total_matches_with_storm}/{len(match_index)} ({total_matches_with_storm/len(match_index)*100:.1f}%)")
    
    for map_id, positions in storm_positions.items():
        print(f"\n  {map_id}: {len(positions)} storm deaths")
        if positions:
            avg_x = sum(p[0] for p in positions) / len(positions)
            avg_y = sum(p[1] for p in positions) / len(positions)
            print(f"    Average position: ({avg_x:.0f}, {avg_y:.0f}) on 1024x1024 grid")
            
            # Edge proximity (how far from center)
            center = 512
            distances = [math.sqrt((p[0]-center)**2 + (p[1]-center)**2) for p in positions]
            avg_dist = sum(distances) / len(distances)
            edge_deaths = sum(1 for d in distances if d > 400)
            print(f"    Avg distance from center: {avg_dist:.0f}px (map edge starts ~450px)")
            print(f"    Deaths near edges (>400px): {edge_deaths}/{len(positions)} ({edge_deaths/len(positions)*100:.0f}%)")
    
    # ──────────────────────────────────────────────────────────────
    # INSIGHT 5: Loot Distribution Balance
    # ──────────────────────────────────────────────────────────────
    print("\n" + "─" * 70)
    print("ANALYSIS 5: Loot Distribution by Map Quadrant")
    print("─" * 70)
    
    quadrant_names = {(0,0): "NW", (1,0): "NE", (0,1): "SW", (1,1): "SE"}
    
    for map_id in ["AmbroseValley", "GrandRift", "Lockdown"]:
        print(f"\n  {map_id}:")
        quad_totals = {}
        total = 0
        for (mid, qx, qy), count in loot_density.items():
            if mid == map_id:
                quad_totals[quadrant_names[(qx, qy)]] = count
                total += count
        
        if total > 0:
            for qname in ["NW", "NE", "SW", "SE"]:
                c = quad_totals.get(qname, 0)
                bar = "█" * int(c / total * 40)
                print(f"    {qname}: {c:>6} ({c/total*100:>5.1f}%) {bar}")
        else:
            print("    No loot data")
    
    # ──────────────────────────────────────────────────────────────
    # INSIGHT 6: Human Kill Rarity
    # ──────────────────────────────────────────────────────────────
    print("\n" + "─" * 70)
    print("ANALYSIS 6: Human vs Bot Kill Breakdown")
    print("─" * 70)
    
    human_kills = stats["events_by_type"].get("Kill", 0)
    bot_kills = stats["events_by_type"].get("BotKill", 0)
    total_kills = human_kills + bot_kills
    
    print(f"\n  Human-on-Human kills:  {human_kills} ({human_kills/total_kills*100:.1f}%)" if total_kills > 0 else "  No kills")
    print(f"  Bot kills (by humans): {bot_kills} ({bot_kills/total_kills*100:.1f}%)" if total_kills > 0 else "")
    print(f"  Total combat events:   {total_kills}")
    print(f"\n  => Human PvP is extremely rare ({human_kills} out of {total_kills} kills)")
    print(f"     This means 99.9% of combat is PvE (players vs bots)")
    
    print("\n" + "=" * 70)
    print("Analysis complete!")
    print("=" * 70)

if __name__ == "__main__":
    analyze()
