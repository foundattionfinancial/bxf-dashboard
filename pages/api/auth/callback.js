import { serialize } from 'cookie';

const GUILD_ID = process.env.DISCORD_GUILD_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

export default async function handler(req, res) {
  const { code } = req.query;
  if (!code) return res.redirect('/?error=no_code');

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.redirect('/?error=no_token');

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const user = await userRes.json();

    const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const guilds = await guildsRes.json();
    if (!guilds.find(g => g.id === GUILD_ID)) return res.redirect('/?error=not_member');

    let roles = [];
    let displayName = user.global_name || user.username;
    let avatar = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/0.png`;

    try {
      const memberRes = await fetch(
        `https://discord.com/api/guilds/${GUILD_ID}/members/${user.id}`,
        { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
      );
      if (memberRes.ok) {
        const member = await memberRes.json();
        roles = member.roles || [];
        if (member.nick) displayName = member.nick;
        if (member.avatar) {
          avatar = `https://cdn.discordapp.com/guilds/${GUILD_ID}/users/${user.id}/avatars/${member.avatar}.png`;
        }
      }
    } catch(e) {}

    let roleNames = [];
    try {
      const rolesRes = await fetch(
        `https://discord.com/api/guilds/${GUILD_ID}/roles`,
        { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
      );
      if (rolesRes.ok) {
        const allRoles = await rolesRes.json();
        const roleMap = {};
        allRoles.forEach(r => roleMap[r.id] = r.name);
        roleNames = roles.map(id => roleMap[id]).filter(Boolean);
      }
    } catch(e) {}

    const session = {
      discord_id: user.id,
      username: user.username,
      display_name: displayName,
      avatar,
      roles: roleNames,
    };

    res.setHeader('Set-Cookie', serialize('session', JSON.stringify(session), {
      httpOnly: true,
      secure: true,
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
      sameSite: 'lax',
    }));

    res.redirect('/dashboard');
  } catch(e) {
    console.error('Auth error:', e);
    res.redirect('/?error=auth_failed');
  }
}
