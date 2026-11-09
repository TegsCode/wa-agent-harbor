// Demo replacement for "@/lib/wa/wa.functions" in the static (Pages) build.
// Same call shape as the server functions ({ data } => result) so `useServerFn` keeps working,
// but every handler runs in the browser against the localStorage demo store.
// If a WAHA bridge is configured (Settings → Bridge), the pairing/chats calls are made
// directly to WAHA from the browser (WAHA returns `Access-Control-Allow-Origin: *`),
// so a real WhatsApp number can be paired from GitHub Pages.
import { buildDemoSeed } from "@/lib/wa/demo";
import { normalizeChatId } from "@/lib/agent/permissions";
import { DEMO_USER, deleteRows, db, demoPhone, findRow, findRows, insertRow, timestamp, updateRows, type Row } from "./store";

type Args<T> = { data: T };
const notFound = () => new Error("Account not found");

type Bridge = { url: string; key: string | null };

function getBridge(): Bridge | null {
  const row = db.all("bridge_settings")[0];
  const url = (row?.bridge_url as string | null)?.trim();
  if (!url) return null;
  return { url: url.replace(/\/+$/, ""), key: row?.bridge_api_key || null };
}

async function bridgeFetch(b: Bridge, path: string, init: RequestInit = {}): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body) headers.set("content-type", "application/json");
  if (b.key) headers.set("X-Api-Key", b.key);
  const res = await fetch(`${b.url}${path}`, { ...init, headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Bridge responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

const useBridge = (account: Row, b: Bridge | null): b is Bridge => !account.is_demo && !!b;

const tsToIso = (ts: unknown) =>
  typeof ts === "number" ? new Date(ts < 1e12 ? ts * 1000 : ts).toISOString() : new Date().toISOString();

function loadAccount(id: string): Row {
  const account = findRow("wa_accounts", [["id", id]]);
  if (!account) throw notFound();
  return account;
}

function seedDemoAccount(account: Row) {
  const existing = findRows("wa_messages", [["account_id", account.id]]);
  if (existing.length) return;
  // Reuse the same fixture generator the real (Supabase) demo mode uses.
  const seed = buildDemoSeed(account.id);
  db.write("contacts", [
    ...db.all("contacts"),
    ...seed.contacts.map((c: Row) => ({ id: crypto.randomUUID(), created_at: timestamp(), ...c })),
  ]);
  db.write("wa_groups", [
    ...db.all("wa_groups"),
    ...seed.groups.map((g: Row) => ({ id: crypto.randomUUID(), created_at: timestamp(), ...g })),
  ]);
  db.write("wa_messages", [
    ...db.all("wa_messages"),
    ...seed.messages.map((m: Row) => ({ id: crypto.randomUUID(), ...m })),
  ]);
}

// (buildDemoSeed is imported from "@/lib/wa/demo" at the top of this module.)

/* -------------------------------- accounts -------------------------------- */

export async function createAccount({ data }: Args<{ label: string }>) {
  const label = (data.label || "WhatsApp").trim();
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "wa";
  const instance = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
  const bridge = getBridge();
  if (bridge) {
    try {
      // No-op if the session already exists — WAHA ignores duplicates gracefully.
      await bridgeFetch(bridge, "/api/sessions", { method: "POST", body: JSON.stringify({ name: instance, start: true }) }).catch(() => null);
    } catch {
      /* best effort; status polling will surface real errors */
    }
  }
  return insertRow("wa_accounts", {
    label,
    instance_name: instance,
    phone_number: null,
    status: "pairing",
    is_demo: !bridge,
    created_by: DEMO_USER.id,
  });
}

export async function getQr({ data }: Args<{ id: string }>) {
  const account = loadAccount(data.id);
  const bridge = getBridge();
  if (useBridge(account, bridge)) {
    const qr = (await bridgeFetch(bridge, `/api/${account.instance_name}/auth/qr?format=image`)) as {
      mimetype?: string;
      data?: string;
      qrcode?: string;
      qr?: string;
    };
    const raw = (qr?.qrcode ?? qr?.qr ?? qr?.data) as string | undefined;
    if (!raw) throw new Error("QR not available yet — try again in a moment");
    return { kind: "image" as const, value: raw.startsWith("data:") ? raw : `data:${qr?.mimetype ?? "image/png"};base64,${raw}` };
  }
  // No live WAHA session exists, so there is no real WhatsApp pairing code to show.
  // `demo` tells the UI to show a labelled placeholder instead of a fake QR,
  // which WhatsApp would reject with "Invalid QR code".
  return { kind: "demo" as const, value: "" };
}

export async function refreshStatus({ data }: Args<{ id: string }>) {
  const account = loadAccount(data.id);
  const bridge = getBridge();
  if (!useBridge(account, bridge)) return account;
  const s = (await bridgeFetch(bridge, `/api/sessions/${account.instance_name}`)) as {
    status?: string;
    me?: { id?: string; pushName?: string };
  };
  const status = s?.status === "WORKING" ? "connected" : s?.status === "SCAN_QR_CODE" || s?.status === "STARTING" ? "pairing" : "disconnected";
  const phone = s?.me?.id ? String(s.me.id).split("@")[0] : account.phone_number;
  const [row] = updateRows("wa_accounts", { status, phone_number: phone }, [["id", account.id]]);
  return row ?? account;
}

export async function simulateScan({ data }: Args<{ id: string }>) {
  const account = loadAccount(data.id);
  const [row] = updateRows(
    "wa_accounts",
    { status: "connected", phone_number: account.phone_number ?? demoPhone() },
    [["id", account.id]],
  );
  seedDemoAccount(row ?? account);
  return row ?? account;
}

export async function reconnectAccount({ data }: Args<{ id: string }>) {
  const account = loadAccount(data.id);
  const bridge = getBridge();
  if (useBridge(account, bridge)) {
    await bridgeFetch(bridge, `/api/sessions/${account.instance_name}/restart`, { method: "POST" }).catch(() =>
      bridgeFetch(bridge, "/api/sessions", { method: "POST", body: JSON.stringify({ name: account.instance_name, start: true }) }),
    );
  }
  updateRows("wa_accounts", { status: "pairing" }, [["id", data.id]]);
  return { ok: true };
}

export async function deleteAccount({ data }: Args<{ id: string }>) {
  const account = loadAccount(data.id);
  const bridge = getBridge();
  if (useBridge(account, bridge)) {
    await bridgeFetch(bridge, `/api/sessions/${account.instance_name}`, { method: "DELETE" }).catch(() => null);
  }
  deleteRows("wa_accounts", [["id", data.id]]);
  for (const table of ["contacts", "wa_messages", "wa_groups"]) deleteRows(table, [["account_id", data.id]]);
  return { ok: true };
}

/* --------------------------------- chats ---------------------------------- */

export interface ChatSummary {
  id: string;
  name: string;
  isGroup: boolean;
  lastMessage: string;
  lastAt: string;
  unread: number;
}

function listChats(account: Row, limit = 30): ChatSummary[] {
  const rows = findRows("wa_messages", [["account_id", account.id]]).sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at)),
  );
  const map = new Map<string, ChatSummary>();
  for (const m of rows) {
    let chat = map.get(m.chat_id);
    if (!chat) {
      chat = {
        id: m.chat_id,
        name: m.chat_name ?? String(m.chat_id).split("@")[0],
        isGroup: !!m.is_group,
        lastMessage: m.body,
        lastAt: m.created_at,
        unread: 0,
      };
      map.set(m.chat_id, chat);
    }
    if (!m.from_me && !m.is_read) chat.unread++;
  }
  return [...map.values()].slice(0, limit);
}

