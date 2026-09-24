// Starts Discord sign-in for the TV display. Redirect URI to register in the
// Discord developer portal:  https://blueprintagencysales.io/api/tv-callback
import crypto from 'crypto';
import { serialize } from 'cookie';
import { originOf } from '../../lib/tv-auth';

export default function handler(req, res) {
  const state = crypto.randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie', serialize('tv_oauth_state', state, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600,
  }));
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: `${originOf(req)}/api/tv-callback`,
    response_type: 'code',
    scope: 'identify',
    state,
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
}
