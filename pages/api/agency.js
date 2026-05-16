import { parse } from 'cookie';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const GUILD_ID = process.env.DISCORD_GUILD_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

// ---------- Org model ----------
// Each agency owner sees:
//   - self: their own agency (used for "Direct" bucket)
//   - subs: descendant sub-agencies (rendered as breakdown cards)
//
// "Direct" bucket = members who have the owner's self role but none of
// the sub-agency roles. e.g. Foundation owner: an agent in only "The
// Foundation" (no Key/AA/Formula/Stark) is bucketed as Foundation Direct.
const VIEW_CONFIG = {
  'Agency Owner- Blueprint': {
    self: 'Blueprint Agency',
    subs: ['The Foundation', 'THE KEY AGENCY', 'AA FINANCIAL', 'FORMULA FINANCIAL', 'Stark Financial'],
  },
  'Agency Owner- The Foundation': {
    self: 'The Foundation',
    subs: ['THE KEY AGENCY', 'AA FINANCIAL', 'FORMULA FINANCIAL', 'Stark Financial'],
  },
  'Agency Owner- The Key': {
    self: 'THE KEY AGENCY',
    subs: ['AA FINANCIAL', 'FORMULA FINANCIAL'],
  },
  'Agency Owner- AA FINANCIAL':      { self: 'AA FINANCIAL',      subs: [] },
  'Agency Owner- Formula Financial': { self: 'FORMULA FINANCIAL', subs: [] },
  'Agency Owner- Stark Financial':   { self: 'Stark Financial',   subs: [] },
};

// Used for exclusive bucketing: when a member has multiple visible roles,
// they're assigned to the role with the highest depth (most specific).
// e.g. an agent in [Foundation, Key, AA] buckets as AA (depth 4), not Key (3).
const AGENCY_DEPTH = {
  'Blueprint Agency':  1,
  'The Foundation':    2,
  'THE KEY AGENCY':    3,
  'Stark Financial':   3,
  'AA FINANCIAL':      4,
  'FORMULA FINANCIAL': 4,
};

const AGENCY_LABELS = {
  'Blueprint Agency':  'Blueprint Agency',
  'The Foundation':    'The Foundation',
  'THE KEY AGENCY':    'The Key Agency',
  'AA FINANCIAL':      'AA Financial',
  'FORMULA FINANCIAL': 'Formula Financial',
  'Stark Financial':   'Stark Financial',
};

const DIRECT = '__direct__';

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
  const easternAsUtcMs = Date.UTC(e.year, e.month - 1, e.day, e.hour, e.minute, e.second);
  return (easternAsUtcMs - utcDate.getTime()) / 60000;
}

function easternToUtc(year, month, day, hour = 0, minute = 0, second = 0) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offsetMin = easternOffsetMinutes(guess);
  return new Date(guess.getTime() - offsetMin * 60000);
}

function easternMidnightOfToday() {
  const e = easternPartsOf(new Date());
  return easternToUtc(e.year, e.month, e.day, 0, 0, 0);
}

function easternMidnightOfWeek() {
  const e = easternPartsOf(new Date());
  const probe = new Date(Date.UTC(e.year, e.month - 1, e.day));
  const dow = probe.getUTCDay();
  const startUtc = new Date(probe.getTime() - dow * 86400000);
  return easternToUtc(
    startUtc.getUTCFullYear(),
    startUtc.getUTCMonth() + 1,
    startUtc.getUTCDate(),
    0, 0, 0
  );
}

function easternMidnightOfMonth() {
  const e = easternPartsOf(new Date());
  return easternToUtc(e.year, e.month, 1, 0, 0, 0);
}

function easternMidnightOfYear() {
  const e = easternPartsOf(new Date());
  return easternToUtc(e.year, 1, 1, 0, 0, 0);
}

function parseEasternYmd(ymd, endOfDay = false) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  if (!m) return null;
  const [, y, mo, d] = m;
  return endOfDay
    ? easternToUtc(+y, +mo, +d, 23, 59, 59)
    : easternToUtc(+y, +mo, +d, 0, 0, 0);
}

// ---------- handler ----------

