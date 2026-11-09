// Static-demo backend used by the GitHub Pages build (vite --mode pages).
// It mirrors the tiny slice of PostgREST the app touches, but stores everything in
// localStorage so the whole dashboard works without a server, Supabase or a WAHA bridge.
import { buildDemoSeed, demoPhone } from "@/lib/wa/demo";

export type Row = Record<string, any>;

const DB_KEY = "wa-hub-demo-db-v2";
const SESSION_KEY = "wa-hub-demo-session-v2";
const SIGNOUT_KEY = "wa-hub-demo-signed-out";

export const DEMO_USER = { id: "demo-user-0001", email: "demo@wa-agent-hub.app" };

export type DemoUser = { id: string; email: string; created_at: string };

const TABLES = [
  "wa_accounts",
  "contacts",
  "wa_messages",
  "wa_groups",
  "bridge_settings",
  "agent_keys",
  "agent_requests",
  "user_roles",
  "team_invites",
] as const;

type Data = Record<string, Row[]>;

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

const now = () => new Date().toISOString();

function emptyData(): Data {
  const data: Data = {};
  for (const t of TABLES) data[t] = [];
  data.bridge_settings = [{ id: 1, bridge_url: null, bridge_api_key: null, updated_at: now() }];
  return data;
}

function seedFirstRun(): Data {
  const data = emptyData();
  const account: Row = {
    id: "demo-account-0001",
    label: "Demo Sales Line",
    instance_name: "demo-sales",
    phone_number: "15551234567",
    status: "connected",
    is_demo: true,
    created_by: DEMO_USER.id,
    created_at: now(),
  };
  data.wa_accounts.push(account);

  const seed = buildDemoSeed(account.id);
  data.contacts = seed.contacts.map((c: Row) => ({ id: uid(), ...c, created_at: now() }));
  data.wa_groups = seed.groups.map((g: Row) => ({ id: uid(), ...g, created_at: now() }));
  data.wa_messages = seed.messages.map((m: Row) => ({ id: uid(), ...m }));

  data.user_roles = [{ id: uid(), user_id: DEMO_USER.id, role: "admin", created_at: now() }];

  const key: Row = {
    id: "demo-key-0001",
    name: "Claude Desktop",
    key_prefix: "wa_live_demo…",
    key_hash: "demo",
    actions: ["read_messages", "send_message", "list_contacts"],
    account_ids: [account.id],
    allowed_chats: [],
    last_used_at: now(),
    revoked_at: null,
    created_by: DEMO_USER.id,
    created_at: now(),
  };
  data.agent_keys.push(key);

  data.agent_requests = [
    { id: uid(), key_id: key.id, tool: "list_chats", ok: true, error: null, created_at: new Date(Date.now() - 1000 * 60 * 42).toISOString() },
    { id: uid(), key_id: key.id, tool: "read_messages", ok: true, error: null, created_at: new Date(Date.now() - 1000 * 60 * 31).toISOString() },
    { id: uid(), key_id: key.id, tool: "send_message", ok: true, error: null, created_at: new Date(Date.now() - 1000 * 60 * 12).toISOString() },
    { id: uid(), key_id: key.id, tool: "delete_contact", ok: false, error: "Missing permission: delete_contact", created_at: new Date(Date.now() - 1000 * 60 * 9).toISOString() },
  ];

  return data;
}

interface Persisted {
  version: 2;
  data: Data;
}

let cache: Data | null = null;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function load(): Data {
  if (cache) return cache;
  const store = storage();
  if (store) {
    try {
      const raw = store.getItem(DB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Persisted;
        if (parsed?.data) {
          for (const t of TABLES) if (!Array.isArray(parsed.data[t])) parsed.data[t] = [];
          cache = parsed.data;
          return cache;
        }
      }
    } catch {
      /* corrupt payload — fall through to a fresh seed */
    }
  }
  cache = seedFirstRun();
  persist();
  return cache;
}

