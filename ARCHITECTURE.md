# Architecture & Implementation Notes

This document outlines the architecture, technology stack, and design decisions made for the LILA BLACK Player Journey Visualizer.

## Technology Stack

The project is split into two distinct phases: a data processing pipeline and a web-based visualization frontend.

### 1. Data Pipeline (Python)
- **Language**: Python 3
- **Libraries**: `pyarrow` (reading Parquet), `pandas` (data manipulation)
- **Purpose**: Parse raw Parquet files, clean data, compute derived metrics, and export optimized JSON files that can be easily consumed by the frontend.

### 2. Web Frontend (Next.js & React)
- **Framework**: Next.js (React)
- **Styling**: Vanilla CSS (CSS Modules / Global CSS)
- **Visualization**: HTML5 `<canvas>` API
- **Purpose**: Provide a fast, interactive dashboard for level designers to explore player journeys, combat hotspots, and heatmaps without needing to process heavy data in the browser.

## Coordinate Mapping

The game uses a 3D coordinate system, but the minimap is a 2D 1024x1024 pixel image. The `process_data.py` script maps world coordinates to pixel coordinates during the export phase, saving the frontend from having to do this calculation.

The formula used for the projection:
1. **Convert to UV Space (0-1):**
   ```python
   u = (x - origin_x) / scale
   v = (z - origin_z) / scale
   ```
2. **Convert to Pixel Coordinates (1024x1024):**
   ```python
   pixel_x = u * 1024
   pixel_y = (1 - v) * 1024  # Y is inverted
   ```

*Note: The game's `y` coordinate represents elevation and is ignored for the 2D top-down visualization.*

## Key Design Decisions & Tradeoffs

### 1. Precomputing JSON vs. Reading Parquet in Browser
- **Decision**: Pre-process the 1,243 Parquet files into structured JSON files (`stats.json`, `match_index.json`, `heatmaps.json`, and one JSON per match).
- **Tradeoff**: Takes extra disk space for the JSON files and requires a build step. However, it completely eliminates the need for a heavy web assembly (WASM) Parquet reader in the browser.
- **Benefit**: The web app loads instantly, and match data fetches in milliseconds.

### 2. Canvas API vs. SVG / DOM Elements
- **Decision**: Render the map, paths, and event markers using the HTML5 `<canvas>` API rather than SVG or React DOM elements.
- **Tradeoff**: Canvas is harder to make interactive (e.g., hover events require manual raycasting/distance checks) compared to DOM nodes which have built-in `onMouseEnter` events.
- **Benefit**: Rendering performance. Matches can have thousands of position events. Creating thousands of DOM nodes would cause severe lag. Canvas renders 10,000+ points at 60 FPS, ensuring smooth zoom, pan, and timeline playback.

### 3. Timeline Normalization
- **Decision**: The raw `ts` column contains timestamps spanning from 1970 (unix epoch). We normalize these to a 0-1 percentage scale representing the duration of the match.
- **Benefit**: Allows the frontend to have a simple `[0, 1]` playback slider that works uniformly across short and long matches.

### 4. Level-Designer Centric UX
- **Decision**: Focus the UX on actionable insights rather than just raw data display.
- **Features**:
  - Global heatmap overlays (Kill / Death / Traffic) aggregated across all matches.
  - Highlighting individual player paths while dimming others to trace specific engagements.
  - Differentiating Humans (colored) vs Bots (orange) to quickly spot PvE vs PvP.

## Assumptions

- **Data Fits in Memory**: The Python script assumes the raw Parquet data for a single day can fit in system RAM when loaded via Pandas. Given the dataset size (~8MB total), this is a safe assumption.
- **Static Map Images**: The map images and their scale/origin values are assumed to be static. If the map layout changes, the background images and scaling constants will need updating.
