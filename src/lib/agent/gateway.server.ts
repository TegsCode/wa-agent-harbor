// Agent gateway: API-key auth, permission checks, tool execution and audit logging.
// Shared by the REST endpoint and the MCP endpoint.
import { checkAccess, type AgentAction } from "./permissions";
import {
  getGroupInfo,
  getMessages,
  listChats,
  listGroups,
  sendMessage,
  type Account,
  type DB,
} from "@/lib/wa/data.server";

type KeyRow = {
  id: string;
  name: string;
  actions: string[];
  account_ids: string[];
  allowed_chats: string[];
  revoked_at: string | null;
};

type Args = Record<string, unknown>;

interface ToolDef {
  name: string;
  description: string;
  action: AgentAction | null;
  properties: Record<string, { type: string; description: string }>;
  required?: string[];
  run: (ctx: { db: DB; key: KeyRow }, args: Args) => Promise<unknown>;
}

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const num = (v: unknown, d: number, max: number) => Math.min(Math.max(Number(v) || d, 1), max);

const accountProp = { account_id: { type: "string", description: "WhatsApp account id (from list_accounts). Optional when only one is allowed." } };

async function resolveAccount(db: DB, key: KeyRow, accountId?: unknown): Promise<Account> {
  const id = str(accountId);
  let q = db.from("wa_accounts").select("*").order("created_at");
  if (id) q = q.eq("id", id);
  else if (key.account_ids.length) q = q.in("id", key.account_ids);
  const { data } = await q.limit(1);
  const acc = data?.[0];
  if (!acc) throw new Error(id ? "Account not found" : "No accessible account");
  const err = checkAccess(key, { accountId: acc.id });
  if (err) throw new Error(err);
  return acc;
}

function guardChat(key: KeyRow, chatId: string) {
  const err = checkAccess(key, { chatId });
  if (err) throw new Error(err);
}