function persist() {
  if (!cache) return;
  const store = storage();
  if (!store) return;
  try {
    store.setItem(DB_KEY, JSON.stringify({ version: 2, data: cache }));
  } catch {
    /* quota — demo data is best-effort */
  }
}

export const db = {
  all(table: string): Row[] {
    return load()[table] ?? [];
  },
  write(table: string, rows: Row[]) {
    load()[table] = rows;
    persist();
  },
  reset() {
    cache = seedFirstRun();
    persist();
  },
};

/* ---------------------------------- auth ---------------------------------- */

type Subscription = { unsubscribe: () => void };
type AuthEvent = "INITIAL_SESSION" | "SIGNED_IN" | "SIGNED_OUT" | "USER_UPDATED";
type Listener = (event: AuthEvent, session: DemoSess | null) => void;

export interface DemoSess {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  refresh_token: string;
  user: DemoUser;
}

const listeners = new Set<Listener>();

function makeUser(email: string): DemoUser {
  return { id: DEMO_USER.id, email, created_at: now() };
}

function makeSession(email: string): DemoSess {
  const expires_at = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  return {
    access_token: `demo.${btoa(email).replace(/=+$/, "")}.${expires_at}`,
    token_type: "bearer",
    expires_in: 60 * 60 * 24 * 30,
    expires_at,
    refresh_token: "demo-refresh",
    user: makeUser(email),
  };
}

let session: DemoSess | null = null;
let restored = false;

function restore() {
  if (restored) return;
  restored = true;
  const store = storage();
  if (!store) return;
  if (store.getItem(SIGNOUT_KEY) === "1") return;
  const email = store.getItem(SESSION_KEY);
  session = makeSession(email || DEMO_USER.email);
}

function emit(event: AuthEvent) {
  for (const l of listeners) {
    try {
      l(event, session);
    } catch {
      /* listener errors must not break auth */
    }
  }
}

export const auth = {
  getUser: async () => {
    restore();
    return { data: { user: session?.user ?? null }, error: null };
  },
  getSession: async () => {
    restore();
    return { data: { session }, error: null };
  },
  getClaims: async (token?: string) => {
    restore();
    return { data: token || session ? { claims: { sub: DEMO_USER.id } } : null, error: null };
  },
  setSession: async (tokens: { access_token?: string; refresh_token?: string }) => {
    restore();
    session = makeSession(session?.user.email ?? DEMO_USER.email);
    const store = storage();
    store?.setItem(SESSION_KEY, session.user.email);
    store?.removeItem(SIGNOUT_KEY);
    emit("SIGNED_IN");
    return { data: { session, user: session.user }, error: null, ...tokens };
  },
  onAuthStateChange(cb: Listener) {
    restore();
    listeners.add(cb);
    setTimeout(() => cb(session ? "SIGNED_IN" : "INITIAL_SESSION", session), 0);
    const subscription: Subscription = { unsubscribe: () => listeners.delete(cb) };
    return { data: { subscription } };
  },
  signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
    restore();
    if (!email || !email.includes("@")) return { data: { user: null, session: null }, error: { message: "Enter a valid email address" } };
    if (!password || password.length < 6) return { data: { user: null, session: null }, error: { message: "Password must be at least 6 characters" } };
    session = makeSession(email.toLowerCase());
    const store = storage();
    store?.setItem(SESSION_KEY, session.user.email);
    store?.removeItem(SIGNOUT_KEY);
    emit("SIGNED_IN");
    return { data: { user: session.user, session }, error: null };
  },
  signUp: async ({ email, password }: { email: string; password: string; options?: Row }) => {
    restore();
    if (!email || !email.includes("@")) return { data: { user: null, session: null }, error: { message: "Enter a valid email address" } };
    if (!password || password.length < 6) return { data: { user: null, session: null }, error: { message: "Password must be at least 6 characters" } };
    // Demo mode auto-confirms so the account is usable immediately.
    session = makeSession(email.toLowerCase());
    const store = storage();
    store?.setItem(SESSION_KEY, session.user.email);
    store?.removeItem(SIGNOUT_KEY);
    emit("SIGNED_IN");
    return { data: { user: session.user, session }, error: null };
  },
  signOut: async () => {
    session = null;
    storage()?.setItem(SIGNOUT_KEY, "1");
    emit("SIGNED_OUT");
    return { error: null };
  },
  resetPasswordForEmail: async () => ({ data: {}, error: null }),
  updateUser: async () => ({ data: { user: session?.user ?? null }, error: null }),
};

