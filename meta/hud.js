/*
 * HUD (Ray-Ban Display) — camera view + AI action card, driven by the phone.
 * Interaction model ported from meta-glass-band-silent-ar-ai:
 *   browse (detect + focus) -> menu (AI context actions + query row) -> result
 * The phone sends generic intents (nav/select/back/zoom) + query text; the HUD
 * interprets them against its current state. Actions come from the vision model
 * (server.js -> Gemini); with no key it falls back to Search / Describe / Photo.
 */
const conn      = document.getElementById("conn");
const video     = document.getElementById("video");
const worldLabel  = document.getElementById("world-label");
const worldCanvas = document.getElementById("worldcanvas");
const wctx        = worldCanvas.getContext("2d");
const dcanvas   = document.getElementById("dcanvas");
const dctx      = dcanvas.getContext("2d");
const idle      = document.getElementById("idle");
const menuEl    = document.getElementById("menu");
const optList   = menuEl.querySelector(".opt-list");
const queryRow  = menuEl.querySelector(".query-row");
const camBtn    = document.getElementById("cam-btn");
const queryField = document.getElementById("query-field");
const kbview     = document.getElementById("kbview");
const textline   = document.getElementById("textline");
const caret      = document.getElementById("caret");
const hudKb      = document.getElementById("hud-kb");
const hudKbWrap  = document.getElementById("hud-kb-wrap");
const hudTrail   = document.getElementById("hud-kb-trail");
const hudSuggest = document.getElementById("hud-suggest");
const resultEl   = document.getElementById("result");
const display    = document.getElementById("display");
const chatEl       = document.getElementById("chat");
const chatThread   = chatEl.querySelector(".chat-thread");
const chatDefaults = chatEl.querySelector(".chat-defaults");
const chatCam      = document.getElementById("chat-cam");
const chatField    = document.getElementById("chat-field");
const modeBadge    = document.getElementById("mode-badge");
const helpBtn      = document.getElementById("help-btn");
const helpPanel    = document.getElementById("help-panel");
const feedToggle   = document.getElementById("feed-toggle");
helpBtn.addEventListener("click", () => helpPanel.classList.toggle("hidden"));

// monochrome line/solid icon set (inherits currentColor) — replaces emoji for a clean glasses UI
const ICONS = {
  spark:    `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7z"/></svg>`,
  search:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>`,
  describe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="14" y2="17"/></svg>`,
  camera:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 8.5h3L8.5 6h7L17 8.5h3V19H4z"/><circle cx="12" cy="13" r="3.1"/></svg>`,
  play:     `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="5.5" width="16" height="15" rx="2.5"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="8" y1="3.5" x2="8" y2="6.5"/><line x1="16" y1="3.5" x2="16" y2="6.5"/></svg>`,
  chat:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 5h14v10H9.5L5 19z"/></svg>`,
  globe:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3c3.2 3 3.2 15 0 18M12 3c-3.2 3-3.2 15 0 18"/></svg>`,
  info:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16.5"/><circle cx="12" cy="7.8" r="0.5" fill="currentColor" stroke="none"/></svg>`,
  shop:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 8h12l-1 12H7z"/><path d="M9 8V6.5a3 3 0 016 0V8"/></svg>`,
  utensils: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 3v6a2 2 0 002 2M9 3v8m0 0v10M16 3c-1.4 0-2.3 2-2.3 4.5S14.6 12 16 12v9"/></svg>`,
  pin:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 21s7-6.3 7-11a7 7 0 10-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/></svg>`,
  phone:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6.5 3.5h3l1.4 4.5-2.2 1.4a11 11 0 004.9 4.9l1.4-2.2 4.5 1.4v3a2 2 0 01-2.2 2A15 15 0 014.5 5.7a2 2 0 012-2.2z"/></svg>`,
  share:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><line x1="8.1" y1="11" x2="15.9" y2="7"/><line x1="8.1" y1="13" x2="15.9" y2="17"/></svg>`,
  bookmark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M7 4h10v16l-5-4-5 4z"/></svg>`,
};
// map a Gemini action label to a clean icon (so AI actions match the icon set)
function iconFor(label) {
  const l = (label || "").toLowerCase();
  const map = [
    [/transl|language/, ICONS.globe], [/identif|recogn|what is|info/, ICONS.info],
    [/shop|buy|price|order|store|cart/, ICONS.shop], [/summar|read|doc|note|detail|describe/, ICONS.describe],
    [/recipe|cook|food|eat|menu/, ICONS.utensils], [/search|find|look up|google/, ICONS.search],
    [/direction|navigat|map|route|nearby|where/, ICONS.pin], [/call|dial|phone/, ICONS.phone],
    [/messag|text|reply/, ICONS.chat], [/share|send/, ICONS.share], [/save|bookmark|remember/, ICONS.bookmark],
    [/photo|camera|picture|capture|scan/, ICONS.camera], [/play|music|song|listen/, ICONS.play],
    [/schedul|calendar|event|book|remind/, ICONS.calendar],
  ];
  for (const [re, ic] of map) if (re.test(l)) return ic;
  return ICONS.spark;
}
const FALLBACK_ACTIONS = [
  { ic: ICONS.search,   label: "Search",   run: runSearch },
  { ic: ICONS.describe, label: "Describe", run: runDescribe },
  { ic: ICONS.camera,   label: "Photo",    run: runPhoto },
];
const FACTS = {
  cup: "a drinking vessel.", bottle: "a container for liquids.", laptop: "a portable computer.",
  "cell phone": "a mobile device.", book: "bound printed pages.", keyboard: "a typing input device.",
  chair: "a seat with a back.", person: "a human being.", tv: "a display screen.",
  "potted plant": "a plant in a container.", clock: "a timekeeping device.", mouse: "a pointing device.",
};

renderKeyboard(hudKb);
camBtn.innerHTML = ICONS.camera;
chatCam.innerHTML = ICONS.camera;
modeBadge.innerHTML = `<span class="meta-mark"></span><span>Meta AI</span>`;
if (feedToggle) feedToggle.addEventListener("click", toggleFeed);   // demo control: webcam <-> street feed

let model = null, detections = [], tracked = [], nextTrackId = 1;
let focusId = null, focusCenter = null, focusClass = null, lostFrames = 0;
let selObj = null, selImg = null;
let stage = "browse";                 // browse | menu | keyboard | result
let menuIdx = 0, qSub = "input";      // menu focus (menuIdx===currentActions.length -> query row)
let currentActions = [], menuLoading = false, loadingMsg = "";
let query = "", scale = 1;
let inputMode = "neural";             // input modality proxy: "neural" | "bci"
const SSVEP_FREQ = [7.5, 10, 12, 15]; // Hz for the flickering targets (stylized)
let aim = null, dwell = 0, dwellId = null, tPrev = performance.now();   // BCI head-aim reticle + dwell-to-select
let lock = { el: null, run: null, progress: 0 };                        // BCI SSVEP lock: number-key -> fill -> commit
let metaAI = false, chat = [];        // Meta AI assistant conversation
let chatIdx = 0, chatSub = "input";   // Meta AI focus (defaults + camera/input row)
const DEFAULTS = [
  { ic: ICONS.play,     label: "Play Spotify music", reply: "Playing your liked songs on Spotify." },
  { ic: ICONS.calendar, label: "Today's schedule",   reply: "Today: 10:00 Standup · 1:00 Lunch with Sam · 4:30 Design review." },
  { ic: ICONS.chat,     label: "Today's messages",   reply: "2 new — Sam: “lunch at 1?” · Mom: “call me back 🙂”." },
];

