import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCheck, MessagesSquare, Search, Send, Users } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/PageHeader";
import { AccountPicker } from "@/components/AccountPicker";
import { supabase } from "@/integrations/supabase/client";
import { fetchChats, fetchGroupInfo, fetchMessages, sendFromDashboard } from "@/lib/wa/wa.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/chats")({
  head: () => ({
    meta: [
      { title: "Chats — WhatsApp Agent Hub" },
      { name: "description", content: "Read and reply to WhatsApp conversations and inspect groups." },
      { property: "og:title", content: "Chats — WhatsApp Agent Hub" },
      { property: "og:description", content: "Read and reply to WhatsApp conversations and inspect groups." },
    ],
  }),
  component: ChatsPage,
});

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function ChatsPage() {
  const [accountId, setAccountId] = useState("");
  const [chatId, setChatId] = useState("");
  const [q, setQ] = useState("");
  const [text, setText] = useState("");
  const qc = useQueryClient();
  const chatsFn = useServerFn(fetchChats);
  const msgsFn = useServerFn(fetchMessages);
  const sendFn = useServerFn(sendFromDashboard);
  const groupFn = useServerFn(fetchGroupInfo);

  const chats = useQuery({ queryKey: ["chats", accountId], queryFn: () => chatsFn({ data: { accountId } }), enabled: !!accountId, refetchInterval: 5000 });
  const chat = chats.data?.find((c) => c.id === chatId);
  const msgs = useQuery({ queryKey: ["msgs", accountId, chatId], queryFn: () => msgsFn({ data: { accountId, chatId } }), enabled: !!accountId && !!chatId, refetchInterval: 4000 });
  const group = useQuery({ queryKey: ["group", accountId, chatId], queryFn: () => groupFn({ data: { accountId, jid: chatId } }), enabled: !!chat?.isGroup });
  const contact = useQuery({
    queryKey: ["contact", accountId, chatId],
    enabled: !!chat && !chat.isGroup,
    queryFn: async () => (await supabase.from("contacts").select("*").eq("account_id", accountId).eq("phone", chatId.split("@")[0]).maybeSingle()).data,
  });

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await sendFn({ data: { accountId, chatId, text } });
      setText("");
      toast.success("Message sent");
      qc.invalidateQueries({ queryKey: ["msgs", accountId, chatId] });
      qc.invalidateQueries({ queryKey: ["chats", accountId] });
    } catch (err) { toast.error(err instanceof Error ? err.message : "Send failed"); }
  }

  const list = (chats.data ?? []).filter((c) => (c.name + c.id).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <aside className="flex w-80 shrink-0 flex-col border-r bg-card">
        <div className="space-y-2 border-b p-3">
          <AccountPicker value={accountId} onChange={(v) => { setAccountId(v); setChatId(""); }} />
          <div className="relative"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input className="pl-8" placeholder="Search chats" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {list.map((c) => (
            <button key={c.id} onClick={() => setChatId(c.id)} className={cn("flex w-full gap-3 border-b px-3 py-3 text-left hover:bg-accent", chatId === c.id && "bg-accent")}>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary font-bold">{c.isGroup ? <Users className="size-4" /> : c.name.slice(0, 1)}</span>
              <span className="min-w-0 flex-1">
                <span className="flex justify-between gap-2"><span className="truncate font-semibold">{c.name}</span><span className="text-xs text-muted-foreground">{time(c.lastAt)}</span></span>
                <span className="flex justify-between gap-2"><span className="truncate text-sm text-muted-foreground">{c.lastMessage}</span>{c.unread > 0 && <Badge className="h-5 rounded-full px-1.5">{c.unread}</Badge>}</span>
              </span>
            </button>
          ))}
          {accountId && list.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No conversations. Pair the account first.</p>}
        </div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col bg-muted">
        {!chat ? (
          <div className="m-auto"><EmptyState icon={MessagesSquare} title="Pick a conversation" description="Select a chat on the left to view history and send a test message." /></div>
        ) : (
          <>
            <div className="border-b bg-card px-4 py-3 font-bold">{chat.name} <span className="font-mono text-xs font-normal text-muted-foreground">{chat.id}</span></div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {(msgs.data ?? []).map((m) => (
                <div key={m.id} className={cn("max-w-[70%] rounded-xl px-3 py-2 text-sm shadow-sm", m.fromMe ? "ml-auto bg-bubble-out" : "bg-bubble-in")}>
                  {!m.fromMe && chat.isGroup && <div className="text-xs font-bold text-primary">{m.author}</div>}
                  <div className="whitespace-pre-wrap">{m.body}</div>
                  <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">{time(m.createdAt)}{m.fromMe && (m.status === "sent" ? <Check className="size-3" /> : <CheckCheck className={cn("size-3", m.status === "read" && "text-primary")} />)}</div>
                </div>
              ))}
            </div>
            <form onSubmit={send} className="flex gap-2 border-t bg-card p-3">
              <Input placeholder="Type a message" value={text} onChange={(e) => setText(e.target.value)} />
              <Button aria-label="Send"><Send className="size-4" /></Button>
            </form>
          </>
        )}
      </section>
      {chat && (
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l bg-card p-4 lg:block">
          <h3 className="mb-3 font-bold">{chat.isGroup ? "Group info" : "Contact"}</h3>
          {chat.isGroup ? (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">{group.data?.description}</p>
              <p className="font-semibold">{group.data?.participants.length ?? 0} participants</p>
              {group.data?.participants.map((p) => (
                <div key={p.id} className="flex justify-between"><span>{p.name}</span>{p.admin && <Badge variant="outline">admin</Badge>}</div>
              ))}
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="font-mono">+{chat.id.split("@")[0]}</p>
              <p>{contact.data?.name ?? chat.name}</p>
              <div className="flex flex-wrap gap-1">{contact.data?.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}</div>
              <p className="text-muted-foreground">{contact.data?.notes || "No notes."}</p>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
