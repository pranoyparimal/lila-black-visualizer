"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─── Constants ─────────────────────────────────────────────────────
const MAP_IMAGES = {
  AmbroseValley: "/minimaps/AmbroseValley_Minimap.png",
  GrandRift: "/minimaps/GrandRift_Minimap.png",
  Lockdown: "/minimaps/Lockdown_Minimap.jpg",
};

const MAP_DISPLAY_NAMES = {
  AmbroseValley: "Ambrose Valley",
  GrandRift: "Grand Rift",
  Lockdown: "Lockdown",
};

const EVENT_STYLES = {
  Kill:          { color: "#ef4444", symbol: "crosshair", label: "Kill",        icon: "⊕" },
  Killed:        { color: "#f59e0b", symbol: "skull",     label: "Death",       icon: "✕" },
  BotKill:       { color: "#fb7185", symbol: "crosshair", label: "Bot Kill",    icon: "⊕" },
  BotKilled:     { color: "#fbbf24", symbol: "skull",     label: "Bot Death",   icon: "✕" },
  KilledByStorm: { color: "#8b5cf6", symbol: "storm",     label: "Storm Death", icon: "▲" },
  Loot:          { color: "#10b981", symbol: "diamond",   label: "Loot",        icon: "◆" },
  Position:      { color: "#3b82f6", symbol: null,        label: "Human Path",  icon: "─" },
  BotPosition:   { color: "#f97316", symbol: null,        label: "Bot Path",    icon: "─" },
};

const HEATMAP_MODES = ["off", "traffic", "kills", "deaths"];
const SPEEDS = [0.5, 1, 2, 4, 8];
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