async function init() {               // called at the very end of the file, after all state is initialized
  show("off");                        // default: the glasses display is blank — nothing shown until enabled
  setFeed(feedSource);                // apply the default feed (street) to the ambient view + toggle
  idle.classList.add("hidden");
  requestAnimationFrame(loop);
  try {
    await startCamera();
    model = await cocoSsd.load();
    detectLoop();
  } catch (e) { idle.textContent = "camera/model error: " + (e && e.message); idle.classList.remove("hidden"); }
}
async function startCamera() {
  const s = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" }, width: 1280, height: 720 }, audio: false,
  });
  video.srcObject = s; await video.play();
}
async function detectLoop() {
  if (model && stage === "browse" && feedReady()) {   // same pipeline on whichever feed is active
    try { const raw = await model.detect(feedEl(), 20); updateTracker(raw); detections = visibleObjects(); } catch (_) {}
  }
  requestAnimationFrame(detectLoop);
}

// ---- geometry ----
function coverT() {
  const vw = feedW(), vh = feedH(), cw = dcanvas.width, ch = dcanvas.height;
  const s = Math.max(cw / vw, ch / vh);   // cover: fill the display (crops the overflow)
  return { s, ox: (cw - vw * s) / 2, oy: (ch - vh * s) / 2, vw, vh };
}
// ---- CV: temporal tracker — stable, EMA-smoothed, debounced boxes (from the band repo) ----
const TRK = { smooth: 0.35, minHits: 3, maxMissed: 15, minIoU: 0.2 };
function iou(a, b) {
  const [ax, ay, aw, ah] = a, [bx, by, bw, bh] = b;
  const x1 = Math.max(ax, bx), y1 = Math.max(ay, by);
  const x2 = Math.min(ax + aw, bx + bw), y2 = Math.min(ay + ah, by + bh);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const uni = aw * ah + bw * bh - inter;
  return uni > 0 ? inter / uni : 0;
}
function updateTracker(dets) {
  const used = new Set();
  tracked.forEach((t) => {
    const tcx = t.bbox[0] + t.bbox[2] / 2, tcy = t.bbox[1] + t.bbox[3] / 2;
    const tsize = Math.hypot(t.bbox[2], t.bbox[3]);
    let best = -1, bestScore = 0;
    dets.forEach((d, i) => {
      if (used.has(i) || d.class !== t.cls) return;
      const io = iou(t.bbox, d.bbox);
      const dcx = d.bbox[0] + d.bbox[2] / 2, dcy = d.bbox[1] + d.bbox[3] / 2;
      const cd = Math.hypot(dcx - tcx, dcy - tcy);
      let s = io;
      if (s < TRK.minIoU && cd < tsize * 0.5) s = 0.1 * (1 - cd / (tsize * 0.5));
      if (s > bestScore) { bestScore = s; best = i; }
    });
    if (best >= 0 && bestScore > 0) {
      const d = dets[best]; used.add(best);
      t.bbox = t.bbox.map((v, k) => v + TRK.smooth * (d.bbox[k] - v));   // EMA glide
      t.score = d.score; t.hits++; t.missed = 0;
    } else { t.missed++; }
  });
  dets.forEach((d, i) => {
    if (used.has(i)) return;
    tracked.push({ id: nextTrackId++, cls: d.class, score: d.score, bbox: d.bbox.slice(), hits: 1, missed: 0 });
  });
  tracked = tracked.filter((t) => t.missed <= TRK.maxMissed);
}
function visibleObjects() {
  return tracked.filter((t) => t.hits >= TRK.minHits).map((t) => ({ id: t.id, class: t.cls, score: t.score, bbox: t.bbox }));
}

// ---- sticky focus + directional navigation (from the band repo) ----
function center(d) { const [x, y, w, h] = d.bbox; return [x + w / 2, y + h / 2]; }
function nearestToCenter() {
  const cx = feedW() / 2, cy = feedH() / 2;
  let best = null, bd = Infinity;
  detections.forEach((d) => { const [x, y] = center(d); const dist = Math.hypot(x - cx, y - cy); if (dist < bd) { bd = dist; best = d; } });
  return best;
}
function resetFocus() { focusId = null; focusCenter = null; focusClass = null; lostFrames = 0; }
function focused() {
  if (!detections.length) return null;
  let f = focusId != null ? detections.find((d) => d.id === focusId) : null;   // same object by id
  if (!f && focusCenter) {                                                       // id churned -> re-acquire same object
    let best = null, bd = Infinity;
    detections.forEach((d) => {
      const [x, y] = center(d);
      let dist = Math.hypot(x - focusCenter[0], y - focusCenter[1]);
      if (d.class !== focusClass) dist += feedW() * 0.12;
      if (dist < bd) { bd = dist; best = d; }
    });
    if (best && bd < feedW() * 0.18) f = best;                          // tight radius: only the same object
  }
  if (f) { lostFrames = 0; focusId = f.id; focusCenter = center(f); focusClass = f.class; return f; }
  lostFrames++;
  if (focusCenter === null || lostFrames > 45) {                                 // first-ever, or gone ~1s -> center
    f = nearestToCenter();
    if (f) { lostFrames = 0; focusId = f.id; focusCenter = center(f); focusClass = f.class; }
    return f;
  }
  return null;                                                                    // brief loss: no jump
}
function moveDir(dx, dy) {
  const cur = focused(); if (!cur) return;
  const [cx0, cy0] = center(cur);
  let best = null, bestScore = Infinity;
  detections.forEach((d) => {
    if (d.id === cur.id) return;
    const [x, y] = center(d);
    const vx = x - cx0, vy = y - cy0;
    const along = vx * dx + vy * dy;               // distance along the swipe direction
    if (along <= 4) return;
    const perp = Math.abs(vx * dy - vy * dx);       // sideways offset
    const score = along + perp * 2;                 // prefer near + aligned
    if (score < bestScore) { bestScore = score; best = d; }
  });
  if (best) focusId = best.id;
}

function cropObject(o) {
  const [x, y, w, h] = o.bbox, pad = 0.12, src = feedEl(), sw = feedW(), sh = feedH();
  const px = Math.max(0, x - w * pad), py = Math.max(0, y - h * pad);
  const pw = Math.max(1, Math.min(sw - px, w * (1 + 2 * pad)));   // guard against 0 (drawImage/÷0)
  const ph = Math.max(1, Math.min(sh - py, h * (1 + 2 * pad)));
  const c = document.createElement("canvas");
  c.width = 512; c.height = Math.max(1, Math.round(512 * ph / pw));
  c.getContext("2d").drawImage(src, px, py, pw, ph, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85).split(",")[1];
}
function frameB64() {
  const src = feedEl(), sw = feedW(), sh = feedH();
  const c = document.createElement("canvas");
  c.width = 640; c.height = Math.max(1, Math.round(640 * sh / sw));
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82).split(",")[1];
}

