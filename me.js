import { parse } from 'cookie';

export default function handler(req, res) {
  const { session: raw } = parse(req.headers.cookie || '');
  if (!raw) return res.status(401).json({ error: 'Not logged in' });
  res.json(JSON.parse(raw));
}
