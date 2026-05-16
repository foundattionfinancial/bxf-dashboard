import { parse } from 'cookie';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const GUILD_ID = process.env.DISCORD_GUILD_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const AGENCY_HIERARCHY = {
  'Agency Owner- Blueprint':         ['Blueprint Agency','The Foundation','THE KEY AGENCY','AA FINANCIAL','FORMULA FINANCIAL','Stark Financial'],
  'Agency Owner- The Foundation':    ['The Foundation','THE KEY AGENCY','AA FINANCIAL','FORMULA FINANCIAL','Stark Financial'],
  'Agency Owner- The Key':           ['THE KEY AGENCY','AA FINANCIAL','FORMULA FINANCIAL'],
  'Agency Owner- AA FINANCIAL':      ['AA FINANCIAL'],
  'Agency Owner- Formula Financial': ['FORMULA FINANCIAL'],
  'Agency Owner- Stark Financial':   ['Stark Financial'],
};

const ROLE_LABELS = {
  'Blueprint Agency':  'Blueprint',
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

  const ownerRole = (session.roles || []).find(r => AGENCY_HIERARCHY[r]);
  if (!ownerRole) return res.status(403).json({ error: 'Not an agency owner' });

  const visibleRoles = AGENCY_HIERARCHY[ownerRole];

  try {
    // Fetch all guild roles
    const rolesRes = await fetch(`https://discord.com/api/guilds/${GUILD_ID}/roles`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` }
    });
    const allRoles = await rolesRes.json();
    const roleIdMap = {};
    allRoles.forEach(r => { roleIdMap[r.id] = r.name; });

    // Fetch all members once
    let allMembers = [];
    let after = '0';
    while (true) {
      const res2 = await fetch(
        `https://discord.com/api/guilds/${GUILD_ID}/members?limit=1000&after=${after}`,
        { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
      );
      const batch = await res2.json();
      if (!batch.length) break;
      allMembers = allMembers.concat(batch);
      if (batch.length < 1000) break;
      after = batch[batch.length - 1].user.id;
    }

    // Build member → agency map (use most specific role)
    // Priority: sub-agencies first (AA, Formula, Stark, Key) then Foundation then Blueprint
    const memberAgencyMap = {};
    const rolePriority = [...visibleRoles].reverse(); // most specific first

    allMembers.forEach(m => {
      const memberRoleNames = m.roles.map(id => roleIdMap[id]).filter(Boolean);
      // Find which visible role this member belongs to (most specific)
      for (const roleName of rolePriority) {
        if (memberRoleNames.includes(roleName)) {
          memberAgencyMap[m.user.id] = ROLE_LABELS[roleName] || roleName;
          break;
        }
      }
    });

    const memberIds = Object.keys(memberAgencyMap);
    if (!memberIds.length) return res.json([]);

    // Get last 50 deals from these members
    const { data: deals, error } = await supabase
      .from('deals')
      .select('discord_id, amount, posted_at, message_url')
      .in('discord_id', memberIds)
      .order('posted_at', { ascending: false })
      .limit(50);

    if (error) return res.status(500).json({ error: error.message });

    // Get display names from users table
    const dealIds = [...new Set(deals.map(d => d.discord_id))];
    const { data: users } = await supabase
      .from('users')
      .select('discord_id, display_name, avatar')
      .in('discord_id', dealIds);

    const userMap = {};
    (users || []).forEach(u => { userMap[u.discord_id] = u; });

    const result = deals.map(d => ({
      discord_id: d.discord_id,
      amount: d.amount,
      posted_at: d.posted_at,
      message_url: d.message_url,
      display_name: userMap[d.discord_id]?.display_name || 'Agent',
      avatar: userMap[d.discord_id]?.avatar || null,
      agency: memberAgencyMap[d.discord_id] || '',
    }));

    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  } catch(e) {
    console.error('Ticker error:', e);
    res.status(500).json({ error: e.message });
  }
}
