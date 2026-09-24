// Starts Discord sign-in for an office TV (?office=south-florida | dallas).
// Discord developer portal -> OAuth2 -> Redirects must include each office's link:
//   https://blueprintagencysales.io/api/tv-callback          (South Florida)
//   https://blueprintagencysales.io/api/tv-callback/dallas   (Dallas)
import crypto from 'crypto';
import { serialize } from 'cookie';
import { originOf, canonicalOrigin } from '../../lib/tv-auth';
import { OFFICES, officeOf } from '../../lib/offices';

export default function handler(req, res) {
  const office = officeOf(String(req.query.office || ''));
  const canonical = canonicalOrigin(req);

  // Opened on www. / vercel.app? Hop to the registered domain first so the
  // sign-in cookies and the Discord redirect all live on the same site.
  if (originOf(req) !== canonical) {
    return res.redirect(`${canonical}/api/tv-login?office=${office}`);
  }

  const state = crypto.randomBytes(16).toString('hex');
  const opts = { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 };
  res.setHeader('Set-Cookie', [serialize('tv_oauth_state', state, opts), serialize('tv_oauth_office', office, opts)]);
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: `${canonical}${OFFICES[office].callbackPath}`,
    response_type: 'code',
    scope: 'identify',
    state,
    prompt: 'consent',
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
}
