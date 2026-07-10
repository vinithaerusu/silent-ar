/*
 * Phone controller — the touch surface that drives the HUD.
 * Floating Meta icon -> control surface: ZOOM / SCROLL / BACK + Meta keyboard.
 *
 *   SCROLL  swipe (up/down/left/right) -> nav ;  center tap -> select
 *   ZOOM    vertical swipe -> zoom
 *   BACK    tap -> back
 *   keyboard  tap = type ; swipe across keys = glide-type ; drag never selects
 * Everything is mirrored to the HUD over the sync channel.
 */
const floatIcon = document.getElementById("float-icon");
const surface   = document.getElementById("surface");
const phoneKb   = document.getElementById("phone-kb");
const kbWrap    = document.getElementById("kb-wrap");
const trail     = document.getElementById("kb-trail");
const phoneText = document.getElementById("phone-text");
const zoomBtn   = document.getElementById("zoom-btn");
const scrollBtn = document.getElementById("scroll-btn");
const backBtn   = document.getElementById("back-btn");
const conn      = document.getElementById("conn");
const phoneSuggest = document.getElementById("phone-suggest");

renderKeyboard(phoneKb);
floatIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6.5" width="19" height="11" rx="2.5"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M6 13.3h.01M18 13.3h.01"/><path d="M9 13.3h6"/></svg>`;
let text = "";                              // the query text
let currentSuggest = [], lastInsert = null;
let hudKb = false, woke = false;            // is the HUD showing the keyboard? / first-touch wake gesture
const TAP_SLOP = 8;

// ---- connection ----
function connected() { conn.classList.remove("off"); conn.classList.add("on"); conn.textContent = "● HUD connected"; }
Sync.on((m) => {
  connected();
  if (m.type === "hello") Sync.send("hello-ack");
  if (m.type === "hudkb") hudKb = m.open;
});
Sync.send("hello");

// ---- open the control surface ----
floatIcon.addEventListener("click", () => {
  floatIcon.classList.add("hidden");
  surface.classList.remove("hidden");
});

// ---- close the controller: back to the phone home (and dismiss the HUD keyboard) ----
function closeController() {
  if (surface.classList.contains("hidden")) return;
  surface.classList.add("hidden");
  floatIcon.classList.remove("hidden");
  if (hudKb) { hudKb = false; Sync.send("keyboard:close"); }
}

// ---- Pixel-style home gesture: swipe up on the nav pill to close the controller ----
const navpill = document.getElementById("navpill");
if (navpill) {
  navpill.style.cursor = "grab"; navpill.style.touchAction = "none";
  let npY = null;
  navpill.addEventListener("pointerdown", (e) => { npY = e.clientY; try { navpill.setPointerCapture(e.pointerId); } catch (_) {} });
  navpill.addEventListener("pointerup", (e) => { if (npY != null && npY - e.clientY > 22) closeController(); npY = null; });   // swiped up -> home
}

// ---- controls cheat-sheet toggle ("?" on the surface) ----
const phoneHelpBtn = document.getElementById("phone-help-btn");
const phoneHelp = document.getElementById("phone-help");
if (phoneHelpBtn) phoneHelpBtn.addEventListener("click", () => {
  phoneHelp.classList.toggle("hidden"); phoneHelpBtn.classList.toggle("on");
});

// ---- tap anywhere outside the keyboard -> dismiss just the HUD keyboard (the controller stays open; swipe up the home bar to close it) ----
document.addEventListener("pointerdown", (e) => {
  if (e.target.closest(".kb-panel") || e.target.closest(".ctrl-row") || e.target.closest("#float-icon") ||
      e.target.closest("#phone-help-btn") || e.target.closest("#phone-help") || e.target.closest("#navpill")) return;
  if (hudKb) { hudKb = false; Sync.send("keyboard:close"); }
});

// ---- keyboard: tap = type, swipe = glide-type, drag-in-key = nothing ----
let pressing = false, moved = false, sx = 0, sy = 0, startKey = null, path = [], points = [];

phoneKb.addEventListener("pointerdown", (e) => {
  woke = !hudKb;
  if (woke) { hudKb = true; Sync.send("keyboard:open"); }   // first touch: bring the keyboard up on the HUD
  pressing = true; moved = false; sx = e.clientX; sy = e.clientY;
  phoneKb.setPointerCapture(e.pointerId);
  startKey = keyAt(e);
  path = startKey ? [startKey.dataset.key] : [];
  points = [pt(e)];
  press(startKey);
  e.preventDefault();
});
phoneKb.addEventListener("pointermove", (e) => {
  if (!pressing) return;
  if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) > TAP_SLOP) moved = true;
  const k = keyAt(e);
  if (k && (!path.length || path[path.length - 1] !== k.dataset.key)) path.push(k.dataset.key);
  press(k);
  if (moved) { points.push(pt(e)); drawTrail(); }
});
phoneKb.addEventListener("pointerup", (e) => {
  pressing = false;
  const endKey = keyAt(e);
  clearPress(); clearTrail();
  Sync.send("key:hover", { key: null });
  if (woke) { woke = false; return; }        // the wake touch only opened the HUD keyboard — don't type
  if (!moved) { if (endKey || startKey) applyKey((endKey || startKey).dataset.key); }
  else {
    let cands = glideDecode(points);                                     // geometry-based decode (path shape)
    if (!cands || !cands.length) {                                       // fallback: coarse crossed-keys match
      const letters = collapse(path.filter(isLetter));
      if (letters.length >= 2) cands = glideCandidates(letters);
    }
    if (cands && cands.length) { clearSuggest(); insertWord(cands[0]); setSuggest(cands); }
  }
});
phoneKb.addEventListener("pointercancel", () => { pressing = false; clearPress(); clearTrail(); });

function keyAt(e) { const el = document.elementFromPoint(e.clientX, e.clientY); return el && el.closest(".kb-key"); }
function isLetter(k) { return k.length === 1 && k >= "a" && k <= "z"; }
function collapse(arr) { return arr.filter((k, i) => k !== arr[i - 1]); }
function pt(e) { const r = kbWrap.getBoundingClientRect(); return [Math.round(e.clientX - r.left), Math.round(e.clientY - r.top)]; }

let pressed = null;
function press(k) {
  if (pressed === k) return;
  if (pressed) pressed.classList.remove("hover");
  pressed = k;
  if (pressed) { pressed.classList.add("hover"); Sync.send("key:hover", { key: pressed.dataset.key }); }
  else Sync.send("key:hover", { key: null });
}
function clearPress() { if (pressed) { pressed.classList.remove("hover"); pressed = null; } }
function drawTrail() {
  trail.innerHTML = `<polyline points="${points.map((p) => p.join(",")).join(" ")}"/>`;
  const r = kbWrap.getBoundingClientRect();   // mirror the swipe line onto the HUD keyboard (normalized 0–1)
  Sync.send("trail:set", { pts: points.map((p) => [+(p[0] / r.width).toFixed(4), +(p[1] / r.height).toFixed(4)]) });
}
function clearTrail() { points = []; trail.innerHTML = ""; Sync.send("trail:set", { pts: [] }); }

// ---- text ----
function applyKey(k) {
  clearSuggest();
  if (k === "return") { if (hudKb) { hudKb = false; Sync.send("keyboard:close"); } return; }   // Enter closes the HUD keyboard
  if (k === "back") text = text.slice(0, -1);
  else if (k === "space") text += " ";
  else if (k === "shift" || k === "?123") { /* later */ }
  else text += k;
  commit();
}
function insertWord(word) {
  if (text && !text.endsWith(" ")) text += " ";
  lastInsert = { start: text.length };
  text += word + " ";
  commit();
}
function commit() { phoneText.textContent = text; Sync.send("text:set", { text }); }

// ---- suggestion strip ----
function setSuggest(words) { currentSuggest = words || []; renderSuggest(phoneSuggest, currentSuggest); Sync.send("suggest:set", { words: currentSuggest }); }
function clearSuggest() { lastInsert = null; setSuggest([]); }
function chooseSuggest(word) { if (!word || !lastInsert) return; text = text.slice(0, lastInsert.start) + word + " "; commit(); }
phoneSuggest.addEventListener("click", (e) => { const s = e.target.closest(".sugg"); if (s) chooseSuggest(currentSuggest[+s.dataset.idx]); });

function glideCandidates(letters) {
  const p = collapse(letters);
  if (p.length < 2) return [p.join("")];
  const pStart = p[0], pEnd = p[p.length - 1];
  const scored = [];
  for (let i = 0; i < WORDS.length; i++) {
    const w = WORDS[i]; if (w.length < 2) continue;
    const wc = collapseStr(w);
    if (!isSubseq(wc, p)) continue;                       // word's letters must be crossed in order
    const s0 = wc[0] === pStart, s1 = wc[wc.length - 1] === pEnd;
    if (!s0 && !s1) continue;                             // anchor on at least one endpoint (tolerates one sloppy end)
    // lower score = better: reward matched endpoints + longer words + more common
    const score = (s0 ? 0 : 5) + (s1 ? 0 : 5) - w.length * 1.4 + i * 0.02;
    scored.push({ w, score });
  }
  if (!scored.length) return [p.join("")];
  scored.sort((a, b) => a.score - b.score);
  const out = [];
  for (const s of scored) { if (!out.includes(s.w)) out.push(s.w); if (out.length >= 3) break; }
  return out;
}
function collapseStr(s) { let o = ""; for (const c of s) if (c !== o[o.length - 1]) o += c; return o; }
function isSubseq(word, arr) { let j = 0; for (let i = 0; i < arr.length && j < word.length; i++) if (arr[i] === word[j]) j++; return j === word.length; }

// ---- geometric glide decoder (path-shape matching, closer to Gboard) ----
// Scores each word by how well the actual swipe path follows that word's key
// centres (DTW location channel + resampled point distance), anchored on the
// start/end keys. Uses the real sampled points, not just which keys were crossed.
const GLIDE_N = 28;
function d2(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
function keyCenters() {
  const wrap = kbWrap.getBoundingClientRect(), map = {};
  phoneKb.querySelectorAll(".kb-key").forEach((k) => {
    const key = k.dataset.key; if (!isLetter(key)) return;
    const r = k.getBoundingClientRect();
    map[key] = [r.left + r.width / 2 - wrap.left, r.top + r.height / 2 - wrap.top];
  });
  return map;
}
function keyPitch(c) { return (c.a && c.s) ? Math.max(12, Math.abs(c.s[0] - c.a[0])) : 30; }
function resample(pts, n) {
  if (!pts.length) return [];
  let total = 0; for (let i = 1; i < pts.length; i++) total += d2(pts[i - 1], pts[i]);
  if (total < 1e-6) return Array.from({ length: n }, () => pts[0].slice());
  const step = total / (n - 1), out = [pts[0].slice()];
  let prev = pts[0], acc = 0, i = 1;
  while (out.length < n && i < pts.length) {
    const seg = d2(prev, pts[i]);
    if (acc + seg >= step && seg > 1e-9) {
      const t = (step - acc) / seg;
      const np = [prev[0] + t * (pts[i][0] - prev[0]), prev[1] + t * (pts[i][1] - prev[1])];
      out.push(np); prev = np; acc = 0;
    } else { acc += seg; prev = pts[i]; i++; }
  }
  while (out.length < n) out.push(pts[pts.length - 1].slice());
  return out;
}
function nearestKeys(p, centers, n) {
  return Object.keys(centers).map((k) => [k, d2(p, centers[k])]).sort((a, b) => a[1] - b[1]).slice(0, n).map((x) => x[0]);
}
function dtwCost(letters, path) {                        // ordered alignment of the word's keys to the path
  const n = letters.length, m = path.length, W = m + 1, D = new Float64Array((n + 1) * W).fill(Infinity);
  D[0] = 0;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const c = d2(letters[i - 1], path[j - 1]);
    D[i * W + j] = c + Math.min(D[(i - 1) * W + j], D[(i - 1) * W + j - 1], D[i * W + j - 1]);
  }
  return D[n * W + m] / (n + m);
}
function glideDecode(pts) {
  if (!pts || pts.length < 2) return null;
  const centers = keyCenters(); if (!centers.a) return null;
  const pitch = keyPitch(centers);
  const uRes = resample(pts, GLIDE_N), start = uRes[0], end = uRes[GLIDE_N - 1];
  const startCand = new Set(nearestKeys(start, centers, 2));   // first letter is reliable
  const endCand = new Set(nearestKeys(end, centers, 4));       // lift-off is sloppier
  const scored = [];
  for (let wi = 0; wi < WORDS.length; wi++) {
    const w = WORDS[wi]; if (w.length < 2) continue;
    if (!startCand.has(w[0]) || !endCand.has(w[w.length - 1])) continue;   // endpoint pruning
    const tpl = []; let ok = true;
    for (const ch of w) { const c = centers[ch]; if (!c) { ok = false; break; } if (tpl[tpl.length - 1] !== c) tpl.push(c); }
    if (!ok) continue;
    const tRes = resample(tpl.length >= 2 ? tpl : [tpl[0], tpl[0]], GLIDE_N);
    let pd = 0; for (let i = 0; i < GLIDE_N; i++) pd += d2(uRes[i], tRes[i]); pd /= GLIDE_N;
    const score = (dtwCost(tpl, uRes) + pd) / pitch + (wi / WORDS.length) * 0.9;   // + small frequency prior
    scored.push({ w, score });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => a.score - b.score);
  const out = [];
  for (const s of scored) { if (!out.includes(s.w)) out.push(s.w); if (out.length >= 3) break; }
  return out;
}

// ---- control buttons ----
function flash(btn) { btn.classList.add("flash"); setTimeout(() => btn.classList.remove("flash"), 150); }

// SCROLL: swipe = nav (up/down/left/right), center tap = select
scrollBtn.addEventListener("pointerdown", (e) => { scrollBtn._x = e.clientX; scrollBtn._y = e.clientY; scrollBtn.setPointerCapture(e.pointerId); });
scrollBtn.addEventListener("pointerup", (e) => {
  const dx = e.clientX - scrollBtn._x, dy = e.clientY - scrollBtn._y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 14) { Sync.send("select"); flash(scrollBtn); return; }
  const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
  Sync.send("nav", { dir }); flash(scrollBtn);
});

// ZOOM: vertical swipe
zoomBtn.addEventListener("pointerdown", (e) => { zoomBtn._y = e.clientY; zoomBtn.setPointerCapture(e.pointerId); });
zoomBtn.addEventListener("pointerup", (e) => { const d = e.clientY - zoomBtn._y; if (Math.abs(d) > 14) { Sync.send("zoom", { dir: d < 0 ? 1 : -1 }); flash(zoomBtn); } });

// BACK: tap only
backBtn.addEventListener("pointerdown", (e) => { backBtn._x = e.clientX; backBtn._y = e.clientY; backBtn.setPointerCapture(e.pointerId); });
backBtn.addEventListener("pointerup", (e) => { if (Math.hypot(e.clientX - backBtn._x, e.clientY - backBtn._y) < 14) { Sync.send("back"); flash(backBtn); } });

// ---- status-bar clock (Pixel UI) ----
(function clock() {
  const now = new Date();
  const t = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const sb = document.querySelector(".sb-time"); if (sb) sb.textContent = t;
  const hct = document.querySelector(".hc-time"); if (hct) hct.textContent = t;
  const hcd = document.querySelector(".hc-date"); if (hcd) hcd.textContent = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  setTimeout(clock, 15000);
})();
