const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE = "https://api.deadlock-api.com";
const ASSETS_BASE = "https://assets.deadlock-api.com";
const STEAM_API_KEY = process.env.STEAM_API_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL || "https://collinbernardy08-star.github.io/deadlock-tracker";
const BACKEND_URL = process.env.BACKEND_URL || "https://deadlock-api-server-production.up.railway.app";

app.use(cors({ origin: "*" }));
app.use(express.json());

// ─── STEAM OAUTH ───────────────────────────────────────────

// Step 1: Redirect to Steam login
app.get("/auth/steam", (req, res) => {
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": `${BACKEND_URL}/auth/steam/callback`,
    "openid.realm": BACKEND_URL,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  res.redirect(`https://steamcommunity.com/openid/login?${params}`);
});

// Step 2: Steam redirects back here
app.get("/auth/steam/callback", async (req, res) => {
  try {
    const claimed = req.query["openid.claimed_id"] || "";
    const steamIdMatch = claimed.match(/(\d+)$/);
    if (!steamIdMatch) return res.redirect(`${FRONTEND_URL}?auth_error=invalid`);

    const steamId = steamIdMatch[1];

    // Verify with Steam
    const params = new URLSearchParams({ ...req.query, "openid.mode": "check_authentication" });
    const verifyRes = await fetch("https://steamcommunity.com/openid/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const verifyText = await verifyRes.text();
    if (!verifyText.includes("is_valid:true")) {
      return res.redirect(`${FRONTEND_URL}?auth_error=invalid`);
    }

    // Get Steam profile
    let playerName = steamId;
    let playerAvatar = "";
    if (STEAM_API_KEY) {
      const profileRes = await fetch(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${steamId}`
      );
      const profileData = await profileRes.json();
      const player = profileData?.response?.players?.[0];
      if (player) {
        playerName = player.personaname;
        playerAvatar = player.avatarfull;
      }
    }

    // Redirect back to frontend with user info
    const token = Buffer.from(JSON.stringify({ steamId, playerName, playerAvatar })).toString("base64");
    res.redirect(`${FRONTEND_URL}?token=${token}`);
  } catch (e) {
    console.error("Auth error:", e);
    res.redirect(`${FRONTEND_URL}?auth_error=server`);
  }
});

// ─── STEAM NAME → STEAM ID ────────────────────────────────
app.get("/api/search/:name", async (req, res) => {
  try {
    if (!STEAM_API_KEY) return res.status(500).json({ ok: false, error: "STEAM_API_KEY not set" });
    const name = encodeURIComponent(req.params.name);
    const r = await fetch(
      `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${STEAM_API_KEY}&vanityurl=${name}`
    );
    const data = await r.json();
    if (data.response.success === 1) {
      res.json({ ok: true, steam_id: data.response.steamid });
    } else {
      res.status(404).json({ ok: false, error: "Steam Name nicht gefunden" });
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── STEAM PROFILE ────────────────────────────────────────
app.get("/api/steam-profile/:steam_id", async (req, res) => {
  try {
    if (!STEAM_API_KEY) return res.status(500).json({ ok: false, error: "STEAM_API_KEY not set" });
    const r = await fetch(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${req.params.steam_id}`
    );
    const data = await r.json();
    const player = data?.response?.players?.[0];
    if (!player) return res.status(404).json({ ok: false, error: "Profile not found" });
    res.json({ ok: true, data: player });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── STEAM FRIENDS ────────────────────────────────────────
app.get("/api/friends/:steam_id", async (req, res) => {
  try {
    if (!STEAM_API_KEY) return res.status(500).json({ ok: false, error: "STEAM_API_KEY not set" });
    const r = await fetch(
      `https://api.steampowered.com/ISteamUser/GetFriendList/v1/?key=${STEAM_API_KEY}&steamid=${req.params.steam_id}&relationship=friend`
    );
    if (!r.ok) return res.status(200).json({ ok: true, data: [] }); // private profile
    const data = await r.json();
    const friends = data?.friendslist?.friends || [];

    // Get profiles for first 20 friends
    if (friends.length > 0) {
      const ids = friends.slice(0, 20).map(f => f.steamid).join(",");
      const profileRes = await fetch(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${ids}`
      );
      const profileData = await profileRes.json();
      const players = profileData?.response?.players || [];
      res.json({ ok: true, data: players });
    } else {
      res.json({ ok: true, data: [] });
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── HEROES ───────────────────────────────────────────────
app.get("/api/heroes", async (req, res) => {
  try {
    const r = await fetch(`${ASSETS_BASE}/v2/heroes`);
    const text = await r.text();
    const data = JSON.parse(text);
    res.json({ ok: true, data });
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
    const data = JSON.parse(text);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── HEALTH CHECK ─────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    name: "DeadlockAPI Server",
    status: "online",
    steam_key_set: !!STEAM_API_KEY,
    endpoints: [
      "GET /auth/steam",
      "GET /auth/steam/callback",
      "GET /api/search/:name",
      "GET /api/steam-profile/:steam_id",
      "GET /api/friends/:steam_id",
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
  console.log(`✅ Server läuft auf Port ${PORT}`);
  console.log(`🔑 Steam API Key: ${STEAM_API_KEY ? "gesetzt ✅" : "FEHLT ❌"}`);
  console.log(`🌐 Frontend: ${FRONTEND_URL}`);
  console.log(`🔗 Backend:  ${BACKEND_URL}`);
});
