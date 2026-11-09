// Static build for GitHub Pages: `npm run build:pages`.
//
// TanStack Start runs in SPA mode (no SSR, no server functions), and the modules that
// normally talk to Supabase / the WAHA bridge are aliased to the localStorage-backed demo
// backend in src/demo/. The result in .output/public is plain HTML + JS + CSS that can be
// served from any static host, including a GitHub Pages project site.
import { fileURLToPath } from "node:url";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Project-site URL is https://<user>.github.io/wa-agent-harbor/
export const PAGES_BASE = "/wa-agent-harbor/";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
    spa: { enabled: true, maskPath: "/" },
    router: { basepath: PAGES_BASE.replace(/\/$/, "") },
  },
  // No Cloudflare Worker / Nitro output for a static site.
  nitro: false,
  vite: {
    base: PAGES_BASE,
    define: {
      "import.meta.env.VITE_DEMO_MODE": JSON.stringify("true"),
    },
    resolve: {
      alias: [
        { find: "@/integrations/supabase/client", replacement: here("./src/demo/supabase-client.ts") },
        { find: "@/integrations/supabase/auth-middleware", replacement: here("./src/demo/auth-middleware.ts") },
        { find: "@/integrations/lovable", replacement: here("./src/demo/lovable.ts") },
        { find: "@/lib/wa/wa.functions", replacement: here("./src/demo/wa-functions.ts") },
      ],
    },
  },
});
