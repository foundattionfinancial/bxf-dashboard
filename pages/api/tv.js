// pages/api/tv.js — South Florida Office TV leaderboard feed
//
// Access: the TV signs in once with a Discord account that has the
// "South Florida Leaderboard" role (see lib/tv-auth.js). A backup URL key
// (/floridatv?key=YOUR_TV_KEY, with TV_KEY set in Vercel) also works.
//
// Returns one board per requested period (default: today + week) so the TV can
// rotate between them without refetching, plus the newest deals so the TV can
// detect a fresh sale and fire the celebration.

import { createClient } from '@supabase/supabase-js';
import { getDiscordData } from '../../lib/discord-cache';
import { VIEWER_ROLES, readSession, makeSessionCookie, needsRenewal } from '../../lib/tv-auth';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const OFFICE_ROLE = 'South Florida Office';
const BOARD_SIZE = 13;               // top 3 podium + 10 below
const RECENT_LIMIT = 25;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const ALLOWED = ['today', 'week', 'month', 'year'];

// ---------- Eastern Time (DST-safe, same approach as agency.js) ----------
function easternParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date);
  const m = {};
  parts.forEach(p => { if (p.type !== 'literal') m[p.type] = p.value; });
  return {
    year: +m.year, month: +m.month, day: +m.day,
    hour: +(m.hour === '24' ? '0' : m.hour), minute: +m.minute, second: +m.second,
  };
}
function easternOffsetMinutes(date) {
  const e = easternParts(date);
  return (Date.UTC(e.year, e.month - 1, e.day, e.hour, e.minute, e.second) - date.getTime()) / 60000;
}
function easternToUtc(y, mo, d) {
  const guess = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0));
  return new Date(guess.getTime() - easternOffsetMinutes(guess) * 60000);
}

function periodInfo(period) {
  const e = easternParts(new Date());
  const noon = (y, mo, d) => new Date(Date.UTC(y, mo - 1, d, 12));
  const f = (d, o) => d.toLocaleDateString('en-US', { ...o, timeZone: 'UTC' });
  if (period === 'today') {
    return {
      start: easternToUtc(e.year, e.month, e.day),
      label: f(noon(e.year, e.month, e.day), { weekday: 'long', month: 'long', day: 'numeric' }),
      word: 'today',
    };
  }
  if (period === 'week') {
    const probe = noon(e.year, e.month, e.day);
    const sun = new Date(probe.getTime() - probe.getUTCDay() * 86400000); // week resets Sunday
    const sat = new Date(sun.getTime() + 6 * 86400000);
    const sameMonth = sun.getUTCMonth() === sat.getUTCMonth();
    const label = sameMonth
      ? `${f(sun, { month: 'long', day: 'numeric' })} – ${f(sat, { day: 'numeric' })}`
      : `${f(sun, { month: 'short', day: 'numeric' })} – ${f(sat, { month: 'short', day: 'numeric' })}`;
    return {
      start: easternToUtc(sun.getUTCFullYear(), sun.getUTCMonth() + 1, sun.getUTCDate()),
      label: `Week of ${label}`,
      word: 'this week',
    };
  }
  if (period === 'year') {
    return { start: easternToUtc(e.year, 1, 1), label: String(e.year), word: 'this year' };
  }
  return {
    start: easternToUtc(e.year, e.month, 1),
    label: f(noon(e.year, e.month, 1), { month: 'long', year: 'numeric' }),
    word: 'this month',
  };
}

