// pages/api/agency.js
//
// True hierarchical model. Each request renders ONE node in the tree —
// drill-down is just "view a different node". Members are bucketed
// exclusively into their deepest role, so rollups don't double-count.
//
// Tree:
//   Blueprint Agency
//     └─ The Foundation
//          ├─ THE KEY AGENCY
//          │    ├─ AA FINANCIAL
//          │    └─ FORMULA FINANCIAL
//          └─ Stark Financial
//
// Each owner can view their own subtree. Blueprint owner sees the whole
// tree; Foundation owner sees Foundation down; Key owner sees Key down;
// AA/Formula/Stark owners only see themselves.

import { parse } from 'cookie';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const GUILD_ID = process.env.DISCORD_GUILD_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const AGENCY_TREE = {
  'Blueprint Agency':  { parent: null,                children: ['The Foundation'],                       label: 'Blueprint Agency' },
  'The Foundation':    { parent: 'Blueprint Agency', children: ['THE KEY AGENCY', 'Stark Financial'],    label: 'The Foundation' },
  'THE KEY AGENCY':    { parent: 'The Foundation',   children: ['AA FINANCIAL', 'FORMULA FINANCIAL'],   label: 'The Key Agency' },
  'AA FINANCIAL':      { parent: 'THE KEY AGENCY',   children: [],                                       label: 'AA Financial' },
  'FORMULA FINANCIAL': { parent: 'THE KEY AGENCY',   children: [],                                       label: 'Formula Financial' },
  'Stark Financial':   { parent: 'The Foundation',   children: [],                                       label: 'Stark Financial' },
};

const OWNER_SELF = {
  'Agency Owner- Blueprint':         'Blueprint Agency',
  'Agency Owner- The Foundation':    'The Foundation',
  'Agency Owner- The Key':           'THE KEY AGENCY',
  'Agency Owner- AA FINANCIAL':      'AA FINANCIAL',
  'Agency Owner- Formula Financial': 'FORMULA FINANCIAL',
  'Agency Owner- Stark Financial':   'Stark Financial',
};

function subtreeOf(node) {
  if (!AGENCY_TREE[node]) return [];
  const out = [node];
  for (const c of AGENCY_TREE[node].children) out.push(...subtreeOf(c));
  return out;
}

function depthOf(node) {
  let d = 0;
  let cur = AGENCY_TREE[node]?.parent;
  while (cur) { d++; cur = AGENCY_TREE[cur].parent; }
  return d;
}

// Path from owner's root agency down to a node, inclusive.
function pathFromOwnerTo(ownerSelf, target) {
  const sub = new Set(subtreeOf(ownerSelf));
  if (!sub.has(target)) return null;
  const path = [];
  let cur = target;
  while (cur && cur !== ownerSelf) {
    path.unshift(cur);
    cur = AGENCY_TREE[cur].parent;
  }
  path.unshift(ownerSelf);
  return path;
}

// ---------- Eastern Time helpers (TZ-independent) ----------

function easternPartsOf(utcDate) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(utcDate);
  const m = {};
  parts.forEach(p => { if (p.type !== 'literal') m[p.type] = p.value; });
  return {
    year:  parseInt(m.year, 10),
    month: parseInt(m.month, 10),
    day:   parseInt(m.day, 10),
    hour:  parseInt(m.hour === '24' ? '0' : m.hour, 10),
    minute: parseInt(m.minute, 10),
    second: parseInt(m.second, 10),
  };
}
function easternOffsetMinutes(utcDate) {
  const e = easternPartsOf(utcDate);
  const eAsUtc = Date.UTC(e.year, e.month-1, e.day, e.hour, e.minute, e.second);
  return (eAsUtc - utcDate.getTime()) / 60000;
}
function easternToUtc(y,m,d,h=0,mi=0,s=0) {
  const guess = new Date(Date.UTC(y, m-1, d, h, mi, s));
  return new Date(guess.getTime() - easternOffsetMinutes(guess) * 60000);
}
function easternMidnightOfToday() { const e = easternPartsOf(new Date()); return easternToUtc(e.year, e.month, e.day); }
function easternMidnightOfWeek() {
  const e = easternPartsOf(new Date());
  const probe = new Date(Date.UTC(e.year, e.month-1, e.day));
  const startUtc = new Date(probe.getTime() - probe.getUTCDay() * 86400000);
  return easternToUtc(startUtc.getUTCFullYear(), startUtc.getUTCMonth()+1, startUtc.getUTCDate());
}
function easternMidnightOfMonth() { const e = easternPartsOf(new Date()); return easternToUtc(e.year, e.month, 1); }
function easternMidnightOfYear()  { const e = easternPartsOf(new Date()); return easternToUtc(e.year, 1, 1); }
function parseEasternYmd(ymd, endOfDay = false) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  if (!m) return null;
  const [, y, mo, d] = m;
  return endOfDay ? easternToUtc(+y, +mo, +d, 23, 59, 59) : easternToUtc(+y, +mo, +d, 0, 0, 0);
}

// ============================================================================

