import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

const fmt = (n) => '$' + Math.round(n).toLocaleString();
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function filterByPeriod(deals, period) {
  const now = new Date();
  return deals.filter(d => {
    const dt = new Date(d.posted_at);
    if (period === 'today') return dt.toDateString() === now.toDateString();
    if (period === 'week') return (now - dt) < 7 * 86400000;
    if (period === 'month') return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
    if (period === 'year') return dt.getFullYear() === now.getFullYear();
    return true;
  });
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [deals, setDeals] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [tab, setTab] = useState('personal');
  const [period, setPeriod] = useState('year');
  const [lbPeriod, setLbPeriod] = useState('year');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/me').then(r => {
      if (!r.ok) { router.push('/'); return; }
      return r.json();
    }).then(u => { if (u) setUser(u); });
    fetch('/api/deals').then(r => r.json()).then(d => { setDeals(Array.isArray(d) ? d : []); setLoading(false); });
  }, []);

  useEffect(() => {
    fetch(`/api/leaderboard?period=${lbPeriod}`).then(r => r.json()).then(d => setLeaderboard(Array.isArray(d) ? d : []));
  }, [lbPeriod]);

  const filtered = filterByPeriod(deals, period);
  const total = filtered.reduce((s, d) => s + parseFloat(d.amount), 0);
  const count = filtered.length;
  const avg = count ? total / count : 0;
  const myRank = leaderboard.find(u => u.discord_id === user?.discord_id)?.rank;

  const dailyMap = {};
  deals.forEach(d => {
    const day = d.posted_at.slice(0, 10);
    dailyMap[day] = (dailyMap[day] || 0) + parseFloat(d.amount);
  });
  const maxDay = Math.max(...Object.values(dailyMap), 1);
  const bestDay = Object.entries(dailyMap).sort((a, b) => b[1] - a[1])[0];
  const activeDays = Object.keys(dailyMap).length;
  const biggest = deals.reduce((m, d) => parseFloat(d.amount) > m ? parseFloat(d.amount) : m, 0);

  if (!user) return null;

  return (
    <>
      <Head>
        <title>Blueprint × Foundation</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </Head>
      <style>{`
        * { margin:0; padding:0; box-sizing:border-box; }
        body { background:#060810; color:#e8eaf0; font-family:'DM Sans',sans-serif; min-height:100vh; }
        .header { display:flex; align-items:center; justify-content:space-between; padding:0 28px; height:60px; border-bottom:1px solid rgba(255,255,255,0.06); background:rgba(6,8,16,0.95); backdrop-filter:blur(12px); position:sticky; top:0; z-index:100; }
        .brand { display:flex; align-items:center; gap:10px; }
        .brand-logos { display:flex; align-items:center; gap:6px; }
        .brand-box { width:28px; height:28px; border-radius:7px; display:flex; align-items:center; justify-content:center; font-family:'Bebas Neue',sans-serif; font-size:11px; letter-spacing:1px; }
        .brand-bp { background:rgba(88,101,242,0.15); border:1px solid rgba(88,101,242,0.25); color:#7289da; }
        .brand-tf { background:rgba(34,197,94,0.12); border:1px solid rgba(34,197,94,0.25); color:#22C55E; }
        .brand-x { font-family:'Bebas Neue',sans-serif; font-size:14px; color:#2a2d3a; }
        .brand-name { font-family:'Bebas Neue',sans-serif; font-size:18px; letter-spacing:2px; color:#e8eaf0; }
        .tabs { display:flex; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.07); border-radius:8px; padding:3px; gap:2px; }
        .tab { padding:5px 14px; border:none; background:transparent; color:#4a5260; font-family:'DM Sans',sans-serif; font-size:12px; font-weight:500; cursor:pointer; border-radius:6px; transition:all 0.15s; }
        .tab.active { background:rgba(255,255,255,0.06); color:#e8eaf0; border:1px solid rgba(255,255,255,0.1); }
        .user-chip { display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.07); border-radius:8px; padding:5px 12px; font-size:13px; font-weight:500; }
        .avatar { width:22px; height:22px; border-radius:50%; }
        .content { padding:28px; max-width:1200px; margin:0 auto; }
        .period-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; }
        .page-title { font-family:'Bebas Neue',sans-serif; font-size:26px; letter-spacing:2px; }
        .pills { display:flex; gap:3px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.07); border-radius:8px; padding:3px; }
        .pill { padding:4px 12px; border:none; background:transparent; color:#4a5260; font-family:'DM Sans',sans-serif; font-size:12px; font-weight:500; cursor:pointer; border-radius:5px; transition:all 0.15s; }
        .pill.active { background:rgba(255,255,255,0.06); color:#e8eaf0; border:1px solid rgba(255,255,255,0.1); }
        .stat-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:20px; }
        .stat-card { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:12px; padding:18px 20px; position:relative; overflow:hidden; }
        .stat-card::before { content:''; position:absolute; top:0; left:0; right:0; height:1px; background:linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent); }
        .stat-label { font-size:10px; font-weight:500; letter-spacing:1.5px; color:#3a4050; text-transform:uppercase; margin-bottom:8px; }
        .stat-value { font-family:'Bebas Neue',sans-serif; font-size:34px; letter-spacing:1px; color:#e8eaf0; line-height:1; margin-bottom:6px; }
        .stat-sub { font-size:11px; color:#3a4050; font-family:'DM Mono',monospace; }
        .card { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:12px; padding:20px; margin-bottom:16px; }
        .card-title { font-size:13px; font-weight:600; color:#e8eaf0; margin-bottom:16px; }
        .bar-chart { display:flex; align-items:flex-end; gap:5px; height:110px; }
        .bar-wrap { flex:1; display:flex; flex-direction:column; align-items:center; gap:5px; height:100%; justify-content:flex-end; }
        .bar { width:100%; background:rgba(34,197,94,0.2); border-radius:3px 3px 0 0; min-height:2px; transition:background 0.2s; cursor:pointer; }
        .bar:hover { background:rgba(34,197,94,0.5); }
        .bar-lbl { font-size:8px; color:#2a2d3a; font-family:'DM Mono',monospace; white-space:nowrap; }
        .heatmap-grid { display:grid; grid-template-columns:repeat(53,1fr); gap:2px; margin-bottom:14px; }
        .hm-cell { aspect-ratio:1; border-radius:2px; background:rgba(255,255,255,0.04); cursor:pointer; transition:transform 0.1s; }
        .hm-cell:hover { transform:scale(1.5); z-index:2; position:relative; }
        .hm-cell.l1 { background:rgba(34,197,94,0.18); }
        .hm-cell.l2 { background:rgba(34,197,94,0.38); }
        .hm-cell.l3 { background:rgba(34,197,94,0.62); }
        .hm-cell.l4 { background:rgba(34,197,94,0.88); }
        .hm-stats { display:flex; gap:32px; padding-top:14px; border-top:1px solid rgba(255,255,255,0.05); }
        .hm-stat-label { font-size:10px; color:#3a4050; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px; }
        .hm-stat-value { font-family:'Bebas Neue',sans-serif; font-size:24px; color:#e8eaf0; }
        .hm-stat-sub { font-size:10px; color:#3a4050; }
        .records-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:16px; }
        .rec-card { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:12px; padding:16px 18px; }
        .rec-label { font-size:10px; color:#3a4050; letter-spacing:1px; text-transform:uppercase; margin-bottom:6px; }
        .rec-badge { display:inline-block; font-size:9px; font-family:'DM Mono',monospace; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.07); color:#3a4050; padding:2px 7px; border-radius:4px; margin-bottom:8px; }
        .rec-value { font-family:'Bebas Neue',sans-serif; font-size:30px; color:#e8eaf0; letter-spacing:1px; }
        .rec-sub { font-size:10px; color:#3a4050; margin-top:3px; }
        .section-label { font-size:10px; font-weight:500; letter-spacing:2px; color:#3a4050; text-transform:uppercase; margin-bottom:12px; }
        .deal-row { display:flex; align-items:center; justify-content:space-between; padding:12px 0; border-bottom:1px solid rgba(255,255,255,0.05); }
        .deal-row:last-child { border-bottom:none; }
        .deal-date { font-size:12px; color:#3a4050; }
        .deal-amount { font-family:'DM Mono',monospace; font-size:14px; font-weight:500; color:#22C55E; }
        .lb-row { display:flex; align-items:center; padding:12px 20px; border-bottom:1px solid rgba(255,255,255,0.05); gap:14px; transition:background 0.15s; }
        .lb-row:last-child { border-bottom:none; }
        .lb-row:hover { background:rgba(255,255,255,0.02); }
        .lb-row.you { background:rgba(34,197,94,0.06); }
        .lb-rank { font-family:'DM Mono',monospace; font-size:12px; color:#3a4050; width:32px; text-align:center; flex-shrink:0; }
        .lb-rank.gold { color:#f59e0b; }
        .lb-rank.silver { color:#94a3b8; }
        .lb-rank.bronze { color:#cd7f32; }
        .lb-avatar { width:30px; height:30px; border-radius:50%; background:rgba(255,255,255,0.06); flex-shrink:0; display:flex; align-items:center; justify-content:center; font-family:'Bebas Neue',sans-serif; font-size:12px; color:#3a4050; overflow:hidden; }
        .lb-avatar img { width:100%; height:100%; object-fit:cover; }
        .lb-name { flex:1; font-size:13px; font-weight:500; }
        .you-badge { font-size:9px; font-weight:600; background:rgba(34,197,94,0.12); color:#22C55E; border:1px solid rgba(34,197,94,0.25); padding:2px 6px; border-radius:3px; margin-left:8px; }
        .lb-total { font-family:'DM Mono',monospace; font-size:13px; color:#e8eaf0; }
        .lb-header { padding:12px 20px; border-bottom:1px solid rgba(255,255,255,0.07); font-size:12px; font-weight:600; color:#3a4050; }
        .hidden-rows { text-align:center; padding:10px; font-size:11px; color:#2a2d3a; font-style:italic; border-bottom:1px solid rgba(255,255,255,0.05); }
        @media(max-width:768px) { .stat-grid { grid-template-columns:repeat(2,1fr); } .records-grid { grid-template-columns:1fr; } .content { padding:16px; } }
      `}</style>

      <header className="header">
        <div className="brand">
          <div className="brand-logos">
            <div className="brand-box brand-bp">BP</div>
            <div className="brand-x">×</div>
            <div className="brand-box brand-tf">TF</div>
          </div>
          <span className="brand-name">BLUEPRINT × FOUNDATION</span>
        </div>
        <div className="tabs">
          <button className={`tab ${tab==='personal'?'active':''}`} onClick={() => setTab('personal')}>Personal</button>
          <button className={`tab ${tab==='agency'?'active':''}`} onClick={() => setTab('agency')}>Agency</button>
        </div>
        <div className="user-chip">
          <img className="avatar" src={user.avatar} alt="" onError={e => e.target.style.display='none'} />
          <span>{user.display_name}</span>
        </div>
      </header>

      {tab === 'personal' && (
        <div className="content">
          <div className="period-row">
            <div className="page-title">Your Production</div>
            <div className="pills">
              {['all','today','week','month','year'].map(p => (
                <button key={p} className={`pill ${period===p?'active':''}`} onClick={() => setPeriod(p)}>{p.charAt(0).toUpperCase()+p.slice(1)}</button>
              ))}
            </div>
          </div>
          <div className="stat-grid">
            <div className="stat-card"><div className="stat-label">Total Production</div><div className="stat-value">{fmt(total)}</div></div>
            <div className="stat-card"><div className="stat-label">Deals Written</div><div className="stat-value">{count}</div></div>
            <div className="stat-card"><div className="stat-label">Avg Deal Size</div><div className="stat-value">{fmt(avg)}</div></div>
            <div className="stat-card"><div className="stat-label">Your Rank</div><div className="stat-value">{myRank || '—'}</div><div className="stat-sub">of {leaderboard.length} agents</div></div>
          </div>
          <div className="card"><div className="card-title">Production Over Time</div><BarChart deals={filtered} /></div>
          <div className="card">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
              <div className="card-title" style={{marginBottom:0}}>Production Heatmap</div>
              <span style={{fontSize:11,color:'#2a2d3a'}}>LAST 365 DAYS</span>
            </div>
            <Heatmap dailyMap={dailyMap} maxDay={maxDay} />
            <div className="hm-stats">
              <div><div className="hm-stat-label">Total Production</div><div className="hm-stat-value">{fmt(deals.reduce((s,d)=>s+parseFloat(d.amount),0))}</div></div>
              <div><div className="hm-stat-label">Active Days</div><div className="hm-stat-value">{activeDays}</div><div className="hm-stat-sub">of 365 days</div></div>
              <div><div className="hm-stat-label">Best Day</div><div className="hm-stat-value">{bestDay?fmt(bestDay[1]):'$0'}</div><div className="hm-stat-sub">{bestDay?new Date(bestDay[0]).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}):'—'}</div></div>
            </div>
          </div>
          <div className="section-label">Records</div>
          <div className="records-grid">
            <div className="rec-card"><div className="rec-label">Biggest Deal</div><div className="rec-badge">ALL-TIME</div><div className="rec-value">{fmt(biggest)}</div></div>
            <div className="rec-card"><div className="rec-label">Best Day</div><div className="rec-badge">ALL-TIME</div><div className="rec-value">{bestDay?fmt(bestDay[1]):'$0'}</div><div className="rec-sub">{bestDay?new Date(bestDay[0]).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'}):'—'}</div></div>
            <div className="rec-card"><div className="rec-label">Total All-Time</div><div className="rec-badge">ALL-TIME</div><div className="rec-value">{fmt(deals.reduce((s,d)=>s+parseFloat(d.amount),0))}</div><div className="rec-sub">{deals.length} deals total</div></div>
          </div>
          <div className="section-label">Recent Deals</div>
          <div className="card" style={{padding:'0 20px'}}>
            {deals.slice(0,15).map((d,i) => (<div key={i} className="deal-row"><span className="deal-date">{fmtDate(d.posted_at)}</span><span className="deal-amount">{fmt(parseFloat(d.amount))}</span></div>))}
            {deals.length === 0 && <div style={{padding:'20px 0',textAlign:'center',color:'#3a4050',fontSize:13}}>No deals yet</div>}
          </div>
        </div>
      )}

      {tab === 'agency' && (
        <div className="content">
          <div className="period-row">
            <div className="page-title">Agency Leaderboard</div>
            <div className="pills">
              {['all','month','year'].map(p => (
                <button key={p} className={`pill ${lbPeriod===p?'active':''}`} onClick={() => setLbPeriod(p)}>{p.charAt(0).toUpperCase()+p.slice(1)}</button>
              ))}
            </div>
          </div>
          <div className="card" style={{padding:0}}>
            <div className="lb-header">Where You Stand</div>
            <Leaderboard data={leaderboard} currentUser={user} />
          </div>
        </div>
      )}
    </>
  );
}

