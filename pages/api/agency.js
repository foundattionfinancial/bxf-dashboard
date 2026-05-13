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
};

export default async function handler(req, res) {
  const { session: raw } = parse(req.headers.cookie || '');
  if (!raw) return res.status(401).json({ error: 'Not logged in' });

  let session;
  try { session = JSON.parse(raw); } catch(e) { return res.status(401).json({ error: 'Bad session' }); }

  const { period, agency } = req.query;

  const ownerRole = (session.roles || []).find(r => AGENCY_OWNER_MAP.hasOwnProperty(r));
  if (!ownerRole) return res.status(403).json({ error: 'Not an agency owner' });

  const filterRole = agency !== undefined ? agency : AGENCY_OWNER_MAP[ownerRole];

  // Build date filter
  let startDate = null;
  const now = new Date();
  if (period === 'today') {
    startDate = new Date(now); startDate.setHours(0,0,0,0);
  } else if (period === 'week') {
    startDate = new Date(now); startDate.setDate(startDate.getDate() - startDate.getDay()); startDate.setHours(0,0,0,0);
  } else if (period === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === 'year') {
    startDate = new Date(now.getFullYear(), 0, 1);
  }

  try {
    let allowedIds = null;

    if (filterRole) {
      // Get all guild roles to find target role ID
      const rolesRes = await fetch(`https://discord.com/api/guilds/${GUILD_ID}/roles`, {
        headers: { Authorization: `Bot ${BOT_TOKEN}` },
      });
      if (!rolesRes.ok) return res.status(500).json({ error: 'Failed to fetch roles' });
      const allRoles = await rolesRes.json();
      const targetRole = allRoles.find(r => r.name === filterRole);
      if (!targetRole) return res.json({ leaderboard: [], summary: { total_production: 0, total_deals: 0, agent_count: 0 } });

      // Get all our known users
      const { data: allUsers } = await supabase.from('users').select('discord_id');
      const knownIds = new Set((allUsers || []).map(u => u.discord_id));

      // Paginate through guild members to find who has the target role
      allowedIds = [];
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
          if (m.roles.includes(targetRole.id) && knownIds.has(m.user.id)) {
            allowedIds.push(m.user.id);
          }
        });
        if (members.length < 1000) break;
        after = members[members.length - 1].user.id;
      }

      if (!allowedIds.length) {
        return res.json({ leaderboard: [], summary: { total_production: 0, total_deals: 0, agent_count: 0 }, filter_role: filterRole });
      }
    }

    // Fetch deals
    let query = supabase.from('deals').select('discord_id, amount, posted_at');
    if (startDate) query = query.gte('posted_at', startDate.toISOString());
    if (allowedIds) query = query.in('discord_id', allowedIds);

    const { data: deals, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // Aggregate
    const map = {};
    (deals || []).forEach(d => {
      if (!map[d.discord_id]) map[d.discord_id] = { total: 0, count: 0 };
      map[d.discord_id].total += parseFloat(d.amount);
      map[d.discord_id].count++;
    });

    const ids = Object.keys(map);
    if (!ids.length) {
      return res.json({ leaderboard: [], summary: { total_production: 0, total_deals: 0, agent_count: 0 }, filter_role: filterRole });
    }

    const { data: users } = await supabase
      .from('users')
      .select('discord_id, display_name, avatar')
      .in('discord_id', ids);

    const userMap = {};
    (users || []).forEach(u => userMap[u.discord_id] = u);

    const leaderboard = Object.entries(map)
      .map(([id, stats]) => ({
        discord_id: id,
        display_name: userMap[id]?.display_name || 'Unknown',
        avatar: userMap[id]?.avatar || null,
        total: stats.total,
        count: stats.count,
      }))
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