export function isSignedOutExplicitly() {
  return storage()?.getItem(SIGNOUT_KEY) === "1";
}

export function clearExplicitSignOut() {
  restore();
  storage()?.removeItem(SIGNOUT_KEY);
  if (!session) session = makeSession(DEMO_USER.email);
  storage()?.setItem(SESSION_KEY, session.user.email);
  emit("SIGNED_IN");
}

/* -------------------------------- query layer ------------------------------- */

type Result = { data: any; error: { message: string } | null; count?: number | null };

type Filter = [column: string, value: any];

const matches = (row: Row, filters: Filter[]) =>
  filters.every(([col, val]) => {
    if (val === null) return row[col] === null || row[col] === undefined;
    return row[col] === val;
  });

const compare = (a: any, b: any) => {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  return a < b ? -1 : 1;
};

export class DemoQuery implements PromiseLike<Result> {
  private table: string;
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: any = null;
  private returning = false;
  private columns = "*";
  private countOpt: "exact" | "planned" | "estimated" | null = null;
  private head = false;
  private filters: Filter[] = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private limitN: number | null = null;
  private mode: "many" | "single" | "maybeSingle" = "many";
  private onConflict: string | null = null;

  constructor(table: string) {
    this.table = table;
  }

  select(columns?: string, opts?: { count?: "exact" | "planned" | "estimated"; head?: boolean }) {
    if (this.op === "select") {
      this.columns = columns ?? "*";
      this.countOpt = opts?.count ?? null;
      this.head = !!opts?.head;
    } else {
      this.returning = true;
      this.columns = columns ?? "*";
    }
    return this;
  }

