import { clearSessionCookie } from '../../lib/tv-auth';
import { OFFICES, officeOf } from '../../lib/offices';

export default function handler(req, res) {
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.redirect(OFFICES[officeOf(String(req.query.office || ''))].path);
}
