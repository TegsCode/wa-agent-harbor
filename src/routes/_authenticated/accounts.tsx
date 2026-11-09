import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
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
  const isDemo = !!acc?.is_demo;
  const [code, setCode] = useState<{ kind: string; value: string } | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState(0);

  const isStarting = /starting up/i.test(err);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const st = await refresh({ data: { id } });
        if (stop) return;
        if (st.status === "connected") { toast.success(`Paired ${st.label}`); onClose(); return; }
        const next = await qr({ data: { id } });
        if (stop) return;
        setCode(next); setFetchedAt(Date.now()); setErr(""); setLoading(false);
      } catch (e) {
        if (!stop) { setErr(e instanceof Error ? e.message : "QR unavailable"); setLoading(false); }
      }
    };
    tick();
    // WhatsApp pairing codes expire in ~20s, so refetch well inside that window.
    // Poll faster while WAHA is still STARTING so the QR appears as soon as it's ready.
    const t = setInterval(tick, isDemo ? 5000 : 3000);
    return () => { stop = true; clearInterval(t); };
  }, [id, isDemo]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{isDemo ? "Demo pairing" : "Scan with WhatsApp"}</DialogTitle></DialogHeader>
        {isDemo ? (
          <>
            <p className="text-sm text-muted-foreground">
              This site is running in <b>demo mode</b> (no WhatsApp bridge connected). A real pairing code only
              exists on a live bridge, so scanning this with your phone would show “Invalid QR code”.
              Use the button below to simulate the scan instead.
            </p>
            <div className="grid place-items-center rounded-xl border-2 border-dashed bg-muted/40 p-6">
              <div className="grid size-64 place-items-center text-center">
                <div>
                  <QrCode className="mx-auto size-12 text-muted-foreground" />
                  <p className="mt-3 max-w-[220px] text-xs text-muted-foreground">
                    Demo placeholder — not a scannable code.
                  </p>
                </div>
              </div>
            </div>
            <Button
              variant="secondary"
              className="w-full"
              onClick={async () => { await scan({ data: { id } }); toast.success("Demo phone paired"); onClose(); }}
            >
              Simulate phone scan (demo)
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              To pair a real number, connect a bridge under Settings → Bridge, then create a new account.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">On your phone: WhatsApp → Settings → Linked Devices → Link a device.</p>
            <div className="grid place-items-center rounded-xl bg-bubble-in p-6">
              {code?.kind === "image" ? <img src={code.value} alt="WhatsApp QR code" className="size-64" /> : <div className="grid size-64 place-items-center rounded-lg bg-muted text-center"><p className="max-w-[220px] text-xs text-muted-foreground">{isStarting ? "Starting WhatsApp session…" : "Loading QR code…"}</p></div>}
            </div>
            {err && !isStarting && <p className="text-sm text-destructive">{err}</p>}
            <p className="text-center text-xs text-muted-foreground">
              {isStarting
                ? "WhatsApp is starting up for the first time — this can take 10–30s. The QR will appear automatically."
                : loading
                  ? "Fetching QR code…"
                  : `Waiting for scan… refreshes automatically (last updated ${new Date(fetchedAt).toLocaleTimeString()}).`}
            </p>
            <p className="text-center text-xs text-muted-foreground">QR expires in about 20 seconds — scan promptly, never use an old screenshot.</p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
