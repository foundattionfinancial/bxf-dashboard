import Head from 'next/head';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();
  const error = router.query.error;
  return (
    <>
      <Head>
        <title>Blueprint x Foundation</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </Head>
      <style>{`
        * { margin:0; padding:0; box-sizing:border-box; }
        body { background:#060810; color:#e8eaf0; font-family:'DM Sans',sans-serif; min-height:100vh; display:flex; align-items:center; justify-content:center; overflow:hidden; }
        .glow { position:fixed; width:600px; height:600px; background:radial-gradient(circle,rgba(34,197,94,0.07) 0%,transparent 70%); pointer-events:none; top:50%; left:50%; transform:translate(-50%,-50%); }
        .glow2 { position:fixed; width:400px; height:400px; background:radial-gradient(circle,rgba(88,101,242,0.06) 0%,transparent 70%); pointer-events:none; top:20%; right:10%; }
        .container { text-align:center; position:relative; z-index:1; padding:40px 20px; }
        .logo-wrap { display:flex; align-items:center; justify-content:center; gap:16px; margin-bottom:40px; }
        .logo-box { width:52px; height:52px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-family:'Bebas Neue',sans-serif; font-size:18px; letter-spacing:1px; }
        .logo-bp { background:rgba(88,101,242,0.15); border:1px solid rgba(88,101,242,0.3); color:#7289da; }
        .logo-x { font-family:'Bebas Neue',sans-serif; font-size:24px; color:#2a2d3a; }
        .logo-tf { background:rgba(34,197,94,0.12); border:1px solid rgba(34,197,94,0.3); color:#22C55E; }
        .eyebrow { font-family:'DM Mono',monospace; font-size:11px; letter-spacing:4px; color:#3a4050; text-transform:uppercase; margin-bottom:16px; }
        h1 { font-family:'Bebas Neue',sans-serif; font-size:64px; letter-spacing:3px; line-height:1; margin-bottom:6px; background:linear-gradient(135deg,#fff 0%,#a0a8b8 100%); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
        .subtitle { font-family:'Bebas Neue',sans-serif; font-size:64px; letter-spacing:3px; line-height:1; color:#22C55E; margin-bottom:24px; }
        .desc { color:#4a5260; font-size:14px; line-height:1.7; max-width:340px; margin:0 auto 40px; }
        .btn { display:inline-flex; align-items:center; gap:12px; background:#5865F2; color:white; border:none; padding:15px 36px; border-radius:10px; font-family:'DM Sans',sans-serif; font-size:15px; font-weight:600; cursor:pointer; text-decoration:none; letter-spacing:0.5px; transition:all 0.2s; }
        .btn:hover { background:#4752c4; transform:translateY(-2px); box-shadow:0 12px 40px rgba(88,101,242,0.4); }
        .error { margin-top:20px; font-size:13px; color:#ef4444; font-family:'DM Mono',monospace; }
        .footer { position:fixed; bottom:24px; left:0; right:0; text-align:center; font-size:11px; color:#2a2d3a; font-family:'DM Mono',monospace; letter-spacing:2px; }
      `}</style>
      <div className="glow" /><div className="glow2" />
      <div className="container">
        <div className="logo-wrap">
          <div className="logo-box logo-bp">BP</div>
          <div className="logo-x">×</div>
          <div className="logo-box logo-tf">TF</div>
        </div>
        <div className="eyebrow">Producer Dashboard</div>
        <h1>Blueprint</h1>
        <div className="subtitle">× Foundation</div>
        <p className="desc">Track your production, pace the month, and watch the leaderboard move. Sign in with your Blueprint Agency Discord.</p>
        <a href="/api/auth/discord" className="btn">
          <svg width="22" height="22" viewBox="0 0 71 55" fill="none"><path d="M60.1 4.9A58.5 58.5 0 0 0 45.6.9a40.7 40.7 0 0 0-1.8 3.6 54.1 54.1 0 0 0-16.2 0A39.5 39.5 0 0 0 25.8.9 58.4 58.4 0 0 0 11.2 5C1.6 19.3-1 33.2.3 46.9a58.9 58.9 0 0 0 17.9 9 44 44 0 0 0 3.8-6.2 38.3 38.3 0 0 1-6-2.9l1.4-1.1a42 42 0 0 0 36.2 0l1.5 1.1a38.3 38.3 0 0 1-6 2.9 44 44 0 0 0 3.8 6.2 58.7 58.7 0 0 0 17.9-9C72.2 31 69 17.2 60.1 4.9ZM23.7 38.5c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.5 0 6.4 3.2 6.3 7.2 0 4-2.8 7.2-6.3 7.2Zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.5 0 6.4 3.2 6.3 7.2 0 4-2.8 7.2-6.3 7.2Z" fill="currentColor"/></svg>
          LOG IN WITH DISCORD
        </a>
        {error && <div className="error">⚠ {error === 'not_member' ? 'You must be in Blueprint Agency server' : 'Login failed — try again'}</div>}
      </div>
      <div className="footer">BLUEPRINT × FOUNDATION — PRODUCERS ONLY</div>
    </>
  );
}
