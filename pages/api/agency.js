// pages/api/agency.js
import { parse } from 'cookie';
import { createClient } from '@supabase/supabase-js';
import {
  AGENCY_TREE,
  OWNER_SELF,
  subtreeOf,
  depthOf,
  pathFromOwnerTo,
  getDiscordData,
} from '../../lib/discord-cache';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const GUILD_ID = process.env.DISCORD_GUILD_ID;

// ---------- Eastern Time helpers ----------

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

  let requestedNode = nodeParam || legacyAgency || ownerSelf;
  let isDirectView = directParam === 'true';
  if (requestedNode === '__direct__') {
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
  // Explicit start/end params ALWAYS take precedence over the period preset.
  // The dashboard sends start+end when the user navigates prev/next through
  // weeks/months (period stays 'week'/'month' for the UI label, but the
  // range is for the navigated window). Without this precedence, clicking
  // ‹ on Week kept showing this week's numbers — period name won.
  let startDate = null, endDate = null;
  if (start) startDate = parseEasternYmd(start, false);
  if (end)   endDate   = parseEasternYmd(end, true);
  if (!startDate && !endDate) {
    if (period === 'today')      startDate = easternMidnightOfToday();
    else if (period === 'week')  startDate = easternMidnightOfWeek();
    else if (period === 'month') startDate = easternMidnightOfMonth();
    else if (period === 'year')  startDate = easternMidnightOfYear();
    // 'all' or unknown -> no date filter (returns everything)
  }
  const heatmapFloor = easternToUtc(2025, 1, 1);
  const ytdStart = easternMidnightOfYear();
  const heatmapStart = ytdStart.getTime() < heatmapFloor.getTime() ? heatmapFloor : ytdStart;

  try {
    const { roleIdMap, roleIcons, allMembers } = await getDiscordData();

    // ----- Map members to agency roles within owner's subtree -----
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

    const nodeSubtree = new Set(subtreeOf(node));
    const scopeAllIds = Object.keys(memberInfo).filter(id => nodeSubtree.has(memberBucket[id]));
    const scopeIds = isDirectView
      ? scopeAllIds.filter(id => memberBucket[id] === node)
      : scopeAllIds;

    const { data: dbUsers } = scopeIds.length
      ? await supabase.from('users').select('discord_id, display_name, avatar').in('discord_id', scopeIds)
      : { data: [] };
    const dbUserMap = {};
    (dbUsers || []).forEach(u => { dbUserMap[u.discord_id] = u; });

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

    const [periodDeals, heatmapDeals] = await Promise.all([
      fetchDeals(scopeAllIds, startDate, endDate),
      fetchDeals(scopeIds, heatmapStart, null),
    ]);

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

    const summary = {
      total_production: leaderboard.reduce((s, u) => s + u.total, 0),
      total_deals: leaderboard.reduce((s, u) => s + u.count, 0),
      agent_count: leaderboard.length,
    };

    const dailyMap = {};
    heatmapDeals.forEach(d => {
      const dt = new Date(d.posted_at);
      const e = easternPartsOf(dt);
      const key = `${e.year}-${String(e.month).padStart(2, '0')}-${String(e.day).padStart(2, '0')}`;
      dailyMap[key] = (dailyMap[key] || 0) + parseFloat(d.amount);
    });

    const exposedRoles = new Set([...visibleRoles, 'Blueprint Agency']);
    const exposedRoleIcons = {};
    for (const name of Object.keys(roleIcons)) {
      if (exposedRoles.has(name)) exposedRoleIcons[name] = roleIcons[name];
    }

    res.json({
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
      owner_role: ownerRole,
      owner_self: ownerSelf,
      // Legacy back-compat
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
