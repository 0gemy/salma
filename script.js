/* =========================================================
   THE COUNTDOWN — script.js
   All editable content (deadline, music, photos, text) lives in index.html.
   Sections: 1 Setup · 2 Audio · 3 Canvas FX · 4 State machine · 5 Clock/Countdown
             6 Portal + time travel · 7 Photos · 8 Gallery + Lightbox · 9 Init
   ========================================================= */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const body = document.body, root = document.documentElement;
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const LITE = matchMedia('(max-width: 700px)').matches || (navigator.hardwareConcurrency || 8) <= 4;
if (LITE) body.classList.add('lite');
let state = null;

/* ---------- 1. SETUP: read configuration from index.html ---------- */
const cfg = $('#config');
const TZ = cfg.dataset.timezone || 'Africa/Cairo';
let DEADLINE = Date.parse(cfg.dataset.deadline);
if (Number.isNaN(DEADLINE)) {
  console.error('Invalid data-deadline in index.html; using the default Egypt midnight.');
  DEADLINE = Date.parse('2026-10-10T00:00:00+03:00');
}
const MSG_EPOCH = Date.parse(cfg.dataset.messageEpoch) || DEADLINE;
const MSGS = $$('#countdown-messages li').map(li => li.textContent.trim()).filter(Boolean);
const photos = $$('#memory-config img[data-memory]')
  .sort((a, b) => Number(a.dataset.memory) - Number(b.dataset.memory)).slice(0, 10)
  .map(el => ({ src: el.getAttribute('src'), alt: el.getAttribute('alt') || '', caption: (el.dataset.caption || '').trim() }));
if (photos.length !== 10) console.warn('Expected exactly 10 photographs, found ' + photos.length);
const N = photos.length;

// Travel phase durations (ms): A portal activation · B pull in · C tunnel · D time · E burst · F arrival
const T = RM ? { A: 500, B: 800, C: 1100, D: 800, E: 800, F: 900 } : { A: 1700, B: 2600, C: 3400, D: 2000, E: 1600, F: 1600 };
Object.keys(T).forEach(k => root.style.setProperty('--t' + k, T[k] + 'ms'));
const PHOTO_MS = 5600, INTRO_MS = 4800;
const clamp01 = v => Math.max(0, Math.min(1, v));

