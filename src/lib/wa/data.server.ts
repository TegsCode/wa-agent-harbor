// Shared WhatsApp data layer used by the dashboard (RLS client) and the agent gateway (admin client).
// Demo accounts read/write the database; bridge accounts talk to WAHA and mirror sent messages.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { normalizeChatId } from "@/lib/agent/permissions";
import { buildDemoSeed, demoPhone } from "./demo";

export type DB = SupabaseClient<Database>;
export type Account = Database["public"]["Tables"]["wa_accounts"]["Row"];
export type Bridge = { url: string; key: string | null };

export interface ChatSummary {
  id: string;
  name: string;
  isGroup: boolean;
  lastMessage: string;
  lastAt: string;
  unread: number;
}
export interface Message {
  id: string;
  chatId: string;
  fromMe: boolean;
  author: string | null;
  body: string;
  status: string;
  createdAt: string;
}
export interface GroupInfo {
  jid: string;
  name: string;
  description: string | null;
  participants: { id: string; name: string; admin: boolean }[];
}

export async function getBridge(db: DB): Promise<Bridge | null> {
  const { data } = await db.from("bridge_settings").select("bridge_url, bridge_api_key").eq("id", 1).maybeSingle();
  if (!data?.bridge_url) return null;
  return { url: data.bridge_url.replace(/\/+$/, ""), key: data.bridge_api_key };
}

