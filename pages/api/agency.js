import { parse } from 'cookie';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const GUILD_ID = process.env.DISCORD_GUILD_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

// Full hierarchy — each owner sees their role + all downline roles
const AGENCY_HIERARCHY = {
  'Agency Owner- Blueprint': [
    'Blueprint Agency', 'The Foundation', 'THE KEY AGENCY',
    'AA FINANCIAL', 'FORMULA FINANCIAL', 'Stark Financial'
  ],
  'Agency Owner- The Foundation': [
    'The Foundation', 'THE KEY AGENCY', 'AA FINANCIAL',
    'FORMULA FINANCIAL', 'Stark Financial'
  ],
  'Agency Owner- The Key': [
    'THE KEY AGENCY', 'AA FINANCIAL', 'FORMULA FINANCIAL'
  ],
  'Agency Owner- AA FINANCIAL':      ['AA FINANCIAL'],
  'Agency Owner- Formula Financial': ['FORMULA FINANCIAL'],
  'Agency Owner- Stark Financial':   ['Stark Financial'],
};

// Summary labels for each sub-agency group
const AGENCY_LABELS = {
  'Blueprint Agency':  'Blueprint Agency',
  'The Foundation':    'The Foundation',
  'THE KEY AGENCY':    'The Key Agency',
  'AA FINANCIAL':      'AA Financial',
  'FORMULA FINANCIAL': 'Formula Financial',
  'Stark Financial':   'Stark Financial',
};