// ---------- Discord helpers ----------
function avatarOf(m) {
  const id = m.user.id;
  if (m.avatar) return `https://cdn.discordapp.com/guilds/${GUILD_ID}/users/${id}/avatars/${m.avatar}.png?size=256`;
  if (m.user.avatar) return `https://cdn.discordapp.com/avatars/${id}/${m.user.avatar}.png?size=256`;
  let idx = 0;
  try { idx = Number((BigInt(id) >> 22n) % 6n); } catch (e) {}
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

let iconCache = { at: 0, url: null };
async function guildIcon() {
  if (Date.now() - iconCache.at < 60 * 60 * 1000) return iconCache.url;
  try {
    const r = await fetch(`https://discord.com/api/guilds/${GUILD_ID}`, { headers: { Authorization: `Bot ${BOT_TOKEN}` } });
    const g = r.ok ? await r.json() : null;
    iconCache = { at: Date.now(), url: g?.icon ? `https://cdn.discordapp.com/icons/${GUILD_ID}/${g.icon}.png?size=256` : null };
  } catch (e) {
    iconCache = { at: Date.now(), url: null };
  }
  return iconCache.url;
}

// ---------- Deals ----------
async function fetchOfficeDeals(ids, startISO) {
  const out = [];
  for (let i = 0; i < ids.length; i += 150) {          // keep the IN() list URL-safe
    const chunk = ids.slice(i, i + 150);
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('deals')
        .select('message_id, discord_id, amount, posted_at')
        .in('discord_id', chunk)
        .gte('posted_at', startISO)
        .order('posted_at', { ascending: false })
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      if (!data || !data.length) break;
      out.push(...data);
      if (data.length < 1000) break;
      from += 1000;
    }
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const keyOk = !!process.env.TV_KEY && req.query.key === process.env.TV_KEY;
  const session = keyOk ? null : readSession(req);
  if (!keyOk && !session) {
    return res.status(401).json({ code: 'login_required', error: 'Sign in with the South Florida Leaderboard Discord account.' });
  }

  const periods = String(req.query.periods || 'today,week')
    .split(',').map(p => p.trim()).filter(p => ALLOWED.includes(p));
  if (!periods.length) periods.push('today', 'week');

  try {
    const { roleIdMap, allMembers } = await getDiscordData();

    // Signed-in TV: the account must still hold a viewer role
    if (session) {
      const viewerIds = VIEWER_ROLES.map(r => roleIdMap[r]).filter(Boolean);
      const me = allMembers.find(m => m.user.id === session.id);
      if (!me || !(me.roles || []).some(r => viewerIds.includes(r))) {
        return res.status(403).json({ code: 'missing_role', error: `This Discord account no longer has the ${VIEWER_ROLES[0]} role.` });
      }
      if (needsRenewal(session)) res.setHeader('Set-Cookie', makeSessionCookie(session.id, session.name));
    }

    const roleId = roleIdMap[OFFICE_ROLE];
    if (!roleId) {
      return res.status(500).json({ error: `No Discord role named "${OFFICE_ROLE}". Create it and assign it to the office agents.` });
    }

    const roster = {};
    allMembers
      .filter(m => (m.roles || []).includes(roleId) && !m.user.bot)
      .forEach(m => {
        roster[m.user.id] = {
          discord_id: m.user.id,
          name: m.nick || m.user.global_name || m.user.username,
          avatar: avatarOf(m),
        };
      });
    const ids = Object.keys(roster);

    const infos = {};
    periods.forEach(p => { infos[p] = periodInfo(p); });
    const earliest = Object.values(infos).reduce((min, i) => (i.start < min ? i.start : min), new Date());

    const deals = ids.length ? await fetchOfficeDeals(ids, earliest.toISOString()) : [];

    const boards = {};
    for (const p of periods) {
      const startMs = infos[p].start.getTime();
      const agg = {};
      let total = 0, count = 0;
      deals.forEach(d => {
        if (new Date(d.posted_at).getTime() < startMs) return;
        const amt = parseFloat(d.amount) || 0;
        if (!agg[d.discord_id]) agg[d.discord_id] = { total: 0, count: 0 };
        agg[d.discord_id].total += amt;
        agg[d.discord_id].count++;
        total += amt;
        count++;
      });
      // Leaderboard = only agents who sold in this period
      const ranked = ids
        .filter(id => agg[id]?.total > 0)
        .map(id => ({ ...roster[id], total: agg[id].total, count: agg[id].count }))
        .sort((a, b) => b.total - a.total || b.count - a.count || a.name.localeCompare(b.name))
        .map((u, i) => ({ ...u, rank: i + 1 }));
      boards[p] = {
        label: infos[p].label,
        word: infos[p].word,
        total,                                   // Submitted: all premium in the period
        deals: count,                            // Deals: every deal in the period
        people: ranked.length,                   // People: agents on this leaderboard
        avg: ranked.length ? total / ranked.length : 0,   // Avg ticket: total ÷ people
        board: ranked.slice(0, BOARD_SIZE),
      };
    }

    const recent = deals.slice(0, RECENT_LIMIT).map(d => ({
      id: String(d.message_id),
      discord_id: d.discord_id,
      name: roster[d.discord_id]?.name || 'Agent',
      avatar: roster[d.discord_id]?.avatar || null,
      amount: parseFloat(d.amount) || 0,
      posted_at: d.posted_at,
    }));

    res.json({
      office: 'South Florida',
      agency: 'Blueprint Agency',
      agents: ids.length,
      guild_icon: await guildIcon(),
      periods,
      boards,
      recent,
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('TV feed error:', e);
    res.status(500).json({ error: e.message });
  }
}