// ---- render loop ----
function loop(now) {
  if (video.srcObject && video.paused) video.play().catch(() => {});   // resume a stalled camera feed
  const rect = dcanvas.getBoundingClientRect();
  if (dcanvas.width !== Math.round(rect.width) || dcanvas.height !== Math.round(rect.height)) {
    dcanvas.width = Math.round(rect.width); dcanvas.height = Math.round(rect.height);
  }
  try {                                                   // never let one bad frame freeze the feed
    const t = now || performance.now();
    const dt = Math.min(0.05, (t - tPrev) / 1000); tPrev = t;
    if (feedSource === "street") { renderStreetFeed(); drawWorld(); }   // keep the street feed + backdrop current
    const foc = stage === "browse" ? focused() : null;   // compute focus once per frame
    if (inputMode === "bci") {
      if (stage === "browse") dwellTick(dt, foc);         // object: aim + dwell
      else if (stage === "menu" || stage === "chat") tickLock(dt);   // menu: number-key SSVEP fill
    }
    draw(foc);                          // display panel: the camera view (either feed) or transparent for HUD views
  } catch (e) { console.error("HUD loop error:", e && e.stack || e); }
  requestAnimationFrame(loop);                            // ALWAYS reschedule
}
function dwellTick(dt, foc) {
  if (foc && aim) {
    if (dwellId !== foc.id) { dwellId = foc.id; dwell = 0; }
    dwell += dt / 2.0;                            // 2.0s SSVEP dwell (matches the BCI repo)
    if (dwell >= 1) { dwell = 0; dwellId = null; openMenu(); }
  } else {
    dwell = Math.max(0, dwell - dt / 0.8);
    if (dwell === 0) dwellId = null;
  }
}
// SSVEP lock on a menu target: number key starts the fill, it builds, then commits
function startLock(el, run) { lock = { el, run, progress: 0 }; renderLockFill(); }
function clearLock() { lock = { el: null, run: null, progress: 0 }; renderLockFill(); }
function tickLock(dt) {
  if (!lock.el) return;
  lock.progress = Math.min(1, lock.progress + dt / 0.7);   // ~0.7s SSVEP fill
  renderLockFill();
  if (lock.progress >= 1) { const run = lock.run; clearLock(); run(); }
}
function renderLockFill() {
  document.querySelectorAll(".ssvep-lock").forEach((e) => { if (e !== lock.el) { e.classList.remove("ssvep-lock"); e.style.removeProperty("--fill"); } });
  if (lock.el) { lock.el.classList.add("ssvep-lock"); lock.el.style.setProperty("--fill", (lock.progress * 100) + "%"); }
}
function draw(foc) {
  dctx.clearRect(0, 0, dcanvas.width, dcanvas.height);
  // camera feed renders ONLY on the camera view; elsewhere the panel is transparent
  // so the real world (the ambient view behind) shows through the translucent cards.
  if (stage !== "browse" || !feedReady()) return;
  const t = coverT();
  dctx.fillStyle = "#0b0d11";                                   // clean viewfinder backdrop behind the fitted frame
  dctx.fillRect(0, 0, dcanvas.width, dcanvas.height);
  dctx.drawImage(feedEl(), t.ox, t.oy, t.vw * t.s, t.vh * t.s);
  const bci = inputMode === "bci";
  detections.forEach((d, i) => {
    const [x, y, w, h] = d.bbox;
    const bx = x * t.s + t.ox, by = y * t.s + t.oy, bw = w * t.s, bh = h * t.s;
    const on = d === foc;
    if (bci) {                                            // SSVEP: flickering translucent fill (box stays solid)
      const f = SSVEP_FREQ[i % 4];
      dctx.globalAlpha = 0.14 + 0.16 * (0.5 + 0.5 * Math.sin(2 * Math.PI * f * performance.now() / 1000));
      dctx.fillStyle = "#4a9eff"; roundRect(bx, by, bw, bh, 6); dctx.fill();
      dctx.globalAlpha = 1;
    }
    roundRect(bx, by, bw, bh, 6);                          // solid, always-visible outline
    dctx.lineWidth = on ? 3 : 2;
    dctx.strokeStyle = on ? "#4a9eff" : "rgba(255,255,255,0.85)";
    dctx.stroke();
    if (bci && dwell > 0 && dwellId === d.id) {           // SSVEP dwell loader — same fill as the menus
      dctx.save(); roundRect(bx, by, bw, bh, 6); dctx.clip();
      dctx.fillStyle = "rgba(74, 158, 255, 0.55)";
      dctx.fillRect(bx, by, bw * dwell, bh);
      dctx.restore();
    }
    if (on) {                                             // focused object label
      dctx.font = "600 13px -apple-system, sans-serif";
      const tw = dctx.measureText(d.class).width;
      dctx.fillStyle = "#4a9eff"; dctx.fillRect(bx, Math.max(0, by - 18), tw + 12, 18);
      dctx.fillStyle = "#fff"; dctx.fillText(d.class, bx + 6, Math.max(12, by - 5));
    }
  });
  if (aim || bci) {                                       // head-aim reticle — both modes (dwell loader is BCI-only, drawn above)
    const p = aim || { x: dcanvas.width / 2, y: dcanvas.height / 2 };
    dctx.strokeStyle = "#4a9eff"; dctx.lineWidth = 2;
    dctx.beginPath(); dctx.arc(p.x, p.y, 9, 0, 2 * Math.PI); dctx.stroke();
    dctx.fillStyle = "#4a9eff"; dctx.beginPath(); dctx.arc(p.x, p.y, 2.5, 0, 2 * Math.PI); dctx.fill();
  }
}
function roundRect(x, y, w, h, r) {
  dctx.beginPath(); dctx.moveTo(x + r, y);
  dctx.arcTo(x + w, y, x + w, y + h, r); dctx.arcTo(x + w, y + h, x, y + h, r);
  dctx.arcTo(x, y + h, x, y, r); dctx.arcTo(x, y, x + w, y, r); dctx.closePath();
}

