import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  KeyRound,
  LogOut,
  MessageCircle,
  MessagesSquare,
  ScrollText,
  Settings,
  Smartphone,
  Users,
  Laptop,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SetupComputerDialog } from "@/components/SetupComputerDialog";
import { useBridgeSettings, useMe } from "@/lib/wa/queries";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: Layout,
});

const NAV = [
  { to: "/accounts", label: "Accounts", icon: Smartphone },
  { to: "/chats", label: "Chats", icon: MessagesSquare },
  { to: "/contacts", label: "Contacts", icon: Users },
  { to: "/agents", label: "Agent Keys", icon: KeyRound },
  { to: "/logs", label: "Audit Logs", icon: ScrollText },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function Layout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: bridge } = useBridgeSettings();
  const { data: me } = useMe();
  const [setupOpen, setSetupOpen] = useState(false);
  const demo = !bridge?.bridge_url;

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-3 font-bold">
            <span className="grid size-8 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <MessageCircle className="size-4" />
            </span>
            Agent Hub
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              {NAV.map((n) => (
                <SidebarMenuItem key={n.to}>
                  <SidebarMenuButton asChild isActive={path.startsWith(n.to)}>
                    <Link to={n.to}>
                      <n.icon />
                      <span>{n.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => setSetupOpen(true)}>
                <Laptop />
                <span>Set up this computer</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => supabase.auth.signOut()}>
                <LogOut />
                <span className="truncate">Sign out {me?.email ? `(${me.email})` : ""}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <main className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b bg-card px-4">
          <SidebarTrigger />
          <div className="flex-1" />
          {demo ? (
            <Badge variant="outline" className="border-warning bg-warning/15 text-warning-foreground">
              Demo mode — no bridge connected
            </Badge>
          ) : (
            <Badge className="bg-success text-success-foreground">Bridge configured</Badge>
          )}
          <Button size="sm" variant="outline" onClick={() => setSetupOpen(true)}>
            <Laptop className="mr-1.5 size-4" /> Set up this computer
          </Button>
        </header>
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
      <SetupComputerDialog open={setupOpen} onOpenChange={setSetupOpen} />
    </SidebarProvider>
  );
}