export default async function handler(req, res) {
  const { session: raw } = parse(req.headers.cookie || '');
  if (!raw) return res.status(401).json({ error: 'Not logged in' });

  let session;
  try { session = JSON.parse(raw); } catch(e) { return res.status(401).json({ error: 'Bad session' }); }

  const { period, agency, start, end } = req.query;

  const ownerRole = (session.roles || []).find(r => AGENCY_HIERARCHY.hasOwnProperty(r));
  if (!ownerRole) return res.status(403).json({ error: 'Not an agency owner' });

  // Which roles this owner can see
  const visibleRoles = AGENCY_HIERARCHY[ownerRole];

  // If filtering to specific sub-agency
  const filterRole = agency || null;
  const rolesToFetch = filterRole ? [filterRole] : visibleRoles;

  // Build date filter using Eastern Time
  const now = new Date();
  const easternStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const eastern = new Date(easternStr);
  const tzOffset = now - eastern;

  function easternMidnight() {
    const e = new Date(easternStr); e.setHours(0,0,0,0);
    return new Date(e.getTime() + tzOffset);
  }

  let startDate = null;
  let endDate = null;
  if (period === 'today') {
    startDate = easternMidnight();
  } else if (period === 'week') {
    const e = new Date(easternStr);
    e.setDate(e.getDate() - e.getDay()); e.setHours(0,0,0,0);
    startDate = new Date(e.getTime() + tzOffset);
  } else if (period === 'month') {
    const e = new Date(easternStr);
    e.setDate(1); e.setHours(0,0,0,0);
    startDate = new Date(e.getTime() + tzOffset);
  } else if (period === 'year') {
    const e = new Date(easternStr);
    e.setMonth(0); e.setDate(1); e.setHours(0,0,0,0);
    startDate = new Date(e.getTime() + tzOffset);
  } else if (period === 'custom') {
    if (start) { startDate = new Date(start); startDate.setHours(0,0,0,0); }
    if (end) { endDate = new Date(end); endDate.setHours(23,59,59,999); }
  }

  try {
    // Fetch all guild roles once
    const rolesRes = await fetch(`https://discord.com/api/guilds/${GUILD_ID}/roles`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });
    if (!rolesRes.ok) return res.status(500).json({ error: 'Failed to fetch roles' });
    const allRoles = await rolesRes.json();

    // Build role name -> ID map (case-insensitive)
    const roleIdMap = {};
    allRoles.forEach(r => {
      roleIdMap[r.name] = r.id;
      roleIdMap[r.name.toLowerCase()] = r.id;
    });

    // Fetch all guild members once
    let allMembers = [];
    let after = '0';
    while (true) {
      const membersRes = await fetch(
        `https://discord.com/api/guilds/${GUILD_ID}/members?limit=1000&after=${after}`,
        { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
      );
      if (!membersRes.ok) break;
      const members = await membersRes.json();
      if (!members.length) break;
      allMembers = allMembers.concat(members);
      if (members.length < 1000) break;
      after = members[members.length - 1].user.id;
    }

    // Build per-role member lists
    const roleMemberMap = {};
    for (const roleName of visibleRoles) {
      const roleId = roleIdMap[roleName] || roleIdMap[roleName.toLowerCase()];
      if (!roleId) continue;
      roleMemberMap[roleName] = allMembers
        .filter(m => m.roles.includes(roleId))
        .map(m => ({
          discord_id: m.user.id,
          display_name: m.nick || m.user.global_name || m.user.username,
          avatar: m.avatar
            ? `https://cdn.discordapp.com/guilds/${GUILD_ID}/users/${m.user.id}/avatars/${m.avatar}.png`
            : m.user.avatar
              ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png`
              : null,
        }));
    }

    // Get all unique member IDs across filtered roles
    const filteredRoles = filterRole ? [filterRole] : visibleRoles;
    const memberSet = new Set();
    const allMemberIds = [];
    for (const roleName of filteredRoles) {
      for (const m of (roleMemberMap[roleName] || [])) {
        if (!memberSet.has(m.discord_id)) {
          memberSet.add(m.discord_id);
          allMemberIds.push(m);
        }
      }
    }

    // Get DB users for better names/avatars
    const ids = allMemberIds.map(m => m.discord_id);
    const { data: dbUsers } = ids.length
      ? await supabase.from('users').select('discord_id, display_name, avatar').in('discord_id', ids)
      : { data: [] };
    const dbUserMap = {};
    (dbUsers || []).forEach(u => dbUserMap[u.discord_id] = u);

    // Get deals with pagination
    let deals = [];
    if (ids.length) {
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
        if (error || !data || !data.length) break;
        deals = deals.concat(data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
    }

    // Aggregate deals by user
    const dealMap = {};
    deals.forEach(d => {
      if (!dealMap[d.discord_id]) dealMap[d.discord_id] = { total: 0, count: 0 };
      dealMap[d.discord_id].total += parseFloat(d.amount);
      dealMap[d.discord_id].count++;
    });

    // Build leaderboard
    const leaderboard = allMemberIds
      .map(m => {
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

    // Build per-agency summaries for the owner to see breakdowns
    const agencySummaries = [];
    for (const roleName of visibleRoles) {
      const roleMembers = roleMemberMap[roleName] || [];
      const roleMemberIds = new Set(roleMembers.map(m => m.discord_id));
      const roleDeals = deals.filter(d => roleMemberIds.has(d.discord_id));
      const roleTotal = roleDeals.reduce((s, d) => s + parseFloat(d.amount), 0);
      const roleCount = roleDeals.length;
      agencySummaries.push({
        role: roleName,
        label: AGENCY_LABELS[roleName] || roleName,
        total_production: roleTotal,
        total_deals: roleCount,
        agent_count: roleMembers.length,
      });
    }

    const summary = {
      total_production: leaderboard.reduce((s, u) => s + u.total, 0),
      total_deals: leaderboard.reduce((s, u) => s + u.count, 0),
      agent_count: leaderboard.length,
    };

    res.json({
      leaderboard,
      summary,
      agency_summaries: agencySummaries,
      filter_role: filterRole,
      owner_role: ownerRole,
      visible_roles: visibleRoles,
    });
  } catch(e) {
    console.error('Agency error:', e);
    res.status(500).json({ error: e.message });
  }
}
}
