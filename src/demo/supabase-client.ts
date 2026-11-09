// Demo replacement for "@/integrations/supabase/client" in the static (Pages) build.
// Exposes the same surface the app uses, backed by localStorage instead of PostgREST.
import { auth, DemoQuery } from "./store";

type ChangeHandler = (payload: unknown) => void;

class DemoChannel {
  private handlers: { event: string; filter: Record<string, any>; cb: ChangeHandler }[] = [];
  constructor(public name: string) {}
  on(_type: string, filter: Record<string, any>, cb: ChangeHandler) {
    this.handlers.push({ event: String(filter?.event ?? "INSERT"), filter, cb });
    return this;
  }
  subscribe(cb?: (status: string) => void) {
    cb?.("SUBSCRIBED");
    return this;
  }
  unsubscribe() {
    this.handlers = [];
    return this;
  }
}

const channels = new Set<DemoChannel>();

export const supabase = {
  from(table: string) {
    return new DemoQuery(table);
  },
  auth,
  channel(name: string) {
    const ch = new DemoChannel(name);
    channels.add(ch);
    return ch;
  },
  removeChannel(ch: DemoChannel) {
    channels.delete(ch);
  },
  removeAllChannels() {
    for (const ch of channels) ch.unsubscribe();
    channels.clear();
  },
  storage: {
    from: () => ({
      upload: async () => ({ data: null, error: { message: "Storage is not available in the static demo" } }),
      getPublicUrl: () => ({ data: { publicUrl: "" } }),
    }),
  },
  functions: {
    invoke: async () => ({ data: null, error: { message: "Edge functions are not available in the static demo" } }),
  },
};

export function createClient() {
  return supabase;
}

export default supabase;