/* ---------- 2. AUDIO ---------- */
const A = { wait: $('#audio-wait'), birthday: $('#audio-birthday') };
const GAIN = { wait: 0.45, birthday: 0.85 };       // per-track loudness relative to master
const g = { wait: 1, birthday: 1 };                // fade multipliers
const ft = { wait: 0, birthday: 0 };               // fade timers
const dead = { wait: false, birthday: false };     // file missing / unsupported
let vol = 0.6, userMuted = false, autoMuted = false, blocked = false;
const ui = { ctl: $('#audio-ctl'), mute: $('#mute'), vol: $('#vol'), prompt: $('#sound-prompt'), pbtn: $('#sound-btn') };
const curTrack = () => (state === null || state === 'COUNTDOWN_LOCKED' || state === 'PORTAL_READY') ? 'wait' : 'birthday';
const setLevel = k => { A[k].volume = clamp01(vol * GAIN[k] * g[k]); };
const applyMute = () => { A.wait.muted = userMuted || autoMuted; A.birthday.muted = userMuted; };
function fade(k, to, ms) {
  clearInterval(ft[k]);
  const from = g[k], t0 = performance.now();
  ft[k] = setInterval(() => {
    const p = clamp01((performance.now() - t0) / ms);
    g[k] = from + (to - from) * p; setLevel(k);
    if (p >= 1) { clearInterval(ft[k]); ft[k] = 0; }
  }, 50);
}
function refreshUI() {
  const k = curTrack(), a = A[k];
  const silent = userMuted || autoMuted || vol === 0;
  ui.mute.classList.toggle('is-muted', silent);
  ui.mute.setAttribute('aria-pressed', String(silent));
  ui.mute.setAttribute('aria-label', silent ? 'تشغيل الصوت' : 'كتم الصوت');
  ui.ctl.classList.toggle('playing', !a.paused && !silent && !dead[k]);
  ui.ctl.classList.toggle('unavailable', dead[k]);
  ui.ctl.title = dead[k] ? 'ملف الصوت غير متاح' : '';
  ui.prompt.hidden = dead[k] || userMuted || !(blocked || autoMuted);
}
async function tryPlay(k, mutedFallback) {
  const a = A[k];
  if (dead[k]) return false;
  try {
    await a.play();
    if (k === curTrack()) blocked = false;
    if (g[k] < 1 && !ft[k]) fade(k, 1, 2500);
    return true;
  } catch (e) {
    const name = e && e.name;
    if (name === 'AbortError') return false;                 // interrupted by pause(): not an error
    if (name === 'NotAllowedError') {
      if (mutedFallback && !a.muted) {                        // best effort: muted autoplay
        try { a.muted = true; await a.play(); autoMuted = true; return true; }
        catch (e2) { a.muted = userMuted; }
      }
      blocked = true;
    } else { dead[k] = true; console.warn('Audio unavailable (' + k + ')', e); }
    return false;
  } finally { refreshUI(); }
}
function unlockAudio() {                                      // called on user interaction
  const k = curTrack();
  if (dead[k] || (!A[k].paused && !autoMuted)) return;
  autoMuted = false; applyMute(); setLevel(k);
  tryPlay(k, false).then(() => refreshUI());
}
function toBirthdayMusic() {                                  // runs inside the portal click
  g.birthday = 0; setLevel('birthday'); A.birthday.muted = userMuted;
  tryPlay('birthday', false);                                 // play() is called synchronously in the gesture
  clearInterval(ft.wait); A.wait.pause();                     // never both at once
}
['wait', 'birthday'].forEach(k => {
  ['play', 'pause', 'volumechange'].forEach(ev => A[k].addEventListener(ev, refreshUI));
  A[k].addEventListener('error', () => { dead[k] = true; refreshUI(); });
});
ui.mute.addEventListener('click', () => {
  if (userMuted || autoMuted || vol === 0) { userMuted = false; autoMuted = false; if (vol === 0) { vol = .5; ui.vol.value = vol; } }
  else userMuted = true;
  applyMute(); setLevel('wait'); setLevel('birthday');
  const k = curTrack(); if (A[k].paused) tryPlay(k, false);
  refreshUI();
});
ui.vol.addEventListener('input', () => {
  vol = Number(ui.vol.value); if (vol > 0) { userMuted = false; autoMuted = false; applyMute(); }
  setLevel('wait'); setLevel('birthday');
  const k = curTrack(); if (vol > 0 && A[k].paused) tryPlay(k, false);
  refreshUI();
});
ui.pbtn.addEventListener('click', unlockAudio);
['click', 'touchend', 'keydown'].forEach(ev => addEventListener(ev, unlockAudio, { passive: true }));

// Attempt autoplay as early as possible: audible first, muted fallback second.
setLevel('wait'); setLevel('birthday'); applyMute();
tryPlay('wait', true);

