// Demo replacement for "@/integrations/lovable" in the static (Pages) build.
export const lovable = {
  auth: {
    signInWithOAuth: async () => ({
      error: new Error("Google sign-in is not wired up in the static demo — use any email + password (6+ characters)."),
      redirected: false,
    }),
  },
};
