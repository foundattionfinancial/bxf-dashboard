import { clearSessionCookie } from '../../lib/tv-auth';

export default function handler(req, res) {
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.redirect('/floridatv');
}
