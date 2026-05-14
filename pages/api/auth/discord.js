export default function handler(req, res) {
  const { popup } = req.query;
  
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds',
    state: popup === 'true' ? 'popup' : 'normal',
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
}
