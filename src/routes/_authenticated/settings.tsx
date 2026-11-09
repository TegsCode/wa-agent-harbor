import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import { BridgeForm } from "@/components/BridgeForm";
import { SetupInstructions } from "@/components/SetupComputerDialog";
import { useMe } from "@/lib/wa/queries";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — WhatsApp Agent Hub" },
      { name: "description", content: "Team members, invites and bridge configuration." },
      { property: "og:title", content: "Settings — WhatsApp Agent Hub" },
      { property: "og:description", content: "Team members, invites and bridge configuration." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [email, setEmail] = useState("");
  const { data: members = [] } = useQuery({ queryKey: ["members"], queryFn: async () => (await supabase.from("user_roles").select("*").order("created_at")).data ?? [] });
  const { data: invites = [] } = useQuery({ queryKey: ["invites"], queryFn: async () => (await supabase.from("team_invites").select("*").order("created_at")).data ?? [] });

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("team_invites").insert({ email: email.trim().toLowerCase(), invited_by: me?.id });
    if (error) return toast.error(error.message);
    toast.success(`${email} can now sign up`); setEmail(""); qc.invalidateQueries({ queryKey: ["invites"] });
  }

  return (
    <div>
      <PageHeader title="Settings" />
      <div className="p-6">
        <Tabs defaultValue="team">
          <TabsList><TabsTrigger value="team">Team</TabsTrigger><TabsTrigger value="bridge">Bridge</TabsTrigger><TabsTrigger value="setup">Set up this computer</TabsTrigger></TabsList>
          <TabsContent value="team" className="space-y-6">
            <div className="rounded-xl border bg-card p-5">
              <h2 className="mb-3 font-bold">Members</h2>
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between border-b py-2 last:border-0"><span>{m.email}</span><Badge variant={m.role === "admin" ? "default" : "secondary"}>{m.role}</Badge></div>
              ))}
            </div>
            <div className="rounded-xl border bg-card p-5">
              <h2 className="mb-3 font-bold">Invites</h2>
              {me?.isAdmin ? (
                <form onSubmit={invite} className="mb-3 flex gap-2"><Input type="email" required placeholder="coworker@company.com" value={email} onChange={(e) => setEmail(e.target.value)} /><Button>Invite member</Button></form>
              ) : <p className="mb-3 text-sm text-muted-foreground">Only admins can invite.</p>}
              {invites.length === 0 && <p className="text-sm text-muted-foreground">No pending invites.</p>}
              {invites.map((i) => (
                <div key={i.email} className="flex items-center justify-between border-b py-2 last:border-0"><span>{i.email}</span>{me?.isAdmin && <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { await supabase.from("team_invites").delete().eq("email", i.email); qc.invalidateQueries({ queryKey: ["invites"] }); }}>Remove</Button>}</div>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="bridge"><div className="rounded-xl border bg-card p-5"><BridgeForm /></div></TabsContent>
          <TabsContent value="setup"><div className="rounded-xl border bg-card p-5"><SetupInstructions /></div></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
