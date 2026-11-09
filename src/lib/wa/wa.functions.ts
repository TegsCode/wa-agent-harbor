import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  bridgeFetch,
  getBridge,
  getGroupInfo,
  getMessages,
  listChats,
  markRead,
  newDemoPhone,
  seedDemoAccount,
  sendMessage,
  type DB,
} from "./data.server";

async function loadAccount(db: DB, id: string) {
  const { data, error } = await db.from("wa_accounts").select("*").eq("id", id).single();
  if (error || !data) throw new Error("Account not found");
  return data;
}

const idInput = (i: { id: string }) => i;

export const createAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { label: string }) => i)
  .handler(async ({ data, context }) => {
    const db = context.supabase as DB;
    const bridge = await getBridge(db);
    const slug = data.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "wa";
    const instance = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
    if (bridge) {
      await bridgeFetch(bridge, "/api/sessions", {
        method: "POST",
        body: JSON.stringify({ name: instance, start: true }),
      });
    }
    const { data: row, error } = await db
      .from("wa_accounts")
      .insert({ label: data.label, instance_name: instance, created_by: context.userId, is_demo: !bridge, status: "pairing" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const getQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput)
  .handler(async ({ data, context }) => {
    const db = context.supabase as DB;
    const acc = await loadAccount(db, data.id);
    const bridge = await getBridge(db);
    if (acc.is_demo || !bridge) {
      // No live WAHA session exists, so there is no real WhatsApp pairing code to show.
      // Return `demo` so the UI can show a non-scannable placeholder instead of a fake
      // QR (a fake payload like `2@demo-…` is always rejected by WhatsApp as invalid).
      return { kind: "demo" as const, value: "" };
    }
    let qr: { mimetype?: string; data?: string; qrcode?: string; qr?: string };
    try {
      qr = (await bridgeFetch(bridge, `/api/${acc.instance_name}/auth/qr?format=image`)) as {
        mimetype?: string;
        data?: string;
        qrcode?: string;
        qr?: string;
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // WAHA replies 422 "Session status is not as expected … STARTING, expected [SCAN_QR_CODE]"
      // while the session is still booting. That is not a user error — ask to retry.
      if (/not as expected|STARTING|SCAN_QR_CODE/i.test(msg)) {
        throw new Error("WhatsApp is still starting up — retrying automatically, QR will appear in a few seconds.");
      }
      throw e;
    }
    // WAHA returns {mimetype, data} on newer versions, {qrcode: "data:…"} on older ones.
    const raw = qr?.qrcode ?? qr?.qr ?? qr?.data;
    if (!raw) throw new Error("WhatsApp is still starting up — retrying automatically, QR will appear in a few seconds.");
    const value = raw.startsWith("data:") ? raw : `data:${qr?.mimetype ?? "image/png"};base64,${raw}`;
    return { kind: "image" as const, value };
  });

export const refreshStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput)
  .handler(async ({ data, context }) => {
    const db = context.supabase as DB;
    const acc = await loadAccount(db, data.id);
    const bridge = await getBridge(db);
    if (acc.is_demo || !bridge) return acc;
    const s = (await bridgeFetch(bridge, `/api/sessions/${acc.instance_name}`)) as {
      status?: string;
      me?: { id?: string; pushName?: string };
    };
    const status = s?.status === "WORKING" ? "connected" : s?.status === "SCAN_QR_CODE" || s?.status === "STARTING" ? "pairing" : "disconnected";
    const phone = s?.me?.id ? s.me.id.split("@")[0] : acc.phone_number;
    const { data: row } = await db
      .from("wa_accounts")
      .update({ status, phone_number: phone })
      .eq("id", acc.id)
      .select()
      .single();
    return row ?? acc;
  });

export const simulateScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput)
  .handler(async ({ data, context }) => {
    const db = context.supabase as DB;
    const acc = await loadAccount(db, data.id);
    if (!acc.is_demo) throw new Error("Only demo accounts can simulate pairing");
    const { data: row, error } = await db
      .from("wa_accounts")
      .update({ status: "connected", phone_number: acc.phone_number ?? newDemoPhone() })
      .eq("id", acc.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await seedDemoAccount(db, row);
    return row;
  });

export const reconnectAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput)
  .handler(async ({ data, context }) => {
    const db = context.supabase as DB;
    const acc = await loadAccount(db, data.id);
    const bridge = await getBridge(db);
    if (!acc.is_demo && bridge) {
      await bridgeFetch(bridge, `/api/sessions/${acc.instance_name}/restart`, { method: "POST" }).catch(() =>
        bridgeFetch(bridge, `/api/sessions`, { method: "POST", body: JSON.stringify({ name: acc.instance_name, start: true }) }),
      );
    }
    await db.from("wa_accounts").update({ status: "pairing" }).eq("id", acc.id);
    return { ok: true };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput)
  .handler(async ({ data, context }) => {
    const db = context.supabase as DB;
    const acc = await loadAccount(db, data.id);
    const bridge = await getBridge(db);
    if (!acc.is_demo && bridge) {
      await bridgeFetch(bridge, `/api/sessions/${acc.instance_name}`, { method: "DELETE" }).catch(() => null);
    }
    const { error } = await db.from("wa_accounts").delete().eq("id", acc.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const fetchChats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { accountId: string }) => i)
  .handler(async ({ data, context }) => {
    const db = context.supabase as DB;
    return listChats(db, await loadAccount(db, data.accountId), 100);
  });

export const fetchMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { accountId: string; chatId: string }) => i)
  .handler(async ({ data, context }) => {
    const db = context.supabase as DB;
    const acc = await loadAccount(db, data.accountId);
    const msgs = await getMessages(db, acc, data.chatId, 100);
    await markRead(db, acc, data.chatId);
    return msgs;
  });

export const sendFromDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { accountId: string; chatId: string; text: string }) => {
    if (!i.text?.trim()) throw new Error("Message is empty");
    return i;
  })
  .handler(async ({ data, context }) => {
    const db = context.supabase as DB;
    return sendMessage(db, await loadAccount(db, data.accountId), data.chatId, data.text.trim());
  });

