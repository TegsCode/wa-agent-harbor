import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/_authenticated/logs")({
  head: () => ({
    meta: [
      { title: "Audit Logs — WhatsApp Agent Hub" },
      { name: "description", content: "Real-time audit trail of every AI agent call." },
      { property: "og:title", content: "Audit Logs — WhatsApp Agent Hub" },
      { property: "og:description", content: "Real-time audit trail of every AI agent call." },
    ],
  }),
  component: LogsPage,
});

function LogsPage() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["logs"],
    queryFn: async () => (await supabase.from("agent_requests").select("*, agent_keys(name)").order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  useEffect(() => {
    const ch = supabase
      .channel(`logs-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_requests" }, () => qc.invalidateQueries({ queryKey: ["logs"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return (
    <div>
      <PageHeader title="Audit Logs" description="Every agent request, live." />
      <div className="p-6">
        {data.length === 0 ? (
          <EmptyState icon={ScrollText} title="No agent calls yet" description="Calls made with your agent keys will appear here in real time." />
        ) : (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Key</TableHead><TableHead>Tool</TableHead><TableHead>Result</TableHead><TableHead>Error</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell>{r.agent_keys?.name ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.tool}</TableCell>
                    <TableCell>{r.ok ? <Badge className="bg-success text-success-foreground">ok</Badge> : <Badge variant="destructive">rejected</Badge>}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.error}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
