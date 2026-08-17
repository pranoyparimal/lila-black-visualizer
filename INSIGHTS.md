# INSIGHTS.md — LILA BLACK Level Design Analysis

> **Data Window:** February 10–14 | **796 matches** | **245 unique human players** | **89,104 events**
> 
> These insights are derived from analyzing player movement, combat, and loot patterns across three maps using the Player Journey Visualizer tool.

---

## Insight 1: Kill Hotspots Are Entirely Predictable — Combat Happens Exclusively on Main Routes

### Finding

100% of kill hotspots (top 10% of cells by kill density) coincide with high-traffic movement areas across all three maps. On **Ambrose Valley**, 41.5% of all kills are concentrated in just 10% of the map grid cells — specifically around grid (13, 15) which alone accounts for 65 kills. This pattern repeats on every map.

| Map | Top 10% Cells Contain | Hottest Cell | % in High-Traffic |
|-----|----------------------|--------------|-------------------|
| Ambrose Valley | 41.5% of kills | (13, 15) — 65 kills | 100% |
| Grand Rift | 28.5% of kills | (13, 12) — 11 kills | 100% |
| Lockdown | 30.3% of kills | (19, 16) — 17 kills | 100% |

### What This Means

There are **zero surprise engagements** in off-path locations. Players are not being ambushed in quiet corners or flanking through secondary routes — all combat is funneled through a small number of predictable chokepoints. This suggests the maps lack viable alternative paths or there is insufficient incentive to explore them.

### Recommendation

- **Add secondary paths with flanking opportunities** around the top 5 kill cells to break the predictability
- **Place high-value loot slightly off the main path** to encourage players to diverge from the kill corridors
- Consider adding environmental cover or terrain variation near hotspots to create more tactical combat rather than head-on encounters

---

## Insight 2: Loot Distribution Is Heavily Unbalanced — Some Quadrants Are "Dead Zones"

### Finding

Loot pickups are distributed unevenly across map quadrants, with some areas receiving 4x more loot activity than others:

**Ambrose Valley:**
| Quadrant | Loot Events | Share |
|----------|-------------|-------|
| SW | 3,622 | 36.4% |
| NW | 3,168 | 31.8% |
| SE | 2,262 | 22.7% |
| **NE** | **903** | **9.1%** ⚠️ |

The **NE quadrant of Ambrose Valley receives only 9.1% of all loot pickups** — nearly 4x less than the SW quadrant. This creates a "dead zone" where players have no reason to visit, effectively wasting 25% of the map's playable area.

**Lockdown** shows a similar pattern but inverted: the SE quadrant gets only 9.3% of loot activity while NE gets 39.5%.

### What This Means

Players are gravitating heavily toward loot-dense areas and ignoring large portions of the map. In a battle royale context, this concentrates the early-game in specific regions and makes rotations predictable for experienced players.

### Recommendation

- **Rebalance loot spawns** in underutilized quadrants (Ambrose Valley NE, Lockdown SE) to bring them closer to 20-25% each
- **Add a "high-risk, high-reward" loot zone** in the emptiest quadrant to attract aggressive players and create early-game variety
- Use the heatmap overlay in the visualizer to compare traffic vs. loot patterns and identify specific POIs that need attention

---

## Insight 3: Player Engagement Dropped 87% Over 5 Days — Retention Is Critical

### Finding

Match volume declined sharply and consistently across the data window:

| Date | Matches | Day-over-Day | Unique Players |
|------|---------|-------------|----------------|
| Feb 10 | 285 | — | 98 |
| Feb 11 | 200 | **−30%** | 80 |
| Feb 12 | 162 | −19% | 59 |
| Feb 13 | 112 | −31% | 47 |
| Feb 14 | 37 | **−67%** | 12 |

From Day 1 to Day 5, **match count dropped 87%** (285 → 37) and **unique players dropped 88%** (98 → 12). The sharpest single-day drop was Feb 13→14 at −67%.

Additionally, **99.9% of all kills are PvE** (humans killing bots) — only 3 out of 2,418 total kills were human-on-human. This means players rarely encounter each other in combat, which may contribute to the lack of engagement.

### What This Means

The combination of predictable combat (Insight 1), unbalanced maps (Insight 2), and near-zero PvP suggests players aren't finding enough variety or challenge to keep playing. The bot-dominated combat may feel repetitive, and the lack of meaningful human encounters reduces the competitive tension that drives retention in battle royale games.

### Recommendation

- **Reduce bot density in matches** to create more human-vs-human encounters — the current bot ratio ranges from 33-49% but human PvP is virtually nonexistent
- **Introduce dynamic map events** (supply drops, zone hazards) to break the "run the same route every match" pattern
- **Focus on Day 1 → Day 2 retention** — the 30% drop on Day 2 suggests first-session experience isn't compelling enough to drive return visits
- Consider **matchmaking improvements** to ensure enough human players per lobby for meaningful PvP interactions

---

## Appendix: Additional Observations

### Storm Deaths Are Not Edge-Related
Only 4.9% of matches contain storm deaths (39 total across all maps), and surprisingly, storm deaths happen **near the map center** (avg distance ~240px from center on a 1024px grid), not at edges. This suggests the storm mechanic is catching players mid-rotation rather than punishing edge-camping. The storm may be closing too quickly for the available movement speed.

### Map Popularity Is Heavily Skewed
Ambrose Valley hosts **71.1%** of all matches, GrandRift only **7.4%**. This 10:1 ratio suggests either matchmaking weight is imbalanced or players strongly prefer the Ambrose Valley layout. GrandRift may need design improvements or better visibility in map rotation.

---

*Generated using the LILA BLACK Player Journey Visualizer — [scripts/analyze_data.py](scripts/analyze_data.py)*