/* ---------- 3. CANVAS FX (dust, inward particles, star tunnel, ring spin) ---------- */
const fx = (() => {
  const cv = $('#fx'), c = cv.getContext('2d');
  const M = { mode: 'float', speed: 1, target: 1, rs: 1, rsT: 1, stars: [], dust: [], starA: 0, t0: 0 };
  const rings = $$('.p-ring.spin'), RS = [8, -14, 24, -38], ang = [0, 0, 0, 0];
  let w = 0, h = 0, dpr = 1, last = 0;
  const NDUST = LITE ? 36 : 70, NSTAR = LITE ? 100 : 210;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const COL = [[198, 203, 211], [154, 120, 232], [95, 134, 255], [255, 244, 228]];
  const tint = p => { const s = clamp01(p) * 3, i = Math.min(2, Math.floor(s)), f = s - i;
    return COL[i].map((v, n) => Math.round(v + (COL[i + 1][n] - v) * f)).join(','); };
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, LITE ? 1 : 1.5);
    w = innerWidth; h = innerHeight; cv.width = w * dpr; cv.height = h * dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function spawn(p, edge) {
    if (edge) { const a = rnd(0, 6.283), r = Math.max(w, h) * .6; p.x = w / 2 + Math.cos(a) * r; p.y = h / 2 + Math.sin(a) * r; }
    else { p.x = rnd(0, w); p.y = rnd(0, h); }
    p.r = rnd(.6, 2); p.a = rnd(.25, .8); p.vx = rnd(-6, 6); p.vy = rnd(-8, 4); p.ph = rnd(0, 6.28); return p;
  }
  function drawDust(dt, now) {
    const cx = w / 2, cy = h / 2, rgb = M.mode === 'warm' ? '232,205,162' : M.mode === 'inward' ? '185,130,145' : '198,203,211';
    for (const p of M.dust) {
      if (M.mode === 'inward') {
        const k = .1 * M.speed, dx = cx - p.x, dy = cy - p.y;
        p.x += (dx * k - dy * k * .7) * dt; p.y += (dy * k + dx * k * .7) * dt;
        if (dx * dx + dy * dy < 400) spawn(p, true);
      } else if (M.mode === 'warm') {
        p.x += Math.sin(now / 1800 + p.ph) * 10 * dt; p.y -= (10 + p.r * 8) * dt;
        if (p.y < -10) { p.y = h + 10; p.x = rnd(0, w); }
      } else {
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.x < -5) p.x = w + 5; else if (p.x > w + 5) p.x = -5;
        if (p.y < -5) p.y = h + 5; else if (p.y > h + 5) p.y = -5;
      }
      c.globalAlpha = p.a * (.6 + .4 * Math.sin(now / 900 + p.ph));
      c.fillStyle = 'rgb(' + rgb + ')'; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.283); c.fill();
    }
  }
  function drawStars(dt, now) {
    const cx = w / 2, cy = h / 2, kx = w * .25, ky = h * .25;
    const rgb = tint((now - M.t0) / (T.C + T.D + T.E));
    c.strokeStyle = 'rgb(' + rgb + ')'; c.lineCap = 'round';
    for (const s of M.stars) {
      s.z -= M.speed * dt * .5;
      if (s.z <= .03) { s.x = rnd(-1, 1); s.y = rnd(-1, 1); s.z = 1; continue; }
      const z1 = Math.min(1.2, s.z + M.speed * .1);
      c.globalAlpha = clamp01((1 - s.z) * 1.4) * M.starA;
      c.lineWidth = 1 + (1 - s.z) * 2;
      c.beginPath(); c.moveTo(cx + s.x / z1 * kx * 2, cy + s.y / z1 * ky * 2); c.lineTo(cx + s.x / s.z * kx * 2, cy + s.y / s.z * ky * 2); c.stroke();
    }
  }
  function frame(t) {
    requestAnimationFrame(frame);
    const dt = Math.min(.05, (t - last) / 1000 || 0); last = t;
    M.speed += (M.target - M.speed) * Math.min(1, dt * 2.2);
    M.rs += (M.rsT - M.rs) * Math.min(1, dt * 2);
    if (body.dataset.state && /PORTAL|TIME_TRAVEL/.test(body.dataset.state)) {
      rings.forEach((el, i) => { ang[i] += RS[i] * M.rs * dt * (RM ? .3 : 1); el.style.transform = 'rotate(' + ang[i].toFixed(1) + 'deg)'; });
    }
    c.clearRect(0, 0, w, h);
    if (M.mode === 'stars') { M.starA = Math.min(1, M.starA + dt * 1.1); drawStars(dt, t); }
    else { M.starA = 0; drawDust(dt, t); }
    c.globalAlpha = 1;
  }
  return {
    start() {
      resize(); let rt = 0;
      addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 150); });
      M.dust = Array.from({ length: NDUST }, () => spawn({}, false));
      M.stars = Array.from({ length: NSTAR }, () => ({ x: rnd(-1, 1), y: rnd(-1, 1), z: rnd(.05, 1) }));
      requestAnimationFrame(frame);
    },
    onState(s) {
      M.mode = s === 'COUNTDOWN_LOCKED' ? 'float' : /^(PORTAL|TIME)/.test(s) ? (M.mode === 'stars' ? 'stars' : 'inward') : 'warm';
      if (s === 'PORTAL_READY') { M.target = 1; M.rsT = 1; }
    },
    phase(p) {
      if (p === 'A') { M.target = 3; M.rsT = 6; }
      if (p === 'B') { M.target = 6; M.rsT = 16; }
      if (p === 'C') { if (!RM) { M.mode = 'stars'; M.t0 = performance.now(); M.starA = 0; } M.target = .7; }
      if (p === 'D') M.target = 1.8;
      if (p === 'E') M.target = .25;
      if (p === 'F') { M.mode = 'warm'; M.target = 1; M.rsT = 1; }
    }
  };
})();

