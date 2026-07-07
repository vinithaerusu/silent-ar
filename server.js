/*
 * Spectra AI — zero-dependency backend.
 * Serves the static app AND proxies vision requests to Gemini (key stays here).
 *
 *   GEMINI_API_KEY=xxx node server.js       (or put the key in a .env file)
 *   open http://localhost:8000
 *
 * No key set -> the /api endpoints return 503 and the frontend falls back to
 * fixed local actions, so the app still runs.
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

// minimal .env loader (zero-dep)
try {
  fs.readFileSync(path.join(__dirname, ".env"), "utf8").split("\n").forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  });
} catch (_) {}

const PORT  = process.env.PORT || 8000;
const KEY   = process.env.GEMINI_API_KEY || "";
const MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".ico": "image/x-icon", ".png": "image/png", ".svg": "image/svg+xml" };

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/actions") return handleApi(req, res, "actions");
  if (req.method === "POST" && req.url === "/api/run")     return handleApi(req, res, "run");
  if (req.method === "POST" && req.url === "/api/chat")    return handleApi(req, res, "chat");
  serveStatic(req, res);
});

function serveStatic(req, res) {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const file = path.join(__dirname, path.normalize(p));
  if (!file.startsWith(__dirname)) { res.writeHead(403); return res.end("forbidden"); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",   // dev demo — always serve fresh, avoid stale-cache confusion
    });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = ""; req.on("data", (c) => (b += c));
    req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch { resolve({}); } });
  });
}

async function handleApi(req, res, kind) {
  const body = await readBody(req);
  const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (!KEY) { console.warn(`[api/${kind}] no GEMINI_API_KEY set → fallback`); return send(503, { error: "no_key" }); }

  const prompt = kind === "actions" ? actionsPrompt(body.label)
    : kind === "chat" ? chatPrompt(body.text)
    : runPrompt(body.action, body.label);
  try {
    const text = await callGemini(prompt, body.image, kind === "actions");
    if (kind === "actions") {
      const actions = parseActions(text);
      console.log(`[api/actions] ok → ${actions.map((a) => a.label).join(", ") || "(none parsed)"}`);
      return send(200, { actions });
    }
    console.log(`[api/run] ok`);
    return send(200, { text: text.trim() });
  } catch (e) {
    console.error(`[api/${kind}] Gemini error: ${(e && e.message) || e}`);
    return send(502, { error: String((e && e.message) || e) });
  }
}

function actionsPrompt(label) {
  return `You are the UI of smart AR glasses. The user is looking at an object (detector guess: "${label || "unknown"}"). ` +
    `Look at the image and suggest exactly 3 short, genuinely useful actions for THIS specific object. ` +
    `Tailor them to what it actually is: text/sign -> Translate; landmark/artwork -> Identify; product -> Shop; book -> Summarize; food -> Recipe; plant/animal -> Identify. ` +
    `Each action: a 1-2 word "label" and one "icon" emoji. Respond ONLY as a JSON array: [{"label":"Translate","icon":"🌐"}, ...].`;
}
function runPrompt(action, label) {
  return `You are smart AR glasses. The user chose the action "${action}" on the object in this image (detector guess: "${label || "unknown"}"). ` +
    `Perform that action and answer in ONE short, direct sentence (max ~25 words). ` +
    `If translating, give the translation. If identifying, name it specifically. Plain text only, no markdown.`;
}
function chatPrompt(text) {
  return `You are Snap AI, a helpful assistant built into smart AR glasses. The user may be looking at the scene in the image. ` +
    `Reply to their message conversationally and concisely — 1 to 2 short sentences, plain text only, no markdown. ` +
    `Message: "${text || ""}".`;
}

function callGemini(prompt, imageB64, wantJson) {
  return new Promise((resolve, reject) => {
    const parts = [{ text: prompt }];
    if (imageB64) parts.push({ inline_data: { mime_type: "image/jpeg", data: imageB64 } });
    const payload = {
      contents: [{ parts }],
      generationConfig: Object.assign(
        { temperature: 0.4, maxOutputTokens: 400 },
        wantJson ? { responseMimeType: "application/json" } : {}
      ),
    };
    const data = JSON.stringify(payload);
    const opts = {
      hostname: "generativelanguage.googleapis.com",
      path: `/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
    };
    const r = https.request(opts, (resp) => {
      let b = ""; resp.on("data", (c) => (b += c));
      resp.on("end", () => {
        try {
          const j = JSON.parse(b);
          if (j.error) return reject(new Error(j.error.message || "gemini error"));
          const text = (j.candidates && j.candidates[0] && j.candidates[0].content &&
            j.candidates[0].content.parts.map((p) => p.text).join("")) || "";
          resolve(text);
        } catch (e) { reject(e); }
      });
    });
    r.on("error", reject);
    r.write(data); r.end();
  });
}

function parseActions(text) {
  try {
    const arr = JSON.parse(text);
    if (Array.isArray(arr)) {
      return arr.filter((a) => a && a.label)
        .map((a) => ({ label: String(a.label).slice(0, 18), icon: a.icon || "✨" }))
        .slice(0, 4);
    }
  } catch (_) {}
  return [];
}

server.listen(PORT, () => {
  console.log(`\nSpectra AI → http://localhost:${PORT}`);
  console.log(`Gemini key: ${KEY ? "set ✓  (model: " + MODEL + ")" : "MISSING — running in fallback mode"}\n`);
});