  insert(payload: Row | Row[]) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }

  upsert(payload: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = "upsert";
    this.payload = payload;
    this.onConflict = opts?.onConflict ?? null;
    return this;
  }

  update(payload: Row) {
    this.op = "update";
    this.payload = payload;
    return this;
  }

  delete() {
    this.op = "delete";
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push([column, value]);
    return this;
  }

  in(column: string, values: any[]) {
    const set = new Set(values);
    // Encoded as a predicate via a marker filter handled in exec().
    this.filters.push([column, { __in: [...set] }]);
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: opts?.ascending !== false };
    return this;
  }

  limit(n: number) {
    this.limitN = n;
    return this;
  }

  single() {
    this.mode = "single";
    return this;
  }

  maybeSingle() {
    this.mode = "maybeSingle";
    return this;
  }

  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.exec()).then(onfulfilled, onrejected);
  }

  private filterRows(rows: Row[]): Row[] {
    return rows.filter((row) =>
      this.filters.every(([col, val]) => {
        if (val && typeof val === "object" && "__in" in val) return val.__in.includes(row[col]);
        if (val === null) return row[col] === null || row[col] === undefined;
        return row[col] === val;
      }),
    );
  }

  private shape(rows: Row[]): Result {
    let out = rows;
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      out = [...out].sort((a, b) => (ascending ? 1 : -1) * compare(a[column], b[column]));
    }
    if (this.limitN != null) out = out.slice(0, this.limitN);
    out = out.map((r) => this.expand(r));

    if (this.mode === "single") {
      if (out.length !== 1) {
        return { data: null, error: { message: out.length === 0 ? "No rows found" : "Multiple rows returned" }, count: null };
      }
      return { data: out[0], error: null, count: null };
    }
    if (this.mode === "maybeSingle") {
      return { data: out[0] ?? null, error: out.length > 1 ? { message: "Multiple rows returned" } : null, count: null };
    }
    return { data: out, error: null, count: this.countOpt ? out.length : null };
  }

  // "*, agent_keys(name)" — attach the related row so the audit log can show key names.
  private expand(row: Row): Row {
    const rel = /([a-z_]+)\(([a-z_]+)\)/.exec(this.columns || "");
    if (!rel) return row;
    const [, table, column] = rel;
    const fk = `${table.replace(/s$/, "")}_id`;
    const fkValue = row[fk] ?? row.key_id;
    if (!fkValue) return { ...row, [table]: null };
    const related = db.all(table).find((r) => r.id === fkValue);
    return { ...row, [table]: related ? { [column]: related[column] } : null };
  }

  private exec(): Result {
    const rows = db.all(this.table);
    const stamp = now();

    if (this.op === "select") {
      const found = this.filterRows(rows);
      if (this.head) return { data: null, error: null, count: found.length };
      return this.shape(found);
    }

    if (this.op === "insert") {
      const incoming: Row[] = Array.isArray(this.payload) ? this.payload : [this.payload];
      const inserted = incoming.map((r) => ({ id: r.id ?? uid(), created_at: r.created_at ?? stamp, ...r }));
      db.write(this.table, [...rows, ...inserted]);
      if (!this.returning) return { data: null, error: null, count: null };
      return this.shape(inserted);
    }

    if (this.op === "upsert") {
      const incoming: Row[] = Array.isArray(this.payload) ? this.payload : [this.payload];
      const conflictCols = this.onConflict ? this.onConflict.split(",").map((s) => s.trim()) : ["id"];
      const next = [...rows];
      const touched: Row[] = [];
      for (const raw of incoming) {
        const row = { id: raw.id ?? uid(), created_at: raw.created_at ?? stamp, ...raw };
        const idx = next.findIndex((existing) => conflictCols.every((c) => existing[c] === row[c]));
        if (idx >= 0) {
          next[idx] = { ...next[idx], ...row };
          touched.push(next[idx]);
        } else {
          next.push(row);
          touched.push(row);
        }
      }
      db.write(this.table, next);
      if (!this.returning) return { data: null, error: null, count: null };
      return this.shape(touched);
    }

    if (this.op === "update") {
      const updated: Row[] = [];
      const next = rows.map((row) => {
        if (!matches(row, this.filters)) return row;
        const merged = { ...row, ...this.payload };
        updated.push(merged);
        return merged;
      });
      db.write(this.table, next);
      if (!this.returning) return { data: null, error: null, count: null };
      return this.shape(updated);
    }

    // delete
    const removed = rows.filter((row) => !matches(row, this.filters));
    db.write(this.table, removed);
    return { data: null, error: null, count: rows.length - removed.length };
  }
}

/* --------------------------------- helpers -------------------------------- */

export function insertRow(table: string, row: Row): Row {
  const record = { id: row.id ?? uid(), created_at: row.created_at ?? now(), ...row };
  db.write(table, [...db.all(table), record]);
  return record;
}

export function updateRows(table: string, patch: Row, filters: Filter[]): Row[] {
  const updated: Row[] = [];
  const next = db.all(table).map((row) => {
    if (!matches(row, filters)) return row;
    const merged = { ...row, ...patch };
    updated.push(merged);
    return merged;
  });
  db.write(table, next);
  return updated;
}

export function deleteRows(table: string, filters: Filter[]): Row[] {
  const removed = db.all(table).filter((row) => matches(row, filters));
  db.write(table, db.all(table).filter((row) => !matches(row, filters)));
  return removed;
}

export function findRow(table: string, filters: Filter[]): Row | null {
  return db.all(table).find((row) => matches(row, filters)) ?? null;
}

export function findRows(table: string, filters: Filter[]): Row[] {
  return db.all(table).filter((row) => matches(row, filters));
}

export { demoPhone, uid, now as timestamp };
