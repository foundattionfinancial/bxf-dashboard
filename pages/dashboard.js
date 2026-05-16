import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

const BLUEPRINT_LOGO = "/* unchanged - paste your existing base64 string here */";
const FAVICON = "/* unchanged - paste your existing base64 string here */";

const AGENCY_LOGOS = {
  'Agency Owner- The Foundation':    { src: "/* unchanged */", name: 'The Foundation' },
  'Agency Owner- AA FINANCIAL':      { src: "/* unchanged */", name: 'AA Financial' },
  'Agency Owner- The Key':           { src: "/* unchanged */", name: 'The Key Agency' },
  'Agency Owner- Formula Financial': { src: "/* unchanged */", name: 'Formula Financial' },
  'Agency Owner- Stark Financial':   { src: "/* unchanged */", name: 'Stark Financial' },
};

const AGENCY_OWNER_ROLES = [
  'Agency Owner- Blueprint','Agency Owner- The Foundation','Agency Owner- The Key',
  'Agency Owner- AA FINANCIAL','Agency Owner- Formula Financial','Agency Owner- Stark Financial',
];

// NEW: Network display names for owners that see multiple sub-agencies.
// Used as the top-of-page label when no filter is applied and the owner
// rolls up more than one sub-agency. Disambiguates "Foundation Network"
// (the rollup) from "The Foundation" (the sub-agency card in breakdown).
const NETWORK_NAMES = {
  'Agency Owner- Blueprint': 'Blueprint Network',
  'Agency Owner- The Foundation': 'Foundation Network',
  'Agency Owner- The Key': 'Key Network',
};

const MONTHS_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS_SHORT   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function getRoleClass(r) {
  if (!r) return 'owner-gold';
  if (r.includes('Foundation') || r.includes('Stark')) return 'owner-silver';
  if (r.includes('Key') || r.includes('Blueprint')) return 'owner-gold';
  return 'owner-red';
}
function getBadgeClass(r) {
  if (!r) return 'badge-gold';
  if (r.includes('Foundation') || r.includes('Stark')) return 'badge-silver';
  if (r.includes('Key') || r.includes('Blueprint')) return 'badge-gold';
  return 'badge-red';
}

const fmt = n => '$' + Math.round(n).toLocaleString();
const fmtDate = iso => new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
const fmtMonth = iso => new Date(iso).toLocaleDateString('en-US', { month:'long', year:'numeric' });

function getEasternNow() {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

// YYYY-MM-DD from a Date's *local* parts (matches the format that
// <input type="date"> already produces for the custom-range UI, so the
// /api/agency endpoint sees a consistent shape).
function ymdLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// NEW: compute {start, end, label} for an agency-tab period + offset.
// offset is in units of the period (-1 = previous day/week/month, 0 = current).
// start/end are YYYY-MM-DD strings ready to send to /api/agency.
function getPeriodRange(period, offset) {
  const now = getEasternNow();

  if (period === 'today') {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    const ymd = ymdLocal(d);
    return {
      start: ymd,
      end: ymd,
      label: `${DAYS_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`,
    };
  }

  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() + offset * 7);
    const dow = d.getDay();
    const start = new Date(d);
    start.setDate(start.getDate() - dow);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return {
      start: ymdLocal(start),
      end: ymdLocal(end),
      label: `Week of ${MONTHS_SHORT[start.getMonth()]} ${start.getDate()}`,
    };
  }

  if (period === 'month') {
    const cur = new Date(now);
    const d = new Date(cur.getFullYear(), cur.getMonth() + offset, 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return {
      start: ymdLocal(d),
      end: ymdLocal(lastDay),
      label: `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`,
    };
  }

  return { start: null, end: null, label: '' };
}

function filterDeals(deals, period) {
  if (period === 'all') return deals;
  const e = getEasternNow();
  const tzOff = new Date() - e;
  let start;
  if (period === 'today') { const s = new Date(e); s.setHours(0,0,0,0); start = new Date(s.getTime() + tzOff); }
  else if (period === 'week') { const s = new Date(e); s.setDate(s.getDate()-s.getDay()); s.setHours(0,0,0,0); start = new Date(s.getTime() + tzOff); }
  else if (period === 'month') { const s = new Date(e); s.setDate(1); s.setHours(0,0,0,0); start = new Date(s.getTime() + tzOff); }
  else if (period === 'year') { const s = new Date(e); s.setMonth(0); s.setDate(1); s.setHours(0,0,0,0); start = new Date(s.getTime() + tzOff); }
  if (!start) return deals;
  return deals.filter(d => new Date(d.posted_at) >= start);
}