export default async function handler(req, res) {
  const { session: raw } = parse(req.headers.cookie || '');
  if (!raw) return res.status(401).json({ error: 'Not logged in' });

  let session;
  try { session = JSON.parse(raw); } catch (e) { return res.status(401).json({ error: 'Bad session' }); }

  const { period, agency, start, end } = req.query;

  const ownerRole = (session.roles || []).find(r => VIEW_CONFIG.hasOwnProperty(r));
  if (!ownerRole) return res.status(403).json({ error: 'Not an agency owner' });

  const { self: selfRole, subs: subRoles } = VIEW_CONFIG[ownerRole];
  const visibleRoles = [selfRole, ...subRoles];
  const filterRole = agency || null; // may be a sub-role name, '__direct__', or null

  // ----- Period -> date range (in Eastern) -----
  let startDate = null;
  let endDate = null;

  if (period === 'today') {
    startDate = easternMidnightOfToday();
  } else if (period === 'week') {
    startDate = easternMidnightOfWeek();
  } else if (period === 'month') {
    startDate = easternMidnightOfMonth();
  } else if (period === 'year') {
    startDate = easternMidnightOfYear();
  } else if (period === 'custom') {
    if (start) startDate = parseEasternYmd(start, false);
    if (end)   endDate   = parseEasternYmd(end, true);
  }
  // period === 'all' or unknown -> no date filter

  // Heatmap range: floor at Jan 1 2025 to match the frontend's `canBack` floor.
  const heatmapFloor = easternToUtc(2025, 1, 1, 0, 0, 0);
  const heatmapStart = (() => {
    const ytdStart = easternMidnightOfYear();
    return ytdStart.getTime() < heatmapFloor.getTime() ? heatmapFloor : ytdStart;
  })();

  try {
    // Fetch all guild roles once
    const rolesRes = await fetch(`https://discord.com/api/guilds/${GUILD_ID}/roles`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });
    if (!rolesRes.ok) return res.status(500).json({ error: 'Failed to fetch roles' });
    const allRoles = await rolesRes.json();
    const roleIdMap = {};
    allRoles.forEach(r => { roleIdMap[r.name] = r.id; });

    // Fetch all guild members once (paginated)
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
      const roleId = roleIdMap[roleName];
      if (!roleId) { roleMemberMap[roleName] = []; continue; }
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

    // ----- Member -> bucket assignment (exclusive) -----
    // For each member with any visible role, compute:
    //   - memberInfo[id] = canonical { discord_id, display_name, avatar }
    //   - memberRoles[id] = Set of visible roles they belong to
    //   - memberBucket[id] = the bucket they show under (sub-role with max
    //     depth, or '__direct__' if they only have the self role)
    const memberInfo = {};
    const memberRoles = {};
    for (const roleName of visibleRoles) {
      for (const m of roleMemberMap[roleName]) {
        if (!memberInfo[m.discord_id]) memberInfo[m.discord_id] = m;
        if (!memberRoles[m.discord_id]) memberRoles[m.discord_id] = new Set();
        memberRoles[m.discord_id].add(roleName);
      }
    }

    const memberBucket = {};
    for (const id of Object.keys(memberRoles)) {
      const rolesForMember = memberRoles[id];
      let bestRole = null;
      let bestDepth = -1;
      for (const r of rolesForMember) {
        if (!subRoles.includes(r)) continue;
        const d = AGENCY_DEPTH[r] || 0;
        if (d > bestDepth) { bestDepth = d; bestRole = r; }
      }
      memberBucket[id] = bestRole || DIRECT;
    }

    // ----- Apply filter to determine in-scope members for leaderboard -----
    const allIds = Object.keys(memberInfo);
    let scopeIds;
    if (!filterRole) {
      scopeIds = allIds;
    } else if (filterRole === DIRECT) {
      scopeIds = allIds.filter(id => memberBucket[id] === DIRECT);
    } else if (subRoles.includes(filterRole)) {
      scopeIds = allIds.filter(id => memberBucket[id] === filterRole);
    } else {
      // Unknown filter — treat as no match.
      scopeIds = [];
    }

    // DB metadata override for scope members
    const { data: dbUsers } = scopeIds.length
      ? await supabase.from('users').select('discord_id, display_name, avatar').in('discord_id', scopeIds)
      : { data: [] };
    const dbUserMap = {};
    (dbUsers || []).forEach(u => { dbUserMap[u.discord_id] = u; });

    // ----- Paginated deals fetch -----
    async function fetchDeals(idsList, fromDate, toDate) {
      if (!idsList.length) return [];
      const out = [];
      let from = 0;
      const PAGE_SIZE = 1000;
      while (true) {
        let q = supabase
          .from('deals')
          .select('discord_id, amount, posted_at')
          .in('discord_id', idsList)
          .range(from, from + PAGE_SIZE - 1);
        if (fromDate) q = q.gte('posted_at', fromDate.toISOString());
        if (toDate)   q = q.lte('posted_at', toDate.toISOString());
        const { data, error } = await q;
        if (error || !data || !data.length) break;
        out.push(...data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return out;
    }

    // Period-filtered deals across ALL members (so agency_summaries shows
    // real numbers for every bucket even when a filter is active).
    const periodDeals = await fetchDeals(allIds, startDate, endDate);

    // Year-scoped deals for the heatmap, restricted to the active scope so
    // the heatmap respects the filter dropdown.
    const heatmapDeals = await fetchDeals(scopeIds, heatmapStart, null);

    // ----- Aggregate period deals by member (for leaderboard) -----
    const scopeIdSet = new Set(scopeIds);
    const dealMap = {};
    periodDeals.forEach(d => {
      if (!scopeIdSet.has(d.discord_id)) return;
      if (!dealMap[d.discord_id]) dealMap[d.discord_id] = { total: 0, count: 0 };
      dealMap[d.discord_id].total += parseFloat(d.amount);
      dealMap[d.discord_id].count++;
    });

    const leaderboard = scopeIds
      .map(id => {
        const m = memberInfo[id];
        const dbUser = dbUserMap[id];
        return {
          discord_id: id,
          display_name: dbUser?.display_name || m.display_name || 'Unknown',
          avatar: dbUser?.avatar || m.avatar || null,
          bucket: memberBucket[id],
          total: dealMap[id]?.total || 0,
          count: dealMap[id]?.count || 0,
        };
      })
      .sort((a, b) => b.total - a.total)
      .map((u, i) => ({ ...u, rank: i + 1 }));

    // ----- Build agency_summaries (one per sub-role, plus Direct) -----
    // Always built from periodDeals across allIds, so the breakdown bar
    // shows correct numbers regardless of the active filter.
    const bucketAgg = {};
    for (const r of subRoles) bucketAgg[r] = { agents: 0, deals: 0, total: 0 };
    bucketAgg[DIRECT] = { agents: 0, deals: 0, total: 0 };

    for (const id of allIds) {
      const b = memberBucket[id];
      if (bucketAgg[b]) bucketAgg[b].agents++;
    }
    periodDeals.forEach(d => {
      const b = memberBucket[d.discord_id];
      if (bucketAgg[b]) {
        bucketAgg[b].total += parseFloat(d.amount);
        bucketAgg[b].deals++;
      }
    });

    const agencySummaries = [];
    for (const r of subRoles) {
      agencySummaries.push({
        role: r,
        label: AGENCY_LABELS[r] || r,
        total_production: bucketAgg[r].total,
        total_deals: bucketAgg[r].deals,
        agent_count: bucketAgg[r].agents,
        is_direct: false,
      });
    }
    // Include the Direct bucket only when the owner has sub-agencies AND
    // there's at least one member sitting in it. (Single-agency owners
    // like Stark/AA/Formula don't need a Direct card — their leaderboard
    // is already the full picture.)
    if (subRoles.length > 0 && bucketAgg[DIRECT].agents > 0) {
      agencySummaries.push({
        role: DIRECT,
        label: `${AGENCY_LABELS[selfRole] || selfRole} (Direct)`,
        total_production: bucketAgg[DIRECT].total,
        total_deals: bucketAgg[DIRECT].deals,
        agent_count: bucketAgg[DIRECT].agents,
        is_direct: true,
        self_role: selfRole,
      });
    }

    // ----- Summary card numbers (reflect the filtered view) -----
    const summary = {
      total_production: leaderboard.reduce((s, u) => s + u.total, 0),
      total_deals: leaderboard.reduce((s, u) => s + u.count, 0),
      agent_count: leaderboard.length,
    };

    // ----- Daily map for heatmap (year-scoped, TZ-correct) -----
    const dailyMap = {};
    heatmapDeals.forEach(d => {
      const dt = new Date(d.posted_at);
      const e = easternPartsOf(dt);
      const key = `${e.year}-${String(e.month).padStart(2, '0')}-${String(e.day).padStart(2, '0')}`;
      dailyMap[key] = (dailyMap[key] || 0) + parseFloat(d.amount);
    });

    res.json({
      leaderboard,
      summary,
      agency_summaries: agencySummaries,
      daily_map: dailyMap,
      filter_role: filterRole,
      owner_role: ownerRole,
      self_role: selfRole,
      self_label: AGENCY_LABELS[selfRole] || selfRole,
      visible_roles: visibleRoles,
    });
  } catch (e) {
    console.error('Agency error:', e);
    res.status(500).json({ error: e.message });
  }
}
