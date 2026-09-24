// components/OfficeTV.js — shared TV leaderboard used by every office page
// (pages/floridatv.js, pages/dallastv.js). Office settings live in lib/offices.js.
// On the TV: open the office URL and sign in once with that office's leaderboard
// Discord account (stays signed in).  Shift+L signs out.  ?period=day opens on Day.

import Head from 'next/head';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { BILL_FRONT, BILL_BACK } from '../lib/cash-textures';
import { BP_LOGO, FOUNDATION_LOGO } from '../lib/logos';
import { OFFICES, officeOf } from '../lib/offices';

const POLL_MS = 3000;                      // new sales show up within ~3 seconds
const DEFAULT_CELEBRATE_MS = 8000;         // cash mode: used until the sale sound loads (or if there is none)
const DEFAULT_VIDEO_MS = 32200;            // video mode fallback (Dallas clip = 32.2s); the real length is read from the file
const QUEUE_GAP_MS = 2500;                 // pause between back-to-back celebrations
const FRESH_WINDOW_MS = 20 * 60 * 1000;    // only celebrate sales posted in the last 20 min
const MAX_BURST = 3;                       // max celebrations queued from a single poll


const fmt = n => '$' + Math.round(n || 0).toLocaleString('en-US');
const initials = name => (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

function AnimatedNumber({ value, from, delay = 0, duration = 1400 }) {
  const [display, setDisplay] = useState(from ?? value);
  const fromRef = useRef(from ?? value);
  useEffect(() => {
    const start = fromRef.current;
    const end = value;
    if (start === end) { setDisplay(end); return; }
    let t0 = null;
    const dur = duration;
    let raf, timer;
    const tick = now => {
      if (t0 === null) t0 = now;
      const t = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(start + (end - start) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    timer = setTimeout(() => { raf = requestAnimationFrame(tick); }, delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); fromRef.current = end; };
  }, [value]);
  return <>{fmt(display)}</>;
}

function Avatar({ src, name, className = '' }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className={`av ${className}`}>
      {src && !broken
        ? <img src={src} alt="" onError={() => setBroken(true)} />
        : <span>{initials(name)}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cash rain: real-looking two-sided $100 bills falling with paper physics —
// sway, tilt into the drift, end-over-end tumbles or flutters, perspective,
// light that changes as each bill turns, and three depth layers (far bills are
// small, slow and soft; a few huge, blurred bills slide past in the foreground).
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Sale sound (cash mode): the office's sound file plays at the start of every
// celebration, timed to the file's exact length so sound and visuals start and end
// together. Browsers hold sound until someone clicks once; a small bell next to the
// office name shows while that's the case. Video mode uses the same unlock check.
// ---------------------------------------------------------------------------
const SOUND_MAX_SECONDS = 12;    // the celebration runs exactly as long as the file (up to 12s)
const SOUND_GAIN = 1.8;          // 1 = file's own volume; boosted, with a limiter so it doesn't crackle

const sound = { ctx: null, buffer: null, loading: null, playing: null };

function loadSound(url) {
  if (sound.loading) return sound.loading;
  sound.loading = (async () => {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    sound.ctx = sound.ctx || new AC();
    if (!url) return;                                    // video offices: context only, for the unlock check
    const r = await fetch(url, { cache: 'force-cache' });
    if (!r.ok) return;                                   // no file uploaded yet -> stay silent
    const data = await r.arrayBuffer();
    sound.buffer = await new Promise((res, rej) => sound.ctx.decodeAudioData(data, res, rej));
  })().catch(() => {});
  return sound.loading;
}

async function unlockSound(url) {
  await loadSound(url);
  if (sound.ctx && sound.ctx.state !== 'running') {
    // resume() never settles while the browser is blocking sound, so don't wait on it forever
    try { await Promise.race([sound.ctx.resume(), new Promise(r => setTimeout(r, 400))]); } catch (e) {}
  }
  return !!(sound.ctx && sound.ctx.state === 'running');
}

// How long a celebration lasts: exactly the sale sound's length
function celebrationMs() {
  if (sound.buffer) return Math.round(Math.min(SOUND_MAX_SECONDS, Math.max(4, sound.buffer.duration)) * 1000);
  return DEFAULT_CELEBRATE_MS;
}

function playSaleSound() {
  const { ctx, buffer } = sound;
  if (!ctx || !buffer || ctx.state !== 'running') return false;
  const t = ctx.currentTime;
  // back-to-back sales: fade out the previous sound so they don't pile up
  if (sound.playing) {
    const g = sound.playing.gain.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.0001, t + 0.25);
    try { sound.playing.src.stop(t + 0.3); } catch (e) {}
  }
  const dur = Math.min(SOUND_MAX_SECONDS, buffer.duration);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(SOUND_GAIN, t);
  gain.gain.setValueAtTime(SOUND_GAIN, t + Math.max(0, dur - 0.6));
  gain.gain.linearRampToValueAtTime(0.0001, t + dur);       // fades out with the visuals
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6; limiter.knee.value = 4; limiter.ratio.value = 20;
  limiter.attack.value = 0.002; limiter.release.value = 0.2;
  src.connect(gain); gain.connect(limiter); limiter.connect(ctx.destination);
  src.start(t);
  src.stop(t + dur + 0.05);
  sound.playing = { src, gain };
  src.onended = () => { if (sound.playing && sound.playing.src === src) sound.playing = null; };
  console.info('[floridatv] sale sound played');
  return true;
}

const rnd = (a, b) => a + Math.random() * (b - a);

function makeBill(host, w, blur, dim) {
  const el = document.createElement('div');
  el.className = 'cb';
  el.style.width = `${w}px`;
  el.style.height = `${w / 2.35}px`;
  const f = (blur || dim) ? ` style="filter:${blur ? `blur(${blur}px)` : ''} ${dim ? `brightness(${dim})` : ''}"` : '';
  el.innerHTML =
    `<div class="cb-face cb-front"${f}><i class="cb-shade"></i><i class="cb-shine"></i></div>` +
    `<div class="cb-face cb-back"${f}><i class="cb-shade"></i><i class="cb-shine"></i></div>`;
  host.appendChild(el);
  return { el, shades: el.querySelectorAll('.cb-shade'), shines: el.querySelectorAll('.cb-shine') };
}

function CashRain({ seed, duration }) {
  const backRef = useRef(null);
  const frontRef = useRef(null);

  useEffect(() => {
    const back = backRef.current, front = frontRef.current;
    if (!back || !front) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const vw = window.innerWidth, vh = window.innerHeight;
    const weak = (navigator.hardwareConcurrency || 8) <= 4;
    const TOTAL = weak ? 95 : 150;         // bills behind the popup
    const FOREGROUND = weak ? 2 : 4;       // big blurred bills in front, kept to the edges
    const SPAWN_MS = Math.max(3000, duration * 0.55);
    const bills = [];
    let spawned = 0, fgSpawned = 0, raf;
    const t0 = performance.now();
    let last = t0;

    const spawn = (fg) => {
      const layer = fg ? 3 : (Math.random() < 0.34 ? 0 : Math.random() < 0.72 ? 1 : 2);
      const w = vw * (layer === 0 ? rnd(0.05, 0.068) : layer === 1 ? rnd(0.08, 0.11) : layer === 2 ? rnd(0.12, 0.155) : rnd(0.2, 0.26));
      const blur = layer === 0 ? 1.4 : layer === 3 ? 3.5 : 0;
      const dim = layer === 0 ? 0.72 : layer === 1 ? 0.9 : 0;
      const b = makeBill(fg ? front : back, w, blur, dim);
      const speed = vh * (layer === 0 ? rnd(0.36, 0.44) : layer === 1 ? rnd(0.48, 0.6) : layer === 2 ? rnd(0.62, 0.76) : rnd(0.9, 1.05));
      const x0 = fg
        ? (Math.random() < 0.5 ? rnd(-0.08, 0.12) : rnd(0.78, 0.98)) * vw
        : rnd(-0.06, 1.0) * vw;
      Object.assign(b, {
        w, x0, y: -w * rnd(0.7, 1.6), vy: speed,
        swayA: w * rnd(0.35, 0.9), swayF: rnd(0.55, 1.15), ph: rnd(0, Math.PI * 2),
        drift: rnd(-0.03, 0.03) * vw,
        tumble: Math.random() < 0.55,
        rx: rnd(0, 360), wx: rnd(160, 420) * (Math.random() < 0.5 ? -1 : 1),
        ry: rnd(-30, 30), wy: rnd(40, 160) * (Math.random() < 0.5 ? -1 : 1),
        rzBase: rnd(-35, 35),
        flutF: rnd(1.2, 2.2), flutA: rnd(45, 70), born: performance.now(),
      });
      bills.push(b);
    };

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.12, (now - last) / 1000);   // stays real-time even if a TV drops frames
      last = now;
      const t = now - t0;

      // steady downpour for ~4s
      const target = Math.min(TOTAL, Math.round(TOTAL * Math.pow(Math.min(1, t / SPAWN_MS), 0.9)));
      while (spawned < target) { spawn(false); spawned++; }
      const fgTarget = Math.min(FOREGROUND, Math.floor(FOREGROUND * Math.min(1, t / (SPAWN_MS * 0.8))));
      while (fgSpawned < fgTarget) { spawn(true); fgSpawned++; }

      for (let i = bills.length - 1; i >= 0; i--) {
        const b = bills[i];
        const age = (now - b.born) / 1000;
        b.y += b.vy * dt;
        const s = Math.sin(age * b.swayF * Math.PI * 2 + b.ph);
        const c = Math.cos(age * b.swayF * Math.PI * 2 + b.ph);
        const x = b.x0 + b.swayA * s + b.drift * age;
        const rz = b.rzBase + 28 * c;                           // tilts into the direction it's drifting
        const rx = b.tumble ? (b.rx += b.wx * dt) : b.flutA * Math.sin(age * b.flutF * Math.PI * 2 + b.ph);
        b.ry += b.wy * dt * 0.35;
        const ry = b.tumble ? b.ry : 18 * Math.sin(age * 0.9 + b.ph);

        b.el.style.transform = `translate3d(${x}px, ${b.y}px, 0) rotateZ(${rz}deg) rotateX(${rx}deg) rotateY(${ry}deg)`;

        // lighting: how squarely the bill faces the viewer / the key light
        const rxR = rx * Math.PI / 180, ryR = ry * Math.PI / 180;
        const facing = Math.abs(Math.cos(rxR) * Math.cos(ryR));             // 1 = flat to camera
        const shade = (1 - facing) * 0.62;
        const shine = Math.pow(Math.max(0, Math.sin(rxR * 0.5 + 0.9) * facing), 6) * 0.45;
        for (let k = 0; k < 2; k++) {
          b.shades[k].style.opacity = shade;
          b.shines[k].style.opacity = shine;
        }

        if (b.y > vh + b.w) { b.el.remove(); bills.splice(i, 1); }
      }
      if (t < duration + 1500 && (bills.length || spawned < TOTAL)) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      bills.forEach(b => b.el.remove());
    };
  }, [seed, duration]);

  // Textures are shared through CSS variables so 150 bills reuse one decoded image
  const tex = { '--bf': `url(${BILL_FRONT})`, '--bb': `url(${BILL_BACK})` };
  return (
    <>
      <div className="rain rain-back" ref={backRef} style={tex} />
      <div className="rain rain-front" ref={frontRef} style={tex} />
    </>
  );
}

function Logos({ cfg, big = false }) {
  const map = { blueprint: [BP_LOGO, 'The Blueprint Agency'], foundation: [FOUNDATION_LOGO, 'The Foundation'] };
  return (
    <div className={`logos ${big ? 'big' : ''}`}>
      {cfg.logos.map((k, i) => (
        <span key={k} className="logos-item">
          {i > 0 && <span className="logos-x">×</span>}
          <span className={`logo-tile ${big ? 'big' : ''} ${k}`}><img src={map[k][0]} alt={map[k][1]} /></span>
        </span>
      ))}
    </div>
  );
}

function PodiumCard({ p, place, hot }) {
  if (!p) return <div className="pod pod-empty" />;
  return (
    <div className={`pod pod-${place} ${hot ? 'hot' : ''} ${p.total === 0 ? 'is-zero' : ''}`} data-flip={p.discord_id}>
      <div className="pod-ghost">#{place}</div>
      <Avatar src={p.avatar} name={p.name} className="pod-av" />
      <div className="pod-rank">Rank {place}</div>
      <div className="pod-name">{p.name}</div>
      <div className="pod-amt">{p.total > 0 ? <AnimatedNumber value={p.total} /> : '$0'}</div>
      <div className="pod-deals">{p.count} {p.count === 1 ? 'deal' : 'deals'}</div>
    </div>
  );
}

function Row({ p, hot }) {
  return (
    <div className={`row ${p.total === 0 ? 'is-zero' : ''} ${hot ? 'hot' : ''}`} data-flip={p.discord_id}>
      <div className="row-rank">#{p.rank}</div>
      <Avatar src={p.avatar} name={p.name} className="row-av" />
      <div className="row-name">{p.name}</div>
      <div className="row-deals">{p.count > 0 ? `${p.count} ${p.count === 1 ? 'deal' : 'deals'}` : ''}</div>
      <div className="row-amt">{p.total > 0 ? <AnimatedNumber value={p.total} /> : '—'}</div>
    </div>
  );
}

export default function OfficeTV({ office }) {
  const officeKey = officeOf(office);
  const cfg = OFFICES[officeKey];
  const isVideo = cfg.celebration === 'video';
  const router = useRouter();
  const videoRef = useRef(null);
  const volTimerRef = useRef(null);
  const blobUrlRef = useRef(null);          // the whole video held in memory once downloaded

  // Video offices: download the entire clip into memory on page load, so every
  // play starts instantly at full HD with no buffering, stalls or first-frame flash.
  useEffect(() => {
    if (!isVideo) return;
    const v = videoRef.current;
    if (v) { v.src = cfg.videoUrl; v.load(); }      // streams immediately as a fallback
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(cfg.videoUrl, { cache: 'force-cache' });
        if (!r.ok) return;
        const blob = await r.blob();
        if (cancelled) return;
        blobUrlRef.current = URL.createObjectURL(blob);
        const el = videoRef.current;
        if (el && el.paused) { el.src = blobUrlRef.current; el.load(); }
      } catch (e) { /* keep streaming from the file */ }
    })();
    return () => {
      cancelled = true;
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, [isVideo, cfg.videoUrl]);
  const [params, setParams] = useState(null);
  const [shown, setShown] = useState(null);       // data currently on screen
  const [view, setView] = useState('week');
  const [current, setCurrent] = useState(null);   // active celebration
  const [hotId, setHotId] = useState(null);
  const [err, setErr] = useState(null);
  const [auth, setAuth] = useState(null);         // null | { code, error }
  const [soundBlocked, setSoundBlocked] = useState(false); // true = browser is holding sound until someone clicks

  const dataRef = useRef(null);
  const seenRef = useRef(new Set());
  const bootedRef = useRef(false);
  const busyRef = useRef(false);
  const queueRef = useRef([]);
  const viewRef = useRef('week');
  const rectsRef = useRef(new Map());
  const skipFlipRef = useRef(false);

  useEffect(() => {
    if (isVideo) return;
    [BILL_FRONT, BILL_BACK].forEach(src => { const i = new Image(); i.src = src; if (i.decode) i.decode().catch(() => {}); });
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    setParams({
      key: String(router.query.key || ''),
      error: String(router.query.error || ''),
      period: ['day', 'today'].includes(String(router.query.period)) ? 'today' : 'week',
    });
  }, [router.isReady, router.query]);

  const board = shown ? shown.boards[view] : null;

  // Celebration queue — one sale at a time, board updates as each one finishes
  const runNext = useCallback(() => {
    const next = queueRef.current.shift();
    if (!next) {
      busyRef.current = false;
      setCurrent(null);
      if (dataRef.current) setShown(dataRef.current);
      return;
    }
    busyRef.current = true;
    const d = dataRef.current;
    const b = d?.boards?.[viewRef.current];
    const entry = b?.board?.find(x => x.discord_id === next.discord_id);
    const week = d?.boards?.week?.ranks?.[next.discord_id] || null;
    let ms;
    if (isVideo) {
      const v = videoRef.current;
      ms = v && isFinite(v.duration) && v.duration > 0
        ? Math.round(Math.min(60, Math.max(8, v.duration)) * 1000)
        : DEFAULT_VIDEO_MS;
      if (v) {
        clearInterval(volTimerRef.current);
        if (v.currentTime > 0.01) v.currentTime = 0;
        v.volume = 1;
        v.muted = !(sound.ctx && sound.ctx.state === 'running');
        v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
        // ease the music out over the last 1.5s so it ends with the visuals
        setTimeout(() => {
          clearInterval(volTimerRef.current);
          volTimerRef.current = setInterval(() => {
            v.volume = Math.max(0, v.volume - 0.07);
            if (v.volume <= 0) clearInterval(volTimerRef.current);
          }, 100);
        }, Math.max(0, ms - 1500));
      }
    } else {
      ms = celebrationMs();
    }
    setCurrent({
      ...next, key: `${next.id}:${Date.now()}`, ms,
      rank: entry?.rank || null, periodWord: b?.word || '',
      weekRank: week?.rank || null, weekDeals: week?.count || null,
    });
    if (!isVideo) playSaleSound();                     // same tick as the visuals
    setTimeout(() => {
      setCurrent(null);
      if (isVideo && videoRef.current) {
        const el = videoRef.current;
        el.pause();
        clearInterval(volTimerRef.current);
        // if the in-memory copy finished downloading mid-play, switch to it now
        if (blobUrlRef.current && el.src !== blobUrlRef.current) { el.src = blobUrlRef.current; el.load(); }
        else { el.currentTime = 0; }                 // rewind now so the next sale starts on frame one
      }
      if (dataRef.current) setShown(dataRef.current);
      setHotId(next.discord_id);
      setTimeout(() => setHotId(h => (h === next.discord_id ? null : h)), 7000);
      setTimeout(runNext, QUEUE_GAP_MS);               // next sale (if any) after a short pause
    }, ms);
  }, []);

  const celebrate = useCallback(items => {
    queueRef.current.push(...items);
    if (!busyRef.current) runNext();
  }, [runNext]);

  const poll = useCallback(async () => {
    if (!params) return;
    try {
      const keyPart = params.key ? `key=${encodeURIComponent(params.key)}&` : '';
      const r = await fetch(`/api/tv?office=${officeKey}&${keyPart}periods=today,week`, { cache: 'no-store', credentials: 'same-origin' });
      const json = await r.json();
      if (r.status === 401 || r.status === 403) { setAuth({ code: json.code, error: json.error }); return; }
      if (!r.ok) { setErr(json.error || 'The leaderboard feed is unavailable.'); return; }
      setErr(null);
      setAuth(null);
      dataRef.current = json;
      const recent = json.recent || [];

      if (!bootedRef.current) {
        seenRef.current = new Set(recent.map(d => d.id));
        bootedRef.current = true;
        setShown(json);
        return;
      }

      const now = Date.now();
      const fresh = recent.filter(d => !seenRef.current.has(d.id));
      seenRef.current = new Set(recent.map(d => d.id));

      // Group a burst by agent so "$1,200 and $900" in one message = one celebration
      const byAgent = {};
      fresh
        .filter(d => now - new Date(d.posted_at).getTime() < FRESH_WINDOW_MS)
        .sort((a, b) => new Date(a.posted_at) - new Date(b.posted_at))
        .forEach(d => {
          if (!byAgent[d.discord_id]) byAgent[d.discord_id] = { ...d, amount: 0 };
          byAgent[d.discord_id].amount += d.amount;
        });
      const items = Object.values(byAgent).slice(-MAX_BURST);

      if (items.length) celebrate(items);
      else if (!busyRef.current) setShown(json);
    } catch (e) {
      // network blip — keep the last good board on screen
    }
  }, [params, celebrate]);

  useEffect(() => {
    if (!params) return;
    poll();
    const i = setInterval(poll, POLL_MS);
    return () => clearInterval(i);
  }, [params, poll]);

  // Sale sound: starts right away if the browser allows it. If the browser is
  // holding sound back, a small bell appears next to the office name; one click
  // (on the bell or anywhere) turns sound on until the page is restarted.
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const on = await unlockSound(cfg.soundUrl);
      if (alive) setSoundBlocked((isVideo || !!sound.buffer) && !on);
    };
    check();
    const onGesture = () => { check(); };
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);
    return () => {
      alive = false;
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }, []);

  // Day / Week toggle
  const switchView = useCallback(v => {
    if (v === viewRef.current) return;
    skipFlipRef.current = true;
    viewRef.current = v;
    setView(v);
  }, []);

  useEffect(() => { if (params) switchView(params.period); }, [params, switchView]);

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'd' || e.key === 'D') switchView('today');
      if (e.key === 'w' || e.key === 'W') switchView('week');
      if (e.key === 'L' && e.shiftKey) window.location.href = `/api/tv-logout?office=${officeKey}`;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [switchView]);

  // Hide the mouse cursor after 3s of no movement
  useEffect(() => {
    let t;
    const wake = () => { document.body.classList.remove('idle'); clearTimeout(t); t = setTimeout(() => document.body.classList.add('idle'), 3000); };
    wake();
    window.addEventListener('mousemove', wake);
    return () => { window.removeEventListener('mousemove', wake); clearTimeout(t); };
  }, []);

  // Preview a sale: press T (offices with testHotkey: true in lib/offices.js)
  const fireTest = useCallback(() => {
    const d = dataRef.current;
    const b = d?.boards?.[viewRef.current];
    const pick = b?.board?.[0] || d?.boards?.week?.board?.[0];
    if (!pick) return;
    celebrate([{ id: `test-${Date.now()}`, discord_id: pick.discord_id, name: pick.name, avatar: pick.avatar, amount: 1500, posted_at: new Date().toISOString() }]);
  }, [celebrate]);

  useEffect(() => {
    if (!cfg.testHotkey) return;
    const onKey = e => {
      if ((e.key === 't' || e.key === 'T') && !e.shiftKey && !e.metaKey && !e.ctrlKey) unlockSound(cfg.soundUrl).then(() => fireTest());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fireTest]);

  // FLIP: agents glide to their new rank when the board updates
  useLayoutEffect(() => {
    const els = document.querySelectorAll('[data-flip]');
    const next = new Map();
    const skip = skipFlipRef.current;
    skipFlipRef.current = false;
    els.forEach(el => {
      const id = el.getAttribute('data-flip');
      const r = el.getBoundingClientRect();
      next.set(id, r);
      const prev = rectsRef.current.get(id);
      if (skip || !prev || !el.animate) return;
      const dx = prev.left - r.left;
      const dy = prev.top - r.top;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        el.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
          { duration: 1100, easing: 'cubic-bezier(.2,.8,.2,1)' }
        );
      }
    });
    rectsRef.current = next;
  }, [shown, view]);

  const top = board?.board || [];
  const rest = top.slice(3, 13);

  return (
    <>
      <Head>
        <title>{`${cfg.title} — Leaderboard`}</title>
        <link rel="icon" type="image/png" href={BP_LOGO} />
        <link rel="apple-touch-icon" href={BP_LOGO} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300..800&display=swap" rel="stylesheet" />
      </Head>
      <style dangerouslySetInnerHTML={{ __html: `
        :root{
          --ink:#050814; --navy:#0C1733; --blue:#3B8CFF; --sky:#9FD4FF; --ice:#F2F6FF; --slate:#8E9AB8;
          --cash:#34D399;
        }
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        html,body{height:100%;overflow:hidden;background:var(--ink)}
        body.idle,body.idle *{cursor:none!important}
        body{
          color:var(--ice);
          font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Inter",system-ui,sans-serif;
          font-optical-sizing:auto;font-feature-settings:"tnum" 1,"cv11" 0,"ss01" 0;
          -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;
          font-variant-numeric:tabular-nums;letter-spacing:-.011em;
        }
        .stage{position:fixed;inset:0;display:flex;flex-direction:column;padding:3.6vh 4.6vw 3.2vh;
          background:
            radial-gradient(70% 55% at 50% 38%, rgba(30,70,160,.22) 0%, rgba(20,40,100,.08) 45%, transparent 75%),
            linear-gradient(180deg, #0A1226 0%, #070C1C 55%, #04060F 100%)}

        /* Header */
        .head{display:flex;align-items:center;justify-content:space-between;gap:3vw;padding-bottom:2.2vh;margin-bottom:2.6vh;
          border-bottom:1px solid rgba(160,190,255,.10)}
        .brand{display:flex;align-items:center;gap:1.6vw;min-width:0}
        .logo-tile{width:10vh;height:10vh;flex:none;border-radius:2.2vh;display:flex;align-items:center;justify-content:center;
          background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.02));border:1px solid rgba(160,190,255,.16)}
        .logo-tile img{width:86%;height:86%;object-fit:contain;filter:drop-shadow(0 0 1.6vh rgba(59,140,255,.45))}
        .eyebrow{font-size:1.45vh;font-weight:700;letter-spacing:.32em;text-transform:uppercase;color:var(--slate);margin-bottom:.9vh}
        .title{font-size:5vh;font-weight:650;letter-spacing:-.042em;line-height:1.02}
        .title-row{display:flex;align-items:center;gap:1.2vw}
        .logos{display:flex;align-items:center;flex:none}
        .logos-item{display:flex;align-items:center}
        .logos-x{margin:0 1vh;font-size:3vh;font-weight:300;color:var(--slate)}
        .logos.big .logos-x{margin:0 1.6vh;font-size:4.4vh}
        .logo-tile.foundation img{width:92%;height:92%;filter:none}

        /* ---------- video celebration ---------- */
        .vid-stage{position:fixed;inset:0;z-index:50;background:#000;opacity:0;visibility:hidden;pointer-events:none}
        .vid-stage.on{visibility:visible;animation:vidLife var(--cd,30s) linear both}
        @keyframes vidLife{0%{opacity:0}3.5%{opacity:1}95%{opacity:1}100%{opacity:0}}
        .vid-stage video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000;transform:translateZ(0)}
        .vid-overlay{position:absolute;inset:0}
        .vid-overlay .pop-ring{filter:none;box-shadow:0 0 2.4vh rgba(59,140,255,.7)}
        .vid-overlay .pop-halo,.vid-overlay .pop-ring,.vid-overlay .pop-wave{will-change:transform,opacity}
        .headline,.agent{will-change:opacity,transform}
        .vid-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.35) 0%,rgba(0,0,0,0) 22%,rgba(0,0,0,0) 70%,rgba(0,0,0,.45) 100%)}

        /* headline: fades in grand, holds, fades out by ~42% of the video */
        .headline{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;
          text-align:center;padding:12vh 6vw;
          animation:hlOut 1.4s ease calc(var(--cd,30s) * .40) forwards}
        @keyframes hlOut{to{opacity:0;filter:blur(10px);transform:translateY(-50%) scale(1.03)}}
        .hl-band{position:absolute;inset:0;z-index:-1;
          background:linear-gradient(90deg,rgba(3,7,20,0) 0%,rgba(3,7,20,.8) 18%,rgba(3,7,20,.86) 50%,rgba(3,7,20,.8) 82%,rgba(3,7,20,0) 100%);
          -webkit-mask-image:linear-gradient(180deg,transparent 0%,#000 22%,#000 78%,transparent 100%);
          mask-image:linear-gradient(180deg,transparent 0%,#000 22%,#000 78%,transparent 100%);
          animation:fadeIn 1.2s ease calc(var(--cd,30s) * .04) both}
        .hl-rule{width:46vw;height:2px;background:linear-gradient(90deg,transparent,#7FC0FF 30%,#3B8CFF 70%,transparent);
          transform-origin:center;animation:ruleIn 1.3s cubic-bezier(.2,.9,.25,1) calc(var(--cd,30s) * .05) both;margin-bottom:3.4vh}
        .hl-rule.bottom{margin:3.6vh 0 0}
        @keyframes ruleIn{from{transform:scaleX(0);opacity:0}to{transform:scaleX(1);opacity:1}}
        .hl-1{font-size:6.4vh;font-weight:800;letter-spacing:-.03em;line-height:1.05;color:#fff;
          text-shadow:0 .4vh 2.4vh rgba(0,0,0,.65);
          animation:hlIn 1.6s cubic-bezier(.2,.9,.25,1) calc(var(--cd,30s) * .06) both}
        .hl-2{font-size:10.5vh;font-weight:800;letter-spacing:-.04em;line-height:1.02;margin-top:1.2vh;color:#fff;
          text-shadow:0 .5vh 3vh rgba(0,0,0,.7);
          animation:hlIn 1.8s cubic-bezier(.2,.9,.25,1) calc(var(--cd,30s) * .06 + .7s) both}
        .hl-2 span{color:#9ED4FF;text-shadow:0 0 3vh rgba(59,140,255,.75),0 .5vh 3vh rgba(0,0,0,.6)}
        @keyframes hlIn{0%{opacity:0;transform:translateY(3vh) scale(.97);filter:blur(10px);letter-spacing:.08em}
          100%{opacity:1;transform:none;filter:blur(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}

        /* agent card: arrives at ~50%, holds, fades out with the video */
        .agent{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;
          opacity:0;animation:agIn 1.6s cubic-bezier(.2,.9,.25,1) calc(var(--cd,30s) * .5) both, agOut 1.3s ease calc(var(--cd,30s) - 1.8s) forwards}
        @keyframes agIn{0%{opacity:0;transform:scale(.92);filter:blur(12px)}100%{opacity:1;transform:none;filter:blur(0)}}
        @keyframes agOut{to{opacity:0;transform:scale(1.03);filter:blur(8px)}}
        .agent-scrim{position:absolute;left:50%;top:50%;width:64vw;height:84vh;transform:translate(-50%,-50%);z-index:-1;border-radius:4.4vh;
          background:linear-gradient(180deg,rgba(9,16,38,.86) 0%,rgba(4,8,22,.9) 100%);border:1px solid rgba(140,190,255,.28);
          box-shadow:0 0 0 1px rgba(59,140,255,.08) inset,0 3vh 10vh rgba(0,0,0,.45),0 0 8vh rgba(59,140,255,.18)}
        .ag-avwrap{position:relative;width:28vh;height:28vh;display:flex;align-items:center;justify-content:center}
        .ag-avwrap .pop-halo{width:58vh;height:58vh;margin:-29vh 0 0 -29vh}
        .ag-av{position:relative;width:26vh;height:26vh;font-size:7vh;border:.8vh solid rgba(12,18,40,.9);
          box-shadow:0 0 6vh rgba(59,140,255,.65),0 0 14vh rgba(46,120,240,.4)}
        .ag-name{font-size:8vh;font-weight:800;letter-spacing:-.04em;line-height:1;margin-top:4.6vh;color:#fff;text-shadow:0 .6vh 3vh rgba(0,0,0,.6)}
        .ag-amt{font-size:13vh;font-weight:800;letter-spacing:-.05em;line-height:1.05;margin-top:1.4vh;padding:0 .12em;
          background:linear-gradient(180deg,#B7FFD9 0%,#34D399 60%,#1E9E6E 100%);-webkit-background-clip:text;background-clip:text;color:transparent;
          filter:drop-shadow(0 0 3vh rgba(52,211,153,.45))}
        .ag-stats{display:flex;gap:2vw;margin-top:4vh}
        .ag-stat{display:flex;align-items:baseline;gap:1.2vh;padding:1.6vh 3vh;border-radius:99px;
          background:rgba(8,18,44,.82);border:1px solid rgba(110,170,255,.4);box-shadow:0 0 3vh rgba(59,140,255,.25)}
        .ag-stat b{font-size:4.2vh;font-weight:800;letter-spacing:-.03em;color:#fff}
        .ag-stat span{font-size:2.4vh;font-weight:600;color:#BFD6F5}
        .agent .ag-avwrap{animation:zoomIn 1.2s cubic-bezier(.2,.9,.25,1) calc(var(--cd,30s) * .5 + .15s) both}
        .agent .ag-name{animation:fadeUp .9s cubic-bezier(.2,.9,.25,1) calc(var(--cd,30s) * .5 + .6s) both}
        .agent .ag-amt{animation:amtIn 1s cubic-bezier(.2,.9,.25,1) calc(var(--cd,30s) * .5 + .85s) both}
        .agent .ag-stats{animation:fadeUp .9s ease calc(var(--cd,30s) * .5 + 1.5s) both}
        .bell{width:4vh;height:4vh;flex:none;display:flex;align-items:center;justify-content:center;padding:.8vh;border-radius:50%;
          color:var(--slate);background:rgba(255,255,255,.05);border:1px solid rgba(160,190,255,.16);cursor:pointer;opacity:.75;
          transition:opacity .2s,color .2s;animation:bellNudge 4s ease-in-out infinite}
        .bell svg{width:100%;height:100%}
        .bell:hover,.bell:focus-visible{opacity:1;color:var(--ice);outline:none}
        @keyframes bellNudge{0%,86%,100%{transform:rotate(0)}90%{transform:rotate(-12deg)}94%{transform:rotate(10deg)}}
        .title-period{display:flex;align-items:center;gap:1.4vw;margin-top:.5vh}
        .date{font-size:3.6vh;font-weight:600;letter-spacing:-.03em;line-height:1.15;white-space:nowrap;
          background:linear-gradient(90deg,#D6ECFF 0%,#86C3FF 40%,#3B8CFF 85%);-webkit-background-clip:text;background-clip:text;color:transparent}
        .head-right{display:flex;flex-direction:column;align-items:flex-end;gap:1.1vh;flex:none}
        .toggle{display:flex;padding:.3vh;border-radius:99px;background:rgba(255,255,255,.035);border:1px solid rgba(160,190,255,.12)}
        .toggle button{font:inherit;font-size:1.35vh;font-weight:600;letter-spacing:.02em;color:rgba(142,154,184,.85);background:none;border:0;
          padding:.45vh 1.5vh;border-radius:99px;cursor:pointer;transition:background .25s,color .25s}
        .toggle button.on{background:rgba(59,140,255,.22);color:#DCEBFF;box-shadow:0 0 0 1px rgba(110,170,255,.35) inset}
        .toggle button:focus-visible{outline:2px solid #9FD4FF;outline-offset:2px}
        .stats{display:flex;gap:1vw}
        .stat{min-width:15vh;padding:1.7vh 1.6vw;border-radius:1.6vh;text-align:center;
          background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02));border:1px solid rgba(160,190,255,.14)}
        .stat-v{font-size:3.4vh;font-weight:650;letter-spacing:-.035em;line-height:1}
        .stat-l{font-size:1.2vh;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:var(--slate);margin-top:1vh}

        .view{flex:1;display:flex;flex-direction:column;min-height:0;animation:viewIn .7s ease both}
        @keyframes viewIn{from{opacity:0;transform:translateY(1.2vh)}to{opacity:1;transform:none}}

        /* Top 3 */
        .podium{display:grid;grid-template-columns:repeat(3,1fr);gap:1.6vw;height:26vh;margin-bottom:2.2vh}
        .pod{position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;
          border-radius:2.4vh;padding:1.6vh 1.6vw;
          background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02));border:1px solid rgba(160,190,255,.14)}
        /* #1 blue card, gold glow  |  #2 silver  |  #3 bronze */
        .pod-1{--accent:#F5C451;
          background:linear-gradient(160deg,rgba(59,140,255,.34) 0%,rgba(40,90,200,.18) 55%,rgba(20,40,110,.12) 100%);
          border:1.5px solid rgba(245,196,81,.8);animation:goldGlow 3.2s ease-in-out infinite}
        @keyframes goldGlow{
          0%,100%{box-shadow:0 0 0 1px rgba(245,196,81,.25) inset,0 0 2.4vh rgba(245,196,81,.35),0 0 7vh rgba(245,196,81,.16)}
          50%{box-shadow:0 0 0 1px rgba(245,196,81,.4) inset,0 0 3.6vh rgba(245,196,81,.55),0 0 11vh rgba(245,196,81,.26)}}
        .pod-1::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
          background:linear-gradient(105deg,transparent 35%,rgba(255,230,160,.10) 48%,transparent 60%);background-size:250% 100%;
          animation:sheen 6s ease-in-out infinite}
        @keyframes sheen{0%,60%{background-position:120% 0}100%{background-position:-120% 0}}
        .pod-2{--accent:#D9E1EE;border:1.5px solid rgba(217,225,238,.6);
          box-shadow:0 0 0 1px rgba(217,225,238,.12) inset,0 0 2.6vh rgba(217,225,238,.16),0 0 6vh rgba(217,225,238,.07)}
        .pod-3{--accent:#DB935C;border:1.5px solid rgba(219,147,92,.65);
          box-shadow:0 0 0 1px rgba(219,147,92,.14) inset,0 0 2.6vh rgba(219,147,92,.2),0 0 6vh rgba(219,147,92,.08)}
        .pod-empty{background:rgba(255,255,255,.015);border-style:dashed;border-color:rgba(160,190,255,.08);animation:none;box-shadow:none}
        .pod-ghost{position:absolute;top:1.6vh;right:1.6vw;font-size:4.6vh;font-weight:800;letter-spacing:-.04em;color:var(--accent,#fff);opacity:.28}
        .pod-1 .pod-ghost{opacity:.45}
        .av{border-radius:50%;overflow:hidden;background:#16224A;display:flex;align-items:center;justify-content:center;color:var(--slate);font-weight:700;flex:none}
        .av img{width:100%;height:100%;object-fit:cover;display:block}
        .pod-av{width:8.6vh;height:8.6vh;font-size:2.8vh;box-shadow:0 0 0 .45vh var(--accent,#fff),0 1.2vh 3vh rgba(0,0,0,.5)}
        .pod-1 .pod-av{box-shadow:0 0 0 .45vh #F5C451,0 0 3.4vh rgba(245,196,81,.6),0 1.2vh 3vh rgba(0,0,0,.5)}
        .pod-2 .pod-av{box-shadow:0 0 0 .45vh #D9E1EE,0 0 2.6vh rgba(217,225,238,.4),0 1.2vh 3vh rgba(0,0,0,.5)}
        .pod-3 .pod-av{box-shadow:0 0 0 .45vh #DB935C,0 0 2.6vh rgba(219,147,92,.45),0 1.2vh 3vh rgba(0,0,0,.5)}
        .pod-rank{font-size:1.15vh;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:var(--accent,var(--slate));opacity:.9;margin-top:1.4vh}
        .pod-name{font-size:2.9vh;font-weight:600;letter-spacing:-.03em;line-height:1.15;margin-top:.4vh;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .pod-amt{font-size:4.6vh;font-weight:700;letter-spacing:-.045em;line-height:1.1;margin-top:.6vh}
        .pod-deals{font-size:1.6vh;color:var(--slate);margin-top:.6vh}
        .pod.is-zero .pod-amt,.pod.is-zero .pod-name{opacity:.45}

        /* Ranks 4-13 */
        .list{flex:1;display:flex;flex-direction:column;min-height:0;border-radius:2.2vh;overflow:hidden;
          background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.015));border:1px solid rgba(160,190,255,.12)}
        .row{flex:1;display:flex;align-items:center;gap:1.4vw;padding:0 2vw;min-height:0;border-bottom:1px solid rgba(160,190,255,.07)}
        .row:last-child{border-bottom:none}
        .row-rank{width:5vh;font-size:2.1vh;font-weight:600;letter-spacing:-.02em;color:var(--sky)}
        .row-av{width:3.4vh;height:3.4vh;font-size:1.3vh;box-shadow:0 0 0 .22vh rgba(255,255,255,.7)}
        .row-name{flex:1;min-width:0;font-size:2.35vh;font-weight:560;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .row-deals{font-size:1.6vh;color:var(--slate);white-space:nowrap}
        .row-amt{min-width:13vh;text-align:right;font-size:2.55vh;font-weight:650;letter-spacing:-.035em}
        .row.is-zero{opacity:.4}
        .empty{margin:auto;font-size:2.4vh;font-weight:500;color:var(--slate)}

        .hot{animation:hot 1.4s ease-in-out 5}
        @keyframes hot{0%,100%{box-shadow:0 0 0 0 rgba(52,211,153,0)}50%{box-shadow:0 0 0 .4vh rgba(52,211,153,.6),0 0 6vh rgba(52,211,153,.35)}}
        .row.hot{animation:hotRow 1.4s ease-in-out 5}
        @keyframes hotRow{0%,100%{background:transparent}50%{background:rgba(52,211,153,.14)}}

        /* Celebration */
        .celebrate{position:fixed;inset:0;z-index:50;pointer-events:none}
        .dim{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(6,10,28,.55),rgba(3,4,12,.92));animation:dim var(--cd,8s) ease both}
        .stage{transition:filter .5s ease}
        .stage.blurred{filter:blur(10px)}
        .stage.under-video{animation:hideUnder 0s linear 1.3s forwards}
        @keyframes hideUnder{to{visibility:hidden}}
        @keyframes dim{0%{opacity:0}8%{opacity:1}90%{opacity:1}100%{opacity:0}}
        .flash{position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,rgba(59,140,255,.35),transparent 55%);animation:flash 1.4s ease-out both}
        @keyframes flash{0%{opacity:0;transform:scale(.6)}25%{opacity:1}100%{opacity:0;transform:scale(1.4)}}
        .rain{position:absolute;inset:0;overflow:hidden;contain:strict;perspective:1400px;perspective-origin:50% 35%;pointer-events:none;animation:rainOut var(--cd,8s) linear both}
        .rain-back{z-index:1}
        .rain-front{z-index:4}
        @keyframes rainOut{0%{opacity:0}4%{opacity:1}88%{opacity:1}100%{opacity:0}}
        .cb{position:absolute;left:0;top:0;transform-style:preserve-3d;will-change:transform}
        .cb-face{position:absolute;inset:0;border-radius:.35vh;overflow:hidden;backface-visibility:hidden;-webkit-backface-visibility:hidden;
          box-shadow:0 .5vh 1.4vh rgba(0,0,0,.38),0 0 0 1px rgba(255,255,255,.06) inset}
        .cb-front{background:var(--bf) center/cover no-repeat}
        .cb-back{background:var(--bb) center/cover no-repeat;transform:rotateY(180deg)}
        .cb-shade,.cb-shine{position:absolute;inset:0;opacity:0;pointer-events:none}
        .cb-shade{background:linear-gradient(135deg,rgba(0,8,6,.55),rgba(0,10,8,.85))}
        .cb-shine{background:linear-gradient(115deg,transparent 30%,rgba(255,255,245,.85) 48%,transparent 62%);mix-blend-mode:screen}
        .center{position:absolute;inset:0;z-index:3;isolation:isolate;display:flex;align-items:center;justify-content:center}
        .pop-backdrop{position:absolute;left:50%;top:50%;width:78vw;height:92vh;transform:translate(-50%,-50%);border-radius:50%;
          background:radial-gradient(closest-side,rgba(4,7,18,.82),rgba(4,7,18,.55) 55%,rgba(4,7,18,0));animation:dim var(--cd,8s) ease both}
        .pop{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;animation:popOut var(--cd,8s) linear both}
        @keyframes popOut{0%,90%{opacity:1;transform:none}100%{opacity:0;transform:translateY(-2.5vh) scale(.97)}}
        .pop > *{animation-fill-mode:both}
        @keyframes fadeDown{from{opacity:0;transform:translateY(-2vh)}to{opacity:1;transform:none}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(3vh);filter:blur(6px)}to{opacity:1;transform:none;filter:blur(0)}}
        @keyframes zoomIn{0%{opacity:0;transform:scale(.55);filter:blur(12px)}65%{opacity:1;transform:scale(1.06);filter:blur(0)}100%{opacity:1;transform:scale(1)}}
        @keyframes amtIn{0%{opacity:0;transform:translateY(3vh) scale(.9);filter:blur(8px)}70%{opacity:1;transform:scale(1.04);filter:blur(0)}100%{opacity:1;transform:scale(1)}}
        .pop-tag{font-size:2.6vh;font-weight:700;color:#CFE6FF;padding:.9vh 2.4vh;border-radius:99px;letter-spacing:.02em;
          background:rgba(8,20,48,.92);border:1px solid rgba(110,170,255,.55);margin-bottom:4.4vh;box-shadow:0 0 3vh rgba(59,140,255,.3);
          animation:fadeDown .6s cubic-bezier(.2,.9,.25,1) .15s both}

        /* agent spotlight: light rays, halo, rotating gold ring, shockwaves */
        .pop-av-wrap{position:relative;width:24vh;height:24vh;display:flex;align-items:center;justify-content:center;
          animation:zoomIn 1s cubic-bezier(.2,.9,.25,1) .3s both}
        .pop-halo{position:absolute;left:50%;top:50%;width:54vh;height:54vh;margin:-27vh 0 0 -27vh;border-radius:50%;pointer-events:none;
          background:radial-gradient(closest-side,rgba(120,185,255,.75),rgba(59,140,255,.42) 38%,rgba(46,120,240,.16) 62%,transparent 78%);
          animation:haloPulse 2.2s ease-in-out infinite}
        @keyframes haloPulse{0%,100%{transform:scale(.92);opacity:.8}50%{transform:scale(1.08);opacity:1}}
        .pop-ring{position:absolute;inset:-1.4vh;border-radius:50%;pointer-events:none;
          background:conic-gradient(from 0deg,#DCEEFF,#7FC0FF,#3B8CFF,#2E78F0,#7FC0FF,#DCEEFF);
          -webkit-mask:radial-gradient(farthest-side,transparent calc(100% - .9vh),#000 calc(100% - .8vh));
          mask:radial-gradient(farthest-side,transparent calc(100% - .9vh),#000 calc(100% - .8vh));
          filter:drop-shadow(0 0 1.8vh rgba(59,140,255,.85));animation:spin 4s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        .pop-wave{position:absolute;inset:0;border-radius:50%;border:.45vh solid rgba(127,192,255,.7);pointer-events:none;opacity:0;
          animation:wave 2.4s cubic-bezier(.1,.6,.3,1) infinite}
        .pop-wave.w1{animation-delay:.55s}
        .pop-wave.w2{animation-delay:1.35s}
        @keyframes wave{0%{transform:scale(1);opacity:.85}100%{transform:scale(2.2);opacity:0}}
        .pop-av{position:relative;width:22vh;height:22vh;font-size:6vh;border:.6vh solid rgba(12,18,40,.9);
          box-shadow:0 0 5vh rgba(59,140,255,.6),0 0 12vh rgba(46,120,240,.35)}

        .pop-name{font-size:8.4vh;font-weight:800;letter-spacing:-.04em;margin-top:4.4vh;line-height:1;text-shadow:0 .6vh 3vh rgba(0,0,0,.55);
          animation:fadeUp .8s cubic-bezier(.2,.9,.25,1) .7s both}
        .pop-amt{font-size:15vh;font-weight:800;letter-spacing:-.05em;line-height:1.05;margin-top:1.6vh;padding:0 .12em;
          background:linear-gradient(180deg,#B7FFD9 0%,#34D399 60%,#1E9E6E 100%);-webkit-background-clip:text;background-clip:text;color:transparent;
          filter:drop-shadow(0 0 4vh rgba(52,211,153,.45));animation:amtIn .9s cubic-bezier(.2,.9,.25,1) .95s both}
        .pop-rank{font-size:3vh;color:var(--ice);font-weight:600;margin-top:2vh;opacity:.85;animation:fadeUp .7s ease 1.4s both}

        .message{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.6vh;text-align:center;padding:0 10vw}
        .message h1{font-size:4.4vh;font-weight:800;letter-spacing:-.03em}
        .message p{font-size:2.4vh;color:var(--slate);max-width:70ch}
        .signin{background:radial-gradient(70% 55% at 50% 40%, rgba(30,70,160,.25) 0%, transparent 70%),linear-gradient(180deg,#0A1226,#04060F)}
        .signin .logo-tile.big{width:16vh;height:16vh;border-radius:3.4vh;margin-bottom:1.4vh}
        .signin h1{font-size:6vh;font-weight:700;letter-spacing:-.045em}
        .discord-btn{display:inline-flex;align-items:center;gap:1.4vh;margin-top:2.4vh;padding:2vh 4vh;border-radius:99px;
          background:linear-gradient(180deg,#4F9BFF,#2E78F0);color:#fff;text-decoration:none;font-size:2.4vh;font-weight:600;letter-spacing:-.01em;
          box-shadow:0 1vh 4vh rgba(46,120,240,.45);cursor:pointer}
        .discord-btn:focus-visible{outline:3px solid #9FD4FF;outline-offset:3px}

        @media (prefers-reduced-motion: reduce){
          .hot,.pop-ring,.pop-halo,.pop-wave,.pod-1,.pod-1::after{animation:none!important}
        }
      ` }} />

      {auth && !shown && (
        <div className="message signin">
          <Logos cfg={cfg} big />
          <div className="eyebrow">{cfg.eyebrow}</div>
          <h1>{cfg.title}</h1>
          <p>
            {params?.error === 'role' ? `That Discord account doesn't have the ${cfg.viewerRole} role.`
              : params?.error === 'not_member' ? "That Discord account isn't in the Blueprint server."
              : params?.error === 'login' ? 'Sign-in didn\'t finish. Try again.'
              : auth.code === 'missing_role' ? auth.error
              : `Sign in with the ${cfg.viewerRole} Discord account to start the display.`}
          </p>
          <a className="discord-btn" href={`/api/tv-login?office=${officeKey}`}>
            <svg width="26" height="20" viewBox="0 0 71 55" aria-hidden="true"><path fill="currentColor" d="M60.1 4.9A58.5 58.5 0 0 0 45.6.9a40.7 40.7 0 0 0-1.8 3.6 54.1 54.1 0 0 0-16.2 0A39.5 39.5 0 0 0 25.8.9 58.4 58.4 0 0 0 11.2 5C1.6 19.3-1 33.2.3 46.9a58.9 58.9 0 0 0 17.9 9 44 44 0 0 0 3.8-6.2 38.3 38.3 0 0 1-6-2.9l1.4-1.1a42 42 0 0 0 36.2 0l1.5 1.1a38.3 38.3 0 0 1-6 2.9 44 44 0 0 0 3.8 6.2 58.7 58.7 0 0 0 17.9-9C72.2 31 69 17.2 60.1 4.9ZM23.7 38.5c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.5 0 6.4 3.2 6.3 7.2 0 4-2.8 7.2-6.3 7.2Zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.5 0 6.4 3.2 6.3 7.2 0 4-2.8 7.2-6.3 7.2Z"/></svg>
            Sign in with Discord
          </a>
        </div>
      )}

      {err && !shown && !auth && (
        <div className="message">
          <h1>Leaderboard can't load</h1>
          <p>{err}</p>
        </div>
      )}

      {!err && !shown && !auth && (
        <div className="message"><h1>{cfg.title}</h1><p>Loading the leaderboard…</p></div>
      )}

      {shown && board && (
        <div className={`stage ${current ? (isVideo ? 'under-video' : 'blurred') : ''}`}>
          <header className="head">
            <div className="brand">
              <Logos cfg={cfg} />
              <div>
                <div className="eyebrow">{cfg.eyebrow}</div>
                <div className="title-row">
                  <div className="title">{cfg.title}</div>
                  {soundBlocked && (
                    <button className="bell" title="Sale sound is off. Click to turn it on." aria-label="Turn on sale sound"
                      onClick={() => unlockSound(cfg.soundUrl).then(on => setSoundBlocked(!on))}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 3a6 6 0 0 0-6 6v3.6l-1.6 2.7A1 1 0 0 0 5.3 17h13.4a1 1 0 0 0 .9-1.7L18 12.6V9a6 6 0 0 0-6-6z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
                        <path d="M10 19.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                        <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                      </svg>
                    </button>
                  )}
                </div>
                <div className="title-period">
                  <span className="date">{board.label}</span>
                </div>
              </div>
            </div>

            <div className="head-right">
              <div className="stats">
                <div className="stat"><div className="stat-v"><AnimatedNumber value={board.total} /></div><div className="stat-l">Submitted</div></div>
                <div className="stat"><div className="stat-v">{board.deals}</div><div className="stat-l">Deals</div></div>
                <div className="stat"><div className="stat-v">{board.people}</div><div className="stat-l">People</div></div>
                <div className="stat"><div className="stat-v"><AnimatedNumber value={board.avg} /></div><div className="stat-l">Avg deal size</div></div>
              </div>
              <div className="toggle" role="tablist" aria-label="Leaderboard period">
                <button role="tab" aria-selected={view === 'week'} className={view === 'week' ? 'on' : ''} onClick={() => switchView('week')}>Week</button>
                <button role="tab" aria-selected={view === 'today'} className={view === 'today' ? 'on' : ''} onClick={() => switchView('today')}>Day</button>
              </div>
            </div>
          </header>

          <main className="view" key={view}>
            <section className="podium">
              <PodiumCard p={top[0]} place={1} hot={hotId && top[0]?.discord_id === hotId} />
              <PodiumCard p={top[1]} place={2} hot={hotId && top[1]?.discord_id === hotId} />
              <PodiumCard p={top[2]} place={3} hot={hotId && top[2]?.discord_id === hotId} />
            </section>
            <section className="list">
              {rest.map(p => <Row key={p.discord_id} p={p} hot={hotId === p.discord_id} />)}
              {top.length === 0 && <div className="empty">No sales yet {board.word}. The first deal takes the top spot.</div>}
            </section>
          </main>
        </div>
      )}

      {!isVideo && current && (
        <div className="celebrate" key={current.key} style={{ '--cd': `${current.ms}ms` }}>
          <div className="dim" />
          <div className="flash" />
          <CashRain seed={current.key} duration={current.ms} />
          <div className="center">
            <div className="pop-backdrop" />
            <div className="pop">
              <div className="pop-tag">New sale</div>
              <div className="pop-av-wrap">
                <div className="pop-halo" />
                <div className="pop-wave w1" />
                <div className="pop-wave w2" />
                <div className="pop-ring" />
                <Avatar src={current.avatar} name={current.name} className="pop-av" />
              </div>
              <div className="pop-name">{current.name}</div>
              <div className="pop-amt">+<AnimatedNumber value={current.amount} from={0} delay={950} duration={1600} /></div>
              {current.rank && <div className="pop-rank">Now #{current.rank} {current.periodWord}</div>}
            </div>
          </div>
        </div>
      )}
      {isVideo && (
        <div className={`vid-stage ${current ? 'on' : ''}`} style={current ? { '--cd': `${current.ms}ms` } : undefined} aria-hidden={!current}>
          <video ref={videoRef} preload="auto" playsInline disablePictureInPicture disableRemotePlayback />
          {current && (
            <div className="vid-overlay" key={current.key}>
              <div className="vid-shade" />
              <div className="headline">
                <div className="hl-band" />
                <div className="hl-rule" />
                <div className="hl-1">Another family has been protected</div>
                <div className="hl-2">in the city of <span>{cfg.city}</span></div>
                <div className="hl-rule bottom" />
              </div>
              <div className="agent">
                <div className="agent-scrim" />
                <div className="ag-avwrap">
                  <div className="pop-halo" />
                  <div className="pop-wave w1" />
                  <div className="pop-wave w2" />
                  <div className="pop-ring" />
                  <Avatar src={current.avatar} name={current.name} className="ag-av" />
                </div>
                <div className="ag-name">{current.name}</div>
                <div className="ag-amt">+<AnimatedNumber value={current.amount} from={0} delay={Math.round(current.ms * 0.5) + 900} duration={1800} /></div>
                <div className="ag-stats">
                  {current.weekRank && <div className="ag-stat"><b>#{current.weekRank}</b><span>this week</span></div>}
                  {current.weekDeals && <div className="ag-stat"><b>{current.weekDeals}</b><span>{current.weekDeals === 1 ? 'family protected' : 'families protected'} this week</span></div>}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
