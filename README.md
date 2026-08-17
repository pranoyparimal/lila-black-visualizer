# LILA BLACK — Player Journey Visualizer

This project is a level-designer-friendly web application for visualizing player journeys, combat hotspots, and heatmaps from LILA BLACK production gameplay data.

## 🗂️ Project Structure

```
player_data/
├── ASSIGNMENT.md         # Original task assignment and data schema
├── ARCHITECTURE.md       # Tech stack, coordinate mapping, and design decisions
├── INSIGHTS.md           # 3 actionable level-design insights derived from the data
├── processed_data/       # Generated JSON files ready for the frontend
├── scripts/              # Python data processing scripts
│   ├── process_data.py   # Parses Parquet -> JSON and projects coordinates
│   └── analyze_data.py   # Analyzes data and generates level-design metrics
├── web/                  # Next.js frontend application
└── minimaps/             # High-res minimap source images
```

## 🚀 Setup & Installation

This project consists of two parts: a Python data processing pipeline and a Next.js web application.

### 1. Data Pipeline (Python)

If you just want to run the web app, you can skip this step! The processed data is already included in the `processed_data/` folder.

If you want to re-run the pipeline on new data:

1. Ensure you have Python 3.9+ installed.
2. Install the required dependencies:
   ```bash
   pip install pyarrow pandas
   ```
3. Run the processing script from the root directory:
   ```bash
   python scripts/process_data.py
   ```
   *This will parse all `.nakama-0` Parquet files in the date folders and generate optimized JSON files in `processed_data/`.*

### 2. Web Frontend (Next.js)

The frontend visualizer is built with Next.js and React.

1. Ensure you have Node.js 18+ installed.
2. Navigate to the `web/` directory:
   ```bash
   cd web
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Copy the processed data and map images to the web public folder:
   *(Note: This happens automatically on Windows/Linux during build, or you can manually copy `../processed_data/` to `public/data/` and `../minimaps/` to `public/minimaps/`)*
5. Start the development server:
   ```bash
   npm run dev
   ```
6. Open your browser to **http://localhost:3000**

## 🎯 Features for Level Designers

- **Interactive Canvas Rendering**: Smoothly renders thousands of movement and combat events.
- **Playback Timeline**: Play, pause, scrub, and change playback speed to watch matches unfold over time.
- **Smart Zoom & Pan**: Mouse wheel to zoom (up to 8x), click and drag to pan across the map to inspect micro-engagements.
- **Match Filtering**: Filter matches by Map, Date, or search by Match ID.
- **Global Heatmaps**: Overlay total Kill, Death, or Traffic heatmaps across the entire 5-day dataset to spot unbalanced zones.
- **Player Isolation**: Click any player in the sidebar to highlight their specific path and dim the rest.
- **Hover Details**: Hover over any map event to see exact coordinates and event details.

## 📚 Documentation

For deep-dives into the project, please read:
- [**ARCHITECTURE.md**](./ARCHITECTURE.md) — For technical details, architecture, tradeoffs, and coordinate projection math.
- [**INSIGHTS.md**](./INSIGHTS.md) — For data-driven level design findings (e.g., kill hotspot analysis, loot distribution imbalance).