// ============ Camera feed source: live webcam OR a 360° street panorama (a demo toggle) ============
// The ENTIRE camera-view pipeline (detection, focus, action cards, Meta AI) is unchanged — only the
// feed pixels swap. Everywhere the pipeline used `video`, it now uses feedEl()/feedW()/feedH() so it
// works identically on either source. The street is a true 360° equirectangular pano you can pan (drag).
const streetImg = new Image();
let streetReady = false, feedSource = "street", panAngle = 180, panDrag = null;   // default feed: the street demo
const streetFeed = document.createElement("canvas");   // the current street window, rendered as a camera-like frame
const sfctx = streetFeed.getContext("2d");
streetFeed.width = 720; streetFeed.height = 720;
streetImg.onload = () => { streetReady = true; };
streetImg.src = window.STREET_PANO || "";
const ST_FOV = 76;          // street feed (camera) horizontal FOV — tighter = objects appear closer
const ST_WORLD_FOV = 118;   // ambient glasses-view FOV — wider backdrop behind the panel
const ST_PITCH = 0.56;      // vertical center (fraction of image height): the horizon / street level
function norm180(a) { return ((a + 180) % 360 + 360) % 360 - 180; }
// the feed abstraction the camera pipeline runs on
function feedEl()    { return feedSource === "street" ? streetFeed : video; }
function feedW()     { return feedSource === "street" ? streetFeed.width  : (video.videoWidth  || 16); }
function feedH()     { return feedSource === "street" ? streetFeed.height : (video.videoHeight || 9); }
function feedReady() { return feedSource === "street" ? streetReady : (video.readyState >= 2); }
function drawWrapped(ctx, img, sx, sy, sw, sh, dW, dH) {  // draw an (x-wrapping) window from a vertical band
  const iw = img.naturalWidth;
  sx = ((sx % iw) + iw) % iw;
  if (sx + sw <= iw) { ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dW, dH); return; }
  const w1 = iw - sx, dw1 = (w1 / sw) * dW;
  ctx.drawImage(img, sx, sy, w1, sh, 0, 0, dw1, dH);
  ctx.drawImage(img, 0, sy, sw - w1, sh, dw1, 0, dW - dw1, dH);
}
function renderStreetFeed() {            // render the current street window into the camera-frame canvas
  if (!streetReady) return;
  const iw = streetImg.naturalWidth, ih = streetImg.naturalHeight;
  const sw = (ST_FOV / 360) * iw, sh = sw, sy = ST_PITCH * ih - sh / 2;   // square window (no distortion)
  const sx = (panAngle / 360) * iw - sw / 2;
  sfctx.clearRect(0, 0, streetFeed.width, streetFeed.height);
  drawWrapped(sfctx, streetImg, sx, sy, sw, sh, streetFeed.width, streetFeed.height);
}
function roundRectC(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function drawWorld() {                   // ambient glasses view: the wider street backdrop (no boxes)
  if (!streetReady) return;
  const rect = worldCanvas.getBoundingClientRect();
  const W = Math.round(rect.width), H = Math.round(rect.height);
  if (!W || !H) return;
  if (worldCanvas.width !== W || worldCanvas.height !== H) { worldCanvas.width = W; worldCanvas.height = H; }
  const iw = streetImg.naturalWidth, ih = streetImg.naturalHeight;
  const sw = (ST_WORLD_FOV / 360) * iw, sh = sw * H / W, sy = ST_PITCH * ih - sh / 2;
  const sx = (panAngle / 360) * iw - sw / 2;
  wctx.clearRect(0, 0, W, H);
  drawWrapped(wctx, streetImg, sx, sy, sw, sh, W, H);   // (location shown by the world-label top-left)
}
function setFeed(src) {                   // switch the camera feed source (webcam <-> street)
  feedSource = src;
  const street = src === "street";
  worldCanvas.classList.toggle("on", street);
  video.style.visibility = street ? "hidden" : "";
  worldLabel.textContent = street ? "glasses view — Bethesda, Maryland (street demo)" : "glasses view — the real world";
  if (typeof feedToggle !== "undefined" && feedToggle) {
    feedToggle.classList.toggle("on", street);
    feedToggle.innerHTML = `<span class="ic">${street ? ICONS.pin : ICONS.camera}</span><span>${street ? "Street" : "Live"}</span>`;
  }
  resetFocus(); tracked = [];             // clear the tracker so boxes don't jump across the feed change
}
function toggleFeed() { setFeed(feedSource === "street" ? "camera" : "street"); }
// drag the glasses view to pan the street (only meaningful when the street feed is active)
worldCanvas.addEventListener("pointerdown", (e) => { if (feedSource !== "street") return; panDrag = { x: e.clientX, a: panAngle }; try { worldCanvas.setPointerCapture(e.pointerId); } catch (_) {} });
worldCanvas.addEventListener("pointermove", (e) => { if (!panDrag) return; const r = worldCanvas.getBoundingClientRect(); const ddeg = (e.clientX - panDrag.x) * ST_WORLD_FOV / (r.width || 1); panAngle = ((panDrag.a - ddeg) % 360 + 360) % 360; });
worldCanvas.addEventListener("pointerup", () => { panDrag = null; });
worldCanvas.addEventListener("pointercancel", () => { panDrag = null; });
worldCanvas.style.touchAction = "none";

// ---- views ----
function show(st) {
  clearLock();
  stage = st;
  menuEl.classList.toggle("hidden", st !== "menu");
  kbview.classList.toggle("hidden", st !== "keyboard");
  resultEl.classList.toggle("hidden", st !== "result");
  chatEl.classList.toggle("hidden", st !== "chat");
  display.classList.toggle("off", st === "off");     // "off" = blank display (glow + badge hidden, no card)
  Sync.send("hudkb", { open: st === "keyboard" });   // tell the phone whether its keyboard is live on the HUD
}

// ---- select an object -> ask the model for context actions ----
function openMenu() {
  const f = focused(); if (!f) return;
  metaAI = false;
  selObj = f.class;
  selImg = cropObject(f);
  query = ""; menuIdx = 0; qSub = "input";
  menuLoading = true; loadingMsg = "reading the object…";
  renderMenu(); show("menu");
  loadActions();
}
async function loadActions() {
  try {
    const res = await fetch("/api/actions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: selImg, label: selObj }),
    });
    if (!res.ok) throw new Error("no-ai");
    const data = await res.json();
    if (!data.actions || !data.actions.length) throw new Error("empty");
    currentActions = data.actions.slice(0, 4).map((a) => ({ label: a.label, ic: iconFor(a.label), ai: true }));
  } catch (_) {
    currentActions = FALLBACK_ACTIONS;
  }
  if (stage !== "menu") return;
  menuLoading = false; menuIdx = currentActions.length; qSub = "input";  // default focus: the text input
  renderMenu();
}
function renderMenu() {
  if (menuLoading) {
    optList.innerHTML = `<div class="opt-item"><span class="ic">${ICONS.spark}</span><span class="lbl">${loadingMsg || "thinking…"}</span></div>`;
    queryRow.classList.add("hidden");
    return;
  }
  queryRow.classList.remove("hidden");
  const onQuery = menuIdx >= currentActions.length;
  optList.innerHTML = currentActions.map((a, i) =>
    `<div class="opt-item ${!onQuery && menuIdx === i ? "active" : ""}"><span class="ic">${a.ic}</span><span class="lbl">${a.label}</span></div>`
  ).join("");
  queryField.textContent = query || "Ask…";
  queryField.classList.toggle("ph", !query);
  camBtn.classList.toggle("active", onQuery && qSub === "camera");
  queryField.classList.toggle("active", onQuery && qSub === "input");
  ssvepClear(menuEl);
  if (inputMode === "bci") ssvepApply([...optList.querySelectorAll(".opt-item"), camBtn]);   // text input isn't an SSVEP target
}
function openKeyboard() { show("keyboard"); setText(query); renderSuggest(hudSuggest, []); }

