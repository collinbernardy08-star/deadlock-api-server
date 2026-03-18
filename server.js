const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE = "https://api.deadlock-api.com";
const ASSETS_BASE = "https://assets.deadlock-api.com";

app.use(cors({ origin: "*" }));
app.use(express.json());

// ─── HEROES ───────────────────────────────────────────────
app.get("/api/heroes", async (req, res) => {
  try {
    const r = await fetch(`${ASSETS_BASE}/v2/heroes`);
    const text = await r.text();
    console.log("heroes status:", r.status);
    const data = JSON.parse(text);
    res.json({ ok: true, source: "assets.deadlock-api.com", data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/heroes/:id", async (req, res) => {
  try {
    const r = await fetch(`${ASSETS_BASE}/v2/heroes/${req.params.id}`);
    if (!r.ok) return res.status(404).json({ ok: false, error: "Hero not found" });
    const data = await r.json();
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── META / STATS ──────────────────────────────────────────
app.get("/api/meta/heroes", async (req, res) => {
  try {
    const r = await fetch(`${API_BASE}/v3/analytics/hero-stats`);
    const text = await r.text();
    console.log("meta/heroes status:", r.status);
    const data = JSON.parse(text);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── PLAYER ───────────────────────────────────────────────
app.get("/api/players/:steam_id", async (req, res) => {
  try {
    const r = await fetch(`${API_BASE}/v1/players/${req.params.steam_id}/summary`);
    if (!r.ok) return res.status(404).json({ ok: false, error: "Player not found" });
    const data = await r.json();
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/players/:steam_id/matches", async (req, res) => {
  try {
    const limit = req.query.limit || 20;
    const r = await fetch(`${API_BASE}/v1/players/${req.params.steam_id}/match-history?limit=${limit}`);
    if (!r.ok) return res.status(404).json({ ok: false, error: "Player not found" });
    const data = await r.json();
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── MATCHES ──────────────────────────────────────────────
app.get("/api/matches/:id", async (req, res) => {
  try {
    const r = await fetch(`${API_BASE}/v1/matches/${req.params.id}`);
    if (!r.ok) return res.status(404).json({ ok: false, error: "Match not found" });
    const data = await r.json();
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── LEADERBOARD ──────────────────────────────────────────
app.get("/api/leaderboard", async (req, res) => {
  try {
    const region = req.query.region || "Europe";
    const r = await fetch(`${API_BASE}/v1/leaderboard?region=${region}`);
    const text = await r.text();
    console.log("leaderboard status:", r.status);
    const data = JSON.parse(text);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── HEALTH CHECK ─────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    name: "DeadlockAPI – Dein eigener Server",
    status: "online",
    endpoints: [
      "GET /api/heroes",
      "GET /api/heroes/:id",
      "GET /api/meta/heroes",
      "GET /api/players/:steam_id",
      "GET /api/players/:steam_id/matches",
      "GET /api/matches/:id",
      "GET /api/leaderboard?region=Europe",
    ]
  });
});

app.listen(PORT, () => {
  console.log(`✅ DeadlockAPI Server läuft auf Port ${PORT}`);
});
