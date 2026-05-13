import { parse } from 'cookie';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
export default async function handler(req, res) {
  const { session: raw } = parse(req.headers.cookie || '');
  if (!raw) return res.status(401).json({ error: 'Not logged in' });
  const { period } = req.query;
  let query = supabase.from('deals').select('discord_id, amount, posted_at');
  if (period === 'month') {
    const start = new Date(); start.setDate(1); start.setHours(0,0,0,0);
    query = query.gte('posted_at', start.toISOString());
  } else if (period === 'year') {
    query = query.gte('posted_at', new Date(new Date().getFullYear(), 0, 1).toISOString());
  }
  const { data, error } = await query;
  if (error) return res.status(500).json({ error });
  const map = {};
  data.forEach(d => {
    if (!map[d.discord_id]) map[d.discord_id] = { discord_id: d.discord_id, total: 0, deals: 0 };
    map[d.discord_id].total += parseFloat(d.amount);
    map[d.discord_id].deals++;
  });
  const ids = Object.keys(map);
  const { data: users } = await supabase.from('users').select('discord_id, display_name, avatar').in('discord_id', ids);
  const userMap = {};
  (users || []).forEach(u => userMap[u.discord_id] = u);
  const leaderboard = Object.values(map).map(u => ({ ...u, display_name: userMap[u.discord_id]?.display_name || 'Unknown', avatar: userMap[u.discord_id]?.avatar || null })).sort((a, b) => b.total - a.total).map((u, i) => ({ ...u, rank: i + 1 }));
  res.json(leaderboard);
}
