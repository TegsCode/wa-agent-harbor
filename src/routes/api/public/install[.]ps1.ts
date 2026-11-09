import { createFileRoute } from "@tanstack/react-router";
import { INSTALL_PS1 } from "@/lib/setup-scripts";

export const Route = createFileRoute("/api/public/install.ps1")({
  server: {
    handlers: {
      GET: async () => new Response(INSTALL_PS1, { headers: { "content-type": "text/plain; charset=utf-8" } }),
    },
  },
});