// ---- run an action / query ----
function runAction(a) {
  if (!a) return;
  if (a.ai) return runAI(a.label, `${a.ic} ${a.label}`);
  a.run();
}
async function runAI(action, header) {
  menuLoading = true; loadingMsg = action + "…"; renderMenu(); show("menu");
  try {
    const res = await fetch("/api/run", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: selImg, action, label: selObj }),
    });
    const data = await res.json();
    if (!res.ok || !data.text) throw new Error(data.error || "failed");
    showResult(`<b>${escapeHtml(header)}</b><br>${escapeHtml(data.text)}`);
  } catch (_) {
    showResult(`⚠️ ${escapeHtml(action)} failed — is the server running with a Gemini key?`);
  }
}
function submitQuery() {
  const t = query.trim();
  if (!t) { openKeyboard(); return; }
  if (metaAI) chatSend(t);
  else runAI(t, "💬 " + t);
}
function showResult(html) { resultEl.innerHTML = html; menuLoading = false; show("result"); }

// ---- fallback local actions (no key) ----
function runSearch() { showResult(`🔍 <b>${selObj}</b> — searching…`); }
function runDescribe() { showResult(`📝 <b>${selObj}</b> — ${FACTS[selObj] || "an object in view."}`); }
function runPhoto() { showResult(`📸 Photo of <b>${selObj}</b> saved`); }

// ---- navigation intents from the phone ----
function nav(dir) {
  if (stage === "browse") {
    const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    if (v) moveDir(v[0], v[1]);          // directional: jump to nearest object that way
  } else if (stage === "menu" && !menuLoading) {
    const rows = currentActions.length + 1;
    if (dir === "up") menuIdx = (menuIdx - 1 + rows) % rows;
    else if (dir === "down") menuIdx = (menuIdx + 1) % rows;
    else if (menuIdx >= currentActions.length) qSub = dir === "left" ? "camera" : "input";
    renderMenu();
  } else if (stage === "chat") {
    const optCount = chat.length ? 0 : DEFAULTS.length;
    const rows = optCount + 1;
    if (dir === "up") chatIdx = (chatIdx - 1 + rows) % rows;
    else if (dir === "down") chatIdx = (chatIdx + 1) % rows;
    else if (chatIdx >= optCount) chatSub = dir === "left" ? "camera" : "input";
    renderChat();
  }
}
function select() {
  if (stage === "browse") openMenu();
  else if (stage === "menu" && !menuLoading) {
    if (menuIdx < currentActions.length) runAction(currentActions[menuIdx]);
    else if (qSub === "camera") openCamera();
    else openKeyboard();
  } else if (stage === "chat") {
    const optCount = chat.length ? 0 : DEFAULTS.length;
    if (chatIdx < optCount) return runDefault(DEFAULTS[chatIdx]);
    if (chatSub === "camera") { metaAI = false; return openCamera(); }   // camera icon -> the camera view
    return openKeyboard();
  } else if (stage === "keyboard") submitQuery();
}
function back() {
  if (stage === "keyboard") { if (metaAI) { renderChat(); show("chat"); } else { renderMenu(); show("menu"); } }
  else if (stage === "result") { renderMenu(); show("menu"); }
  else if (stage === "menu") { resetFocus(); show("browse"); }   // object card -> back to the camera view
  else if (stage === "chat") { metaAI = false; resetFocus(); show("browse"); }   // Meta AI home -> camera view
  else if (stage === "browse") openMetaAI();   // camera view -> Meta AI home
}
function zoom(dir) { scale = Math.min(2.4, Math.max(1, scale + dir * 0.25)); display.style.transform = `scale(${scale})`; }

// ---- Neural Band gesture proxies (keyboard) — a second input path alongside the phone ----
//   thumb swipe = arrows/WASD (nav) · index pinch = Enter/Space (select) · middle pinch = Esc (back)
//   pinch+twist = Z/X (zoom) · open camera view = C · open Meta AI = M
function openCamera() { resetFocus(); show("browse"); }   // the camera view (shows whichever feed is active)
function openMetaAI() {
  metaAI = true; chat = []; query = "";
  chatIdx = DEFAULTS.length; chatSub = "input";     // default focus: the text input
  renderChat(); show("chat");
  tourComplete("metaai");                           // enabling Meta AI satisfies the walkthrough's "enable" step
}
function renderChat() {
  chatThread.innerHTML = chat.map((m) => `<div class="msg ${m.role}">${escapeHtml(m.text)}</div>`).join("");
  const optCount = chat.length ? 0 : DEFAULTS.length;   // default options only on the empty "home"
  chatDefaults.innerHTML = optCount
    ? DEFAULTS.map((d, i) => `<div class="opt-item ${chatIdx === i ? "active" : ""}"><span class="ic">${d.ic}</span><span class="lbl">${d.label}</span></div>`).join("")
    : "";
  chatDefaults.classList.toggle("hidden", !optCount);
  const onQuery = chatIdx >= optCount;
  chatField.textContent = query || "Ask Meta AI…";
  chatField.classList.toggle("ph", !query);
  chatCam.classList.toggle("active", onQuery && chatSub === "camera");
  chatField.classList.toggle("active", onQuery && chatSub === "input");
  chatThread.scrollTop = chatThread.scrollHeight;
  ssvepClear(chatEl);
  if (inputMode === "bci") ssvepApply([...chatDefaults.querySelectorAll(".opt-item"), chatCam]);   // text input isn't an SSVEP target
}
function runDefault(d) {
  chat.push({ role: "user", text: d.label });
  chat.push({ role: "ai", text: d.reply });
  chatIdx = 0; chatSub = "input";
  renderChat();
}
async function chatSend(t) {
  chat.push({ role: "user", text: t });
  chat.push({ role: "ai", text: "…" });
  query = ""; chatIdx = 0; chatSub = "input"; renderChat(); show("chat");
  try {
    const res = await fetch("/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: t, image: video.videoWidth ? frameB64() : null }),
    });
    const data = await res.json();
    chat[chat.length - 1].text = (res.ok && data.text) ? data.text : "⚠️ couldn't answer — is the server running with a Gemini key?";
  } catch (_) {
    chat[chat.length - 1].text = "⚠️ couldn't answer — is the server running?";
  }
  renderChat();
}
window.addEventListener("keydown", onKey);
window.addEventListener("keyup", onKeyUp);
window.addEventListener("mousemove", onAim);   // head-aim (mouse stands in for head-pointing) — both modes in the camera view
// Neural Band "tap" = a mouse click selects the object you're pointing at (dwell is the BCI equivalent)
dcanvas.addEventListener("click", () => { if (stage === "browse" && inputMode !== "bci") { const f = focused(); if (f) openMenu(); } });
function onAim(e) {
  if (stage !== "browse") { aim = null; return; }
  const r = dcanvas.getBoundingClientRect();
  const x = (e.clientX - r.left) * dcanvas.width / r.width;
  const y = (e.clientY - r.top) * dcanvas.height / r.height;
  if (x < 0 || y < 0 || x > dcanvas.width || y > dcanvas.height) { aim = null; return; }
  aim = { x, y };
  const t = coverT();                            // focus the object under the reticle
  let best = null, bd = Infinity;
  detections.forEach((d) => {
    const [ox, oy, ow, oh] = d.bbox;
    const bx = ox * t.s + t.ox, by = oy * t.s + t.oy, bw = ow * t.s, bh = oh * t.s;
    const inside = x >= bx && x <= bx + bw && y >= by && y <= by + bh;
    const dd = Math.hypot(x - (bx + bw / 2), y - (by + bh / 2)) - (inside ? 1e6 : 0);
    if (dd < bd) { bd = dd; best = d; }
  });
  if (best) focusId = best.id;
}
function onKey(e) {
  if (stage === "keyboard") {                                    // either modality can also type the query
    if (e.key === "Enter") { e.preventDefault(); return submitQuery(); }
    if (e.key === "Escape") return back();
    if (e.key === "Backspace") { e.preventDefault(); return setQuery(query.slice(0, -1)); }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) return setQuery(query + e.key);
    return;
  }
  if (e.key === "Escape") return back();                      // back to the previous page — any mode
  if (e.key === "?") return helpPanel.classList.toggle("hidden");   // controls cheat-sheet
  if (e.key === "v" || e.key === "V") return toggleFeed();   // switch the camera feed: webcam <-> street demo
  if (e.key === "t" || e.key === "T") return tongueDown(e);   // tongue works in any mode (hold = toggle BCI)
  if (inputMode === "bci") return bciKey(e);
  switch (e.key) {                          // Neural Band proxies
    case "ArrowUp": case "w":    return nav("up");
    case "ArrowDown": case "s":  return nav("down");
    case "ArrowLeft": case "a":  return nav("left");
    case "ArrowRight": case "d": return nav("right");
    case "Enter": case " ":      e.preventDefault(); return select();   // index-finger pinch
    case "z": case "Z":          return zoom(1);                         // pinch + twist
    case "x": case "X":          return zoom(-1);
    case "c": case "C":          return openCamera();                    // open camera view
    case "m": case "M":          return openMetaAI();                    // open Meta AI
  }
}