export default async function handler(req, res) {
  const { session: raw } = parse(req.headers.cookie || '');
  if (!raw) return res.status(401).json({ error: 'Not logged in' });

  let session;
  try { session = JSON.parse(raw); } catch (e) { return res.status(401).json({ error: 'Bad session' }); }

  const { period, node: nodeParam, agency: legacyAgency, direct: directParam, start, end } = req.query;

  const ownerRole = (session.roles || []).find(r => OWNER_SELF.hasOwnProperty(r));
  if (!ownerRole) return res.status(403).json({ error: 'Not an agency owner' });
  const ownerSelf = OWNER_SELF[ownerRole];

  // Resolve current node. Accept both `node` (new) and `agency` (legacy) params.
  let requestedNode = nodeParam || legacyAgency || ownerSelf;
  let isDirectView = directParam === 'true';
  if (requestedNode === '__direct__') {
    // Legacy: '__direct__' meant "direct view of owner's self"
    requestedNode = ownerSelf;
    isDirectView = true;
  }
  const ownerSubtree = new Set(subtreeOf(ownerSelf));
  if (!ownerSubtree.has(requestedNode)) {
    return res.status(403).json({ error: 'Not authorized to view this agency' });
  }
  const node = requestedNode;
  const nodeMeta = AGENCY_TREE[node];
  const breadcrumb = pathFromOwnerTo(ownerSelf, node).map(r => ({
    role: r,
    label: AGENCY_TREE[r].label,
  }));

  // ----- Period -> Eastern date range -----
  let startDate = null, endDate = null;
  if (period === 'today') startDate = easternMidnightOfToday();
  else if (period === 'week')  startDate = easternMidnightOfWeek();
  else if (period === 'month') startDate = easternMidnightOfMonth();
  else if (period === 'year')  startDate = easternMidnightOfYear();
  else if (period === 'custom') {
    if (start) startDate = parseEasternYmd(start, false);
    if (end)   endDate   = parseEasternYmd(end, true);
  }
  const heatmapFloor = easternToUtc(2025, 1, 1);
  const ytdStart = easternMidnightOfYear();
  const heatmapStart = ytdStart.getTime() < heatmapFloor.getTime() ? heatmapFloor : ytdStart;

  try {
    // ----- Discord roles + role icons -----
    const rolesRes = await fetch(`https://discord.com/api/guilds/${GUILD_ID}/roles`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });
    if (!rolesRes.ok) return res.status(500).json({ error: 'Failed to fetch roles' });
    const allRoles = await rolesRes.json();
    const roleIdMap = {};
    const roleIcons = {};
    allRoles.forEach(r => {
      roleIdMap[r.name] = r.id;
      if (r.icon) {
        roleIcons[r.name] = `https://cdn.discordapp.com/role-icons/${r.id}/${r.icon}.png?size=128`;
      }
    });

    // ----- All guild members (paginated) -----
    let allMembers = [];
    let after = '0';
    while (true) {
      const r = await fetch(
        `https://discord.com/api/guilds/${GUILD_ID}/members?limit=1000&after=${after}`,
        { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
      );
      if (!r.ok) break;
      const m = await r.json();
      if (!m.length) break;
      allMembers = allMembers.concat(m);
      if (m.length < 1000) break;
      after = m[m.length - 1].user.id;
    }

    // ----- Map members to their agency roles (within owner's subtree) -----
    const visibleRoles = Array.from(ownerSubtree);
    const roleMemberMap = {};
    for (const roleName of visibleRoles) {
      const rid = roleIdMap[roleName];
      if (!rid) { roleMemberMap[roleName] = []; continue; }
      roleMemberMap[roleName] = allMembers
        .filter(m => m.roles.includes(rid))
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

    // ----- Compute deepest-role bucket per member -----
    const memberInfo = {};
    const memberRolesSet = {};
    for (const roleName of visibleRoles) {
      for (const m of roleMemberMap[roleName]) {
        if (!memberInfo[m.discord_id]) memberInfo[m.discord_id] = m;
        if (!memberRolesSet[m.discord_id]) memberRolesSet[m.discord_id] = new Set();
        memberRolesSet[m.discord_id].add(roleName);
      }
    }
    const memberBucket = {};
    for (const id of Object.keys(memberRolesSet)) {
      let best = null, bestD = -1;
      for (const r of memberRolesSet[id]) {
        const d = depthOf(r);
        if (d > bestD) { bestD = d; best = r; }
      }
      memberBucket[id] = best;
    }

    // ----- Scope members to current node's subtree -----
    const nodeSubtree = new Set(subtreeOf(node));
    const scopeAllIds = Object.keys(memberInfo).filter(id => nodeSubtree.has(memberBucket[id]));
    const scopeIds = isDirectView
      ? scopeAllIds.filter(id => memberBucket[id] === node)
      : scopeAllIds;

    // ----- DB user metadata override -----
    const { data: dbUsers } = scopeIds.length
      ? await supabase.from('users').select('discord_id, display_name, avatar').in('discord_id', scopeIds)
      : { data: [] };
    const dbUserMap = {};
    (dbUsers || []).forEach(u => { dbUserMap[u.discord_id] = u; });

    // ----- Deals fetchers -----
    async function fetchDeals(idsList, fromDate, toDate) {
      if (!idsList.length) return [];
      const out = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        let q = supabase
          .from('deals')
          .select('discord_id, amount, posted_at')
          .in('discord_id', idsList)
          .range(from, from + PAGE - 1);
        if (fromDate) q = q.gte('posted_at', fromDate.toISOString());
        if (toDate)   q = q.lte('posted_at', toDate.toISOString());
        const { data, error } = await q;
        if (error || !data || !data.length) break;
        out.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return out;
    }

    // Pull period deals for the FULL node subtree so the breakdown reflects
    // every bucket, even when the user has toggled Direct view.
    const periodDeals = await fetchDeals(scopeAllIds, startDate, endDate);
    // Heatmap respects the active view (direct toggle).
    const heatmapDeals = await fetchDeals(scopeIds, heatmapStart, null);

    // ----- Leaderboard for the active view -----
    const scopeSet = new Set(scopeIds);
    const dealMap = {};
    periodDeals.forEach(d => {
      if (!scopeSet.has(d.discord_id)) return;
      if (!dealMap[d.discord_id]) dealMap[d.discord_id] = { total: 0, count: 0 };
      dealMap[d.discord_id].total += parseFloat(d.amount);
      dealMap[d.discord_id].count++;
    });
    const leaderboard = scopeIds
      .map(id => {
        const m = memberInfo[id];
        const db = dbUserMap[id];
        return {
          discord_id: id,
          display_name: db?.display_name || m.display_name || 'Unknown',
          avatar: db?.avatar || m.avatar || null,
          bucket: memberBucket[id],
          total: dealMap[id]?.total || 0,
          count: dealMap[id]?.count || 0,
        };
      })
      .sort((a, b) => b.total - a.total)
      .map((u, i) => ({ ...u, rank: i + 1 }));

    // ----- Breakdown: Direct first, then direct children -----
    const breakdown = [];
    if (nodeMeta.children.length > 0) {
      const directIds   = scopeAllIds.filter(id => memberBucket[id] === node);
      const directDeals = periodDeals.filter(d => memberBucket[d.discord_id] === node);
      breakdown.push({
        role: '__direct__',
        node_role: node,
        label: `${nodeMeta.label} (Direct)`,
        is_direct: true,
        sub_count: 0,
        total_production: directDeals.reduce((s, d) => s + parseFloat(d.amount), 0),
        total_deals: directDeals.length,
        agent_count: directIds.length,
      });
    }
    for (const childRole of nodeMeta.children) {
      const childSub = new Set(subtreeOf(childRole));
      const childIds   = scopeAllIds.filter(id => childSub.has(memberBucket[id]));
      const childDeals = periodDeals.filter(d => childSub.has(memberBucket[d.discord_id]));
      breakdown.push({
        role: childRole,
        label: AGENCY_TREE[childRole].label,
        is_direct: false,
        sub_count: AGENCY_TREE[childRole].children.length,
        has_children: AGENCY_TREE[childRole].children.length > 0,
        total_production: childDeals.reduce((s, d) => s + parseFloat(d.amount), 0),
        total_deals: childDeals.length,
        agent_count: childIds.length,
      });
    }

    // ----- Summary (reflects the active view) -----
    const summary = {
      total_production: leaderboard.reduce((s, u) => s + u.total, 0),
      total_deals: leaderboard.reduce((s, u) => s + u.count, 0),
      agent_count: leaderboard.length,
    };

    // ----- Heatmap daily map (Eastern date bucketing) -----
    const dailyMap = {};
    heatmapDeals.forEach(d => {
      const dt = new Date(d.posted_at);
      const e = easternPartsOf(dt);
      const key = `${e.year}-${String(e.month).padStart(2, '0')}-${String(e.day).padStart(2, '0')}`;
      dailyMap[key] = (dailyMap[key] || 0) + parseFloat(d.amount);
    });

    // Expose role icons for all roles the dashboard might render
    const exposedRoles = new Set([...visibleRoles, 'Blueprint Agency']);
    const exposedRoleIcons = {};
    for (const name of Object.keys(roleIcons)) {
      if (exposedRoles.has(name)) exposedRoleIcons[name] = roleIcons[name];
    }

    res.json({
      // New tree-aware response shape
      node,
      node_label: nodeMeta.label,
      parent_node: nodeMeta.parent,
      has_children: nodeMeta.children.length > 0,
      sub_count: nodeMeta.children.length,
      is_direct_view: isDirectView,
      breadcrumb,
      breakdown,
      summary,
      leaderboard,
      daily_map: dailyMap,
      role_icons: exposedRoleIcons,
      // Owner context
      owner_role: ownerRole,
      owner_self: ownerSelf,
      // Legacy keys (kept for back-compat with any cached frontend)
      agency_summaries: breakdown,
      self_role: ownerSelf,
      self_label: AGENCY_TREE[ownerSelf].label,
      filter_role: isDirectView ? '__direct__' : (node === ownerSelf ? null : node),
      visible_roles: visibleRoles,
    });
  } catch (e) {
    console.error('Agency error:', e);
    res.status(500).json({ error: e.message });
  }
}
