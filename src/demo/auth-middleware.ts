// Demo replacement for "@/integrations/supabase/auth-middleware" in the static build.
// The static demo has no server, so there is nothing to authenticate.
export const requireSupabaseAuth = {
  options: {},
  server: async ({ next }: { next: () => Promise<unknown> }) => next(),
};
