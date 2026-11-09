import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { CopyBlock } from "@/components/CopyBlock";
import { useAccounts } from "@/lib/wa/queries";
import { createAgentKey } from "@/lib/wa/wa.functions";
import { ALL_ACTIONS } from "@/lib/agent/permissions";

export const Route = createFileRoute("/_authenticated/agents")({
  head: () => ({
    meta: [
      { title: "Agent Keys — WhatsApp Agent Hub" },
      { name: "description", content: "Create scoped API keys and MCP configs for AI agents." },
      { property: "og:title", content: "Agent Keys — WhatsApp Agent Hub" },
      { property: "og:description", content: "Create scoped API keys and MCP configs for AI agents." },
    ],
  }),
  component: AgentsPage,
});

const ACTION_LABEL: Record<string, string> = { read: "Read chats & history", send: "Send messages", contacts: "List & create contacts", groups: "List & inspect groups" };

function AgentsPage() {
  const qc = useQueryClient();
  const { data: accounts = [] } = useAccounts();
  const create = useServerFn(createAgentKey);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [actions, setActions] = useState<string[]>(["read"]);
  const [accIds, setAccIds] = useState<string[]>([]);
  const [chats, setChats] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const { data: keys = [] } = useQuery({
    queryKey: ["keys"],
    queryFn: async () => (await supabase.from("agent_keys").select("id, name, key_prefix, actions, account_ids, allowed_chats, last_used_at, revoked_at, created_at").order("created_at", { ascending: false })).data ?? [],
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await create({ data: { name, actions, account_ids: accIds, allowed_chats: chats.split(",").map((s) => s.trim()).filter(Boolean) } });
      setRevealed(r.key); setOpen(false); setName(""); setChats("");
      qc.invalidateQueries({ queryKey: ["keys"] });
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
  }

  async function revoke(id: string) {
    await supabase.from("agent_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id);
    toast.success("Key revoked"); qc.invalidateQueries({ queryKey: ["keys"] });
  }

  const key = revealed ?? "wa_live_YOUR_KEY";
  const mcpUrl = `${origin}/api/public/mcp`;
  const claude = JSON.stringify({ mcpServers: { "whatsapp-agent-hub": { command: "npx", args: ["-y", "mcp-remote", mcpUrl, "--header", "Authorization:Bearer ${WA_KEY}"], env: { WA_KEY: key } } } }, null, 2);
  const cursor = JSON.stringify({ mcpServers: { "whatsapp-agent-hub": { url: mcpUrl, headers: { Authorization: `Bearer ${key}` } } } }, null, 2);
  const curl = `# List tools\ncurl ${origin}/api/public/agent/tools -H "Authorization: Bearer ${key}"\n\n# Send a message\ncurl -X POST ${origin}/api/public/agent/send_message \\\n  -H "Authorization: Bearer ${key}" -H "Content-Type: application/json" \\\n  -d '{"to":"14155550123","text":"Hello from my agent"}'\n\n# Other tools: list_accounts, get_chats, get_messages, list_contacts,\n# create_contact, list_groups, get_group_info`;

  return (
    <div>
      <PageHeader title="Agent Keys" description="Scoped access for Claude, Cursor and remote bots over MCP or REST." actions={<Button onClick={() => setOpen(true)}><Plus className="mr-1 size-4" />New key</Button>} />
      <div className="space-y-8 p-6">
        {keys.length === 0 ? (
          <EmptyState icon={KeyRound} title="No agent keys" description="Create a key to let an AI agent read or send WhatsApp messages." action={<Button onClick={() => setOpen(true)}>Create key</Button>} />
        ) : (
          <div className="grid gap-3">
            {keys.map((k) => (
              <div key={k.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{k.name} {k.revoked_at && <Badge variant="destructive">revoked</Badge>}</div>
                  <div className="font-mono text-xs text-muted-foreground">{k.key_prefix}… · {k.account_ids.length ? `${k.account_ids.length} account(s)` : "all accounts"}{k.allowed_chats.length ? ` · ${k.allowed_chats.length} chats` : ""} · last used {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "never"}</div>
                </div>
                <div className="flex gap-1">{k.actions.map((a) => <Badge key={a} variant="secondary">{a}</Badge>)}</div>
                {!k.revoked_at && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => revoke(k.id)}>Revoke</Button>}
              </div>
            ))}
          </div>
        )}
        <div className="rounded-xl border bg-card p-5">
          <h2 className="mb-3 text-lg font-bold">Connect an agent</h2>
          <Tabs defaultValue="claude">
            <TabsList><TabsTrigger value="claude">Claude Desktop</TabsTrigger><TabsTrigger value="cursor">Cursor / MCP clients</TabsTrigger><TabsTrigger value="rest">REST (curl)</TabsTrigger></TabsList>
            <TabsContent value="claude"><p className="mb-2 text-sm text-muted-foreground">Add to claude_desktop_config.json, then restart Claude.</p><CopyBlock code={claude} /></TabsContent>
            <TabsContent value="cursor"><p className="mb-2 text-sm text-muted-foreground">Add to ~/.cursor/mcp.json (or any client supporting remote MCP with headers).</p><CopyBlock code={cursor} /></TabsContent>
            <TabsContent value="rest"><CopyBlock code={curl} /></TabsContent>
          </Tabs>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>New agent key</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <Input required placeholder="Name, e.g. Claude support bot" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="space-y-2"><Label>Permissions</Label>
              {ALL_ACTIONS.map((a) => (
                <label key={a} className="flex items-center gap-2 text-sm"><Checkbox checked={actions.includes(a)} onCheckedChange={(c) => setActions(c ? [...actions, a] : actions.filter((x) => x !== a))} /><span className="font-mono">{a}</span> — {ACTION_LABEL[a]}</label>
              ))}
            </div>
            <div className="space-y-2"><Label>Target accounts (none selected = all)</Label>
              {accounts.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm"><Checkbox checked={accIds.includes(a.id)} onCheckedChange={(c) => setAccIds(c ? [...accIds, a.id] : accIds.filter((x) => x !== a.id))} />{a.label}</label>
              ))}
            </div>
            <div className="space-y-1.5"><Label>Allowed chats (optional)</Label><Input placeholder="14155550123, 120363…@g.us" value={chats} onChange={(e) => setChats(e.target.value)} /></div>
            <Button className="w-full">Create key</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!revealed} onOpenChange={(o) => !o && setRevealed(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Copy your key now</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">It won't be shown again. The configs below now include it.</p>
          <CopyBlock code={revealed ?? ""} />
          <CopyBlock code={claude} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
