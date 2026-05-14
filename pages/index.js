import Head from 'next/head';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();
  const error = router.query.error;

  return (
    <>
      <Head>
        <title>The Blueprint Agency Sales</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400;1,500&family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400&display=swap" rel="stylesheet" />
      </Head>
      <style>{`
        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
        html, body { height:100%; }
        body {
          min-height:100vh;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          overflow:hidden;
          position:relative;
          font-family:'DM Sans', sans-serif;
          color:#ffffff;
          background:#0a0f1a;
        }
        .bg {
          position:fixed; inset:0;
          background:radial-gradient(ellipse 120% 80% at 50% 30%, #0d1e3a 0%, #070d1a 50%, #04080f 100%);
          z-index:0;
        }
        .bg-beam {
          position:fixed; top:-200px; left:50%; transform:translateX(-50%);
          width:600px; height:800px;
          background:radial-gradient(ellipse at top, rgba(30,80,160,0.12) 0%, transparent 70%);
          z-index:1; pointer-events:none;
        }
        .container {
          position:relative; z-index:2;
          display:flex; flex-direction:column;
          align-items:center; justify-content:center;
          text-align:center;
          padding:48px 32px;
          max-width:480px; width:100%;
        }
        .logo-wrap {
          width:120px; height:120px; border-radius:50%;
          overflow:hidden; background:transparent;
          margin:0 auto 16px auto;
        }
        .logo-img {
          width:100%; height:100%;
          object-fit:cover; object-position:center;
          display:block; border:none;
        }
        .eyebrow {
          display:flex; align-items:center; justify-content:center;
          gap:14px; margin:0 auto 28px auto; width:100%;
        }
        .eyebrow-line { width:40px; height:1px; background:rgba(255,255,255,0.2); }
        .eyebrow-text {
          font-family:'DM Mono', monospace;
          font-size:10px; letter-spacing:4px;
          color:rgba(255,255,255,0.5);
          text-transform:uppercase; white-space:nowrap;
        }
        .headline { text-align:center; margin-bottom:20px; width:100%; }
        .headline-main {
          font-family:'Playfair Display', serif;
          font-size:58px; font-weight:400;
          letter-spacing:1px; color:#ffffff;
          line-height:1.05; display:block;
        }
        .headline-sub {
          font-family:'Playfair Display', serif;
          font-size:52px; font-weight:400; font-style:italic;
          color:rgba(255,255,255,0.75);
          line-height:1.1; display:block; margin-top:2px;
        }
        .dashboard-label {
          display:flex; align-items:center; justify-content:center;
          gap:14px; margin:0 auto 28px auto; width:100%;
        }
        .dash-line { width:36px; height:1px; background:rgba(255,255,255,0.2); }
        .dash-text {
          font-family:'Cormorant Garamond', serif;
          font-style:italic; font-size:14px;
          letter-spacing:1px; color:rgba(255,255,255,0.55);
          white-space:nowrap;
        }
        .body-text {
          font-size:15px; font-weight:300;
          line-height:1.8; color:rgba(255,255,255,0.6);
          text-align:center; max-width:340px;
          margin:0 auto 40px auto;
        }
        .btn {
          display:inline-flex; align-items:center; gap:14px;
          background:transparent; color:rgba(255,255,255,0.9);
          border:1px solid rgba(255,255,255,0.25);
          padding:16px 44px; border-radius:4px;
          font-family:'DM Sans', sans-serif;
          font-size:13px; font-weight:500;
          cursor:pointer; text-decoration:none;
          letter-spacing:2px; text-transform:uppercase;
          transition:all 0.3s;
        }
        .btn:hover {
          background:rgba(255,255,255,0.04);
          border-color:rgba(255,255,255,0.4);
          color:#ffffff; transform:translateY(-1px);
        }
        .error {
          margin-top:20px; font-size:12px;
          color:rgba(239,68,68,0.8);
          font-family:'DM Mono', monospace; letter-spacing:0.5px;
        }
        .footer {
          position:fixed; bottom:0; left:0; right:0;
          padding:20px 24px; text-align:center; z-index:10;
        }
        .footer-text {
          font-family:'DM Mono', monospace;
          font-size:9px; letter-spacing:3px;
          color:rgba(255,255,255,0.2); text-transform:uppercase;
        }
      `}</style>

      <div className="bg" />
      <div className="bg-beam" />

      <div className="container">
        <div className="logo-wrap">
          <img className="logo-img" src="/blueprint-logo.jpg" alt="Blueprint"
            onError={e => { e.target.src = 'https://blueprintagencysales.io/blueprint-logo.jpg'; }} />
        </div>

        <div className="eyebrow">
          <div className="eyebrow-line" />
          <div className="eyebrow-text">Family First Life</div>
          <div className="eyebrow-line" />
        </div>

        <div className="headline">
          <span className="headline-main">The Blueprint</span>
          <span className="headline-sub">Agency Sales</span>
        </div>

        <div className="dashboard-label">
          <div className="dash-line" />
          <div className="dash-text">producer dashboard</div>
          <div className="dash-line" />
        </div>

        <p className="body-text">
          Track your production, pace the month, and feel the leaderboard move. Sign in with the Discord account you use in your FFL server.
        </p>

        <a href="/api/auth/discord" className="btn" target="_blank" rel="noopener noreferrer">
          <svg width="18" height="18" viewBox="0 0 71 55" fill="none">
            <path d="M60.1 4.9A58.5 58.5 0 0 0 45.6.9a40.7 40.7 0 0 0-1.8 3.6 54.1 54.1 0 0 0-16.2 0A39.5 39.5 0 0 0 25.8.9 58.4 58.4 0 0 0 11.2 5C1.6 19.3-1 33.2.3 46.9a58.9 58.9 0 0 0 17.9 9 44 44 0 0 0 3.8-6.2 38.3 38.3 0 0 1-6-2.9l1.4-1.1a42 42 0 0 0 36.2 0l1.5 1.1a38.3 38.3 0 0 1-6 2.9 44 44 0 0 0 3.8 6.2 58.7 58.7 0 0 0 17.9-9C72.2 31 69 17.2 60.1 4.9ZM23.7 38.5c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.5 0 6.4 3.2 6.3 7.2 0 4-2.8 7.2-6.3 7.2Zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.5 0 6.4 3.2 6.3 7.2 0 4-2.8 7.2-6.3 7.2Z" fill="currentColor"/>
          </svg>
          Log in with Discord
          <span style={{opacity:0.5}}>→</span>
        </a>

        {error && (
          <div className="error">
            ⚠ {error === 'not_member' ? 'You must be in the Blueprint Agency server' : 'Login failed — try again'}
          </div>
        )}
      </div>

      <div className="footer">
        <div className="footer-text">The Blueprint — Producers Only</div>
      </div>
    </>
  );
}