function groupByMonth(deals) {
  const groups = {};
  deals.forEach(d => {
    const k = fmtMonth(d.posted_at);
    if (!groups[k]) groups[k] = [];
    groups[k].push(d);
  });
  return groups;
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [deals, setDeals] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [tab, setTab] = useState('personal');
  const [period, setPeriod] = useState('year');
  const [lbPeriod, setLbPeriod] = useState('month');
  const [agencyData, setAgencyData] = useState(null);
  const [agencyPeriod, setAgencyPeriod] = useState('month');
  const [agencyFilter, setAgencyFilter] = useState('');
  const [agencyLoading, setAgencyLoading] = useState(false);
  const [agencyCustomStart, setAgencyCustomStart] = useState('');
  const [agencyCustomEnd, setAgencyCustomEnd] = useState('');
  // NEW: offset for prev/next nav (in units of agencyPeriod).
  // 0 = "now", -1 = "previous day/week/month", etc. Reset on period change.
  const [agencyDateOffset, setAgencyDateOffset] = useState(0);
  const [tooltip, setTooltip] = useState(null);
  const [showAllDeals, setShowAllDeals] = useState(false);
  const [tickerDeals, setTickerDeals] = useState([]);

  // FIXED: isOwner / ownerRole now declared BEFORE the ticker useEffect that
  // references them. Previous version had a temporal-dead-zone bug — the
  // ticker effect's deps array `[isOwner]` evaluated before `const isOwner`,
  // which should have thrown ReferenceError at render time.
  const isOwner = user && (user.roles||[]).some(r => AGENCY_OWNER_ROLES.includes(r));
  const ownerRole = user && (user.roles||[]).find(r => AGENCY_OWNER_ROLES.includes(r));

  useEffect(() => {
    if (!isOwner) return;
    const fetchTicker = () => {
      fetch('/api/ticker').then(r => r.json()).then(d => {
        if (Array.isArray(d)) setTickerDeals(d);
      }).catch(()=>{});
    };
    fetchTicker();
    const interval = setInterval(fetchTicker, 30000);
    return () => clearInterval(interval);
  }, [isOwner]);

  useEffect(() => {
    fetch('/api/me').then(r => { if (!r.ok) { router.push('/'); return null; } return r.json(); })
      .then(u => { if (u) setUser(u); });
    fetch('/api/deals').then(r => r.json()).then(d => setDeals(Array.isArray(d) ? d : []));
  }, []);

  useEffect(() => {
    fetch('/api/leaderboard?period=' + lbPeriod).then(r => r.json()).then(d => setLeaderboard(Array.isArray(d) ? d : []));
  }, [lbPeriod]);

  // NEW: reset the prev/next offset whenever the period changes so jumping
  // from "month" (offset -3) to "week" doesn't carry over a stale offset.
  useEffect(() => { setAgencyDateOffset(0); }, [agencyPeriod]);

  useEffect(() => {
    if (tab !== 'agency' || !isOwner) return;
    if (agencyPeriod === 'custom' && (!agencyCustomStart || !agencyCustomEnd)) return;
    setAgencyLoading(true);

    const params = new URLSearchParams({ period: agencyPeriod });
    if (agencyFilter) params.set('agency', agencyFilter);

    if (agencyPeriod === 'custom') {
      params.set('start', agencyCustomStart);
      params.set('end', agencyCustomEnd);
    } else if (agencyDateOffset !== 0 && ['today','week','month'].includes(agencyPeriod)) {
      // NEW: when navigating via prev/next, send the explicit window.
      // We keep period=today/week/month for label/back-compat — the API
      // prioritizes start/end when present.
      const range = getPeriodRange(agencyPeriod, agencyDateOffset);
      params.set('start', range.start);
      params.set('end', range.end);
    }

    fetch('/api/agency?' + params).then(r => r.json()).then(d => { setAgencyData(d); setAgencyLoading(false); })
      .catch(() => setAgencyLoading(false));
  }, [tab, agencyPeriod, agencyFilter, agencyCustomStart, agencyCustomEnd, agencyDateOffset, isOwner]);

  const filtered = filterDeals(deals, period);
  const total = filtered.reduce((s,d) => s + parseFloat(d.amount), 0);
  const count = filtered.length;
  const avg = count ? total/count : 0;
  const myRank = leaderboard.find(u => u.discord_id === user?.discord_id)?.rank;

  const dailyMap = {};
  deals.forEach(d => {
    const day = d.posted_at.slice(0,10);
    dailyMap[day] = (dailyMap[day]||0) + parseFloat(d.amount);
  });
  const maxDay = Object.values(dailyMap).reduce((m,v) => v>m?v:m, 1);
  const bestDay = Object.entries(dailyMap).sort((a,b) => b[1]-a[1])[0];
  const activeDays = Object.keys(dailyMap).length;
  const biggest = deals.reduce((m,d) => parseFloat(d.amount)>m?parseFloat(d.amount):m, 0);
  const allTimeTotal = deals.reduce((s,d) => s+parseFloat(d.amount), 0);
  const dealsToShow = showAllDeals ? deals : deals.slice(0,30);
  const groupedDeals = groupByMonth(dealsToShow);

  // NEW: Agency-tab computed values for cleaner JSX below.
  const hasMultiAgencies = (agencyData?.agency_summaries?.length || 0) > 1;
  const networkName = NETWORK_NAMES[ownerRole];
  const ownerLogoName = ownerRole && AGENCY_LOGOS[ownerRole] ? AGENCY_LOGOS[ownerRole].name : null;
  // Title resolution: filtered → that sub-agency's label;
  //                    multi-agency rollup → "Foundation Network" etc.;
  //                    single-agency → owner's name.
  const agencyTitle = (() => {
    if (agencyFilter && agencyData?.agency_summaries) {
      const found = agencyData.agency_summaries.find(a => a.role === agencyFilter);
      if (found) return found.label;
    }
    if (hasMultiAgencies && networkName) return networkName;
    return ownerLogoName || 'Agency Overview';
  })();
  const agencySubtitle = (!agencyFilter && hasMultiAgencies)
    ? `Showing all downline agencies (${agencyData.agency_summaries.length})`
    : null;
  const agencyPeriodLabel = ['today','week','month'].includes(agencyPeriod)
    ? getPeriodRange(agencyPeriod, agencyDateOffset).label
    : null;
  const agencyDailyMap = agencyData?.daily_map || {};
  const agencyMaxDay = Object.values(agencyDailyMap).reduce((m,v) => v>m?v:m, 1);

  if (!user) return null;

  return (
    <>
      <Head>
        <title>Blueprint Agency Sales</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400&family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <link rel="icon" type="image/png" href={`data:image/png;base64,${FAVICON}`} />
      </Head>
      <style>{`
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        body{background:#06080f;color:#fff;font-family:'DM Sans',sans-serif;min-height:100vh}
        .header{display:flex;align-items:center;justify-content:space-between;padding:0 24px;height:60px;border-bottom:1px solid rgba(255,255,255,0.05);background:rgba(6,8,15,0.98);position:sticky;top:0;z-index:200}
        .brand{display:flex;align-items:center;gap:10px}
        .brand-logo{width:32px;height:32px;border-radius:50%;overflow:hidden;flex-shrink:0}
        .brand-logo img{width:100%;height:100%;object-fit:cover;display:block}
        .brand-name{font-family:'Playfair Display',serif;font-size:15px;font-style:italic;color:#fff;letter-spacing:.5px}
        .nav-tabs{display:flex;gap:2px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);border-radius:8px;padding:3px}
        .nav-tab{padding:5px 16px;border:none;background:transparent;color:rgba(255,255,255,.45);font-family:'DM Sans',sans-serif;font-size:11px;font-weight:700;cursor:pointer;border-radius:5px;transition:all .15s;letter-spacing:.5px;text-transform:uppercase}
        .nav-tab.active{background:rgba(37,99,235,.15);color:#60a5fa;border:1px solid rgba(37,99,235,.25)}
        .owner-gold{color:#f59e0b}.owner-gold.active{background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.25);color:#fbbf24}
        .owner-silver{color:#c0c0c0}.owner-silver.active{background:rgba(192,192,192,.08);border-color:rgba(192,192,192,.2);color:#e8e8e8}
        .owner-red{color:#ef4444}.owner-red.active{background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.25);color:#f87171}
        .user-chip{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:20px;padding:4px 14px 4px 4px;font-size:12px;font-weight:600}
        .user-avatar{width:26px;height:26px;border-radius:50%;overflow:hidden;background:rgba(255,255,255,.08)}
        .user-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .refresh-btn{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:8px;color:rgba(255,255,255,.4);font-size:14px;width:32px;height:32px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s}
        .refresh-btn:hover{color:#fff;border-color:rgba(255,255,255,.2)}
        .content{padding:24px;max-width:1280px;margin:0 auto}
        .period-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px}
        .page-title{font-family:'Playfair Display',serif;font-size:20px;font-style:italic;color:#fff}
        .agency-subtitle{font-size:12px;color:rgba(255,255,255,.55);margin-top:4px;font-style:italic;letter-spacing:.2px}
        .pills{display:flex;gap:2px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);border-radius:7px;padding:3px;flex-wrap:wrap}
        .pill{padding:4px 14px;border:none;background:transparent;color:rgba(255,255,255,.8);font-family:'DM Sans',sans-serif;font-size:11px;font-weight:700;cursor:pointer;border-radius:5px;transition:all .15s;text-transform:uppercase;letter-spacing:.5px}
        .pill.active{background:rgba(37,99,235,.15);color:#60a5fa;border:1px solid rgba(37,99,235,.25)}
        .stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
        .stat-card{background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:12px;padding:18px 20px}
        .stat-label{font-size:10px;font-weight:600;letter-spacing:1.5px;color:#fff;text-transform:uppercase;margin-bottom:10px;opacity:.7}
        .stat-value{font-family:'DM Mono',monospace;font-size:28px;color:#fff;line-height:1;margin-bottom:4px}
        .stat-value.blue{color:#60a5fa}
        .stat-sub{font-size:11px;color:rgba(255,255,255,.7);font-family:'DM Mono',monospace}
        .card{background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:12px;padding:20px;margin-bottom:14px}
        .card-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
        .card-title{font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#fff;opacity:.7}
        .bar-chart{display:flex;align-items:flex-end;gap:4px;height:120px}
        .bar-wrap{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end;cursor:pointer}
        .bar{width:100%;background:rgba(37,99,235,.2);border-radius:3px 3px 0 0;min-height:2px;transition:background .2s}
        .bar-wrap:hover .bar{background:rgba(96,165,250,.5)}
        .bar-lbl{font-size:8px;color:rgba(255,255,255,.6);font-family:'DM Mono',monospace;white-space:nowrap}
        .hm-nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
        .hm-nav-btn{background:none;border:none;font-size:20px;cursor:pointer;padding:0 4px;line-height:1;width:28px}
        .hm-nav-center{text-align:center}
        .hm-nav-label{font-family:'DM Mono',monospace;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#fff}
        .hm-nav-total{font-family:'DM Mono',monospace;font-size:18px;color:#60a5fa;font-weight:700;margin-top:2px}
        .hm-day-header{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px}
        .hm-day-lbl{text-align:center;font-family:'DM Mono',monospace;font-size:9px;color:rgba(255,255,255,.5);padding-bottom:4px}
        .hm-week{display:flex;align-items:center;gap:6px;margin-bottom:2px}
        .hm-days{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;flex:1}
        .hm-cell{height:30px;border-radius:3px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;cursor:pointer}
        .hm-cell-num{font-family:'DM Mono',monospace;font-size:9px}
        .hm-cell-amt{font-family:'DM Mono',monospace;font-size:6px;color:#93c5fd}
        .hm-week-total{width:56px;text-align:right;font-family:'DM Mono',monospace;font-size:10px;color:#fff;font-weight:600;cursor:pointer}
        .hm-stats{display:flex;gap:32px;padding-top:14px;border-top:1px solid rgba(255,255,255,.04)}
        .hm-stat-label{font-size:10px;color:#fff;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;opacity:.7}
        .hm-stat-value{font-family:'DM Mono',monospace;font-size:20px;color:#fff}
        .hm-stat-sub{font-size:10px;color:rgba(255,255,255,.7)}
        .records-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
        .rec-card{background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:12px;padding:16px 18px}
        .rec-label{font-size:10px;color:#fff;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;opacity:.7}
        .rec-badge{display:inline-block;font-size:9px;font-family:'DM Mono',monospace;background:rgba(37,99,235,.08);border:1px solid rgba(37,99,235,.15);color:rgba(255,255,255,.7);padding:2px 7px;border-radius:4px;margin-bottom:8px}
        .rec-value{font-family:'DM Mono',monospace;font-size:24px;color:#fff}
        .rec-sub{font-size:10px;color:rgba(255,255,255,.7);margin-top:3px}
        .section-label{font-size:10px;font-weight:700;letter-spacing:2px;color:#fff;text-transform:uppercase;margin-bottom:10px;opacity:.8}
        .month-header{display:flex;align-items:center;gap:12px;padding:14px 0 8px}
        .month-header-text{font-family:'DM Mono',monospace;font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#60a5fa;white-space:nowrap}
        .month-header-line{flex:1;height:1px;background:rgba(37,99,235,.2)}
        .month-total{font-family:'DM Mono',monospace;font-size:10px;color:rgba(255,255,255,.7);white-space:nowrap}
        .deal-row{display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.04)}
        .deal-row:last-child{border-bottom:none}
        .deal-date{font-size:12px;color:rgba(255,255,255,.8)}
        .deal-right{display:flex;align-items:center;gap:10px}
        .deal-amount{font-family:'DM Mono',monospace;font-size:13px;font-weight:500;color:#60a5fa}
        .deal-link{font-size:10px;color:rgba(96,165,250,.6);font-family:'DM Mono',monospace;letter-spacing:.5px;text-decoration:none;border:1px solid rgba(96,165,250,.2);border-radius:3px;padding:2px 7px;transition:all .15s}
        .deal-link:hover{color:#60a5fa;border-color:rgba(96,165,250,.5)}
        .show-more-btn{width:100%;padding:12px;background:transparent;border:1px solid rgba(255,255,255,.07);border-radius:8px;color:rgba(255,255,255,.7);font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600;cursor:pointer;margin-top:8px}
        .show-more-btn:hover{background:rgba(255,255,255,.03)}
        .lb-header-row{display:flex;align-items:center;padding:8px 20px;border-bottom:1px solid rgba(255,255,255,.05);gap:12px}
        .lb-header-text{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,.6)}
        .lb-row{display:flex;align-items:center;padding:11px 20px;border-bottom:1px solid rgba(255,255,255,.03);gap:12px;transition:background .15s}
        .lb-row:last-child{border-bottom:none}
        .lb-row:hover{background:rgba(37,99,235,.04)}
        .lb-row.you{background:rgba(37,99,235,.07);border-left:2px solid rgba(37,99,235,.5)}
        .lb-rank{font-family:'DM Mono',monospace;font-size:12px;color:rgba(255,255,255,.7);width:28px;text-align:center;flex-shrink:0}
        .lb-avatar{width:28px;height:28px;border-radius:50%;overflow:hidden;flex-shrink:0;background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:center;font-family:'DM Mono',monospace;font-size:11px;color:rgba(255,255,255,.5)}
        .lb-avatar img{width:100%;height:100%;object-fit:cover;display:block}
        .lb-name{flex:1;font-size:13px;font-weight:500;color:#fff}
        .you-badge{font-size:9px;font-weight:700;background:rgba(37,99,235,.12);color:#60a5fa;border:1px solid rgba(37,99,235,.25);padding:1px 6px;border-radius:3px;margin-left:8px;letter-spacing:.5px}
        .lb-deals{font-size:11px;color:rgba(255,255,255,.7);margin-right:12px;font-family:'DM Mono',monospace}
        .lb-total{font-family:'DM Mono',monospace;font-size:13px;color:#fff;font-weight:500}
        .agency-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px}
        .agency-role-badge{font-size:10px;font-weight:700;padding:3px 10px;border-radius:4px;letter-spacing:1px;text-transform:uppercase;margin-top:6px;display:inline-block}
        .badge-silver{background:rgba(192,192,192,.08);color:#d4d4d4;border:1px solid rgba(192,192,192,.25)}
        .badge-gold{background:rgba(245,158,11,.08);color:#fbbf24;border:1px solid rgba(245,158,11,.3)}
        .badge-red{background:rgba(239,68,68,.08);color:#f87171;border:1px solid rgba(239,68,68,.25)}
        .agency-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
        .agency-select{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:7px;color:#fff;font-family:'DM Sans',sans-serif;font-size:12px;padding:6px 12px;cursor:pointer;outline:none}
        .agency-select option{background:#0d1020}
        .agency-stat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
        .date-range{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .date-input{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:7px;color:#fff;font-family:'DM Mono',monospace;font-size:11px;padding:6px 10px;outline:none;colorscheme:dark}
        .breakdown-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:14px}
        .breakdown-card{background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:12px 16px;cursor:pointer;transition:border-color .15s}
        .breakdown-card:hover{border-color:rgba(255,255,255,.12)}
        .breakdown-label{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:rgba(255,255,255,.7);margin-bottom:8px}
        .breakdown-value{font-family:'DM Mono',monospace;font-size:20px;color:#60a5fa;margin-bottom:4px}
        .breakdown-sub{font-size:11px;color:rgba(255,255,255,.7)}
        /* NEW: Period prev/next nav bar for agency tab (today/week/month) */
        .period-nav{display:flex;align-items:center;justify-content:center;gap:18px;margin-bottom:14px;padding:12px 18px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:10px}
        .period-nav-btn{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);color:#fff;font-size:18px;cursor:pointer;width:32px;height:32px;line-height:1;border-radius:6px;display:flex;align-items:center;justify-content:center;transition:all .15s;padding:0}
        .period-nav-btn:hover:not(:disabled){background:rgba(37,99,235,.1);border-color:rgba(37,99,235,.25)}
        .period-nav-btn:disabled{cursor:default;opacity:.25}
        .period-nav-label{font-family:'DM Mono',monospace;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#fff;min-width:200px;text-align:center}
        .period-nav-current{font-size:9px;color:#60a5fa;font-weight:700;letter-spacing:1.5px;margin-left:8px;padding:2px 6px;background:rgba(37,99,235,.1);border-radius:3px}
        .tooltip{position:fixed;background:#0d1020;border:1px solid rgba(37,99,235,.3);border-radius:8px;padding:8px 12px;font-size:11px;font-family:'DM Mono',monospace;color:#fff;pointer-events:none;z-index:9999;white-space:nowrap;box-shadow:0 4px 24px rgba(0,0,0,.6)}
        .tooltip-date{color:rgba(255,255,255,.6);font-size:10px;margin-bottom:3px}
        .tooltip-amount{color:#60a5fa;font-weight:500}
        @media(max-width:768px){.stat-grid{grid-template-columns:repeat(2,1fr)}.records-grid{grid-template-columns:1fr}.agency-stat-grid{grid-template-columns:repeat(2,1fr)}.content{padding:14px}.header{padding:0 14px}.brand-name{display:none}.period-nav-label{min-width:120px;font-size:10px}}
        .ticker-wrap{width:100%;background:rgba(255,255,255,0.02);border-bottom:1px solid rgba(255,255,255,0.05);overflow:hidden;height:32px;display:flex;align-items:center;position:sticky;top:60px;z-index:190;backdrop-filter:blur(20px)}
        .ticker-track{display:flex;align-items:center;gap:0;white-space:nowrap;animation:ticker-scroll 60s linear infinite}
        .ticker-track:hover{animation-play-state:paused}
        @keyframes ticker-scroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        .ticker-item{display:inline-flex;align-items:center;gap:8px;padding:0 24px;font-family:'DM Mono',monospace;font-size:11px;border-right:1px solid rgba(255,255,255,0.06)}
        .ticker-name{color:rgba(255,255,255,0.7);font-weight:500}
        .ticker-amount{color:#60a5fa;font-weight:700}
        .ticker-time{color:rgba(255,255,255,0.35);font-size:10px}
        .ticker-dot{width:5px;height:5px;border-radius:50%;background:#60a5fa;opacity:0.5;flex-shrink:0}
      `}</style>

      {tooltip && (
        <div className="tooltip" style={{left:tooltip.x+14,top:tooltip.y-48}}>
          <div className="tooltip-date">{tooltip.date}</div>
          <div className="tooltip-amount">{tooltip.amount}</div>
        </div>
      )}

      <header className="header">
        <div className="brand">
          <div className="brand-logo"><img src={`data:image/jpeg;base64,${BLUEPRINT_LOGO}`} alt="Blueprint" /></div>
          <span className="brand-name">Blueprint Agency Sales</span>
        </div>
        <div className="nav-tabs">
          <button className={`nav-tab ${tab==='personal'?'active':''}`} onClick={()=>setTab('personal')}>Personal</button>
          <button className={`nav-tab ${tab==='leaderboard'?'active':''}`} onClick={()=>setTab('leaderboard')}>Leaderboard</button>
          {isOwner && <button className={`nav-tab ${getRoleClass(ownerRole)} ${tab==='agency'?'active':''}`} onClick={()=>setTab('agency')}>Agency</button>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <button className="refresh-btn" title="Refresh roles" onClick={async()=>{await fetch('/api/auth/refresh',{method:'POST'});window.location.reload();}}>↻</button>
          <div className="user-chip">
            <div className="user-avatar"><img src={user.avatar} alt="" onError={e=>e.target.style.display='none'}/></div>
            <span>{user.display_name}</span>
          </div>
        </div>
      </header>

      {isOwner && tickerDeals.length > 0 && <DealTicker deals={tickerDeals} />}

      {tab==='personal' && (
        <div className="content">
          <div className="period-row">
            <div className="page-title">Your Production</div>
            <div className="pills">
              {['all','today','week','month','year'].map(p=>(
                <button key={p} className={`pill ${period===p?'active':''}`} onClick={()=>setPeriod(p)}>
                  {p==='year'?'YTD':p.charAt(0).toUpperCase()+p.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="stat-grid">
            <div className="stat-card"><div className="stat-label">Total Production</div><div className="stat-value blue">{fmt(total)}</div></div>
            <div className="stat-card"><div className="stat-label">Deals Written</div><div className="stat-value">{count}</div></div>
            <div className="stat-card"><div className="stat-label">Avg Deal Size</div><div className="stat-value">{fmt(avg)}</div></div>
            <div className="stat-card"><div className="stat-label">Your Rank</div><div className="stat-value">{myRank||'—'}</div><div className="stat-sub">of {leaderboard.length} agents</div></div>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title">Production Over Time</div></div>
            <BarChart deals={filtered} setTooltip={setTooltip}/>
          </div>
          <div className="card">
            <div className="card-header"><div className="card-title">Production Heatmap</div></div>
            <MonthHeatmap dailyMap={dailyMap} maxDay={maxDay} setTooltip={setTooltip}/>
            <div className="hm-stats">
              <div><div className="hm-stat-label">All-Time</div><div className="hm-stat-value">{fmt(allTimeTotal)}</div></div>
              <div><div className="hm-stat-label">Active Days</div><div className="hm-stat-value">{activeDays}</div></div>
              <div><div className="hm-stat-label">Best Day</div><div className="hm-stat-value">{bestDay?fmt(bestDay[1]):'$0'}</div><div className="hm-stat-sub">{bestDay?new Date(bestDay[0]).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}):'—'}</div></div>
            </div>
          </div>
          <div className="section-label">Records</div>
          <div className="records-grid">
            <div className="rec-card"><div className="rec-label">Biggest Deal</div><div className="rec-badge">ALL-TIME</div><div className="rec-value">{fmt(biggest)}</div></div>
            <div className="rec-card"><div className="rec-label">Best Day</div><div className="rec-badge">ALL-TIME</div><div className="rec-value">{bestDay?fmt(bestDay[1]):'$0'}</div><div className="rec-sub">{bestDay?new Date(bestDay[0]).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'}):'—'}</div></div>
            <div className="rec-card"><div className="rec-label">Total All-Time</div><div className="rec-badge">ALL-TIME</div><div className="rec-value">{fmt(allTimeTotal)}</div><div className="rec-sub">{deals.length} deals</div></div>
          </div>
          <div className="section-label">Recent Deals</div>
          <div className="card" style={{padding:'0 20px'}}>
            {Object.entries(groupedDeals).map(([month,mDeals])=>{
              const mTotal=mDeals.reduce((s,d)=>s+parseFloat(d.amount),0);
              return (
                <div key={month}>
                  <div className="month-header">
                    <div className="month-header-text">{month}</div>
                    <div className="month-header-line"/>
                    <div className="month-total">{fmt(mTotal)} · {mDeals.length} deals</div>
                  </div>
                  {mDeals.map((d,i)=>(
                    <div key={i} className="deal-row">
                      <span className="deal-date">{fmtDate(d.posted_at)}</span>
                      <div className="deal-right">
                        <span className="deal-amount">{fmt(parseFloat(d.amount))}</span>
                        {d.message_url&&<a href={d.message_url.replace('https://discord.com','discord://discord.com')} onClick={e=>{e.preventDefault();const a=d.message_url.replace('https://discord.com','discord://discord.com');window.location.href=a;setTimeout(()=>window.open(d.message_url,'_blank'),1500);}} className="deal-link">VIEW ↗</a>}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
            {deals.length===0&&<div style={{padding:'20px 0',textAlign:'center',color:'rgba(255,255,255,.5)',fontSize:13}}>No deals yet</div>}
            {deals.length>30&&<button className="show-more-btn" onClick={()=>setShowAllDeals(!showAllDeals)}>{showAllDeals?'Show Less':`Show All ${deals.length} Deals`}</button>}
          </div>
        </div>
      )}

      {tab==='leaderboard' && (
        <div className="content">
          <div className="period-row">
            <div className="page-title">The Blueprint Leaderboard</div>
            <div className="pills">
              {['today','week','month','year','all'].map(p=>(
                <button key={p} className={`pill ${lbPeriod===p?'active':''}`} onClick={()=>setLbPeriod(p)}>
                  {p==='year'?'YTD':p.charAt(0).toUpperCase()+p.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="card" style={{padding:0}}>
            <div className="lb-header-row">
              <div style={{width:28}}/><div style={{width:28}}/>
              <div className="lb-header-text" style={{flex:1}}>Agent</div>
              <div className="lb-header-text" style={{marginRight:12}}>Deals</div>
              <div className="lb-header-text">Production</div>
            </div>
            <Leaderboard data={leaderboard} currentUser={user}/>
          </div>
        </div>
      )}

      {tab==='agency' && isOwner && (
        <div className="content">
          <div className="agency-header">
            <div style={{display:'flex',alignItems:'center',gap:16}}>
              {ownerRole&&AGENCY_LOGOS[ownerRole]&&(
                <div style={{width:64,height:64,borderRadius:12,overflow:'hidden',background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.08)',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <img src={AGENCY_LOGOS[ownerRole].src} alt="" style={{width:'100%',height:'100%',objectFit:'contain',padding:4}}/>
                </div>
              )}
              <div>
                {/* FIXED: title now resolves to "Foundation Network" / "Key Network" /
                    "Blueprint Network" when no filter is set AND owner sees multiple
                    sub-agencies. When a filter is set, shows the sub-agency's label.
                    Otherwise falls back to the owner's name. */}
                <div className="page-title">{agencyTitle}</div>
                {agencySubtitle && <div className="agency-subtitle">{agencySubtitle}</div>}
                <div className={`agency-role-badge ${getBadgeClass(ownerRole)}`}>{ownerRole}</div>
              </div>
            </div>
            <div className="agency-controls">
              {agencyData?.agency_summaries&&agencyData.agency_summaries.length>1&&(
                <select className="agency-select" value={agencyFilter} onChange={e=>setAgencyFilter(e.target.value)}>
                  <option value="">All Agencies</option>
                  {agencyData.agency_summaries.map(a=><option key={a.role} value={a.role}>{a.label}</option>)}
                </select>
              )}
              <div className="pills">
                {['today','week','month','year','all','custom'].map(p=>(
                  <button key={p} className={`pill ${agencyPeriod===p?'active':''}`} onClick={()=>setAgencyPeriod(p)}>
                    {p==='year'?'YTD':p.charAt(0).toUpperCase()+p.slice(1)}
                  </button>
                ))}
              </div>
              {agencyPeriod==='custom'&&(
                <div className="date-range">
                  <input type="date" className="date-input" value={agencyCustomStart} onChange={e=>setAgencyCustomStart(e.target.value)}/>
                  <span style={{color:'#fff',fontSize:12}}>to</span>
                  <input type="date" className="date-input" value={agencyCustomEnd} onChange={e=>setAgencyCustomEnd(e.target.value)}/>
                </div>
              )}
            </div>
          </div>

          {/* NEW: Prev/next navigation for today/week/month periods.
              Hidden for year/all/custom (year already covers a fixed range;
              all is by definition unbounded; custom has its own date inputs). */}
          {['today','week','month'].includes(agencyPeriod) && agencyPeriodLabel && (
            <div className="period-nav">
              <button
                className="period-nav-btn"
                onClick={() => setAgencyDateOffset(o => o - 1)}
                aria-label="Previous period"
                title="Previous period"
              >‹</button>
              <div className="period-nav-label">
                {agencyPeriodLabel}
                {agencyDateOffset === 0 && <span className="period-nav-current">NOW</span>}
              </div>
              <button
                className="period-nav-btn"
                onClick={() => agencyDateOffset < 0 && setAgencyDateOffset(o => o + 1)}
                disabled={agencyDateOffset >= 0}
                aria-label="Next period"
                title="Next period"
              >›</button>
            </div>
          )}

          {agencyLoading?(
            <div style={{textAlign:'center',padding:'60px 0',color:'rgba(255,255,255,.5)',fontSize:13}}>Loading...</div>
          ):agencyData&&!agencyData.error?(
            <>
              <div className="agency-stat-grid">
                <div className="stat-card"><div className="stat-label">Total Production</div><div className="stat-value blue">{fmt(agencyData.summary?.total_production||0)}</div></div>
                <div className="stat-card"><div className="stat-label">Total Deals</div><div className="stat-value">{agencyData.summary?.total_deals||0}</div></div>
                <div className="stat-card"><div className="stat-label">Active Agents</div><div className="stat-value">{agencyData.summary?.agent_count||0}</div></div>
              </div>
              {!agencyFilter&&agencyData.agency_summaries&&agencyData.agency_summaries.length>1&&(
                <div className="card" style={{marginBottom:14}}>
                  <div className="card-header"><div className="card-title">Agency Breakdown</div></div>
                  <div className="breakdown-grid">
                    {agencyData.agency_summaries.map(a=>(
                      <div key={a.role} className="breakdown-card" onClick={()=>setAgencyFilter(a.role)}>
                        <div className="breakdown-label">{a.label}</div>
                        <div className="breakdown-value">{fmt(a.total_production)}</div>
                        <div className="breakdown-sub">{a.total_deals} deals · {a.agent_count} agents</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* NEW: Production Heatmap on agency tab.
                  Uses agencyData.daily_map (returned by /api/agency) and the
                  same MonthHeatmap component as the Personal tab. Note: the
                  heatmap renders data only for days falling inside the current
                  period window — when period=today/week, most cells will be
                  empty. That's expected; the heatmap is most useful on
                  month/year/all/custom. */}
              <div className="card">
                <div className="card-header"><div className="card-title">Production Heatmap</div></div>
                <MonthHeatmap dailyMap={agencyDailyMap} maxDay={agencyMaxDay} setTooltip={setTooltip}/>
              </div>

              <div className="card" style={{padding:0}}>
                <div className="lb-header-row">
                  <div style={{width:28}}/><div style={{width:28}}/>
                  <div className="lb-header-text" style={{flex:1}}>Agent</div>
                  <div className="lb-header-text" style={{marginRight:12}}>Deals</div>
                  <div className="lb-header-text">Production</div>
                </div>
                <Leaderboard data={agencyData.leaderboard||[]} currentUser={user}/>
              </div>
            </>
          ):(
            <div style={{textAlign:'center',padding:'60px 0',color:'rgba(255,255,255,.5)',fontSize:13}}>
              {agencyData?.error==='Not an agency owner'?'Role not detected — refresh your session.':agencyData?.error||'No data available'}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const diffMins = Math.floor(diff / 60000);
  const diffHrs = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays > 0) return diffDays + 'd ago';
  if (diffHrs > 0) return diffHrs + 'h ago';
  if (diffMins > 0) return diffMins + 'm ago';
  return 'just now';
}

function DealTicker({ deals }) {
  const items = [...deals, ...deals];
  const speed = Math.max(deals.length * 3.5, 30);
  return (
    <div className="ticker-wrap">
      <div className="ticker-track" style={{animationDuration: `${speed}s`}}>
        {items.map((deal, i) => (
          <div key={i} className="ticker-item">
            <div className="ticker-dot" />
            <span className="ticker-name">{deal.display_name || 'Agent'}</span>
            {deal.agency && (
              <span style={{fontSize:9,color:'rgba(255,255,255,0.35)',fontFamily:"'DM Mono',monospace",
                background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',
                borderRadius:3,padding:'1px 5px',letterSpacing:'0.5px',textTransform:'uppercase'}}>
                {deal.agency}
              </span>
            )}
            <span className="ticker-amount">{fmt(parseFloat(deal.amount))}</span>
            <span className="ticker-time">{timeAgo(deal.posted_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChart({ deals, setTooltip }) {
  const daily = {};
  deals.forEach(d => {
    const k = d.posted_at.slice(0,10);
    if (!daily[k]) daily[k]={total:0,count:0};
    daily[k].total+=parseFloat(d.amount); daily[k].count++;
  });
  const entries = Object.entries(daily).sort((a,b)=>a[0].localeCompare(b[0])).slice(-20);
  if (!entries.length) return <div style={{color:'rgba(255,255,255,.4)',fontSize:12,textAlign:'center',padding:'30px 0'}}>No deals in this period</div>;
  const max = entries.reduce((m,[,v])=>v.total>m?v.total:m,1);
  return (
    <div className="bar-chart">
      {entries.map(([key,val])=>{
        const dt=new Date(key+'T12:00:00');
        const lbl=dt.toLocaleDateString('en-US',{month:'short',day:'numeric'});
        return (
          <div key={key} className="bar-wrap"
            onMouseMove={e=>setTooltip({x:e.clientX,y:e.clientY,date:lbl,amount:fmt(val.total),deals:val.count})}
            onMouseLeave={()=>setTooltip(null)}>
            <div className="bar" style={{height:`${(val.total/max)*100}%`}}/>
            <div className="bar-lbl">{lbl}</div>
          </div>
        );
      })}
    </div>
  );
}

function MonthHeatmap({ dailyMap, maxDay, setTooltip }) {
  const [mo, setMo] = React.useState(0);
  const e = new Date(new Date().toLocaleString('en-US',{timeZone:'America/New_York'}));
  const yr = e.getFullYear(); const em = e.getMonth();
  const tDate = new Date(yr, em+mo, 1);
  const ty = tDate.getFullYear(); const tm = tDate.getMonth();
  const canBack = new Date(ty,tm-1,1) >= new Date(2025,0,1);
  const canFwd = mo < 0;
  const dim = new Date(ty,tm+1,0).getDate();
  const fdow = new Date(ty,tm,1).getDay();
  const mKey = `${ty}-${String(tm+1).padStart(2,'0')}`;
  const mTotal = Object.entries(dailyMap||{}).filter(([k])=>k.startsWith(mKey)).reduce((s,[,v])=>s+v,0);
  const todayKey = `${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,'0')}-${String(e.getDate()).padStart(2,'0')}`;
  const cells = [];
  for(let i=0;i<fdow;i++) cells.push(null);
  for(let d=1;d<=dim;d++){
    const key=`${ty}-${String(tm+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cells.push({d,key,val:(dailyMap||{})[key]||0,today:key===todayKey});
  }
  while(cells.length%7!==0) cells.push(null);
  const weeks=[];
  for(let i=0;i<cells.length;i+=7) weeks.push(cells.slice(i,i+7));
  const safe = maxDay||1;
  return (
    <div>
      <div className="hm-nav">
        <button className="hm-nav-btn" style={{color:canBack?'#fff':'rgba(255,255,255,.2)'}} onClick={()=>canBack&&setMo(o=>o-1)}>‹</button>
        <div className="hm-nav-center">
          <div className="hm-nav-label">{tDate.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</div>
          {mTotal>0&&<div className="hm-nav-total">{fmt(mTotal)}</div>}
        </div>
        <button className="hm-nav-btn" style={{color:canFwd?'#fff':'rgba(255,255,255,.2)'}} onClick={()=>canFwd&&setMo(o=>o+1)}>›</button>
      </div>
      <div className="hm-day-header">
        {['S','M','T','W','T','F','S'].map((d,i)=><div key={i} className="hm-day-lbl">{d}</div>)}
      </div>
      {weeks.map((week,wi)=>{
        const wTotal=week.reduce((s,c)=>s+(c?.val||0),0);
        return (
          <div key={wi} className="hm-week">
            <div className="hm-days">
              {week.map((cell,ci)=>{
                if(!cell) return <div key={ci} className="hm-cell" style={{background:'transparent',cursor:'default'}}/>;
                const r=cell.val/safe;
                const bg=cell.val===0?'rgba(255,255,255,.03)':r<0.25?'rgba(37,99,235,.18)':r<0.5?'rgba(37,99,235,.38)':r<0.75?'rgba(59,130,246,.58)':'rgba(96,165,250,.82)';
                const dateStr=new Date(ty,tm,cell.d).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
                return (
                  <div key={ci} className="hm-cell" style={{background:bg,outline:cell.today?'1.5px solid rgba(96,165,250,.5)':'none'}}
                    onMouseMove={e=>setTooltip({x:e.clientX,y:e.clientY,date:dateStr,amount:cell.val>0?fmt(cell.val):'No sales',deals:0})}
                    onMouseLeave={()=>setTooltip(null)}>
                    <span className="hm-cell-num" style={{color:cell.val>0?'#fff':'rgba(255,255,255,.4)'}}>{cell.d}</span>
                    {cell.val>0&&<span className="hm-cell-amt">{fmt(cell.val).replace('$','')}</span>}
                  </div>
                );
              })}
            </div>
            {wTotal>0?<div className="hm-week-total">{fmt(wTotal)}</div>:<div style={{width:56}}/>}
          </div>
        );
      })}
    </div>
  );
}

function Leaderboard({ data, currentUser }) {
  const [showAll, setShowAll] = React.useState(false);
  const medals = ['👑','🥈','🥉'];
  const myIdx = data.findIndex(u=>u.discord_id===currentUser?.discord_id);
  const top10 = data.slice(0,10);
  const showCtx = myIdx>=10;
  const ctxRows = showCtx?data.slice(Math.max(10,myIdx-1),myIdx+2):[];
  const hiddenBefore = showCtx&&myIdx>11?myIdx-1-10:0;
  const hiddenAfter = showCtx&&myIdx+2<data.length?data.length-(myIdx+2):0;
  const Row = ({u,medal})=>(
    <div className={`lb-row ${u.discord_id===currentUser?.discord_id?'you':''}`}>
      <div className="lb-rank">{medal||u.rank}</div>
      <div className="lb-avatar">{u.avatar?<img src={u.avatar} alt="" onError={e=>e.target.style.display='none'}/>:u.display_name?.[0]}</div>
      <div className="lb-name">{u.display_name}{u.discord_id===currentUser?.discord_id&&<span className="you-badge">YOU</span>}</div>
      <div className="lb-deals">{u.count||0} deals</div>
      <div className="lb-total">{fmt(u.total)}</div>
    </div>
  );
  const visible = showAll?data:top10;
  return (
    <>
      {visible.map((u,i)=><Row key={u.discord_id} u={u} medal={medals[i]}/>)}
      {!showAll&&showCtx&&hiddenBefore>0&&<div style={{textAlign:'center',padding:'8px',fontSize:11,color:'rgba(255,255,255,.4)',borderBottom:'1px solid rgba(255,255,255,.03)'}}>— {hiddenBefore} agents —</div>}
      {!showAll&&ctxRows.map(u=><Row key={u.discord_id} u={u}/>)}
      {!showAll&&showCtx&&hiddenAfter>0&&<div style={{textAlign:'center',padding:'8px',fontSize:11,color:'rgba(255,255,255,.4)'}}>— {hiddenAfter} more —</div>}
      {data.length>10&&<div style={{textAlign:'center',padding:'12px',borderTop:'1px solid rgba(255,255,255,.04)'}}>
        <button onClick={()=>setShowAll(!showAll)} style={{background:'transparent',border:'1px solid rgba(255,255,255,.1)',borderRadius:6,color:'rgba(255,255,255,.7)',fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:600,padding:'7px 20px',cursor:'pointer'}}>
          {showAll?'Show Less':`Show All ${data.length} Agents`}
        </button>
      </div>}
      {data.length===0&&<div style={{padding:'24px',textAlign:'center',color:'rgba(255,255,255,.5)',fontSize:13}}>No data yet</div>}
    </>
  );
}