export const TOOLS: ToolDef[] = [
  {
    name: "list_accounts",
    description: "List the WhatsApp accounts this key can access, with connection status.",
    action: null,
    properties: {},
    run: async ({ db, key }) => {
      let q = db.from("wa_accounts").select("id, label, phone_number, status, instance_name").order("created_at");
      if (key.account_ids.length) q = q.in("id", key.account_ids);
      const { data } = await q;
      return { accounts: data ?? [] };
    },
  },
  {
    name: "get_chats",
    description: "List recent conversations (private and group) for an account.",
    action: "read",
    properties: { ...accountProp, limit: { type: "number", description: "Max chats (default 20, max 100)." } },
    run: async ({ db, key }, a) => {
      const acc = await resolveAccount(db, key, a.account_id);
      let chats = await listChats(db, acc, num(a.limit, 20, 100));
      if (key.allowed_chats.length) chats = chats.filter((c) => checkAccess(key, { chatId: c.id }) === null);
      return { account_id: acc.id, chats };
    },
  },
  {
    name: "get_messages",
    description: "Fetch message history with a phone number or group JID.",
    action: "read",
    properties: {
      ...accountProp,
      chat_id: { type: "string", description: "Phone number (e.g. 14155550123) or JID (…@c.us / …@g.us)." },
      limit: { type: "number", description: "Max messages (default 30, max 200)." },
    },
    required: ["chat_id"],
    run: async ({ db, key }, a) => {
      const chat = str(a.chat_id);
      guardChat(key, chat);
      const acc = await resolveAccount(db, key, a.account_id);
      return { messages: await getMessages(db, acc, chat, num(a.limit, 30, 200)) };
    },
  },
  {
    name: "send_message",
    description: "Send a text message to a phone number or group JID.",
    action: "send",
    properties: {
      ...accountProp,
      to: { type: "string", description: "Recipient phone number or JID." },
      text: { type: "string", description: "Message text." },
    },
    required: ["to", "text"],
    run: async ({ db, key }, a) => {
      const to = str(a.to);
      const text = str(a.text).trim();
      if (!to || !text) throw new Error("'to' and 'text' are required");
      guardChat(key, to);
      const acc = await resolveAccount(db, key, a.account_id);
      return { sent: await sendMessage(db, acc, to, text, key.id) };
    },
  },
  {
    name: "list_contacts",
    description: "List address book contacts for an account.",
    action: "contacts",
    properties: { ...accountProp, search: { type: "string", description: "Optional name/phone filter." } },
    run: async ({ db, key }, a) => {
      const acc = await resolveAccount(db, key, a.account_id);
      let q = db.from("contacts").select("phone, name, notes, tags").eq("account_id", acc.id).order("name").limit(500);
      const s = str(a.search).replace(/[%,()]/g, "");
      if (s) q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%`);
      const { data } = await q;
      return { contacts: (data ?? []).filter((c) => checkAccess(key, { chatId: c.phone }) === null) };
    },
  },
  {
    name: "create_contact",
    description: "Create or update a contact in the address book.",
    action: "contacts",
    properties: {
      ...accountProp,
      phone: { type: "string", description: "Phone number in international format." },
      name: { type: "string", description: "Display name." },
      notes: { type: "string", description: "Optional notes." },
    },
    required: ["phone"],
    run: async ({ db, key }, a) => {
      const phone = str(a.phone).replace(/\D/g, "");
      if (!phone) throw new Error("'phone' is required");
      guardChat(key, phone);
      const acc = await resolveAccount(db, key, a.account_id);
      const { data, error } = await db
        .from("contacts")
        .upsert(
          { account_id: acc.id, phone, name: str(a.name) || null, notes: str(a.notes) || null },
          { onConflict: "account_id,phone" },
        )
        .select("phone, name, notes, tags")
        .single();
      if (error) throw new Error(error.message);
      return { contact: data };
    },
  },
  {
    name: "list_groups",
    description: "List WhatsApp groups the account belongs to.",
    action: "groups",
    properties: accountProp,
    run: async ({ db, key }, a) => {
      const acc = await resolveAccount(db, key, a.account_id);
      const groups = (await listGroups(db, acc)).filter((g) => checkAccess(key, { chatId: g.jid }) === null);
      return { groups: groups.map((g) => ({ jid: g.jid, name: g.name, participants: g.participants.length })) };
    },
  },
  {
    name: "get_group_info",
    description: "Get group details including participants and admins.",
    action: "groups",
    properties: { ...accountProp, jid: { type: "string", description: "Group JID (…@g.us)." } },
    required: ["jid"],
    run: async ({ db, key }, a) => {
      const jid = str(a.jid);
      guardChat(key, jid);
      const acc = await resolveAccount(db, key, a.account_id);
      const g = await getGroupInfo(db, acc, jid);
      if (!g) throw new Error("Group not found");
      return { group: g };
    },
  },
];

export function toolSchemas() {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description + (t.action ? ` Requires '${t.action}' permission.` : ""),
    inputSchema: { type: "object", properties: t.properties, required: t.required ?? [], additionalProperties: false },
  }));
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getAdmin(): Promise<DB> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
}

export async function authenticate(request: Request): Promise<{ db: DB; key: KeyRow } | { error: string }> {
  const auth = request.headers.get("authorization") ?? "";
  const raw = (auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : request.headers.get("x-api-key") ?? "").trim();
  if (!raw.startsWith("wa_live_")) return { error: "Missing or malformed API key" };
  const db = await getAdmin();
  const { data } = await db
    .from("agent_keys")
    .select("id, name, actions, account_ids, allowed_chats, revoked_at")
    .eq("key_hash", await sha256Hex(raw))
    .maybeSingle();
  if (!data) return { error: "Invalid API key" };
  if (data.revoked_at) return { error: "API key has been revoked" };
  return { db, key: data };
}

export async function callTool(db: DB, key: KeyRow, name: string, args: Args) {
  const tool = TOOLS.find((t) => t.name === name);
  let ok = false;
  let error: string | null = null;
  try {
    if (!tool) throw new Error(`Unknown tool '${name}'`);
    const denied = checkAccess(key, { action: tool.action ?? undefined });
    if (denied) throw new Error(denied);
    const result = await tool.run({ db, key }, args ?? {});
    ok = true;
    return { ok: true as const, result };
  } catch (e) {
    error = e instanceof Error ? e.message : "Tool failed";
    return { ok: false as const, error };
  } finally {
    await Promise.all([
      db.from("agent_requests").insert({ key_id: key.id, tool: name.slice(0, 64), ok, error }),
      db.from("agent_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id),
    ]);
  }
}
