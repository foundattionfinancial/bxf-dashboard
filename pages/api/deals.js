import { parse } from 'cookie';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  const { session: raw } = parse(req.headers.cookie || '');
  if (!raw) return res.status(401).json({ error: 'Not logged in' });

  let session;
  try { session = JSON.parse(raw); } catch(e) { return res.status(401).json({ error: 'Bad session' }); }

  try {
    // Paginate to get ALL deals for this user — no 1000 row cap
    let allDeals = [];
    let from = 0;
    const PAGE_SIZE = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('deals')
        .select('*')
        .eq('discord_id', session.discord_id)
        .order('posted_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) return res.status(500).json({ error: error.message });
      if (!data || data.length === 0) break;

      allDeals = allDeals.concat(data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    res.json(allDeals);
  } catch(e) {
    console.error('Deals error:', e);
    res.status(500).json({ error: e.message });
  }
}
