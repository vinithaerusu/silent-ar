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

// ---- controls cheat-sheet toggle ("?" on the surface) ----
const phoneHelpBtn = document.getElementById("phone-help-btn");
const phoneHelp = document.getElementById("phone-help");
if (phoneHelpBtn) phoneHelpBtn.addEventListener("click", () => {
  phoneHelp.classList.toggle("hidden"); phoneHelpBtn.classList.toggle("on");
});

// ---- tap anywhere outside the keyboard / buttons -> close the keyboard on the HUD ----
document.addEventListener("pointerdown", (e) => {
  if (e.target.closest(".kb-panel") || e.target.closest(".ctrl-row") || e.target.closest("#float-icon") ||
      e.target.closest("#phone-help-btn") || e.target.closest("#phone-help")) return;
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
  else { const letters = collapse(path.filter(isLetter)); if (letters.length >= 2) glideType(letters); }
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
function drawTrail() { trail.innerHTML = `<polyline points="${points.map((p) => p.join(",")).join(" ")}"/>`; }
function clearTrail() { points = []; trail.innerHTML = ""; }

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
function glideType(letters) { const cands = glideCandidates(letters); insertWord(cands[0]); setSuggest(cands); }
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
