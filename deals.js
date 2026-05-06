import { parse } from 'cookie';
import { supabase } from '../../../lib/supabase';

export default async function handler(req, res) {
  const { session: raw } = parse(req.headers.cookie || '');
  if (!raw) return res.status(401).json({ error: 'Not logged in' });
  const session = JSON.parse(raw);

  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .eq('discord_id', session.discord_id)
    .order('posted_at', { ascending: false });

  if (error) return res.status(500).json({ error });
  res.json(data);
}