/* ---------- 4. STATE MACHINE ---------- */
const FLOW = {
  COUNTDOWN_LOCKED: ['PORTAL_READY'], PORTAL_READY: ['PORTAL_OPENING'], PORTAL_OPENING: ['TIME_TRAVEL', 'BIRTHDAY_REVEALED'],
  TIME_TRAVEL: ['BIRTHDAY_REVEALED'], BIRTHDAY_REVEALED: ['PHOTO_REVEAL'], PHOTO_REVEAL: ['GALLERY_COMPLETE'], GALLERY_COMPLETE: ['PHOTO_REVEAL']
};
const enter = {
  COUNTDOWN_LOCKED() { clockLoop(); },
  PORTAL_READY() { body.classList.remove('final-min', 'final-ten'); openBtn.disabled = false; },
  BIRTHDAY_REVEALED() { bdTimer = setTimeout(() => startPhotos(false), RM ? 10000 : 15500); },
  GALLERY_COMPLETE() { buildGallery(); $('#scene-gallery').scrollTop = 0; setTimeout(() => { if (state === 'GALLERY_COMPLETE') stage.textContent = ''; }, 1300); }
};
function setState(next) {
  if (state !== null && next !== state && !(FLOW[state] || []).includes(next)) return false;
  state = next; body.dataset.state = next;
  if (next !== 'COUNTDOWN_LOCKED') cancelAnimationFrame(rafClock);
  fx.onState(next); refreshUI();
  if (enter[next]) enter[next]();
  return true;
}

/* ---------- 5. CLOCK + COUNTDOWN ---------- */
const E = { hour: $('.hand.hour'), min: $('.hand.min'), sec: $('.hand.sec'), clock: $('#clock'),
  d: $('#u-d'), h: $('#u-h'), m: $('#u-m'), s: $('#u-s'), msg: $('#cd-msg') };
let fmt = null;
try { fmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch (e) { /* fallback below */ }
let cc = { sec: -1, h: 0, m: 0, s: 0 }, rafClock = 0, lastShown = -1, lastMsg = -1;
function cairoTime(ms) {                                       // Egypt-local time, independent of device timezone
  const sec = Math.floor(ms / 1000);
  if (sec !== cc.sec) {
    let h, m, s;
    if (fmt) { const o = {}; fmt.formatToParts(new Date(ms)).forEach(p => { o[p.type] = p.value; }); h = Number(o.hour) % 24; m = Number(o.minute); s = Number(o.second); }
    else { const d = new Date(ms + 3 * 3600000); h = d.getUTCHours(); m = d.getUTCMinutes(); s = d.getUTCSeconds(); }
    cc = { sec, h, m, s };
  }
  return cc;
}
function buildDial() {
  const dial = $('#dial'), f = document.createDocumentFragment();
  for (let i = 0; i < 60; i++) { const t = document.createElement('i'); t.className = 'tick' + (i % 5 ? '' : ' major'); t.style.setProperty('--r', i * 6 + 'deg'); f.appendChild(t); }
  ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'].forEach((r, i) => {
    const n = document.createElement('div'); n.className = 'num'; n.style.setProperty('--r', i * 30 + 'deg');
    const sp = document.createElement('span'); sp.textContent = r; n.appendChild(sp); f.appendChild(n);
  });
  dial.insertBefore(f, dial.firstChild);
}
const pad = (n, l) => String(n).padStart(l, '0');
function drawClock(now) {
  const { h, m, s } = cairoTime(now), ms = now % 1000;
  E.sec.style.transform = 'rotate(' + ((s + ms / 1000) * 6).toFixed(2) + 'deg)';
  E.min.style.transform = 'rotate(' + ((m + s / 60) * 6).toFixed(2) + 'deg)';
  E.hour.style.transform = 'rotate(' + (((h % 12) + m / 60) * 30).toFixed(2) + 'deg)';
}
function updateCountdown(now) {
  const rem = Math.max(0, DEADLINE - now), secs = Math.ceil(rem / 1000);
  if (secs !== lastShown) {
    lastShown = secs;
    E.d.textContent = pad(Math.floor(secs / 86400), 2); E.h.textContent = pad(Math.floor(secs % 86400 / 3600), 2);
    E.m.textContent = pad(Math.floor(secs % 3600 / 60), 2); E.s.textContent = pad(secs % 60, 2);
    const fin = rem > 0 && rem <= 60000;                       // final minute: growing bezel light + sweep
    body.classList.toggle('final-min', fin); body.classList.toggle('final-ten', rem > 0 && rem <= 10000);
    E.clock.style.setProperty('--glow', fin ? (1 - rem / 60000).toFixed(2) : '0');
  }
  if (MSGS.length) {
    const idx = Math.floor(Math.max(0, now - MSG_EPOCH) / 180000) % MSGS.length;   // fixed reference, survives refresh
    if (idx !== lastMsg) {
      const first = lastMsg === -1; lastMsg = idx;
      if (first) E.msg.textContent = MSGS[idx];
      else { E.msg.classList.add('swap'); setTimeout(() => { E.msg.textContent = MSGS[lastMsg]; E.msg.classList.remove('swap'); }, 800); }
    }
  }
}
function clockLoop() {
  cancelAnimationFrame(rafClock);
  const step = () => {
    if (state !== 'COUNTDOWN_LOCKED') return;
    const now = Date.now(); drawClock(now); updateCountdown(now);
    if (now >= DEADLINE) { setState('PORTAL_READY'); return; }   // never auto-opens the portal
    rafClock = requestAnimationFrame(step);
  };
  step();
}