export const fetchGroupInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { accountId: string; jid: string }) => i)
  .handler(async ({ data, context }) => {
    const db = context.supabase as DB;
    return getGroupInfo(db, await loadAccount(db, data.accountId), data.jid);
  });

export const importContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { accountId: string }) => i)
  .handler(async ({ data, context }) => {
    const db = context.supabase as DB;
    const acc = await loadAccount(db, data.accountId);
    const bridge = await getBridge(db);
    let rows: { account_id: string; phone: string; name: string | null }[] = [];
    if (!acc.is_demo && bridge) {
      const list = (await bridgeFetch(bridge, `/api/contacts/all?session=${acc.instance_name}`)) as any[];
      rows = (list ?? [])
        .filter((c) => typeof c.id === "string" && c.id.endsWith("@c.us"))
        .map((c) => ({ account_id: acc.id, phone: c.id.split("@")[0], name: c.name ?? c.pushname ?? null }));
    } else {
      const chats = await listChats(db, acc, 200);
      rows = chats.filter((c) => !c.isGroup).map((c) => ({ account_id: acc.id, phone: c.id.split("@")[0], name: c.name }));
    }
    if (rows.length) await db.from("contacts").upsert(rows, { onConflict: "account_id,phone", ignoreDuplicates: true });
    return { imported: rows.length };
  });

export const testBridge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { url: string; key: string }) => i)
  .handler(async ({ data }) => {
    const url = data.url.trim().replace(/\/+$/, "");
    if (!/^https?:\/\//.test(url)) return { ok: false, message: "URL must start with http:// or https://" };
    const started = Date.now();
    try {
      const v = (await bridgeFetch({ url, key: data.key || null }, "/api/server/version").catch(() =>
        bridgeFetch({ url, key: data.key || null }, "/api/sessions"),
      )) as { version?: string; engine?: string } | null;
      return { ok: true, message: `Bridge responded in ${Date.now() - started}ms${v && !Array.isArray(v) && v.version ? ` · WAHA ${v.version}` : ""}` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Bridge unreachable" };
    }
  });

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const createAgentKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { name: string; actions: string[]; account_ids: string[]; allowed_chats: string[] }) => {
    if (!i.name?.trim()) throw new Error("Name is required");
    if (!i.actions?.length) throw new Error("Pick at least one permission");
    return i;
  })
  .handler(async ({ data, context }) => {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const secret = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    const key = `wa_live_${secret}`;
    const { error } = await context.supabase.from("agent_keys").insert({
      name: data.name.trim(),
      key_prefix: key.slice(0, 14),
      key_hash: await sha256Hex(key),
      actions: data.actions,
      account_ids: data.account_ids,
      allowed_chats: data.allowed_chats,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { key };
  });
