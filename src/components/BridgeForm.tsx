import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { testBridge } from "@/lib/wa/wa.functions";
import { useBridgeSettings, useMe } from "@/lib/wa/queries";
import { cn } from "@/lib/utils";

export function BridgeForm() {
  const { data } = useBridgeSettings();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const test = useServerFn(testBridge);
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [health, setHealth] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) {
      setUrl(data.bridge_url ?? "");
      setKey(data.bridge_api_key ?? "");
    }
  }, [data]);

  async function runTest() {
    setBusy(true);
    try {
      setHealth(await test({ data: { url, key } }));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const { error } = await supabase
      .from("bridge_settings")
      .update({ bridge_url: url.trim() || null, bridge_api_key: key.trim() || null, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success(url.trim() ? "Bridge saved — new accounts will use it" : "Bridge cleared — demo mode on");
    qc.invalidateQueries({ queryKey: ["bridge"] });
  }

  const canEdit = !!me?.isAdmin;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Bridge URL</Label>
          <Input
            placeholder="https://your-tunnel.trycloudflare.com"
            value={url}
            disabled={!canEdit}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Bridge API key</Label>
          <Input type="password" value={key} disabled={!canEdit} onChange={(e) => setKey(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={runTest} disabled={!url || busy}>
          {busy ? "Testing…" : "Test connection"}
        </Button>
        {canEdit && <Button onClick={save}>Save</Button>}
        {!canEdit && <span className="text-xs text-muted-foreground">Only admins can change the bridge.</span>}
        {health && (
          <span className="flex items-center gap-2 text-sm">
            <span className={cn("size-2.5 rounded-full", health.ok ? "bg-success" : "bg-destructive")} />
            {health.message}
          </span>
        )}
      </div>
    </div>
  );
}