// ---- BCI modality: SSVEP (flickering targets 1-4) + tongue (hold = Meta AI, double-tap = back) ----
function setMode(m) {
  inputMode = m;
  if (stage === "menu") renderMenu();
  else if (stage === "chat") renderChat();
}
function bciKey(e) {
  if (e.key >= "1" && e.key <= "9") return bciSelect(+e.key - 1);   // SSVEP proxy
  if (e.key === "z" || e.key === "Z") return zoom(1);
  if (e.key === "x" || e.key === "X") return zoom(-1);
}
let tongueTimer = null, lastTap = 0;
function tongueDown(e) {
  if (e.repeat || tongueTimer) return;
  tongueTimer = setTimeout(() => { tongueTimer = null; tongueHold(); }, 500);   // prolonged press
}
function tongueHold() {
  setMode(inputMode === "bci" ? "neural" : "bci");   // hold tongue = turn BCI mode on / off
}
function onKeyUp(e) {
  if ((e.key === "t" || e.key === "T") && tongueTimer) {
    clearTimeout(tongueTimer); tongueTimer = null;                               // released early -> a tap
    const now = performance.now();
    if (now - lastTap < 350) { lastTap = 0; if (inputMode === "bci") back(); }   // double-tap -> back (BCI)
    else lastTap = now;
  }
}
function bciSelect(n) {
  if (stage === "menu" && !menuLoading) {
    const len = currentActions.length;                                           // SSVEP targets: actions, camera (text input is phone/keyboard-only)
    const items = [...optList.querySelectorAll(".opt-item"), camBtn];
    if (n >= items.length) return;
    startLock(items[n], () => {
      if (n < len) runAction(currentActions[n]);
      else openCamera();                                                         // n === len -> camera
    });
  } else if (stage === "chat") {
    const optCount = chat.length ? 0 : DEFAULTS.length;                          // SSVEP targets: defaults, camera (text input is phone/keyboard-only)
    const items = [...chatDefaults.querySelectorAll(".opt-item"), chatCam];
    if (n >= items.length) return;
    startLock(items[n], () => {
      if (n < optCount) runDefault(DEFAULTS[n]);
      else { metaAI = false; openCamera(); }                                     // n === optCount -> camera
    });
  }
}
function ssvepApply(els) {
  els.forEach((el, i) => { if (!el) return; el.classList.add("ssvep", "ssvep" + (i % 4 + 1)); el.dataset.ssvep = i + 1; });
}
function ssvepClear(root) {
  root.querySelectorAll(".ssvep").forEach((el) => {
    el.classList.remove("ssvep", "ssvep1", "ssvep2", "ssvep3", "ssvep4");
    delete el.dataset.ssvep;
  });
}

