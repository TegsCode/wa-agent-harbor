// Shared WAHA session payload (used by both the server functions and the
// static Pages build, so it must stay dependency-free).
//
// NOWEB is the no-browser engine. Chat and contact endpoints refuse to answer
// unless the on-disk store is enabled *at session creation time*:
//   400 Enable NOWEB store "config.noweb.store.enabled=True" ...
// `fullSync` pulls the whole history instead of only new messages.
// Both names are accepted as `fullSync` / `full_sync`; WAHA reads `fullSync`.
export const NOWEB_STORE_CONFIG = {
  noweb: { store: { enabled: true, fullSync: true } },
} as const;

/** Body for `POST /api/sessions` — create *and* start with history enabled. */
export function sessionCreateBody(name: string) {
  return { name, start: true, config: NOWEB_STORE_CONFIG };
}

/** Body for `PUT /api/sessions/<name>` — apply the store to an existing session. */
export function sessionConfigBody() {
  return { config: NOWEB_STORE_CONFIG };
}

type Call = (path: string, init?: RequestInit) => Promise<unknown>;

/**
 * Busted-session repair.
 *
 * When the engine dies (WAHA restart, a network drop mid-handshake, DNS hiccup)
 * WAHA can sit in a state where `GET /api/sessions/<name>` says `FAILED` while
 * `POST /api/sessions/<name>/start` answers "Session is already running". That
 * session never recovers on its own and every later call 422s with "Session
 * status is not as expected".
 *
 * `PUT config` and `/restart` are both no-ops in that state — only an explicit
 * stop->start clears it.
 */
export async function reviveSession(name: string, call: Call): Promise<{ status: string | null; revived: boolean }> {
  const read = async () => {
    const s = (await call(`/api/sessions/${name}`)) as { status?: string } | null;
    return s?.status ?? null;
  };
  let status: string | null = null;
  try {
    status = await read();
  } catch {
    return { status: null, revived: false }; // no such session — the caller should create it
  }
  if (status !== "FAILED") return { status, revived: false };
  await call(`/api/sessions/${name}/stop`, { method: "POST", body: "{}" }).catch(() => null);
  await call(`/api/sessions/${name}/start`, { method: "POST", body: "{}" }).catch(() => null);
  return { status: "STARTING", revived: true };
}
