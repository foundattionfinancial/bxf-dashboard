import { parse } from 'cookie';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  const { session: raw } = parse(req.headers.cookie || '');
  if (!raw) return res.status(401).json({ error: 'Not logged in' });

  const { period } = req.query;

  // Build date filter using Eastern Time
  const now = new Date();
  const easternStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const eastern = new Date(easternStr);
  const tzOffset = now - eastern; // ms difference between UTC and Eastern

  function easternMidnight() {
    const e = new Date(easternStr);
    e.setHours(0,0,0,0);
    return new Date(e.getTime() + tzOffset);
  }

  let startDate = null;
  if (period === 'today') {
    startDate = easternMidnight();
  } else if (period === 'week') {
    const e = new Date(easternStr);
    e.setDate(e.getDate() - e.getDay());
    e.setHours(0,0,0,0);
    startDate = new Date(e.getTime() + tzOffset);
  } else if (period === 'month') {
    const e = new Date(easternStr);
    e.setDate(1); e.setHours(0,0,0,0);
    startDate = new Date(e.getTime() + tzOffset);
  } else if (period === 'year') {
    const e = new Date(easternStr);
    e.setMonth(0); e.setDate(1); e.setHours(0,0,0,0);
    startDate = new Date(e.getTime() + tzOffset);
  }

  try {
    // Paginate through ALL deals — Supabase default limit is 1000 rows
    // Without pagination, all-time totals are silently wrong
    let allDeals = [];
    let from = 0;
    const PAGE_SIZE = 1000;

    while (true) {
      let query = supabase
        .from('deals')
        .select('discord_id, amount')
        .range(from, from + PAGE_SIZE - 1);

      if (startDate) {
        query = query.gte('posted_at', startDate.toISOString());
      }

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      if (!data || data.length === 0) break;

      allDeals = allDeals.concat(data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    // Aggregate by user
    const map = {};
    allDeals.forEach(d => {
      if (!map[d.discord_id]) map[d.discord_id] = { total: 0, count: 0 };
      map[d.discord_id].total += parseFloat(d.amount);
      map[d.discord_id].count++;
    });

    const ids = Object.keys(map);
    if (!ids.length) return res.json([]);

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

    res.json(leaderboard);
  } catch(e) {
    console.error('Leaderboard error:', e);
    res.status(500).json({ error: e.message });
  }
}
