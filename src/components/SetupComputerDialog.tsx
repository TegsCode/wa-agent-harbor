import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyBlock } from "./CopyBlock";
import { BridgeForm } from "./BridgeForm";
import { COMPOSE_YML } from "@/lib/setup-scripts";
import { DEMO_MODE } from "@/lib/demo-mode";

export function SetupInstructions() {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  // The installers are served as static files (public/install.*) so this one-liner
  // works on GitHub Pages too. On Pages the base path is /wa-agent-harbor.
  const base = DEMO_MODE ? "/wa-agent-harbor" : "";
  const isWin = typeof navigator !== "undefined" && /win/i.test(navigator.platform || navigator.userAgent);
  return (
    <div className="space-y-6">
      <Step n={1} title="Run the bridge on this computer">
        <p className="mb-3 text-sm text-muted-foreground">
          Requires Docker. Starts WAHA (WhatsApp bridge) plus a Cloudflare Tunnel that gives it a public HTTPS URL.
          Open a terminal and paste the one-liner for your OS.
        </p>
        <Tabs defaultValue={isWin ? "win" : "unix"}>
          <TabsList>
            <TabsTrigger value="unix">macOS / Linux</TabsTrigger>
            <TabsTrigger value="win">Windows</TabsTrigger>
            <TabsTrigger value="compose">Docker Compose</TabsTrigger>
          </TabsList>
          <TabsContent value="unix">
            <CopyBlock code={`curl -fsSL ${origin}${base}/install.sh | bash`} />
          </TabsContent>
          <TabsContent value="win">
            <CopyBlock code={`irm ${origin}${base}/install.ps1 | iex`} />
          </TabsContent>
          <TabsContent value="compose">
            <p className="mb-2 text-xs text-muted-foreground">
              Save as docker-compose.yml, create a .env with WAHA_API_KEY=your-secret, then run{" "}
              <code className="font-mono">docker compose up -d</code> and{" "}
              <code className="font-mono">docker compose logs tunnel</code> to find the URL.
            </p>
            <CopyBlock code={COMPOSE_YML} />
          </TabsContent>
        </Tabs>
      </Step>
      <Step n={2} title="Paste the tunnel URL and API key">
        <p className="mb-3 text-sm text-muted-foreground">
          The script prints a <code className="font-mono">https://…trycloudflare.com</code> URL and the API key.
        </p>
        <BridgeForm />
      </Step>
      <Step n={3} title="Connect a WhatsApp number">
        <p className="text-sm text-muted-foreground">
          Once the health dot is green, go to Accounts → Connect Account and scan the QR code.
        </p>
      </Step>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="mb-1 font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function SetupComputerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Set up this computer</DialogTitle>
          <DialogDescription>
            Browsers can't hold a WhatsApp session open forever, so a small bridge runs on your machine.
          </DialogDescription>
        </DialogHeader>
        <SetupInstructions />
      </DialogContent>
    </Dialog>
  );
}