// ─── Helpers ───────────────────────────────────────────────────────
function formatTime(ms) {
  if (!isFinite(ms) || isNaN(ms)) return "0.0s";
  const totalSec = Math.abs(ms) / 1000;
  if (totalSec < 60) return `${totalSec.toFixed(1)}s`;
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function shortId(id) {
  return id ? id.substring(0, 8) : "";
}

// Assign a consistent color to each player based on their ID
const PLAYER_COLORS = [
  "#3b82f6", "#06b6d4", "#10b981", "#22c55e", "#84cc16",
  "#eab308", "#f97316", "#ef4444", "#ec4899", "#a855f7",
  "#6366f1", "#14b8a6", "#f43f5e", "#8b5cf6", "#0ea5e9",
];

function getPlayerColor(index, isHuman) {
  if (!isHuman) return "#f97316";
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

// ─── Main Page Component ──────────────────────────────────────────
export default function Home() {
  // Data state
  const [stats, setStats] = useState(null);
  const [matchIndex, setMatchIndex] = useState([]);
  const [matchData, setMatchData] = useState(null);
  const [heatmapData, setHeatmapData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [matchLoading, setMatchLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // Filter state
  const [selectedMap, setSelectedMap] = useState("all");
  const [selectedDate, setSelectedDate] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Visualization state
  const [showHumans, setShowHumans] = useState(true);
  const [showBots, setShowBots] = useState(true);
  const [showEvents, setShowEvents] = useState({
    Kill: true, Killed: true, BotKill: true, BotKilled: true,
    KilledByStorm: true, Loot: true,
  });
  const [heatmapMode, setHeatmapMode] = useState("off");

  // Player highlight state
  const [highlightedPlayer, setHighlightedPlayer] = useState(null);

  // Hover tooltip state
  const [tooltip, setTooltip] = useState(null);

  // Timeline state
  const [timelinePos, setTimelinePos] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1);
  const animFrameRef = useRef(null);
  const lastTimeRef = useRef(null);

  // Canvas/viewport refs
  const canvasRef = useRef(null);
  const mapImageRef = useRef(null);
  const viewportRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState(700);

  // Zoom & Pan state
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const panOffsetStartRef = useRef({ x: 0, y: 0 });

  // ─── Computed match stats ──────────────────────────────────────
  const matchStats = useMemo(() => {
    if (!matchData) return null;
    const players = Object.entries(matchData.players);
    const humans = players.filter(([, p]) => p.is_human);
    const bots = players.filter(([, p]) => !p.is_human);
    const eventCounts = {};
    players.forEach(([, p]) => {
      p.events.forEach((e) => {
        eventCounts[e.e] = (eventCounts[e.e] || 0) + 1;
      });
    });
    return {
      humanCount: humans.length,
      botCount: bots.length,
      totalEvents: players.reduce((s, [, p]) => s + p.events.length, 0),
      kills: (eventCounts.Kill || 0) + (eventCounts.BotKill || 0),
      deaths: (eventCounts.Killed || 0) + (eventCounts.BotKilled || 0) + (eventCounts.KilledByStorm || 0),
      loots: eventCounts.Loot || 0,
      stormDeaths: eventCounts.KilledByStorm || 0,
      eventCounts,
    };
  }, [matchData]);

  // ─── Player list (sorted: humans first, then bots) ────────────
  const playerList = useMemo(() => {
    if (!matchData) return [];
    return Object.entries(matchData.players)
      .map(([id, p], idx) => ({
        id,
        isHuman: p.is_human,
        eventCount: p.events.length,
        kills: p.events.filter((e) => e.e === "Kill" || e.e === "BotKill").length,
        deaths: p.events.filter((e) => e.e === "Killed" || e.e === "BotKilled" || e.e === "KilledByStorm").length,
        loots: p.events.filter((e) => e.e === "Loot").length,
        color: getPlayerColor(idx, p.is_human),
        index: idx,
      }))
      .sort((a, b) => (a.isHuman === b.isHuman ? 0 : a.isHuman ? -1 : 1));
  }, [matchData]);

  // Clamp pan
  const clampPan = useCallback((px, py, z) => {
    const maxPan = (z - 1) * canvasSize / 2;
    return {
      x: Math.max(-maxPan, Math.min(maxPan, px)),
      y: Math.max(-maxPan, Math.min(maxPan, py)),
    };
  }, [canvasSize]);

  // ─── Zoom handlers ────────────────────────────────────────────
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    if (!matchData) return;
    setZoom((prev) => {
      const delta = e.deltaY > 0 ? -0.3 : 0.3;
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta));
      if (next <= 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  }, [matchData]);

  const handleMouseDown = useCallback((e) => {
    if (zoom <= 1) return;
    e.preventDefault();
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX, y: e.clientY };
    panOffsetStartRef.current = { ...panOffset };
    e.currentTarget.style.cursor = "grabbing";
  }, [zoom, panOffset]);

  const handleMouseMove = useCallback((e) => {
    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      const newOffset = clampPan(
        panOffsetStartRef.current.x + dx,
        panOffsetStartRef.current.y + dy,
        zoom
      );
      setPanOffset(newOffset);
      return;
    }

    // Tooltip: compute map coordinates from mouse position
    if (!canvasRef.current || !matchData) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Reverse the zoom/pan transform
    const size = canvasSize;
    const mapX = ((mx - size / 2 - panOffset.x) / zoom + size / 2) / size * 1024;
    const mapY = ((my - size / 2 - panOffset.y) / zoom + size / 2) / size * 1024;

    if (mapX < 0 || mapX > 1024 || mapY < 0 || mapY > 1024) {
      setTooltip(null);
      return;
    }

    // Find nearby events
    const scale = size / 1024;
    const searchRadius = 20 / zoom;
    const nearby = [];
    Object.entries(matchData.players).forEach(([uid, player]) => {
      player.events.forEach((ev) => {
        if (ev.e === "Position" || ev.e === "BotPosition") return;
        const ex = (ev.x || 0);
        const ey = (ev.y || 0);
        const dist = Math.sqrt((ex - mapX) ** 2 + (ey - mapY) ** 2);
        if (dist < searchRadius) {
          nearby.push({
            event: ev.e,
            player: uid,
            isHuman: player.is_human,
            x: ex,
            y: ey,
          });
        }
      });
    });

    setTooltip({
      screenX: e.clientX,
      screenY: e.clientY,
      mapX: Math.round(mapX),
      mapY: Math.round(mapY),
      events: nearby,
    });
  }, [zoom, panOffset, canvasSize, matchData, clampPan]);

  const handleMouseUp = useCallback((e) => {
    isPanningRef.current = false;
    if (e.currentTarget) e.currentTarget.style.cursor = zoom > 1 ? "grab" : "crosshair";
  }, [zoom]);

  const handleMouseLeave = useCallback(() => {
    isPanningRef.current = false;
    setTooltip(null);
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  // ─── Responsive canvas sizing ─────────────────────────────────
  useEffect(() => {
    function updateSize() {
      if (viewportRef.current) {
        const rect = viewportRef.current.getBoundingClientRect();
        const sz = Math.min(rect.width - 32, rect.height - 32);
        setCanvasSize(Math.max(400, Math.floor(sz)));
      }
    }
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Attach wheel listener (non-passive)
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [handleWheel, matchData, mapReady]);

  // ─── Load initial data ─────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      try {
        const [statsRes, indexRes, heatRes] = await Promise.all([
          fetch("/data/stats.json"),
          fetch("/data/match_index.json"),
          fetch("/data/heatmaps.json"),
        ]);
        setStats(await statsRes.json());
        setMatchIndex(await indexRes.json());
        setHeatmapData(await heatRes.json());
      } catch (err) {
        console.error("Failed to load data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // ─── Load match data ───────────────────────────────────────────
  const loadMatch = useCallback(async (matchId) => {
    setMatchLoading(true);
    setMapReady(false);
    setIsPlaying(false);
    setTimelinePos(1);
    setHighlightedPlayer(null);
    resetZoom();
    try {
      const res = await fetch(`/data/matches/${matchId}.json`);
      const data = await res.json();
      setMatchData(data);

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = MAP_IMAGES[data.map_id];
      img.onload = () => {
        mapImageRef.current = img;
        setMapReady(true);
        setMatchLoading(false);
      };
      img.onerror = () => {
        console.error("Failed to load map image for", data.map_id);
        setMapReady(true);
        setMatchLoading(false);
      };
    } catch (err) {
      console.error("Failed to load match:", err);
      setMatchLoading(false);
    }
  }, [resetZoom]);

  // ─── Filter matches ───────────────────────────────────────────
  const filteredMatches = matchIndex.filter((m) => {
    if (selectedMap !== "all" && m.map_id !== selectedMap) return false;
    if (selectedDate !== "all" && m.date !== selectedDate) return false;
    if (searchQuery && !m.match_id.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // ─── Timeline animation ──────────────────────────────────────
  useEffect(() => {
    if (!isPlaying || !matchData) return;
    const animate = (timestamp) => {
      if (lastTimeRef.current === null) lastTimeRef.current = timestamp;
      const delta = (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;
      setTimelinePos((prev) => {
        const next = prev + delta * playSpeed * 0.02;
        if (next >= 1) { setIsPlaying(false); return 1; }
        return next;
      });
      animFrameRef.current = requestAnimationFrame(animate);
    };
    lastTimeRef.current = null;
    animFrameRef.current = requestAnimationFrame(animate);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [isPlaying, playSpeed, matchData]);

  // ─── Canvas rendering ────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !matchData || !mapReady) return;

    const ctx = canvas.getContext("2d");
    const size = canvasSize;
    canvas.width = size;
    canvas.height = size;

    ctx.fillStyle = "#0a0e17";
    ctx.fillRect(0, 0, size, size);

    // Apply zoom & pan
    ctx.save();
    ctx.translate(size / 2 + panOffset.x, size / 2 + panOffset.y);
    ctx.scale(zoom, zoom);
    ctx.translate(-size / 2, -size / 2);

    // Map image
    const mapImg = mapImageRef.current;
    if (mapImg) {
      ctx.drawImage(mapImg, 0, 0, size, size);
      ctx.fillStyle = "rgba(10, 14, 23, 0.2)";
      ctx.fillRect(0, 0, size, size);
    }

    const scale = size / 1024;
    const markerScale = Math.max(0.5, 1 / Math.sqrt(zoom));

    // Heatmap
    if (heatmapMode !== "off" && heatmapData && heatmapData[matchData.map_id]) {
      const hm = heatmapData[matchData.map_id];
      const cells = hm[heatmapMode];
      if (cells && cells.length > 0) {
        const maxVal = Math.max(...cells.map((c) => c.v));
        const cellPx = (hm.cell_size || 32) * scale;
        cells.forEach((cell) => {
          const intensity = cell.v / maxVal;
          let r, g, b;
          if (heatmapMode === "kills") { r = 239; g = 68; b = 68; }
          else if (heatmapMode === "deaths") { r = 245; g = 158; b = 11; }
          else { r = 59; g = 130; b = 246; }
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${intensity * 0.65})`;
          ctx.fillRect(cell.x * cellPx, cell.y * cellPx, cellPx, cellPx);
        });
      }
    }

    // Time range
    let minT = Infinity, maxT = -Infinity;
    Object.values(matchData.players).forEach((p) => {
      p.events.forEach((e) => {
        if (e.t < minT) minT = e.t;
        if (e.t > maxT) maxT = e.t;
      });
    });
    if (!isFinite(minT)) minT = 0;
    if (!isFinite(maxT)) maxT = 1;
    const timeRange = maxT - minT || 1;
    const cutoffT = minT + timeRange * timelinePos;

    // Build player index for consistent coloring
    const playerEntries = Object.entries(matchData.players);

    // Draw paths & events
    playerEntries.forEach(([userId, player], playerIdx) => {
      const isHuman = player.is_human;
      if (isHuman && !showHumans) return;
      if (!isHuman && !showBots) return;

      const isHighlighted = highlightedPlayer === null || highlightedPlayer === userId;
      const dimAlpha = highlightedPlayer !== null && !isHighlighted ? 0.1 : 1;

      const pColor = getPlayerColor(playerIdx, isHuman);
      const visibleEvents = player.events.filter((e) => e.t <= cutoffT);
      const posEvents = visibleEvents.filter(
        (e) => e.e === "Position" || e.e === "BotPosition"
      );

      // Path
      if (posEvents.length > 1) {
        ctx.beginPath();
        const [r, g, b] = hexToRgb(pColor);
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.55 * dimAlpha})`;
        ctx.lineWidth = (isHuman ? 2.5 : 2) * markerScale;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        posEvents.forEach((e, i) => {
          const px = (e.x || 0) * scale;
          const py = (e.y || 0) * scale;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.stroke();
      }

      // Current position
      if (posEvents.length > 0) {
        const last = posEvents[posEvents.length - 1];
        const px = (last.x || 0) * scale;
        const py = (last.y || 0) * scale;
        const [r, g, b] = hexToRgb(pColor);

        ctx.globalAlpha = dimAlpha;
        // Outer glow
        ctx.beginPath();
        ctx.arc(px, py, 7 * markerScale, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.2)`;
        ctx.fill();
        // Inner dot
        ctx.beginPath();
        ctx.arc(px, py, 4 * markerScale, 0, Math.PI * 2);
        ctx.fillStyle = pColor;
        ctx.fill();
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.6)`;
        ctx.lineWidth = 1 * markerScale;
        ctx.stroke();

        // Player label when zoomed in enough
        if (zoom >= 2 && isHighlighted) {
          ctx.font = `${Math.round(10 * markerScale)}px Inter, sans-serif`;
          ctx.fillStyle = `rgba(255,255,255,${0.9 * dimAlpha})`;
          ctx.fillText(
            isHuman ? shortId(userId) : `Bot`,
            px + 8 * markerScale,
            py - 8 * markerScale
          );
        }
        ctx.globalAlpha = 1;
      }

      // Event markers
      visibleEvents.forEach((e) => {
        const style = EVENT_STYLES[e.e];
        if (!style || !style.symbol) return;
        if (!showEvents[e.e]) return;

        const px = (e.x || 0) * scale;
        const py = (e.y || 0) * scale;
        const r = 7 * markerScale;

        ctx.save();
        ctx.globalAlpha = dimAlpha;
        if (style.symbol === "crosshair") {
          ctx.strokeStyle = style.color;
          ctx.lineWidth = 2 * markerScale;
          ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(px - r - 3 * markerScale, py); ctx.lineTo(px + r + 3 * markerScale, py);
          ctx.moveTo(px, py - r - 3 * markerScale); ctx.lineTo(px, py + r + 3 * markerScale);
          ctx.stroke();
        } else if (style.symbol === "skull") {
          ctx.strokeStyle = style.color;
          ctx.lineWidth = 2.5 * markerScale;
          ctx.beginPath();
          ctx.moveTo(px - r, py - r); ctx.lineTo(px + r, py + r);
          ctx.moveTo(px + r, py - r); ctx.lineTo(px - r, py + r);
          ctx.stroke();
        } else if (style.symbol === "storm") {
          ctx.fillStyle = style.color;
          ctx.beginPath();
          ctx.moveTo(px, py - r - 1 * markerScale);
          ctx.lineTo(px + r + 1 * markerScale, py + r);
          ctx.lineTo(px - r - 1 * markerScale, py + r);
          ctx.closePath(); ctx.fill();
        } else if (style.symbol === "diamond") {
          const dr = 5 * markerScale;
          ctx.fillStyle = style.color;
          ctx.globalAlpha = 0.7 * dimAlpha;
          ctx.beginPath();
          ctx.moveTo(px, py - dr); ctx.lineTo(px + dr, py);
          ctx.lineTo(px, py + dr); ctx.lineTo(px - dr, py);
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      });
    });

    ctx.restore();

  }, [matchData, mapReady, canvasSize, timelinePos, showHumans, showBots, showEvents, heatmapMode, heatmapData, zoom, panOffset, highlightedPlayer]);

  // ─── Timeline display ──────────────────────────────────────────
  let minT = 0, maxT = 0;
  if (matchData) {
    minT = Infinity; maxT = -Infinity;
    Object.values(matchData.players).forEach((p) => {
      p.events.forEach((e) => {
        if (e.t < minT) minT = e.t;
        if (e.t > maxT) maxT = e.t;
      });
    });
    if (!isFinite(minT)) minT = 0;
    if (!isFinite(maxT)) maxT = 0;
  }
  const duration = maxT - minT;
  const currentTime = duration * timelinePos;

  // ─── Render ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="loading-overlay" style={{ position: "fixed", inset: 0 }}>
        <div style={{ textAlign: "center" }}>
          <div className="loading-spinner" />
          <p style={{ marginTop: 16, color: "var(--text-muted)", fontSize: 13 }}>
            Loading LILA BLACK data...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      {/* ─── Sidebar ─── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>LILA BLACK</h1>
          <div className="subtitle">Player Journey Visualizer</div>
        </div>

        <div className="sidebar-content">
          {/* Stats */}
          {stats && !matchData && (
            <div className="stats-grid fade-in">
              <div className="stat-card accent-blue">
                <div className="stat-value">{stats.unique_players}</div>
                <div className="stat-label">Players</div>
              </div>
              <div className="stat-card accent-green">
                <div className="stat-value">{stats.unique_matches}</div>
                <div className="stat-label">Matches</div>
              </div>
              <div className="stat-card accent-red">
                <div className="stat-value">
                  {(stats.events_by_type.Kill || 0) + (stats.events_by_type.BotKill || 0)}
                </div>
                <div className="stat-label">Total Kills</div>
              </div>
              <div className="stat-card accent-purple">
                <div className="stat-value">
                  {((stats.total_events || 0) / 1000).toFixed(1)}K
                </div>
                <div className="stat-label">Events</div>
              </div>
            </div>
          )}

          {/* ─── Match Info Panel (when match is loaded) ─── */}
          {matchData && matchStats && (
            <div className="match-info-panel fade-in">
              <div className="match-info-header">
                <span className={`match-map-badge ${matchData.map_id}`}>
                  {MAP_DISPLAY_NAMES[matchData.map_id] || matchData.map_id}
                </span>
                <span className="match-info-id">{shortId(matchData.match_id)}...</span>
              </div>
              <div className="match-info-stats">
                <div className="mi-stat">
                  <span className="mi-val" style={{ color: "#3b82f6" }}>{matchStats.humanCount}</span>
                  <span className="mi-lbl">Humans</span>
                </div>
                <div className="mi-stat">
                  <span className="mi-val" style={{ color: "#f97316" }}>{matchStats.botCount}</span>
                  <span className="mi-lbl">Bots</span>
                </div>
                <div className="mi-stat">
                  <span className="mi-val" style={{ color: "#ef4444" }}>{matchStats.kills}</span>
                  <span className="mi-lbl">Kills</span>
                </div>
                <div className="mi-stat">
                  <span className="mi-val" style={{ color: "#10b981" }}>{matchStats.loots}</span>
                  <span className="mi-lbl">Loots</span>
                </div>
                <div className="mi-stat">
                  <span className="mi-val" style={{ color: "#8b5cf6" }}>{matchStats.stormDeaths}</span>
                  <span className="mi-lbl">Storm</span>
                </div>
              </div>

              {/* Player List */}
              <div className="player-list-section">
                <h4>
                  Players ({playerList.length})
                  {highlightedPlayer && (
                    <button className="clear-highlight" onClick={() => setHighlightedPlayer(null)}>
                      Show All
                    </button>
                  )}
                </h4>
                <div className="player-list">
                  {playerList.map((p) => (
                    <div
                      key={p.id}
                      className={`player-item ${highlightedPlayer === p.id ? "highlighted" : ""} ${
                        highlightedPlayer && highlightedPlayer !== p.id ? "dimmed" : ""
                      }`}
                      onClick={() =>
                        setHighlightedPlayer((prev) => (prev === p.id ? null : p.id))
                      }
                    >
                      <div className="player-color-dot" style={{ background: p.color }} />
                      <div className="player-info">
                        <span className="player-name">
                          {p.isHuman ? shortId(p.id) : `Bot`}
                          <span className="player-type-badge">{p.isHuman ? "Human" : "Bot"}</span>
                        </span>
                        <span className="player-detail">
                          {p.kills > 0 && <span style={{ color: "#ef4444" }}>⊕{p.kills}</span>}
                          {p.deaths > 0 && <span style={{ color: "#f59e0b" }}>✕{p.deaths}</span>}
                          {p.loots > 0 && <span style={{ color: "#10b981" }}>◆{p.loots}</span>}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Map Filter */}
          <div className="filter-section">
            <h3>Map</h3>
            <div className="chip-group">
              <button className={`chip ${selectedMap === "all" ? "active" : ""}`} onClick={() => setSelectedMap("all")}>All Maps</button>
              {["AmbroseValley", "GrandRift", "Lockdown"].map((m) => (
                <button key={m} className={`chip ${selectedMap === m ? "active" : ""}`} onClick={() => setSelectedMap(m)}>{MAP_DISPLAY_NAMES[m]}</button>
              ))}
            </div>
          </div>

          {/* Date Filter */}
          <div className="filter-section">
            <h3>Date</h3>
            <select className="filter-select" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} id="date-filter">
              <option value="all">All Dates</option>
              {["February_10", "February_11", "February_12", "February_13", "February_14"].map((d) => (
                <option key={d} value={d}>{d.replace("_", " ")}</option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="filter-section">
            <h3>Search</h3>
            <input className="search-input" type="text" placeholder="Search by match ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} id="match-search" />
          </div>

          {/* Match List */}
          <div className="filter-section">
            <h3>Matches ({filteredMatches.length})</h3>
            <div className="match-list">
              {filteredMatches.slice(0, 50).map((m) => (
                <div
                  key={m.match_id}
                  className={`match-item ${matchData?.match_id === m.match_id ? "selected" : ""}`}
                  onClick={() => loadMatch(m.match_id)}
                  id={`match-${m.match_id.substring(0, 8)}`}
                >
                  <div className="match-header">
                    <span className="match-id">{shortId(m.match_id)}...</span>
                    <span className={`match-map ${m.map_id}`}>{MAP_DISPLAY_NAMES[m.map_id]}</span>
                  </div>
                  <div className="match-stats">
                    <span>👤 {m.human_count}</span>
                    <span>🤖 {m.bot_count}</span>
                    <span style={{ color: "var(--accent-red)" }}>⚔ {m.kills + m.bot_kills}</span>
                    <span style={{ color: "var(--accent-green)" }}>💎 {m.loots}</span>
                  </div>
                </div>
              ))}
              {filteredMatches.length > 50 && (
                <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", padding: 8 }}>
                  Showing 50 of {filteredMatches.length}
                </p>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="main-content">
        {/* Toolbar */}
        <div className="toolbar">
          <div className="toolbar-group">
            <button className={`toolbar-btn ${showHumans ? "active" : ""}`} onClick={() => setShowHumans(!showHumans)} id="toggle-humans">
              <span style={{ color: EVENT_STYLES.Position.color }}>●</span> Humans
            </button>
            <button className={`toolbar-btn ${showBots ? "active" : ""}`} onClick={() => setShowBots(!showBots)} id="toggle-bots">
              <span style={{ color: EVENT_STYLES.BotPosition.color }}>●</span> Bots
            </button>
            <div className="toolbar-divider" />
            {Object.entries(showEvents).map(([event, visible]) => (
              <button key={event} className={`toolbar-btn ${visible ? "active" : ""}`}
                onClick={() => setShowEvents((prev) => ({ ...prev, [event]: !prev[event] }))}
                id={`toggle-${event.toLowerCase()}`}
              >
                <span style={{ color: EVENT_STYLES[event]?.color }}>{EVENT_STYLES[event]?.icon}</span>{" "}
                {EVENT_STYLES[event]?.label}
              </button>
            ))}
          </div>
          <div className="toolbar-group">
            <div className="toolbar-divider" />
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Heatmap:</span>
            {HEATMAP_MODES.map((mode) => (
              <button key={mode}
                className={`toolbar-btn ${heatmapMode === mode ? "active" : ""} ${mode === "kills" ? "danger" : mode === "deaths" ? "warning" : ""}`}
                onClick={() => setHeatmapMode(mode)} id={`heatmap-${mode}`}
              >
                {mode === "off" ? "Off" : mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Map Viewport */}
        <div className="map-viewport" ref={viewportRef}>
          {!matchData ? (
            <div className="empty-state">
              <div className="empty-icon">🗺️</div>
              <h2>Select a Match</h2>
              <p>Choose a match from the sidebar to visualize player journeys, combat events, and movement patterns on the minimap.</p>
              <div className="empty-hints">
                <div className="hint-item">🖱️ <strong>Scroll</strong> to zoom in/out</div>
                <div className="hint-item">👆 <strong>Drag</strong> to pan when zoomed</div>
                <div className="hint-item">👤 <strong>Click a player</strong> to isolate their path</div>
                <div className="hint-item">🎯 <strong>Hover</strong> on events for details</div>
              </div>
            </div>
          ) : (
            <>
              <div className="map-canvas-wrapper"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                style={{ cursor: zoom > 1 ? "grab" : "crosshair" }}
              >
                <canvas ref={canvasRef} width={canvasSize} height={canvasSize} style={{ width: canvasSize, height: canvasSize }} />
              </div>

              {matchLoading && (
                <div className="loading-overlay">
                  <div style={{ textAlign: "center" }}>
                    <div className="loading-spinner" />
                    <p style={{ marginTop: 12, color: "var(--text-muted)", fontSize: 12 }}>Loading map...</p>
                  </div>
                </div>
              )}

              {/* Map Name Overlay */}
              <div className="map-name-overlay">
                {MAP_DISPLAY_NAMES[matchData.map_id] || matchData.map_id}
              </div>

              {/* Zoom Controls */}
              <div className="zoom-controls" id="zoom-controls">
                <button className="zoom-btn" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.5))} title="Zoom In" id="zoom-in">+</button>
                <span className="zoom-level">{Math.round(zoom * 100)}%</span>
                <button className="zoom-btn" onClick={() => { setZoom((z) => { const next = Math.max(MIN_ZOOM, z - 0.5); if (next <= 1) setPanOffset({ x: 0, y: 0 }); return next; }); }} title="Zoom Out" id="zoom-out">−</button>
                {zoom > 1 && <button className="zoom-btn zoom-reset" onClick={resetZoom} title="Reset Zoom" id="zoom-reset">⟲</button>}
              </div>

              {/* Legend */}
              <div className="legend">
                <div className="legend-title">LEGEND</div>
                <div className="legend-item"><div className="legend-line" style={{ background: EVENT_STYLES.Position.color }} /><span>Human</span></div>
                <div className="legend-item"><div className="legend-line" style={{ background: EVENT_STYLES.BotPosition.color }} /><span>Bot</span></div>
                <div className="legend-divider" />
                <div className="legend-item"><span style={{ color: EVENT_STYLES.Kill.color, fontWeight: 700 }}>⊕</span><span>Kill</span></div>
                <div className="legend-item"><span style={{ color: EVENT_STYLES.Killed.color, fontWeight: 700 }}>✕</span><span>Death</span></div>
                <div className="legend-item"><span style={{ color: EVENT_STYLES.Loot.color, fontWeight: 700 }}>◆</span><span>Loot</span></div>
                <div className="legend-item"><span style={{ color: EVENT_STYLES.KilledByStorm.color, fontWeight: 700 }}>▲</span><span>Storm</span></div>
              </div>

              {/* Hover Tooltip */}
              {tooltip && (
                <div className="map-tooltip" style={{ left: tooltip.screenX + 16, top: tooltip.screenY - 12, position: "fixed" }}>
                  <div className="tooltip-coords">({tooltip.mapX}, {tooltip.mapY})</div>
                  {tooltip.events.length > 0 && (
                    <div className="tooltip-events">
                      {tooltip.events.slice(0, 5).map((ev, i) => (
                        <div key={i} className="tooltip-event">
                          <span style={{ color: EVENT_STYLES[ev.event]?.color }}>{EVENT_STYLES[ev.event]?.icon}</span>
                          {" "}{EVENT_STYLES[ev.event]?.label}{" "}
                          <span className="tooltip-player">— {ev.isHuman ? shortId(ev.player) : "Bot"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Heatmap Legend */}
              {heatmapMode !== "off" && (
                <div className="heatmap-legend">
                  <h4>{heatmapMode.toUpperCase()} HEATMAP</h4>
                  <div className="heatmap-gradient" style={{
                    background: heatmapMode === "kills"
                      ? "linear-gradient(90deg, rgba(239,68,68,0.05), rgba(239,68,68,0.8))"
                      : heatmapMode === "deaths"
                      ? "linear-gradient(90deg, rgba(245,158,11,0.05), rgba(245,158,11,0.8))"
                      : "linear-gradient(90deg, rgba(59,130,246,0.05), rgba(59,130,246,0.8))",
                  }} />
                  <div className="heatmap-labels"><span>Low</span><span>High</span></div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Timeline */}
        {matchData && (
          <div className="timeline-panel">
            <div className="timeline-controls">
              <button className={`timeline-btn ${isPlaying ? "playing" : ""}`}
                onClick={() => { if (timelinePos >= 1) setTimelinePos(0); setIsPlaying(!isPlaying); }} id="play-pause-btn">
                {isPlaying ? "⏸" : "▶"}
              </button>
              <button className="timeline-btn" onClick={() => { setTimelinePos(0); setIsPlaying(false); }} id="reset-btn">⏮</button>
            </div>
            <div className="timeline-slider-wrapper">
              <input className="timeline-slider" type="range" min="0" max="1" step="0.001" value={timelinePos}
                onChange={(e) => { setTimelinePos(parseFloat(e.target.value)); setIsPlaying(false); }} id="timeline-slider" />
              <div className="timeline-time"><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div>
            </div>
            <div className="speed-control">
              <span>Speed:</span>
              {SPEEDS.map((s) => (
                <button key={s} className={`speed-btn ${playSpeed === s ? "active" : ""}`} onClick={() => setPlaySpeed(s)}>{s}x</button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Utility ─────────────────────────────────────────────────────
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [59, 130, 246];
}
