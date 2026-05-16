// pages/api/ticker.js
//
// Live deal feed for the carousel. Scoped by the viewer's role:
//   - Agency owners see their subtree of the org tree.
//   - Everyone else sees the full Blueprint Agency view.
//
// Returns the 50 most recent deals across the scope, enriched with the
// agent's display name, Discord avatar, and canonical agency role name.

import { parse } from 'cookie';
import { createClient } from '@supabase/supabase-js';
import {
  OWNER_SELF,
  subtreeOf,
  depthOf,
  getDiscordData,
} from '../../lib/discord-cache';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const GUILD_ID = process.env.DISCORD_GUILD_ID;

const TICKER_LIMIT = 50;

export default async function handler(req, res) {
  const { session: raw } = parse(req.headers.cookie || '');
  if (!raw) return res.status(401).json({ error: 'Not logged in' });

  let session;
  try { session = JSON.parse(raw); } catch (e) { return res.status(401).json({ error: 'Bad session' }); }

  // Determine scope root: owner's self if they have an owner role,
  // else everyone in Blueprint Agency.
  const ownerRole = (session.roles || []).find(r => OWNER_SELF.hasOwnProperty(r));
  const scopeRoot = ownerRole ? OWNER_SELF[ownerRole] : 'Blueprint Agency';
  const scopeRoles = new Set(subtreeOf(scopeRoot));

  try {
    const { roleIdMap, allMembers } = await getDiscordData();

    // Translate role names -> role IDs we care about.
    const scopeRoleIdToName = {};
    for (const rname of scopeRoles) {
      const rid = roleIdMap[rname];
      if (rid) scopeRoleIdToName[rid] = rname;
    }

    // Per-member: their info + deepest-role bucket (for the agency badge).
    const memberInfo = {};
    for (const m of allMembers) {
      let best = null, bestD = -1;
      for (const rid of m.roles) {
        const rname = scopeRoleIdToName[rid];
        if (!rname) continue;
        const d = depthOf(rname);
        if (d > bestD) { bestD = d; best = rname; }
      }
      if (best === null) continue; // not in scope
      memberInfo[m.user.id] = {
        display_name: m.nick || m.user.global_name || m.user.username,
        avatar: m.avatar
          ? `https://cdn.discordapp.com/guilds/${GUILD_ID}/users/${m.user.id}/avatars/${m.avatar}.png`
          : m.user.avatar
            ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png`
            : null,
        agency: best,
      };
    }

    const scopeIds = Object.keys(memberInfo);
    if (!scopeIds.length) return res.json([]);

    // 50 most recent deals — single non-paginated query, ordered DESC.
    // `message_url` is selected best-effort; if your `deals` table doesn't
    // have that column, PostgREST returns null per row and we just don't
    // render a click-through.
    let dealsQuery = supabase
      .from('deals')
      .select('discord_id, amount, posted_at, message_url')
      .in('discord_id', scopeIds)
      .order('posted_at', { ascending: false })
      .limit(TICKER_LIMIT);
    let { data: deals, error } = await dealsQuery;
    // Retry without message_url if the column doesn't exist.
    if (error && /message_url/.test(error.message || '')) {
      const retry = await supabase
        .from('deals')
        .select('discord_id, amount, posted_at')
        .in('discord_id', scopeIds)
        .order('posted_at', { ascending: false })
        .limit(TICKER_LIMIT);
      deals = retry.data;
      error = retry.error;
    }
    if (error) return res.status(500).json({ error: error.message });

    // DB user metadata override (matches the rest of the dashboard's
    // display_name / avatar precedence).
    const dealIds = (deals || []).map(d => d.discord_id);
    const { data: dbUsers } = dealIds.length
      ? await supabase.from('users').select('discord_id, display_name, avatar').in('discord_id', dealIds)
      : { data: [] };
    const dbMap = {};
    (dbUsers || []).forEach(u => { dbMap[u.discord_id] = u; });

    const result = (deals || []).map(d => {
      const info = memberInfo[d.discord_id] || {};
      const db = dbMap[d.discord_id];
      return {
        discord_id: d.discord_id,
        display_name: db?.display_name || info.display_name || 'Agent',
        avatar: db?.avatar || info.avatar || null,
        agency: info.agency || null,
        amount: d.amount,
        posted_at: d.posted_at,
        message_url: d.message_url || null,
      };
    });

    res.setHeader('Cache-Control', 'private, max-age=15');
    res.json(result);
  } catch (e) {
    console.error('Ticker error:', e);
    res.status(500).json({ error: e.message });
  }
}
