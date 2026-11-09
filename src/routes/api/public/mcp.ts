import { createFileRoute } from "@tanstack/react-router";

// Minimal MCP (Streamable HTTP, JSON responses) server authenticated by agent API keys.
type RpcReq = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: any };

const rpcError = (id: RpcReq["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export const Route = createFileRoute("/api/public/mcp")({
  server: {
    handlers: {
      GET: async () => new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } }),
      DELETE: async () => new Response(null, { status: 204 }),
      POST: async ({ request }) => {
        const { authenticate, callTool, toolSchemas } = await import("@/lib/agent/gateway.server");
        const auth = await authenticate(request);
        if ("error" in auth) {
          return Response.json(rpcError(null, -32001, auth.error), { status: 401 });
        }
        let body: RpcReq | RpcReq[];
        try {
          body = await request.json();
        } catch {
          return Response.json(rpcError(null, -32700, "Parse error"), { status: 400 });
        }
        const handle = async (msg: RpcReq) => {
          if (msg.id === undefined) return null; // notification
          switch (msg.method) {
            case "initialize":
              return {
                jsonrpc: "2.0",
                id: msg.id,
                result: {
                  protocolVersion: msg.params?.protocolVersion ?? "2025-06-18",
                  capabilities: { tools: { listChanged: false } },
                  serverInfo: { name: "whatsapp-agent-hub", title: "WhatsApp Agent Hub", version: "1.0.0" },
                  instructions: `Tools for WhatsApp Agent Hub, authenticated as key "${auth.key.name}". Call list_accounts first.`,
                },
              };
            case "ping":
              return { jsonrpc: "2.0", id: msg.id, result: {} };
            case "tools/list":
              return { jsonrpc: "2.0", id: msg.id, result: { tools: toolSchemas() } };
            case "tools/call": {
              const out = await callTool(auth.db, auth.key, String(msg.params?.name ?? ""), msg.params?.arguments ?? {});
              return {
                jsonrpc: "2.0",
                id: msg.id,
                result: out.ok
                  ? { content: [{ type: "text", text: JSON.stringify(out.result, null, 2) }], structuredContent: out.result }
                  : { content: [{ type: "text", text: out.error }], isError: true },
              };
            }
            default:
              return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
          }
        };
        if (Array.isArray(body)) {
          const res = (await Promise.all(body.map(handle))).filter(Boolean);
          return res.length ? Response.json(res) : new Response(null, { status: 202 });
        }
        const res = await handle(body);
        return res ? Response.json(res) : new Response(null, { status: 202 });
      },
    },
  },
});