export async function bridgeFetch(b: Bridge, path: string, init: RequestInit = {}): Promise<unknown> {
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

const useBridge = (account: Account, bridge: Bridge | null): bridge is Bridge => !account.is_demo && !!bridge;

const tsToIso = (ts: unknown) =>
  typeof ts === "number" ? new Date(ts < 1e12 ? ts * 1000 : ts).toISOString() : new Date().toISOString();

export async function listChats(db: DB, account: Account, limit = 30): Promise<ChatSummary[]> {
  const bridge = await getBridge(db);
  if (useBridge(account, bridge)) {
    const rows = (await bridgeFetch(bridge, `/api/${account.instance_name}/chats/overview?limit=${limit}`)) as any[];
    return (rows ?? []).map((c) => ({
      id: String(c.id),
      name: c.name ?? String(c.id).split("@")[0],
      isGroup: String(c.id).endsWith("@g.us"),
      lastMessage: c.lastMessage?.body ?? "",
      lastAt: tsToIso(c.lastMessage?.timestamp),
      unread: Number(c.unreadCount ?? 0),
    }));
  }
  const { data } = await db
    .from("wa_messages")
    .select("chat_id, chat_name, is_group, body, created_at, from_me, is_read")
    .eq("account_id", account.id)
    .order("created_at", { ascending: false })
    .limit(1000);
  const map = new Map<string, ChatSummary>();
  for (const m of data ?? []) {
    let c = map.get(m.chat_id);
    if (!c) {
      c = {
        id: m.chat_id,
        name: m.chat_name ?? m.chat_id.split("@")[0],
        isGroup: m.is_group,
        lastMessage: m.body,
        lastAt: m.created_at,
        unread: 0,
      };
      map.set(m.chat_id, c);
    }
    if (!m.from_me && !m.is_read) c.unread++;
  }
  return [...map.values()].slice(0, limit);
}

export async function getMessages(db: DB, account: Account, chatId: string, limit = 50): Promise<Message[]> {
  const id = normalizeChatId(chatId);
  const bridge = await getBridge(db);
  if (useBridge(account, bridge)) {
    const rows = (await bridgeFetch(
      bridge,
      `/api/${account.instance_name}/chats/${encodeURIComponent(id)}/messages?limit=${limit}&downloadMedia=false`,
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
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  const { data } = await db
    .from("wa_messages")
    .select("*")
    .eq("account_id", account.id)
    .eq("chat_id", id)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).reverse().map((m) => ({
    id: m.id,
    chatId: m.chat_id,
    fromMe: m.from_me,
    author: m.author,
    body: m.body,
    status: m.status,
    createdAt: m.created_at,
  }));
}

export async function markRead(db: DB, account: Account, chatId: string) {
  await db
    .from("wa_messages")
    .update({ is_read: true })
    .eq("account_id", account.id)
    .eq("chat_id", normalizeChatId(chatId))
    .eq("is_read", false);
}

export async function sendMessage(
  db: DB,
  account: Account,
  to: string,
  text: string,
  agentKeyId?: string,
): Promise<Message> {
  const chatId = normalizeChatId(to);
  const bridge = await getBridge(db);
  if (account.status !== "connected") throw new Error("Account is not connected");
  if (useBridge(account, bridge)) {
    await bridgeFetch(bridge, "/api/sendText", {
      method: "POST",
      body: JSON.stringify({ session: account.instance_name, chatId, text }),
    });
  }
  const [{ data: contact }, { data: group }] = await Promise.all([
    db.from("contacts").select("name").eq("account_id", account.id).eq("phone", chatId.split("@")[0]).maybeSingle(),
    db.from("wa_groups").select("name").eq("account_id", account.id).eq("jid", chatId).maybeSingle(),
  ]);
  const { data, error } = await db
    .from("wa_messages")
    .insert({
      account_id: account.id,
      chat_id: chatId,
      chat_name: group?.name ?? contact?.name ?? chatId.split("@")[0],
      is_group: chatId.endsWith("@g.us"),
      from_me: true,
      body: text,
      status: "sent",
      sent_by_agent: agentKeyId ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return {
    id: data.id,
    chatId,
    fromMe: true,
    author: null,
    body: text,
    status: "sent",
    createdAt: data.created_at,
  };
}

export async function listGroups(db: DB, account: Account): Promise<GroupInfo[]> {
  const bridge = await getBridge(db);
  if (useBridge(account, bridge)) {
    const raw = (await bridgeFetch(bridge, `/api/${account.instance_name}/groups`)) as any;
    const arr: any[] = Array.isArray(raw) ? raw : Object.values(raw ?? {});
    return arr.map(mapBridgeGroup);
  }
  const { data } = await db.from("wa_groups").select("*").eq("account_id", account.id).order("name");
  return (data ?? []).map((g) => ({
    jid: g.jid,
    name: g.name,
    description: g.description,
    participants: (g.participants as GroupInfo["participants"]) ?? [],
  }));
}

function mapBridgeGroup(g: any): GroupInfo {
  const jid = typeof g.id === "string" ? g.id : (g.id?._serialized ?? g.JID ?? "");
  const parts: any[] = g.participants ?? g.groupMetadata?.participants ?? g.Participants ?? [];
  return {
    jid,
    name: g.name ?? g.subject ?? g.Name ?? jid,
    description: g.description ?? g.desc ?? g.Topic ?? null,
    participants: parts.map((p) => ({
      id: typeof p.id === "string" ? p.id : (p.id?._serialized ?? p.JID ?? ""),
      name: p.name ?? (typeof p.id === "string" ? p.id.split("@")[0] : ""),
      admin: !!(p.isAdmin || p.isSuperAdmin || p.IsAdmin || p.admin),
    })),
  };
}

export async function getGroupInfo(db: DB, account: Account, jid: string): Promise<GroupInfo | null> {
  const id = normalizeChatId(jid);
  const bridge = await getBridge(db);
  if (useBridge(account, bridge)) {
    const g = await bridgeFetch(bridge, `/api/${account.instance_name}/groups/${encodeURIComponent(id)}`);
    return g ? mapBridgeGroup(g) : null;
  }
  return (await listGroups(db, account)).find((g) => g.jid === id) ?? null;
}

export async function seedDemoAccount(db: DB, account: Account) {
  const { count } = await db
    .from("wa_messages")
    .select("id", { count: "exact", head: true })
    .eq("account_id", account.id);
  if (count && count > 0) return;
  const seed = buildDemoSeed(account.id);
  await db.from("contacts").upsert(seed.contacts, { onConflict: "account_id,phone" });
  await db.from("wa_groups").upsert(seed.groups, { onConflict: "account_id,jid" });
  await db.from("wa_messages").insert(seed.messages);
}

export function newDemoPhone() {
  return demoPhone();
}
