import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, LayoutGrid, Plus, Table2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { AccountPicker } from "@/components/AccountPicker";
import { importContacts } from "@/lib/wa/wa.functions";

export const Route = createFileRoute("/_authenticated/contacts")({
  head: () => ({
    meta: [
      { title: "Contacts — WhatsApp Agent Hub" },
      { name: "description", content: "Address book per WhatsApp account with tags and notes." },
      { property: "og:title", content: "Contacts — WhatsApp Agent Hub" },
      { property: "og:description", content: "Address book per WhatsApp account with tags and notes." },
    ],
  }),
  component: ContactsPage,
});

type Edit = { id?: string; phone: string; name: string; notes: string; tags: string };

function ContactsPage() {
  const [accountId, setAccountId] = useState("");
  const [view, setView] = useState<"table" | "cards">("table");
  const [edit, setEdit] = useState<Edit | null>(null);
  const qc = useQueryClient();
  const imp = useServerFn(importContacts);
  const { data = [] } = useQuery({
    queryKey: ["contacts", accountId],
    enabled: !!accountId,
    queryFn: async () => (await supabase.from("contacts").select("*").eq("account_id", accountId).order("name")).data ?? [],
  });
  const reload = () => qc.invalidateQueries({ queryKey: ["contacts", accountId] });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    const row = { account_id: accountId, phone: edit.phone.replace(/\D/g, ""), name: edit.name || null, notes: edit.notes || null, tags: edit.tags.split(",").map((t) => t.trim()).filter(Boolean) };
    const { error } = edit.id ? await supabase.from("contacts").update(row).eq("id", edit.id) : await supabase.from("contacts").insert(row);
    if (error) return toast.error(error.message);
    toast.success("Contact saved"); setEdit(null); reload();
  }

  return (
    <div>
      <PageHeader title="Contacts" description="Address book for each WhatsApp account." actions={<>
        <AccountPicker value={accountId} onChange={setAccountId} />
        <Button variant="outline" size="icon" aria-label="Toggle view" onClick={() => setView(view === "table" ? "cards" : "table")}>{view === "table" ? <LayoutGrid className="size-4" /> : <Table2 className="size-4" />}</Button>
        <Button variant="outline" disabled={!accountId} onClick={async () => { try { const r = await imp({ data: { accountId } }); toast.success(`Imported ${r.imported} contacts`); reload(); } catch (e) { toast.error(e instanceof Error ? e.message : "Import failed"); } }}><Download className="mr-1 size-4" />Import</Button>
        <Button disabled={!accountId} onClick={() => setEdit({ phone: "", name: "", notes: "", tags: "" })}><Plus className="mr-1 size-4" />Add</Button>
      </>} />
      <div className="p-6">
        {data.length === 0 ? (
          <EmptyState icon={Users} title="No contacts" description="Add contacts manually or import them from the connected account." />
        ) : view === "table" ? (
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>Tags</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => setEdit({ id: c.id, phone: c.phone, name: c.name ?? "", notes: c.notes ?? "", tags: c.tags.join(", ") })}>
                    <TableCell className="font-semibold">{c.name ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">+{c.phone}</TableCell>
                    <TableCell><div className="flex gap-1">{c.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}</div></TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">{c.notes}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.map((c) => (
              <button key={c.id} className="rounded-xl border bg-card p-4 text-left hover:border-primary" onClick={() => setEdit({ id: c.id, phone: c.phone, name: c.name ?? "", notes: c.notes ?? "", tags: c.tags.join(", ") })}>
                <div className="font-bold">{c.name ?? "—"}</div>
                <div className="font-mono text-xs text-muted-foreground">+{c.phone}</div>
                <div className="mt-2 flex flex-wrap gap-1">{c.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}</div>
                <p className="mt-2 text-sm text-muted-foreground">{c.notes}</p>
              </button>
            ))}
          </div>
        )}
      </div>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? "Edit contact" : "Add contact"}</DialogTitle></DialogHeader>
          {edit && (
            <form onSubmit={save} className="space-y-3">
              <Input required placeholder="Phone (international)" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
              <Input placeholder="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              <Input placeholder="Tags, comma separated" value={edit.tags} onChange={(e) => setEdit({ ...edit, tags: e.target.value })} />
              <Textarea placeholder="Notes" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
              <Button className="w-full">Save</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
