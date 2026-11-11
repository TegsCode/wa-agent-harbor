// End-to-end pressure test for the WAHA bridge used by WhatsApp Agent Hub.
//   node scripts/pressure-test.mjs [baseUrl] [session]
// Defaults: http://localhost:3000 and $env:WAHA_TEST_SESSION || "mrs-muna-fckr1".
// Exercises every endpoint the dashboard and the agent gateway call, in the same
// order the UI does, and prints PASS/FAIL with timings.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.env.USERPROFILE ?? process.env.HOME ?? ".", "wa-agent-bridge/.env");
const KEY = (readFileSync(envPath, "utf8").match(/WAHA_API_KEY=(.*)/)?.[1] ?? "").trim();
const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/+$/, "");
const SESSION = process.argv[3] ?? process.env.WAHA_TEST_SESSION ?? "mrs-muna-fckr1";

let pass = 0;
let fail = 0;
const rows = [];

function rec(name, ok, detail) {
  ok ? pass++ : fail++;
  rows.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(34)} ${detail}`);
}

async function call(path, init = {}) {
  const started = Date.now();
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      "X-Api-Key": KEY,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(40000),
  });
  const ms = Date.now() - started;
  const type = res.headers.get("content-type") ?? "";
  const body = type.includes("json") || type.startsWith("text/") ? await res.text() : await res.arrayBuffer();
  return { status: res.status, ms, type, body };
}

async function expectJson(name, path, { ok = [200], check, init } = {}) {
  try {
    const r = await call(path, init);
    const text = typeof r.body === "string" ? r.body : "";
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON */
    }
    const statusOk = ok.includes(r.status);
    const checkOk = statusOk && (!check || check(parsed, r));
    rec(name, checkOk, `${r.status} ${r.ms}ms ${checkOk ? "" : text.slice(0, 120)}`);
    return { ...r, json: parsed, ok: checkOk };
  } catch (e) {
    rec(name, false, `NETWORK ${e instanceof Error ? e.message : e}`);
    return { ok: false };
  }
}

/** The engine needs ~60-90s after a restart; the UI should wait, not error. */
async function waitWorking(maxMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const r = await call(`/api/sessions/${SESSION}`);
    if (r.status === 200) {
      const s = JSON.parse(String(r.body));
      if (["WORKING", "SCAN_QR_CODE", "FAILED", "STOPPED"].includes(s.status)) return s;
    }
    await new Promise((res) => setTimeout(res, 3000));
  }
  return null;
}

console.log(`\nBridge pressure test → ${BASE} (session ${SESSION})\n`);

/* ---- 1. identity / connectivity (Settings → Bridge "Test connection") ---- */
const version = await expectJson("GET /api/server/version", "/api/server/version", {
  check: (j) => !!j?.version && !!j?.engine,
});
const engineOk = version.json?.engine === "NOWEB";
rec("engine is NOWEB", engineOk, `engine=${version.json?.engine} tier=${version.json?.tier}`);

const sessions = await expectJson("GET /api/sessions", "/api/sessions", { check: Array.isArray });
const known = Array.isArray(sessions.json) && sessions.json.some((s) => s.name === SESSION);
rec(`session "${SESSION}" exists`, known, known ? "" : `got ${JSON.stringify(sessions.json)?.slice(0, 120)}`);

/* ---- 2. account status (Accounts → Refresh) ---- */
const status = await expectJson("GET /api/sessions/{s}", `/api/sessions/${SESSION}`, {
  check: (j) => typeof j?.status === "string",
});
if (status.json?.status === "STARTING") {
  const settled = await waitWorking();
  rec("session settles to WORKING (<120s)", settled?.status === "WORKING", `settled=${settled?.status ?? "timeout"}`);
  if (settled) status.json = { ...status.json, ...settled };
}
const working = status.json?.status === "WORKING";
rec("session is WORKING", working, `status=${status.json?.status}`);
rec("session has a linked number", !!status.json?.me?.id, `me=${status.json?.me?.id ?? "none"}`);
rec("NOWEB store enabled", !!status.json?.config?.noweb?.store?.enabled, JSON.stringify(status.json?.config?.noweb?.store ?? {}));

/* ---- 3. QR endpoint (Accounts → QR) ---- */
const qr = await call(`/api/${SESSION}/auth/qr?format=image`);
// A paired session legitimately refuses a QR (422 "already authorized"). Both
// outcomes prove the endpoint answers; an unreachable bridge would throw.
rec("GET /api/{s}/auth/qr", qr.status === 200 || qr.status === 422, `${qr.status} ${qr.ms}ms ${qr.type}`);

/* ---- 4. Chats (Chats page) ---- */
const chats = await expectJson("GET /api/{s}/chats/overview", `/api/${SESSION}/chats/overview?limit=50`, {
  check: Array.isArray,
});
const chatCount = chats.json?.length ?? 0;
rec("chats overview returns rows", chatCount > 0, `${chatCount} chats`);
const firstChat = chats.json?.[0];
rec("chat rows are shaped for the UI", !!firstChat?.id && "lastMessage" in (firstChat ?? {}), JSON.stringify(Object.keys(firstChat ?? {})).slice(0, 100));

/* ---- 5. Messages (Chats → open conversation) ---- */
let messagesOk = false;
if (firstChat?.id) {
  const msgs = await expectJson("GET /api/{s}/chats/{id}/messages", `/api/${SESSION}/chats/${encodeURIComponent(firstChat.id)}/messages?limit=20`, {
    check: Array.isArray,
  });
  messagesOk = Array.isArray(msgs.json);
  rec("messages return rows", (msgs.json?.length ?? 0) > 0, `${msgs.json?.length ?? 0} messages`);
}

/* ---- 6. Contacts (Contacts → Import) ---- */
const contacts = await expectJson("GET /api/contacts/all", `/api/contacts/all?session=${SESSION}`, { check: Array.isArray });
const contactCount = contacts.json?.length ?? 0;
rec("contacts return rows", contactCount > 0, `${contactCount} contacts`);
const cUsOnly = (contacts.json ?? []).filter((c) => String(c.id ?? "").endsWith("@c.us")).length;
rec("contacts include @c.us ids (importable)", cUsOnly > 0, `${cUsOnly} importable`);

/* ---- 7. Send (Chats → Send, agent send_message) ---- */
const meId = status.json?.me?.id ?? "";
if (meId) {
  const text = `Agent Hub pressure test ${new Date().toISOString()}`;
  const sent = await expectJson("POST /api/sendText", "/api/sendText", {
    ok: [200, 201],
    check: (j) => !!(j?._data?.id || j?.id || j?.key?.id),
    init: { method: "POST", body: JSON.stringify({ session: SESSION, chatId: meId, text }) },
  });
  rec("sendText returns a message id", !!sent.json, (sent.json && (sent.json.id ?? sent.json._data?.id ?? "id?")) || "");

  // Verify it actually landed in the thread.
  await new Promise((r) => setTimeout(r, 3000));
  const back = await expectJson("GET sent message back", `/api/${SESSION}/chats/${encodeURIComponent(meId)}/messages?limit=5`, {
    check: Array.isArray,
  });
  const found = (back.json ?? []).some((m) => String(m.body ?? "").includes("pressure test"));
  rec("sent message is readable back", found, found ? "round-trip ok" : "not found in last 5");
} else {
  rec("sendText skipped", false, "no linked number");
}

/* ---- 8. Groups (Chats → group panel, agent list_groups/get_group_info) ---- */
const groupChat = (chats.json ?? []).find((c) => String(c.id).endsWith("@g.us"));
if (groupChat) {
  const g = await expectJson("GET /api/{s}/groups/{id}", `/api/${SESSION}/groups/${encodeURIComponent(groupChat.id)}`, {
    check: (j) => Array.isArray(j?.participants),
  });
  rec("group info has participants", (g.json?.participants?.length ?? 0) > 0, `${g.json?.participants?.length ?? 0} participants`);
} else {
  rec("group info skipped", true, "no group chats");
}

/* ---- 9. Restart path used by Accounts → Reconnect ---- */
const put = await expectJson("PUT /api/sessions/{s} (store config)", `/api/sessions/${SESSION}`, {
  ok: [200],
  check: (j) => !!j?.name,
  init: { method: "PUT", body: JSON.stringify({ config: { noweb: { store: { enabled: true, fullSync: true } } } }) },
});

/* ---- 10. Latency budget ---- */
const slow = rows.filter((r) => {
  const m = /(\d+)ms/.exec(r.detail);
  return m && Number(m[1]) > 5000;
});
rec("all calls under 5s", slow.length === 0, slow.length ? slow.map((s) => s.name).join(", ") : "ok");

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exitCode = 1;
