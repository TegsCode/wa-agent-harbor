import { createFileRoute } from "@tanstack/react-router";
import { INSTALL_SH } from "@/lib/setup-scripts";

export const Route = createFileRoute("/api/public/install.sh")({
  server: {
    handlers: {
      GET: async () => new Response(INSTALL_SH, { headers: { "content-type": "text/x-shellscript; charset=utf-8" } }),
    },
  },
});
