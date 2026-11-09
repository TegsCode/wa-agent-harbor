import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { DEMO_MODE } from "@/lib/demo-mode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — WhatsApp Agent Hub" },
      { name: "description", content: "Sign in to manage your team's WhatsApp numbers and AI agents." },
      { property: "og:title", content: "Sign in — WhatsApp Agent Hub" },
      { property: "og:description", content: "Sign in to manage your team's WhatsApp numbers and AI agents." },
    ],
  }),
  component: AuthPage,
});

function friendly(msg: string) {
  if (/database error|not been invited/i.test(msg))
    return "This email hasn't been invited yet. Ask a team admin to invite you.";
  return msg;
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState(DEMO_MODE ? "demo@wa-agent-hub.app" : "");
  const [password, setPassword] = useState(DEMO_MODE ? "demo1234" : "");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/accounts" });
    });
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      if (e === "SIGNED_IN" && s) navigate({ to: "/accounts" });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) setSent(true);
      }
    } catch (err) {
      toast.error(friendly(err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) toast.error(friendly(result.error.message ?? "Google sign-in failed"));
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2 text-lg font-bold">
          <span className="grid size-9 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <MessageCircle className="size-5" />
          </span>
          WhatsApp Agent Hub
        </div>
        <div className="space-y-4">
          <h1 className="text-4xl font-extrabold leading-tight text-sidebar-accent-foreground">
            Every WhatsApp number.
            <br />
            One gateway for your AI agents.
          </h1>
          <p className="max-w-md text-sidebar-foreground/70">
            Pair numbers by QR, read and reply from one inbox, and hand Claude, Cursor or your own bots
            scoped keys over MCP and REST.
          </p>
        </div>
        <p className="font-mono text-xs text-sidebar-foreground/50">mcp · rest · audit logs</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div>
            <h2 className="text-2xl font-bold">{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
            <p className="text-sm text-muted-foreground">
              {mode === "signin"
                ? "Sign in to your team workspace."
                : "The first person to sign up becomes admin. Others need an invite."}
            </p>
          </div>
          {DEMO_MODE && (
            <div className="rounded-lg border border-primary/30 bg-accent p-3 text-xs leading-relaxed">
              <b>Static demo.</b> Any email plus a password of 6+ characters signs you in — the fields are
              pre-filled. Accounts, chats, keys and settings are stored in this browser only; no server, no
              WhatsApp connection.
            </div>
          )}
          {sent ? (
            <div className="rounded-lg border bg-accent p-4 text-sm">
              Check <b>{email}</b> for a confirmation link, then come back to sign in.
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button className="w-full" disabled={busy}>
                {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
              </Button>
            </form>
          )}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div>
          <button
            type="button"
            onClick={google}
            className="flex h-10 w-full items-center justify-center gap-2.5 rounded-md border border-[#747775] bg-[#FFFFFF] px-3 text-sm font-medium text-[#1F1F1F]"
          >
            <svg aria-hidden="true" width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
            Continue with Google
          </button>
          <p className="text-center text-sm text-muted-foreground">
            {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
            <button
              className="font-semibold text-primary underline-offset-4 hover:underline"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setSent(false);
              }}
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
