// lib/tv-callback-handler.js — finishes Discord sign-in for an office TV and checks
// that office's viewer role. Used by /api/tv-callback (South Florida) and
// /api/tv-callback/<office> (every other office, each with its own link).
import { parse, serialize } from 'cookie';
import { makeSessionCookie, canonicalOrigin } from './tv-auth';
import { OFFICES, officeOf } from './offices';

const GUILD_ID = process.env.DISCORD_GUILD_ID;
const BOT = { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } };

export async function handleTvCallback(req, res, pathOffice) {
  const { code, state } = req.query;
  const cookies = parse(req.headers.cookie || '');
  const saved = cookies.tv_oauth_state;
  const officeKey = pathOffice ? officeOf(pathOffice) : officeOf(cookies.tv_oauth_office || '');
  const cfg = OFFICES[officeKey];
  const redirectUri = `${canonicalOrigin(req)}${cfg.callbackPath}`;  // must match what tv-login sent
  const gone = { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 };
  const clearState = [serialize('tv_oauth_state', '', gone), serialize('tv_oauth_office', '', gone)];

  // Link opened directly in a browser (no sign-in in progress): just show that office's TV
  if (!code && !state) return res.redirect(cfg.path);

  if (!code || !state || state !== saved) {
    res.setHeader('Set-Cookie', clearState);
    return res.redirect(`${cfg.path}?error=login`);
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
        redirect_uri: redirectUri,
      }),
    });
    const token = await tokenRes.json();
    if (!token.access_token) {
      res.setHeader('Set-Cookie', clearState);
      return res.redirect(`${cfg.path}?error=login`);
    }

    const user = await (await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    })).json();

    const memberRes = await fetch(`https://discord.com/api/guilds/${GUILD_ID}/members/${user.id}`, BOT);
    if (!memberRes.ok) {
      res.setHeader('Set-Cookie', clearState);
      return res.redirect(`${cfg.path}?error=not_member`);
    }
    const member = await memberRes.json();
    const roles = await (await fetch(`https://discord.com/api/guilds/${GUILD_ID}/roles`, BOT)).json();
    const names = (member.roles || []).map(id => (roles.find(r => r.id === id) || {}).name).filter(Boolean);

    if (!names.includes(cfg.viewerRole)) {
      res.setHeader('Set-Cookie', clearState);
      return res.redirect(`${cfg.path}?error=role`);
    }

    res.setHeader('Set-Cookie', [...clearState, makeSessionCookie(user.id, member.nick || user.global_name || user.username)]);
    res.redirect(cfg.path);
  } catch (e) {
    console.error('TV sign-in error:', e);
    res.setHeader('Set-Cookie', clearState);
    res.redirect(`${cfg.path}?error=login`);
  }
}