function BarChart({ deals }) {
  const weeks = {};
  deals.forEach(d => {
    const dt = new Date(d.posted_at);
    const key = `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dt.getMonth()]} ${dt.getDate()}`;
    weeks[key] = (weeks[key] || 0) + parseFloat(d.amount);
  });
  const entries = Object.entries(weeks).slice(-14);
  if (!entries.length) return <div style={{color:'#3a4050',fontSize:12,textAlign:'center',padding:'20px 0'}}>No deals in this period</div>;
  const max = Math.max(...entries.map(([,v])=>v));
  return (
    <div className="bar-chart">
      {entries.map(([label, val]) => (
        <div key={label} className="bar-wrap">
          <div className="bar" style={{height:`${max?(val/max)*100:0}%`}} title={fmt(val)} />
          <div className="bar-lbl">{label}</div>
        </div>
      ))}
    </div>
  );
}

function Heatmap({ dailyMap, maxDay }) {
  const now = new Date();
  const cells = [];
  for (let i = 364; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0,10);
    const val = dailyMap[key] || 0;
    let cls = 'hm-cell';
    if (val > 0) {
      const r = val / maxDay;
      if (r < 0.25) cls += ' l1';
      else if (r < 0.5) cls += ' l2';
      else if (r < 0.75) cls += ' l3';
      else cls += ' l4';
    }
    cells.push(<div key={key} className={cls} title={`${key}: ${fmt(val)}`} />);
  }
  return <div className="heatmap-grid">{cells}</div>;
}

