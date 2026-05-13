import { parse, serialize } from 'cookie';

const GUILD_ID = process.env.DISCORD_GUILD_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { session: raw } = parse(req.headers.cookie || '');
  if (!raw) return res.status(401).json({ error: 'Not logged in' });

  let session;
  try { session = JSON.parse(raw); } catch(e) { return res.status(401).json({ error: 'Bad session' }); }

  try {
    // Re-fetch member data from Discord using bot token
    let roles = [];
    let displayName = session.display_name;
    let avatar = session.avatar;

    const memberRes = await fetch(
      `https://discord.com/api/guilds/${GUILD_ID}/members/${session.discord_id}`,
      { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
    );

    if (memberRes.ok) {
      const member = await memberRes.json();
      if (member.nick) displayName = member.nick;
      if (member.avatar) {
        avatar = `https://cdn.discordapp.com/guilds/${GUILD_ID}/users/${session.discord_id}/avatars/${member.avatar}.png`;
      }

      // Get role names
      const rolesRes = await fetch(
        `https://discord.com/api/guilds/${GUILD_ID}/roles`,
        { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
      );
      if (rolesRes.ok) {
        const allRoles = await rolesRes.json();
        const roleMap = {};
        allRoles.forEach(r => roleMap[r.id] = r.name);
        roles = (member.roles || []).map(id => roleMap[id]).filter(Boolean);
      }
    }

    const updatedSession = {
      ...session,
      display_name: displayName,
      avatar,
      roles,
    };

    res.setHeader('Set-Cookie', serialize('session', JSON.stringify(updatedSession), {
      httpOnly: true,
      secure: true,
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
      sameSite: 'lax',
    }));

    res.json({ success: true, roles });
  } catch(e) {
    console.error('Refresh error:', e);
    res.status(500).json({ error: e.message });
  }
}
