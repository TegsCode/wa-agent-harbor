import { createFileRoute } from "@tanstack/react-router";

// REST gateway: POST /api/public/agent/<tool> with Authorization: Bearer wa_live_...
export const Route = createFileRoute("/api/public/agent/$tool")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { authenticate, callTool } = await import("@/lib/agent/gateway.server");
        const auth = await authenticate(request);
        if ("error" in auth) return Response.json({ ok: false, error: auth.error }, { status: 401 });
        let args: Record<string, unknown> = {};
        try {
          const text = await request.text();
          args = text ? JSON.parse(text) : {};
        } catch {
          return Response.json({ ok: false, error: "Body must be JSON" }, { status: 400 });
        }
        const out = await callTool(auth.db, auth.key, params.tool, args);
        return Response.json(out, { status: out.ok ? 200 : 403 });
      },
      GET: async ({ request, params }) => {
        if (params.tool !== "tools") return Response.json({ error: "Use POST" }, { status: 405 });
        const { authenticate, toolSchemas } = await import("@/lib/agent/gateway.server");
        const auth = await authenticate(request);
        if ("error" in auth) return Response.json({ ok: false, error: auth.error }, { status: 401 });
        return Response.json({ tools: toolSchemas() });
      },
    },
  },
});