// ---- query text ----
function setQuery(t) {
  query = t || "";
  if (stage === "keyboard") setText(query);
  if (stage === "menu" && !menuLoading) { queryField.textContent = query || "Ask…"; queryField.classList.toggle("ph", !query); }
}
function setText(t) { textline.textContent = t || ""; textline.appendChild(caret); }
function highlight(key) {
  hudKb.querySelectorAll(".kb-key.hl").forEach((n) => n.classList.remove("hl"));
  if (key) { const el = hudKb.querySelector(`.kb-key[data-key="${key}"]`); if (el) el.classList.add("hl"); }
}
// mirror the phone's glide swipe line onto the HUD keyboard (pts are normalized 0–1 of the keyboard box)
function drawHudTrail(pts) {
  if (!pts || !pts.length) { hudTrail.innerHTML = ""; return; }
  const w = hudKbWrap.offsetWidth, h = hudKbWrap.offsetHeight;
  const s = pts.map((p) => (p[0] * w).toFixed(1) + "," + (p[1] * h).toFixed(1)).join(" ");
  hudTrail.innerHTML = `<polyline points="${s}"/>`;
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

// ---- sync ----
function connected() { conn.classList.remove("off"); conn.classList.add("on"); }
Sync.on((m) => {
  connected();
  switch (m.type) {
    case "hello":       Sync.send("hello-ack"); break;
    case "nav":         nav(m.dir); break;
    case "select":      select(); break;
    case "keyboard:open": if (stage === "menu" || stage === "chat") openKeyboard(); break;   // touching the phone keyboard opens it
    case "keyboard:close": if (stage === "keyboard") back(); break;                           // tapping outside on the phone closes it
    case "back":        back(); break;
    case "zoom":        zoom(m.dir); break;
    case "text:set":    setQuery(m.text); break;
    case "suggest:set": if (stage === "keyboard") renderSuggest(hudSuggest, m.words); break;
    case "key:hover":   if (stage === "keyboard") highlight(m.key); break;
    case "trail:set":   if (stage === "keyboard") drawHudTrail(m.pts); break;   // mirror the glide swipe line
  }
});
Sync.send("hello");

// ============ Guided walkthrough — a floating card over the live HUD, one modality at a time ============
// Interactive walkthrough — each step prompts a real action; performing it (or the
// proxy key) produces the effect and advances. `await` is the action id that completes
// the step; `do` performs that effect (used by the Next button as a do-it-for-me path).
const TOUR = [
  { mod: "Neural Band", title: "", spot: "#display",
    body: "Double tap your thumb on the side of your index finger using the Meta Neural Band, or press the M proxy key on the keyboard to enable Meta AI.",
    real: "double-tap thumb on index finger", proxy: "M",
    enter: () => { setMode("neural"); show("off"); },   // start blank; wait for the user to enable it
    await: "metaai", do: () => openMetaAI() },
  // Step 2 — the curated suggestions (info only)
  { mod: "Meta AI", title: "", spot: ".chat-defaults",
    body: "Meta AI's three suggestions are curated for the moment — learned from your habits, what the camera sees around you, and the time of day.",
    real: "", proxy: "",
    enter: () => { setMode("neural"); openMetaAI(); } },
  // Step 3 — the camera option
  { mod: "Meta AI", title: "", spot: "#chat-cam",
    body: "Meta AI provides a camera option to select an object from the camera feed to use in your query.",
    real: "", proxy: "",
    enter: () => { setMode("neural"); openMetaAI(); } },
  // Step 4 — navigate + select the options (Neural Band trackpad)
  { mod: "Neural Band", title: "", spot: ".chat-defaults, .chat-row",
    body: "Your index finger works like a trackpad — swipe your thumb across it in any direction using the Meta Neural Band, or use the arrow proxy keys on the keyboard, to move through the options. Tap your index finger on your thumb using the Meta Neural Band, or press the Enter proxy key on the keyboard to select an option.",
    real: "swipe to move · tap to select", proxy: "←  ↑  ↓  →   ·   Enter",
    enter: () => { setMode("neural"); openMetaAI(); } },
  // Step 5 — the camera view (point + select an object from the feed)
  { mod: "Neural Band", title: "", spot: "#display",
    body: "When you select the camera option, you are presented with a view of the camera feed from your Meta glasses. You can point your head to focus on the object and tap your index finger on your thumb to select it using the Neural Band, or use your mouse as a proxy to point and click to select an object from the camera view.",
    real: "point head · tap finger on thumb", proxy: "mouse — point + click",
    enter: () => { setMode("neural"); openCamera(); } },
  // Step 6 — the object's suggested actions (context actions for the selection)
  { mod: "Meta AI", title: "", spot: ".opt-list",
    body: "Select an object from the camera feed, and Meta AI gives you three suggested actions — curated from what it is, your habits, what the camera sees around you, and the time of day.",
    real: "", proxy: "",
    enter: () => { setMode("neural"); tourMenu(); } },
  // BCI/EMG — 1) toggle on, then pick an object in the camera view by dwell (no tap)
  { mod: "BCI/EMG", title: "", spot: "#display",
    body: "Switch to BCI/EMG with a long tongue-press to the roof of your mouth. To pick an object in the camera view, point your head at it and simply rest your gaze — a loader fills on the box and selects it. No tap, no hands.",
    real: "long tongue-press · point head · hold gaze (dwell)", proxy: "hold T · point + hold to dwell",
    enter: () => { setMode("bci"); openCamera(); } },
  // BCI/EMG — 2) the action menu: options flicker (SSVEP), gaze-dwell to select, tongue double-tap = back
  { mod: "BCI/EMG", title: "", spot: ".opt-list",
    body: "In a menu the options flicker at different frequencies — rest your gaze on one and its loader fills to choose it. Double-tap your tongue to go back a page. As keyboard proxies: keys 1–4 fill a loader, double-tap T goes back.",
    real: "gaze dwell · double tongue-tap", proxy: "keys 1–4 · double-tap T",
    enter: () => { setMode("bci"); tourMenu(); } },
  // --- Phone (Meta Controller) steps — cards + spotlights render over the phone via the parent ---
  // Step 8 — open the Meta Controller
  { mod: "Phone", device: "phone", spot: "#float-icon", needsController: false,
    body: "On the go, your phone doubles as a controller for the glasses — type and navigate the HUD while staying heads-up. Press the floating button to open the Meta Controller.",
    real: "tap the floating button", proxy: "mouse click",
    enter: () => { setMode("neural"); openMetaAI(); } },
  // Step 9 — the keyboard
  { mod: "Phone", device: "phone", spot: "#phone-kb", needsController: true,
    body: "Touch the keyboard to activate it, then swipe across letters to glide-type or tap to type. For a precise single key, touch and drag within the keys to hover it, and tap to select.",
    real: "tap · swipe · drag-hover + tap", proxy: "mouse — same gestures",
    enter: () => { setMode("neural"); openMetaAI(); } },
  // Step 9b — close the HUD keyboard by clicking anywhere outside the controller
  { mod: "Phone", device: "phone", spot: "@above-controller", needsController: true,
    body: "Click anywhere outside the Meta Controller to close the keyboard. The two screens stay in sync, so it closes on the HUD too.",
    real: "tap anywhere outside the controller", proxy: "click anywhere outside",
    enter: () => { setMode("neural"); openMetaAI(); } },
  // Step 11 — ZOOM
  { mod: "Phone", device: "phone", spot: "#zoom-btn", needsController: true,
    body: "Swipe up or down on the ZOOM button to zoom in and out on the HUD.",
    real: "swipe up / down", proxy: "mouse drag up / down",
    enter: () => { setMode("neural"); openMetaAI(); } },
  // Step 12 — NAVIGATE
  { mod: "Phone", device: "phone", spot: "#scroll-btn", needsController: true,
    body: "Swipe on the NAVIGATE button to move through items, and tap it to select.",
    real: "swipe · tap", proxy: "mouse drag · click",
    enter: () => { setMode("neural"); openMetaAI(); } },
  // Step 13 — BACK
  { mod: "Phone", device: "phone", spot: "#back-btn", needsController: true,
    body: "Tap the BACK button to go back a page.",
    real: "tap", proxy: "mouse click",
    enter: () => { setMode("neural"); openMetaAI(); } },
  // Step 14 — close the controller (swipe up the home bar) — last step in the phone mode
  { mod: "Phone", device: "phone", spot: "#navpill", needsController: true,
    body: "Swipe up from the home bar to close the controller and return home.",
    real: "swipe up the home bar", proxy: "mouse drag up",
    enter: () => { setMode("neural"); openMetaAI(); } },
];
let tourIdx = 0, tourActive = false, tourSpotSel = null;
let tourGroup = null, groupIdxs = [], groupPos = 0;
// the three input modalities shown on the hub; each walks its own subset of TOUR steps
const GROUPS = [
  { id: "neural", name: "Neural Band", desc: "Subtle finger gestures on a wristband — a hidden trackpad.", solves: "Quiet control in public — no voice, no hands up." },
  { id: "bci", name: "BCI · eyes & brain", desc: "Flickering targets you pick with your gaze; tongue toggles it.", solves: "Fully hands-free — hands busy or can’t move." },
  { id: "phone", name: "Phone controller", desc: "Your phone becomes a keyboard + navigation pads.", solves: "Precise typing on the go, eyes up." },
];
const stepGroup = (s) => s.mod === "Phone" ? "phone" : (s.mod === "BCI/EMG" ? "bci" : "neural");

function tourStart() { tourActive = true; const b = document.getElementById("tour-btn"); if (b) b.style.display = "none"; tourShowHub(); requestAnimationFrame(tourSpotTick); }
function tourFinish(keep) {                        // exit the tour entirely (Skip / Close / Done)
  tourActive = false; document.getElementById("tour").classList.add("hidden");
  const hub = document.getElementById("tour-hub"); if (hub) hub.classList.add("hidden");
  tourSpot(null);
  try { window.parent.__tourPhoneHide(); } catch (_) {}
  const b = document.getElementById("tour-btn"); if (b) b.style.display = "";
  if (!keep) { setMode("neural"); show("off"); }
}
function tourEnd() { tourFinish(false); }         // Skip / Close -> exit

// ---- mode hub: briefly present the three modalities; pick one to walk its steps ----
function renderHub() {
  const wrap = document.querySelector("#tour-hub .th-modes"); if (!wrap) return;
  wrap.innerHTML = GROUPS.map((g) =>
    `<button class="th-mode" data-group="${g.id}"><div class="tm-top"><span class="tm-name">${g.name}</span><span class="tm-arrow">›</span></div>` +
    `<div class="tm-desc">${g.desc}</div><div class="tm-solves"><b>Solves</b> — ${g.solves}</div></button>`).join("");
  wrap.querySelectorAll(".th-mode").forEach((b) => b.addEventListener("click", () => tourEnterGroup(b.dataset.group)));
}
function tourShowHub() {
  tourGroup = null; groupIdxs = []; groupPos = 0;
  document.getElementById("tour").classList.add("hidden"); tourSpot(null);
  try { window.parent.__tourPhoneHide(); } catch (_) {}
  setMode("neural"); show("off");
  renderHub();
  const hub = document.getElementById("tour-hub"); if (hub) hub.classList.remove("hidden");
}
function tourEnterGroup(id) {
  groupIdxs = TOUR.map((s, idx) => idx).filter((idx) => stepGroup(TOUR[idx]) === id);
  if (!groupIdxs.length) return;
  tourGroup = id; groupPos = 0; tourIdx = groupIdxs[0];
  const hub = document.getElementById("tour-hub"); if (hub) hub.classList.add("hidden");
  tourRender();
}
function tourNext() { if (groupPos >= groupIdxs.length - 1) return tourShowHub(); groupPos++; tourIdx = groupIdxs[groupPos]; tourRender(); }   // end of a mode -> back to the hub
function tourPrev() { if (groupPos <= 0) return tourShowHub(); groupPos--; tourIdx = groupIdxs[groupPos]; tourRender(); }
// an in-world action (real gesture proxy) satisfied the current step -> advance
function tourComplete(action) { if (tourActive && TOUR[tourIdx] && TOUR[tourIdx].await === action) tourNext(); }
function tourPhoneData(s) {   // payload the parent uses to render the card + spotlight over the phone
  return { mod: s.mod, body: s.body, real: s.real, proxy: s.proxy, spot: s.spot, needsController: s.needsController,
           idx: groupPos, total: groupIdxs.length, canPrev: true, isLast: groupPos === groupIdxs.length - 1 };
}
function tourRender() {
  const s = TOUR[tourIdx], el = document.getElementById("tour");
  if (s.enter) { try { s.enter(); } catch (_) {} }
  if (s.device === "phone") {                        // phone step: the parent renders the card + spotlight over the phone
    el.classList.add("hidden"); tourSpot(null);      // hide the HUD card + spotlight
    try { window.parent.__tourPhoneShow(tourPhoneData(s)); } catch (_) {}
    return;
  }
  try { window.parent.__tourPhoneHide(); } catch (_) {}   // HUD step: make sure the phone overlay is gone
  el.classList.remove("hidden");
  const mod = el.querySelector(".tour-mod"); mod.textContent = s.mod || ""; mod.classList.toggle("hidden", !s.mod);
  el.querySelector(".tour-count").textContent = (groupPos + 1) + " / " + groupIdxs.length;
  const title = el.querySelector(".tour-title"); title.textContent = s.title || ""; title.classList.toggle("hidden", !s.title);
  el.querySelector(".tour-body").textContent = s.body;
  const map = el.querySelector(".tour-map"), hasMap = !!(s.real || s.proxy);   // hide the Real/Proxy rows when the step has none
  map.classList.toggle("hidden", !hasMap);
  if (hasMap) { el.querySelector(".tour-real").textContent = s.real || "—"; el.querySelector(".tour-proxy").textContent = s.proxy || "—"; }
  const prev = el.querySelector(".tour-prev"); prev.disabled = false; prev.textContent = groupPos === 0 ? "‹ Modes" : "‹ Back";
  el.querySelector(".tour-next").textContent = groupPos === groupIdxs.length - 1 ? "Done ✓" : "Next ›";
  tourSpot(s.spot);   // debounced — positions after the view lays out
}
function tourSpot(sel) {                                           // set the current step's spotlight target
  tourSpotSel = sel || null;
  if (!tourSpotSel) document.getElementById("tour-spot").classList.add("hidden");
}
function tourSpotTick() {                                          // keep the spotlight pinned to its target each frame (robust vs. reflow/timing)
  if (!tourActive) return;
  const spot = document.getElementById("tour-spot");
  if (tourSpotSel) {
    let box = null;                                               // union of every matched element (sel may be comma-separated)
    document.querySelectorAll(tourSpotSel).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      box = box ? { l: Math.min(box.l, r.left), t: Math.min(box.t, r.top), r: Math.max(box.r, r.right), b: Math.max(box.b, r.bottom) }
                : { l: r.left, t: r.top, r: r.right, b: r.bottom };
    });
    if (box) {
      const vp = document.getElementById("viewport").getBoundingClientRect(), pad = 6;
      spot.style.left = (box.l - vp.left - pad) + "px"; spot.style.top = (box.t - vp.top - pad) + "px";
      spot.style.width = (box.r - box.l + pad * 2) + "px"; spot.style.height = (box.b - box.t + pad * 2) + "px";
      spot.classList.remove("hidden");
    } else spot.classList.add("hidden");
  }
  requestAnimationFrame(tourSpotTick);
}
function tourMenu() {   // open an action card reliably, even before a live detection lands
  if (stage === "browse") { const f = focused(); if (f) return openMenu(); }
  metaAI = false; selObj = "traffic light"; selImg = null;
  query = ""; menuIdx = 0; qSub = "input"; menuLoading = true; loadingMsg = "reading the object…";
  renderMenu(); show("menu"); loadActions();
}
(function wireTour() {
  const el = document.getElementById("tour"), btn = document.getElementById("tour-btn");
  if (btn) btn.addEventListener("click", tourStart);
  el.querySelector(".tour-next").addEventListener("click", () => {
    const s = TOUR[tourIdx];
    if (s && s.await && s.do) s.do();   // do-it-for-me: perform the action; its effect advances the tour
    else tourNext();
  });
  el.querySelector(".tour-prev").addEventListener("click", tourPrev);
  el.querySelector(".tour-skip").addEventListener("click", tourEnd);
  const hub = document.getElementById("tour-hub");
  if (hub) { const cl = hub.querySelector(".th-close"); if (cl) cl.addEventListener("click", () => tourFinish(false)); }
})();

init();   // start after every top-level declaration is initialized (avoids TDZ on street state)
tourStart();   // open the mode hub by default on load
