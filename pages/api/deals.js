import { parse } from 'cookie';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
export default async function handler(req, res) {
  const { session: raw } = parse(req.headers.cookie || '');
  if (!raw) return res.status(401).json({ error: 'Not logged in' });
  const session = JSON.parse(raw);
  const { data, error } = await supabase.from('deals').select('*').eq('discord_id', session.discord_id).order('posted_at', { ascending: false });
  if (error) return res.status(500).json({ error });
  res.json(data);
}
