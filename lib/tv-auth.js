// lib/tv-auth.js — sign-in for the office TV displays.
//
// Each office TV signs in once with its own leaderboard Discord account
// (roles are set per office in lib/offices.js).
// It gets its own signed cookie (separate from the dashboard's session) that
// lasts 90 days and renews itself every day the TV is on, so the screen
// never gets kicked back to a login page.

import crypto from 'crypto';
import { parse, serialize } from 'cookie';

export const COOKIE = 'tv_session';
const DAY = 86400;
export const MAX_AGE = 90 * DAY;

const secret = () => process.env.TV_SESSION_SECRET || process.env.DISCORD_CLIENT_SECRET || '';
const sign = data => crypto.createHmac('sha256', secret()).update(data).digest('base64url');

export function makeSessionCookie(id, name) {
  const payload = Buffer.from(JSON.stringify({ id, name, exp: Math.floor(Date.now() / 1000) + MAX_AGE })).toString('base64url');
  return serialize(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: MAX_AGE,
  });
}

export function clearSessionCookie() {
  return serialize(COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
}

export function readSession(req) {
  const raw = parse(req.headers.cookie || '')[COOKIE];
  if (!raw || !secret()) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!s.id || !s.exp || s.exp * 1000 < Date.now()) return null;
    return s;
  } catch (e) {
    return null;
  }
}

// Renew once a day while the TV keeps polling
export function needsRenewal(session) {
  return session.exp * 1000 - Date.now() < MAX_AGE * 1000 - DAY * 1000;
}

// The single domain registered with Discord for sign-in. Taken from the dashboard's
// existing DISCORD_REDIRECT_URI (e.g. https://blueprintagencysales.io/api/auth/callback),
// so the TV callback is always https://blueprintagencysales.io/api/tv-callback no matter
// which address (www., vercel.app) the TV was opened on.
export function canonicalOrigin(req) {
  try { if (process.env.DISCORD_REDIRECT_URI) return new URL(process.env.DISCORD_REDIRECT_URI).origin; } catch (e) {}
  return originOf(req);
}

export function originOf(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}
