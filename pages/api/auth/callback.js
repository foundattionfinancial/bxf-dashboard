import { serialize } from 'cookie';
export default async function handler(req, res) {
  const { code } = req.query;
  if (!code) return res.redirect('/?error=no_code');
  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID, client_secret: process.env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: process.env.DISCORD_REDIRECT_URI }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.redirect('/?error=no_token');
    const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    const user = await userRes.json();
    const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    const guilds = await guildsRes.json();
    if (!guilds.find(g => g.id === process.env.DISCORD_GUILD_ID)) return res.redirect('/?error=not_member');
    const session = { discord_id: user.id, username: user.username, display_name: user.global_name || user.username, avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : `https://cdn.discordapp.com/embed/avatars/0.png` };
    res.setHeader('Set-Cookie', serialize('session', JSON.stringify(session), { httpOnly: true, secure: true, maxAge: 60*60*24*7, path: '/', sameSite: 'lax' }));
    res.redirect('/dashboard');
  } catch(e) { res.redirect('/?error=auth_failed'); }
}