function Leaderboard({ data, currentUser }) {
  const top3 = data.slice(0, 3);
  const medals = ['🥇','🥈','🥉'];
  const rankCls = ['gold','silver','bronze'];
  const myIdx = data.findIndex(u => u.discord_id === currentUser?.discord_id);
  const showContext = myIdx > 3;
  const contextRows = showContext ? data.slice(Math.max(3, myIdx-1), myIdx+2) : [];
  const hiddenBefore = showContext && myIdx > 4 ? myIdx - 1 - 3 : 0;
  const hiddenAfter = showContext && myIdx + 2 < data.length ? data.length - (myIdx + 2) : 0;
  const Row = ({ u, medal, rankClass }) => (
    <div className={`lb-row ${u.discord_id === currentUser?.discord_id ? 'you' : ''}`}>
      <div className={`lb-rank ${rankClass||''}`}>{medal || u.rank}</div>
      <div className="lb-avatar">{u.avatar ? <img src={u.avatar} alt="" onError={e=>e.target.style.display='none'} /> : u.display_name[0]}</div>
      <div className="lb-name">{u.display_name}{u.discord_id === currentUser?.discord_id && <span className="you-badge">YOU</span>}</div>
      <div className="lb-total">{fmt(u.total)}</div>
    </div>
  );
  return (
    <>
      {top3.map((u,i) => <Row key={u.discord_id} u={u} medal={medals[i]} rankClass={rankCls[i]} />)}
      {showContext && hiddenBefore > 0 && <div className="hidden-rows">— {hiddenBefore} agents hidden —</div>}
      {contextRows.map(u => <Row key={u.discord_id} u={u} />)}
      {showContext && hiddenAfter > 0 && <div className="hidden-rows">— {hiddenAfter} more agents —</div>}
      {!showContext && data.slice(3).map(u => <Row key={u.discord_id} u={u} />)}
      {data.length === 0 && <div style={{padding:'20px',textAlign:'center',color:'#3a4050',fontSize:13}}>No data yet</div>}
    </>
  );
}
