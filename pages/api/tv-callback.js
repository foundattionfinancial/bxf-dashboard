// Finishes Discord sign-in for the TV display and checks the viewer role.
import { parse, serialize } from 'cookie';
import { VIEWER_ROLES, makeSessionCookie, originOf } from '../../lib/tv-auth';

const GUILD_ID = process.env.DISCORD_GUILD_ID;
const BOT = { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } };

export default async function handler(req, res) {
  const { code, state } = req.query;
  const saved = parse(req.headers.cookie || '').tv_oauth_state;
  const clearState = serialize('tv_oauth_state', '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });

  if (!code || !state || state !== saved) {
    res.setHeader('Set-Cookie', clearState);
    return res.redirect('/floridatv?error=login');
  }

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${originOf(req)}/api/tv-callback`,
      }),
    });
    const token = await tokenRes.json();
    if (!token.access_token) {
      res.setHeader('Set-Cookie', clearState);
      return res.redirect('/floridatv?error=login');
    }

    const user = await (await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    })).json();

    const memberRes = await fetch(`https://discord.com/api/guilds/${GUILD_ID}/members/${user.id}`, BOT);
    if (!memberRes.ok) {
      res.setHeader('Set-Cookie', clearState);
      return res.redirect('/floridatv?error=not_member');
    }
    const member = await memberRes.json();
    const roles = await (await fetch(`https://discord.com/api/guilds/${GUILD_ID}/roles`, BOT)).json();
    const names = (member.roles || []).map(id => (roles.find(r => r.id === id) || {}).name).filter(Boolean);

    if (!VIEWER_ROLES.some(r => names.includes(r))) {
      res.setHeader('Set-Cookie', clearState);
      return res.redirect('/floridatv?error=role');
    }

    res.setHeader('Set-Cookie', [clearState, makeSessionCookie(user.id, member.nick || user.global_name || user.username)]);
    res.redirect('/floridatv');
  } catch (e) {
    console.error('TV sign-in error:', e);
    res.setHeader('Set-Cookie', clearState);
    res.redirect('/floridatv?error=login');
  }
}