/* ---------- 6. PORTAL + TIME TRAVEL ---------- */
const openBtn = $('#open-portal');
let travelTimer = 0, safety = 0, travelBusy = false, bdTimer = 0;
function setPhase(p) { if (p) body.dataset.phase = p; else delete body.dataset.phase; }
function openPortal() {
  if (state !== 'PORTAL_READY' || travelBusy) return;          // blocks repeated activation
  travelBusy = true; openBtn.disabled = true;
  setState('PORTAL_OPENING');
  toBirthdayMusic();
  const order = ['A', 'B', 'C', 'D', 'E', 'F']; let k = 0;
  safety = setTimeout(finishTravel, Object.values(T).reduce((a, b) => a + b, 0) + 4000);   // never get stuck
  const step = () => {
    const p = order[k];
    try {
      setPhase(p); fx.phase(p);
      if (p === 'B') setState('TIME_TRAVEL');
      if (p === 'F') setState('BIRTHDAY_REVEALED');             // birthday content only appears here
    } catch (err) { console.error(err); }
    k++; travelTimer = setTimeout(k < order.length ? step : finishTravel, T[p]);
  };
  step();
}
function finishTravel() {
  clearTimeout(travelTimer); clearTimeout(safety);
  if (state === 'PORTAL_OPENING') setState('TIME_TRAVEL');
  if (state === 'TIME_TRAVEL') setState('BIRTHDAY_REVEALED');
  setPhase(null); fx.phase('F');
}

/* ---------- 7. PHOTOGRAPHS ---------- */
const stage = $('#stage'), photosScene = $('#scene-photos'), introEl = $('#ph-intro'), labelEl = $('#ph-label');
const pauseBtn = $('#btn-pause'), segs = [];
const P = { idx: -1, timer: 0, intro: 0, end: 0, remain: 0, paused: false };
const preload = src => { const i = new Image(); i.src = src; };
function buildProgress() {
  const wrap = $('#progress'); wrap.textContent = '';
  for (let i = 0; i < N; i++) { const s = document.createElement('i'); wrap.appendChild(s); segs.push(s); }
  wrap.style.setProperty('--dur', PHOTO_MS + 'ms'); wrap.style.setProperty('--dur', (PHOTO_MS / 1000) + 's');
}
function makeFrame(p, i) {
  const f = document.createElement('figure'); f.className = 'frame fx' + (i % 10 + 1);   // deterministic transition per position
  const ph = document.createElement('div'); ph.className = 'ph';
  const img = new Image(); img.alt = p.alt; img.decoding = 'async';
  img.addEventListener('error', () => ph.classList.add('broken'));
  img.src = p.src; ph.appendChild(img); f.appendChild(ph);
  if (p.caption) { const c = document.createElement('figcaption'); c.className = 'cap'; c.textContent = p.caption; f.appendChild(c); }
  return f;
}
function schedule(ms) { clearTimeout(P.timer); P.end = performance.now() + ms; P.timer = setTimeout(advance, ms); }
function syncPauseBtn() {
  pauseBtn.classList.toggle('is-paused', P.paused);
  pauseBtn.setAttribute('aria-label', P.paused ? 'متابعة العرض' : 'إيقاف مؤقت');
  photosScene.classList.toggle('paused', P.paused);
}
function showPhoto(i) {
  clearTimeout(P.timer); P.idx = i;
  const old = stage.querySelector('.frame:not(.out)');
  if (old) { old.classList.add('out'); setTimeout(() => old.remove(), 1000); }
  stage.appendChild(makeFrame(photos[i], i));
  segs.forEach((s, k) => { s.className = k < i ? 'done' : (k === i ? 'active' : ''); });
  labelEl.textContent = 'الذكرى ' + (i + 1) + ' من ' + N;
  if (photos[i + 1]) preload(photos[i + 1].src);                // preload the next image only
  schedule(PHOTO_MS);
}
function advance() { if (P.idx >= N - 1) setState('GALLERY_COMPLETE'); else showPhoto(P.idx + 1); }
function pausePhotos() {
  if (P.paused || state !== 'PHOTO_REVEAL' || P.idx < 0) return;
  P.paused = true; P.remain = Math.max(300, P.end - performance.now()); clearTimeout(P.timer); syncPauseBtn();
}
function resumePhotos() { if (!P.paused) return; P.paused = false; syncPauseBtn(); schedule(P.remain); }
function nextPhoto() { if (state !== 'PHOTO_REVEAL' || P.idx < 0) return; if (P.paused) { P.paused = false; syncPauseBtn(); } advance(); }
function startPhotos(skipIntro) {
  clearTimeout(bdTimer); clearTimeout(P.timer); clearTimeout(P.intro);
  P.paused = false; P.idx = -1; syncPauseBtn(); stage.textContent = '';
  segs.forEach(s => { s.className = ''; });
  if (state !== 'PHOTO_REVEAL' && !setState('PHOTO_REVEAL')) return;
  introEl.classList.remove('show');
  const go = () => { photosScene.classList.add('live'); showPhoto(0); };
  if (skipIntro) go();
  else { photosScene.classList.remove('live'); void introEl.offsetWidth; introEl.classList.add('show'); P.intro = setTimeout(go, INTRO_MS); }
}
pauseBtn.addEventListener('click', () => (P.paused ? resumePhotos() : pausePhotos()));
$('#btn-next').addEventListener('click', nextPhoto);
$('#btn-replay').addEventListener('click', () => startPhotos(true));
$('#g-replay').addEventListener('click', () => startPhotos(true));
stage.addEventListener('click', e => { if (e.target.closest('.ph:not(.broken)') && P.idx >= 0) openLB(P.idx, null); });