export async function fetchChats({ data }: Args<{ accountId: string }>) {
  const account = loadAccount(data.accountId);
  const bridge = getBridge();
  if (useBridge(account, bridge)) {
    const rows = (await bridgeFetch(bridge, `/api/${account.instance_name}/chats/overview?limit=100`)) as any[];
    return (rows ?? []).map((c) => ({
      id: String(c.id),
      name: c.name ?? String(c.id).split("@")[0],
      isGroup: String(c.id).endsWith("@g.us"),
      lastMessage: c.lastMessage?.body ?? "",
      lastAt: tsToIso(c.lastMessage?.timestamp),
      unread: Number(c.unreadCount ?? 0),
    }));
  }
  return listChats(account, 100);
}

export async function fetchMessages({ data }: Args<{ accountId: string; chatId: string }>) {
  const account = loadAccount(data.accountId);
  const id = normalizeChatId(data.chatId);
  const bridge = getBridge();
  if (useBridge(account, bridge)) {
    const rows = (await bridgeFetch(
      bridge,
      `/api/${account.instance_name}/chats/${encodeURIComponent(id)}/messages?limit=100&downloadMedia=false`,
    )) as any[];
    return (rows ?? [])
      .map((m) => ({
        id: String(m.id),
        chatId: id,
        fromMe: !!m.fromMe,
        author: m.fromMe ? null : (m._data?.notifyName ?? m.from ?? null),
        body: m.body ?? "",
        status: m.ack >= 3 ? "read" : m.ack === 2 ? "delivered" : "sent",
        createdAt: tsToIso(m.timestamp),
      }))
      .sort((a: Row, b: Row) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }
  const rows = findRows("wa_messages", [
    ["account_id", account.id],
    ["chat_id", id],
  ])
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .slice(-100);
  updateRows("wa_messages", { is_read: true }, [
    ["account_id", account.id],
    ["chat_id", id],
  ]);
  return rows.map((m) => ({
    id: m.id,
    chatId: m.chat_id,
    fromMe: !!m.from_me,
    author: m.author,
    body: m.body,
    status: m.status,
    createdAt: m.created_at,
  }));
}

export async function sendFromDashboard({ data }: Args<{ accountId: string; chatId: string; text: string }>) {
  const account = loadAccount(data.accountId);
  if (account.status !== "connected") throw new Error("Account is not connected");
  if (!data.text?.trim()) throw new Error("Message is empty");
  const chatId = normalizeChatId(data.chatId);
  const typed = data.text.trim();
  const bridge = getBridge();
  if (useBridge(account, bridge)) {
    await bridgeFetch(bridge, "/api/sendText", {
      method: "POST",
      body: JSON.stringify({ session: account.instance_name, chatId, text: typed }),
    });
  }
  const phone = chatId.split("@")[0];
  const contact = findRow("contacts", [
    ["account_id", account.id],
    ["phone", phone],
  ]);
  const group = findRow("wa_groups", [
    ["account_id", account.id],
    ["jid", chatId],
  ]);
  const row = insertRow("wa_messages", {
    account_id: account.id,
    chat_id: chatId,
    chat_name: group?.name ?? contact?.name ?? phone,
    is_group: chatId.endsWith("@g.us"),
    from_me: true,
    author: null,
    body: typed,
    status: "sent",
    is_read: true,
    sent_by_agent: null,
  });
  return {
    id: row.id,
    chatId,
    fromMe: true,
    author: null,
    body: row.body,
    status: "sent",
    createdAt: row.created_at,
  };
}

export async function fetchGroupInfo({ data }: Args<{ accountId: string; jid: string }>) {
  const account = loadAccount(data.accountId);
  const jid = normalizeChatId(data.jid);
  const bridge = getBridge();
  if (useBridge(account, bridge)) {
    const g = (await bridgeFetch(bridge, `/api/${account.instance_name}/groups/${encodeURIComponent(jid)}`)) as any;
    if (!g) return null;
    const gid = typeof g.id === "string" ? g.id : (g.id?._serialized ?? g.JID ?? "");
    const parts: any[] = g.participants ?? g.groupMetadata?.participants ?? g.Participants ?? [];
    return {
      jid: gid,
      name: g.name ?? g.subject ?? g.Name ?? gid,
      description: g.description ?? g.desc ?? g.Topic ?? null,
      participants: parts.map((p) => ({
        id: typeof p.id === "string" ? p.id : (p.id?._serialized ?? p.JID ?? ""),
        name: p.name ?? (typeof p.id === "string" ? p.id.split("@")[0] : ""),
        admin: !!(p.isAdmin || p.isSuperAdmin || p.IsAdmin || p.admin),
      })),
    };
  }
  const g = findRow("wa_groups", [
    ["account_id", account.id],
    ["jid", jid],
  ]);
  if (!g) return null;
  return { jid: g.jid, name: g.name, description: g.description, participants: g.participants ?? [] };
}

export async function importContacts({ data }: Args<{ accountId: string }>) {
  const account = loadAccount(data.accountId);
  const bridge = getBridge();
  if (useBridge(account, bridge)) {
    const list = (await bridgeFetch(bridge, `/api/contacts/all?session=${account.instance_name}`)) as any[];
    let imported = 0;
    for (const c of list ?? []) {
      if (typeof c.id !== "string" || !c.id.endsWith("@c.us")) continue;
      const phone = c.id.split("@")[0];
      if (findRow("contacts", [["account_id", account.id], ["phone", phone]])) continue;
      insertRow("contacts", { account_id: account.id, phone, name: c.name ?? c.pushname ?? null, tags: [], notes: "" });
      imported++;
    }
    return { imported };
  }
  const chats = listChats(account, 200).filter((c) => !c.isGroup);
  let imported = 0;
  for (const chat of chats) {
    const phone = chat.id.split("@")[0];
    const existing = findRow("contacts", [
      ["account_id", account.id],
      ["phone", phone],
    ]);
    if (existing) continue;
    insertRow("contacts", { account_id: account.id, phone, name: chat.name, tags: [], notes: "" });
    imported++;
  }
  return { imported };
}

/* -------------------------------- bridge ---------------------------------- */

export async function testBridge({ data }: Args<{ url: string; key: string }>) {
  const url = (data.url || "").trim().replace(/\/+$/, "");
  const key = (data.key || "").trim() || null;
  if (!/^https?:\/\//.test(url)) return { ok: false, message: "URL must start with http:// or https://" };
  const started = Date.now();
  try {
    const v = (await bridgeFetch({ url, key }, "/api/server/version").catch(() =>
      bridgeFetch({ url, key }, "/api/sessions"),
    )) as { version?: string; engine?: string } | null;
    const label = v && !Array.isArray(v) && (v as any).version ? `WAHA ${(v as any).version}` : (v as any)?.engine ?? "Bridge";
    return { ok: true, message: `Bridge responded in ${Date.now() - started}ms · ${label}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Bridge unreachable" };
  }
}

/* ------------------------------- agent keys -------------------------------- */

export async function createAgentKey({
  data,
}: Args<{ name: string; actions: string[]; account_ids: string[]; allowed_chats: string[] }>) {
  if (!data.name?.trim()) throw new Error("Name is required");
  if (!data.actions?.length) throw new Error("Pick at least one permission");
  const secret = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const key = `wa_live_${secret}`;
  insertRow("agent_keys", {
    name: data.name.trim(),
    key_prefix: `${key.slice(0, 14)}…`,
    key_hash: secret,
    actions: data.actions,
    account_ids: data.account_ids ?? [],
    allowed_chats: data.allowed_chats ?? [],
    last_used_at: null,
    revoked_at: null,
    created_by: DEMO_USER.id,
  });
  return { key };
}
