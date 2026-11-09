import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { Plus, QrCode, RefreshCw, RotateCcw, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { useAccounts } from "@/lib/wa/queries";
import { createAccount, deleteAccount, getQr, reconnectAccount, refreshStatus, simulateScan } from "@/lib/wa/wa.functions";

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({
    meta: [
      { title: "Accounts — WhatsApp Agent Hub" },
      { name: "description", content: "Connect and manage WhatsApp numbers by QR code." },
      { property: "og:title", content: "Accounts — WhatsApp Agent Hub" },
      { property: "og:description", content: "Connect and manage WhatsApp numbers by QR code." },
    ],
  }),
  component: AccountsPage,
});

const statusClass: Record<string, string> = {
  connected: "bg-success text-success-foreground",
  pairing: "bg-warning text-warning-foreground",
  disconnected: "bg-destructive text-destructive-foreground",
};

function AccountsPage() {
  const { data: accounts = [] } = useAccounts();
  const qc = useQueryClient();
  const create = useServerFn(createAccount);
  const refresh = useServerFn(refreshStatus);
  const reconnect = useServerFn(reconnectAccount);
  const del = useServerFn(deleteAccount);
  const [label, setLabel] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [qrFor, setQrFor] = useState<string | null>(null);
  const reload = () => qc.invalidateQueries({ queryKey: ["accounts"] });

  async function run(fn: () => Promise<unknown>, ok?: string) {
    try {
      await fn();
      if (ok) toast.success(ok);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div>
      <PageHeader
        title="WhatsApp Accounts"
        description="Pair numbers via Linked Devices and monitor their status."
        actions={<Button onClick={() => setNewOpen(true)}><Plus className="mr-1 size-4" />Connect Account</Button>}
      />
      <div className="p-6">
        {accounts.length === 0 ? (
          <EmptyState icon={Smartphone} title="No accounts yet" description="Connect your first WhatsApp number to start chatting and give agents access." action={<Button onClick={() => setNewOpen(true)}>Connect Account</Button>} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {accounts.map((a) => (
              <div key={a.id} className="rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="grid size-11 place-items-center rounded-full bg-accent font-bold text-accent-foreground">{a.label.slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{a.label}</div>
                    <div className="font-mono text-xs text-muted-foreground">{a.phone_number ? `+${a.phone_number}` : a.instance_name}</div>
                  </div>
                  <Badge className={statusClass[a.status]}>{a.status}</Badge>
                </div>
                {a.is_demo && <p className="mt-2 text-xs text-muted-foreground">Demo account</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setQrFor(a.id)}><QrCode className="mr-1 size-3.5" />QR</Button>
                  <Button size="sm" variant="outline" onClick={() => run(() => reconnect({ data: { id: a.id } }), "Reconnecting").then(() => setQrFor(a.id))}><RotateCcw className="mr-1 size-3.5" />Reconnect</Button>
                  <Button size="sm" variant="outline" onClick={() => run(() => refresh({ data: { id: a.id } }), "Status refreshed")}><RefreshCw className="size-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => confirm(`Delete ${a.label}?`) && run(() => del({ data: { id: a.id } }), "Account deleted")}><Trash2 className="size-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Connect a WhatsApp account</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            try {
              const row = await create({ data: { label: label || "WhatsApp" } });
              setNewOpen(false); setLabel(""); reload(); setQrFor(row.id);
            } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
          }}>
            <Input placeholder='Label, e.g. "Sales Support +1…"' value={label} onChange={(e) => setLabel(e.target.value)} />
            <Button className="w-full">Generate QR code</Button>
          </form>
        </DialogContent>
      </Dialog>

      {qrFor && <QrDialog id={qrFor} onClose={() => { setQrFor(null); reload(); }} />}
    </div>
  );
}

function QrDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const qr = useServerFn(getQr);
  const refresh = useServerFn(refreshStatus);
  const scan = useServerFn(simulateScan);
  const { data: accounts = [] } = useAccounts();
  const acc = accounts.find((a) => a.id === id);
  const [code, setCode] = useState<{ kind: "text" | "image"; value: string } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const st = await refresh({ data: { id } });
        if (stop) return;
        if (st.status === "connected") { toast.success(`Paired ${st.label}`); onClose(); return; }
        setCode(await qr({ data: { id } })); setErr("");
      } catch (e) { setErr(e instanceof Error ? e.message : "QR unavailable"); }
    };
    tick();
    const t = setInterval(tick, 4000);
    return () => { stop = true; clearInterval(t); };
  }, [id]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Scan with WhatsApp</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">On your phone: WhatsApp → Settings → Linked Devices → Link a device.</p>
        <div className="grid place-items-center rounded-xl bg-bubble-in p-6">
          {code?.kind === "image" ? <img src={code.value} alt="WhatsApp QR code" className="size-64" /> : code ? <div className="rounded-lg bg-[#FFFFFF] p-3"><QRCodeSVG value={code.value} size={232} /></div> : <div className="size-64 animate-pulse rounded-lg bg-muted" />}
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <p className="text-center text-xs text-muted-foreground">Waiting for scan… status refreshes automatically.</p>
        {acc?.is_demo && (
          <Button variant="secondary" onClick={async () => { await scan({ data: { id } }); toast.success("Demo phone paired"); onClose(); }}>
            Simulate phone scan (demo)
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
