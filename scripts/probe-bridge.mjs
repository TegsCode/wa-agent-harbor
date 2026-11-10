// Probes the WAHA bridge through the tunnel: session list, create, status, QR timing.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(process.env.USERPROFILE + "/wa-agent-bridge/.env", "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const KEY = env.WAHA_API_KEY.trim();
const BASE = process.argv[2] || "https://icon-new-involve-stem.trycloudflare.com";
const SESSION = process.argv[3] || "md-t7dci";

const headers = { "X-Api-Key": KEY };

async function timed(label, path, init = {}) {
  const t0 = Date.now();
  try {
    const res = await fetch(BASE + path, { ...init, headers: { ...headers, ...(init.body ? { "content-type": "application/json" } : {}), ...(init.headers || {}) } });
    const text = await res.text();
    const ms = Date.now() - t0;
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 120); }
    const summary = typeof parsed === "string" ? parsed : JSON.stringify(parsed).slice(0, 220);
    console.log(`${label}: ${res.status} in ${ms}ms -> ${summary}`);
    return { status: res.status, ms, body: parsed };
  } catch (e) {
    console.log(`${label}: NETWORK ERROR in ${Date.now() - t0}ms -> ${e.message}`);
    return { status: 0, error: e.message };
  }
}

await timed("sessions", "/api/sessions");
await timed("status(before)", `/api/sessions/${SESSION}`);
await timed("qr(before)", `/api/${SESSION}/auth/qr?format=image`);
await timed("create", "/api/sessions", { method: "POST", body: JSON.stringify({ name: SESSION, start: true }) });
await timed("status(after)", `/api/sessions/${SESSION}`);
for (let i = 0; i < 6; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const r = await timed(`qr(try ${i + 1})`, `/api/${SESSION}/auth/qr?format=image`);
  if (r.status === 200) break;
}
await timed("sessions(final)", "/api/sessions");
