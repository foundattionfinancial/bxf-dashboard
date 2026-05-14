import { parse } from 'cookie';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const GUILD_ID = process.env.DISCORD_GUILD_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const AGENCY_OWNER_MAP = {
  'Agency Owner- Blueprint':         null,
  'Agency Owner- The Foundation':    'The Foundation',
  'Agency Owner- The Key':           'THE KEY AGENCY',
  'Agency Owner- AA Financial':      'AA FINANCIAL',
  'Agency Owner- Formula Financial': 'FORMULA FINANCIAL',
  'Agency Owner- Stark Financial':   'STARK FINANCIAL',
};

export default async function handler(req, res) {
  const { session: raw } = parse(req.headers.cookie || '');
  if (!raw) return res.status(401).json({ error: 'Not logged in' });

  let session;
  try { session = JSON.parse(raw); } catch(e) { return res.status(401).json({ error: 'Bad session' }); }

  const { period, agency, start, end } = req.query;

  const ownerRole = (session.roles || []).find(r => AGENCY_OWNER_MAP.hasOwnProperty(r));
  if (!ownerRole) return res.status(403).json({ error: 'Not an agency owner' });

  const filterRole = agency !== undefined ? agency : AGENCY_OWNER_MAP[ownerRole];

  // Build date filter
  let startDate = null;
  let endDate = null;
  const now = new Date();
  if (period === 'today') {
    startDate = new Date(now); startDate.setHours(0,0,0,0);
  } else if (period === 'week') {
    startDate = new Date(now); startDate.setDate(startDate.getDate() - startDate.getDay()); startDate.setHours(0,0,0,0);
  } else if (period === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === 'year') {
    startDate = new Date(now.getFullYear(), 0, 1);
  } else if (period === 'custom') {
    if (start) { startDate = new Date(start); startDate.setHours(0,0,0,0); }
    if (end) { endDate = new Date(end); endDate.setHours(23,59,59,999); }
  }

  try {
    // Step 1: Get ALL members with the target role from Discord
    let allMemberIds = [];

    if (filterRole) {
      // Get role ID
      const rolesRes = await fetch(`https://discord.com/api/guilds/${GUILD_ID}/roles`, {
        headers: { Authorization: `Bot ${BOT_TOKEN}` },
      });
      if (!rolesRes.ok) return res.status(500).json({ error: 'Failed to fetch roles' });
      const allRoles = await rolesRes.json();
      const targetRole = allRoles.find(r => r.name === filterRole);
      if (!targetRole) return res.json({ leaderboard: [], summary: { total_production: 0, total_deals: 0, agent_count: 0 } });

      // Paginate through ALL guild members
      let after = '0';
      while (true) {
        const membersRes = await fetch(
          `https://discord.com/api/guilds/${GUILD_ID}/members?limit=1000&after=${after}`,
          { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
        );
        if (!membersRes.ok) break;
        const members = await membersRes.json();
        if (!members.length) break;
        members.forEach(m => {
          if (m.roles.includes(targetRole.id)) {
            allMemberIds.push({
              discord_id: m.user.id,
              display_name: m.nick || m.user.global_name || m.user.username,
              avatar: m.avatar
                ? `https://cdn.discordapp.com/guilds/${GUILD_ID}/users/${m.user.id}/avatars/${m.avatar}.png`
                : m.user.avatar
                  ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png`
                  : null,
            });
          }
        });
        if (members.length < 1000) break;
        after = members[members.length - 1].user.id;
      }
    } else {
      // Blueprint owner — get all users from our DB
      const { data: allUsers } = await supabase
        .from('users')
        .select('discord_id, display_name, avatar');
      allMemberIds = allUsers || [];
    }

    if (!allMemberIds.length) {
      return res.json({ leaderboard: [], summary: { total_production: 0, total_deals: 0, agent_count: 0 }, filter_role: filterRole });
    }

    const ids = allMemberIds.map(m => m.discord_id);

    // Step 2: Get deals for these members in the time period
    let deals = [];
    let from = 0;
    const PAGE_SIZE = 1000;

    while (true) {
      let query = supabase
        .from('deals')
        .select('discord_id, amount, posted_at')
        .in('discord_id', ids)
        .range(from, from + PAGE_SIZE - 1);

      if (startDate) query = query.gte('posted_at', startDate.toISOString());
      if (endDate) query = query.lte('posted_at', endDate.toISOString());

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      if (!data || data.length === 0) break;
      deals = deals.concat(data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    // Step 3: Aggregate deals by user
    const dealMap = {};
    deals.forEach(d => {
      if (!dealMap[d.discord_id]) dealMap[d.discord_id] = { total: 0, count: 0 };
      dealMap[d.discord_id].total += parseFloat(d.amount);
      dealMap[d.discord_id].count++;
    });

    // Step 4: Also get display names from our users table for anyone we have
    const { data: dbUsers } = await supabase
      .from('users')
      .select('discord_id, display_name, avatar')
      .in('discord_id', ids);

    const dbUserMap = {};
    (dbUsers || []).forEach(u => dbUserMap[u.discord_id] = u);

    // Step 5: Build leaderboard with ALL members (even $0)
    const leaderboard = allMemberIds
      .map(m => {
        // Prefer DB name (more up to date from bot), fallback to Discord API name
        const dbUser = dbUserMap[m.discord_id];
        return {
          discord_id: m.discord_id,
          display_name: dbUser?.display_name || m.display_name || 'Unknown',
          avatar: dbUser?.avatar || m.avatar || null,
          total: dealMap[m.discord_id]?.total || 0,
          count: dealMap[m.discord_id]?.count || 0,
        };
      })
      .sort((a, b) => b.total - a.total)
      .map((u, i) => ({ ...u, rank: i + 1 }));

    const summary = {
      total_production: leaderboard.reduce((s, u) => s + u.total, 0),
      total_deals: leaderboard.reduce((s, u) => s + u.count, 0),
      agent_count: leaderboard.length,
    };

    res.json({ leaderboard, summary, filter_role: filterRole, owner_role: ownerRole });
  } catch(e) {
    console.error('Agency error:', e);
    res.status(500).json({ error: e.message });
  }
}
