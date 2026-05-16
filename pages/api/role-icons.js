// pages/api/role-icons.js
//
// Returns a map of { agencyRoleName: discordCdnUrl } for the agency roles
// the dashboard renders. The dashboard fetches this on mount, populates
// state, and uses the URLs everywhere logos appear (header, breakdown,
// ticker). No base64 in the codebase — icons are pulled live from
// Discord and re-render automatically when you swap a role icon in
// Server Settings.

import { parse } from 'cookie';

const GUILD_ID = process.env.DISCORD_GUILD_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const AGENCY_ROLE_NAMES = [
  'Blueprint Agency',
  'The Foundation',
  'THE KEY AGENCY',
  'AA FINANCIAL',
  'FORMULA FINANCIAL',
  'Stark Financial',
];

// In-memory cache. Role icons change rarely; refetching on every dashboard
// load wastes Discord rate-limit budget.
let CACHE = { data: null, at: 0 };
const TTL_MS = 5 * 60 * 1000; // 5 minutes

export default async function handler(req, res) {
  // Require a session cookie. The CDN URLs themselves are public, but
  // gating the endpoint keeps it consistent with the rest of /api/*.
  const cookies = parse(req.headers.cookie || '');
  if (!cookies.session) return res.status(401).json({ error: 'Not logged in' });

  if (CACHE.data && Date.now() - CACHE.at < TTL_MS) {
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.json(CACHE.data);
  }

  try {
    const r = await fetch(`https://discord.com/api/guilds/${GUILD_ID}/roles`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });
    if (!r.ok) {
      return res.status(500).json({ error: 'Discord roles fetch failed' });
    }
    const roles = await r.json();
    const result = {};
    for (const role of roles) {
      if (!AGENCY_ROLE_NAMES.includes(role.name)) continue;
      if (role.icon) {
        // size=128 gives a nice resolution for header (64px) and 2x retina.
        result[role.name] = `https://cdn.discordapp.com/role-icons/${role.id}/${role.icon}.png?size=128`;
      }
    }
    CACHE = { data: result, at: Date.now() };
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.json(result);
  } catch (e) {
    console.error('role-icons error:', e);
    res.status(500).json({ error: e.message });
  }
}
