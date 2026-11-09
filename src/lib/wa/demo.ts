// Realistic demo fixtures used when no bridge is connected.
export const DEMO_CONTACTS = [
  { phone: "14155550123", name: "Maya Chen", tags: ["vip", "lead"], notes: "Interested in annual plan." },
  { phone: "447700900456", name: "Oliver Brooks", tags: ["customer"], notes: "Prefers mornings (UK)." },
  { phone: "5511987650001", name: "Lucas Andrade", tags: ["support"], notes: "" },
  { phone: "919812345678", name: "Priya Nair", tags: ["partner"], notes: "Reseller in Bangalore." },
  { phone: "33612345678", name: "Camille Durand", tags: ["lead"], notes: "" },
];

const THREADS: Record<string, [boolean, string][]> = {
  "14155550123": [
    [false, "Hi! Saw your pricing page — is there a discount for annual billing?"],
    [true, "Hey Maya! Yes, annual plans get 2 months free."],
    [false, "Perfect. Can you send me an invoice for 12 seats?"],
  ],
  "447700900456": [
    [false, "Morning, my order #4821 hasn't arrived yet."],
    [true, "Sorry about that Oliver — checking with the courier now."],
    [true, "It's out for delivery today before 6pm 🚚"],
    [false, "Brilliant, thanks!"],
  ],
  "5511987650001": [[false, "O app está pedindo para atualizar, é seguro?"]],
  "919812345678": [
    [true, "Hi Priya, the new partner deck is ready."],
    [false, "Great, can we review it Thursday?"],
  ],
  "33612345678": [[false, "Bonjour, do you ship to Lyon?"]],
};

export const DEMO_GROUPS = [
  {
    jid: "120363041234567890@g.us",
    name: "Sales Team 🚀",
    description: "Daily pipeline sync",
    participants: [
      { id: "14155550123@c.us", name: "Maya Chen", admin: false },
      { id: "919812345678@c.us", name: "Priya Nair", admin: true },
      { id: "me", name: "You", admin: true },
    ],
    messages: [
      ["Priya Nair", "Closed 3 deals today 🎉"],
      ["Maya Chen", "Nice! Sending the invoice request your way."],
    ] as [string, string][],
  },
  {
    jid: "120363049876543210@g.us",
    name: "Support Escalations",
    description: "Urgent tickets only",
    participants: [
      { id: "447700900456@c.us", name: "Oliver Brooks", admin: false },
      { id: "5511987650001@c.us", name: "Lucas Andrade", admin: false },
      { id: "me", name: "You", admin: true },
    ],
    messages: [["Lucas Andrade", "Ticket #991 needs a refund approval."]] as [string, string][],
  },
];

export function demoPhone(): string {
  return `1555${Math.floor(1000000 + Math.random() * 8999999)}`;
}

export function buildDemoSeed(accountId: string) {
  const now = Date.now();
  let t = now - 1000 * 60 * 60 * 6;
  const messages: {
    account_id: string;
    chat_id: string;
    chat_name: string;
    is_group: boolean;
    from_me: boolean;
    author: string | null;
    body: string;
    status: string;
    is_read: boolean;
    created_at: string;
  }[] = [];
  for (const c of DEMO_CONTACTS) {
    const thread = THREADS[c.phone] ?? [];
    thread.forEach(([fromMe, body], i) => {
      t += 1000 * 60 * (5 + Math.random() * 30);
      messages.push({
        account_id: accountId,
        chat_id: `${c.phone}@c.us`,
        chat_name: c.name,
        is_group: false,
        from_me: fromMe,
        author: fromMe ? null : c.name,
        body,
        status: fromMe ? "read" : "delivered",
        is_read: fromMe || i < thread.length - 1,
        created_at: new Date(Math.min(t, now)).toISOString(),
      });
    });
  }
  for (const g of DEMO_GROUPS) {
    for (const [author, body] of g.messages) {
      t += 1000 * 60 * 7;
      messages.push({
        account_id: accountId,
        chat_id: g.jid,
        chat_name: g.name,
        is_group: true,
        from_me: false,
        author,
        body,
        status: "delivered",
        is_read: false,
        created_at: new Date(Math.min(t, now)).toISOString(),
      });
    }
  }
  return {
    contacts: DEMO_CONTACTS.map((c) => ({ ...c, account_id: accountId })),
    groups: DEMO_GROUPS.map((g) => ({
      account_id: accountId,
      jid: g.jid,
      name: g.name,
      description: g.description,
      participants: g.participants,
    })),
    messages,
  };
}