/* ---------- 8. GALLERY + LIGHTBOX ---------- */
let galleryBuilt = false;
function buildGallery() {
  if (galleryBuilt) return; galleryBuilt = true;
  $('#g-title').textContent = $('#bd-title').textContent;
  const grid = $('#grid');
  photos.forEach((p, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'thumb';
    b.style.setProperty('--d', (i * .12) + 's'); b.setAttribute('aria-label', 'تكبير الصورة ' + (i + 1));
    const img = new Image(); img.alt = p.alt; img.loading = 'lazy'; img.decoding = 'async';
    img.addEventListener('error', () => b.classList.add('broken'));
    img.src = p.src; b.appendChild(img); b.addEventListener('click', () => openLB(i, b)); grid.appendChild(b);
  });
}
const lb = { el: $('#lightbox'), img: $('#lb-img'), cap: $('#lb-cap'), btn: $('#lb-close'), open: false, auto: false, opener: null };
function openLB(i, opener) {
  if (lb.open) return;
  const p = photos[i];
  lb.el.classList.remove('broken'); lb.img.alt = p.alt; lb.img.src = p.src; lb.cap.textContent = p.caption;
  lb.el.classList.add('open'); lb.open = true; lb.opener = opener; lb.auto = false;
  if (state === 'PHOTO_REVEAL' && !P.paused && P.idx >= 0) { pausePhotos(); lb.auto = true; }
  lb.btn.focus();
}
function closeLB() {
  if (!lb.open) return;
  lb.el.classList.remove('open'); lb.open = false; lb.img.removeAttribute('src');
  if (lb.auto && state === 'PHOTO_REVEAL') resumePhotos();   // resume only if the lightbox paused it
  lb.auto = false; if (lb.opener) lb.opener.focus();
}
lb.img.addEventListener('error', () => lb.el.classList.add('broken'));
lb.btn.addEventListener('click', closeLB);
lb.el.addEventListener('click', e => { if (e.target === lb.el) closeLB(); });
addEventListener('keydown', e => {
  if (!lb.open) return;
  if (e.key === 'Escape') closeLB(); else if (e.key === 'Tab') { e.preventDefault(); lb.btn.focus(); }
});

/* ---------- 9. INIT ---------- */
buildDial(); buildProgress(); fx.start();
openBtn.addEventListener('click', openPortal);
setInterval(() => { if (state === 'COUNTDOWN_LOCKED' && Date.now() >= DEADLINE) setState('PORTAL_READY'); }, 1000);  // backup check
setState(Date.now() >= DEADLINE ? 'PORTAL_READY' : 'COUNTDOWN_LOCKED');   // refresh rules: before = locked, after = portal-ready
})();
