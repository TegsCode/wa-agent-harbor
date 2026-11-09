// Demo replacement for "@/lib/wa/wa.functions" in the static (Pages) build.
// Same call shape as the server functions ({ data } => result) so `useServerFn` keeps working,
// but every handler runs in the browser against the localStorage demo store.
import { buildDemoSeed } from "@/lib/wa/demo";
import { normalizeChatId } from "@/lib/agent/permissions";
import { DEMO_USER, deleteRows, db, demoPhone, findRow, findRows, insertRow, timestamp, updateRows, type Row } from "./store";

type Args<T> = { data: T };
const notFound = () => new Error("Account not found");

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
  return insertRow("wa_accounts", {
    label,
    instance_name: `${slug}-${Math.random().toString(36).slice(2, 7)}`,
    phone_number: null,
    status: "pairing",
    is_demo: true,
    created_by: DEMO_USER.id,
  });
}

export async function getQr({ data }: Args<{ id: string }>) {
  loadAccount(data.id);
  // Static Pages build has no WAHA bridge, so no real pairing code exists.
  // `demo` tells the UI to show a labelled placeholder (not a scannable fake QR,
  // which WhatsApp would reject with "Invalid QR code").
  return { kind: "demo" as const, value: "" };
}

export async function refreshStatus({ data }: Args<{ id: string }>) {
  return loadAccount(data.id);
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
  loadAccount(data.id);
  updateRows("wa_accounts", { status: "pairing" }, [["id", data.id]]);
  return { ok: true };
}

export async function deleteAccount({ data }: Args<{ id: string }>) {
  loadAccount(data.id);
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
  return listChats(loadAccount(data.accountId), 100);
}

export async function fetchMessages({ data }: Args<{ accountId: string; chatId: string }>) {
  const account = loadAccount(data.accountId);
  const id = normalizeChatId(data.chatId);
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
    body: data.text.trim(),
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
  const g = findRow("wa_groups", [
    ["account_id", account.id],
    ["jid", jid],
  ]);
  if (!g) return null;
  return { jid: g.jid, name: g.name, description: g.description, participants: g.participants ?? [] };
}

export async function importContacts({ data }: Args<{ accountId: string }>) {
  const account = loadAccount(data.accountId);
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
  if (!/^https?:\/\//.test(url)) return { ok: false, message: "URL must start with http:// or https://" };
  return {
    ok: true,
    message: "Demo mode: bridge responses are simulated on this static build (no network call made).",
  };
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
