export type AgentAction = "read" | "send" | "contacts" | "groups";

export const ALL_ACTIONS: AgentAction[] = ["read", "send", "contacts", "groups"];

export interface KeyScope {
  actions: string[];
  account_ids: string[];
  allowed_chats: string[];
  revoked_at: string | null;
}

/** Canonical WhatsApp chat id: group/explicit JIDs kept, phone numbers become `<digits>@c.us`. */
export function normalizeChatId(input: string): string {
  const v = input.trim();
  if (v.includes("@")) return v.toLowerCase();
  return `${v.replace(/\D/g, "")}@c.us`;
}

export function hasAction(key: KeyScope, action: AgentAction): boolean {
  return key.actions.includes(action);
}

export function canUseAccount(key: KeyScope, accountId: string): boolean {
  return key.account_ids.length === 0 || key.account_ids.includes(accountId);
}

export function canUseChat(key: KeyScope, chatId: string): boolean {
  if (key.allowed_chats.length === 0) return true;
  const target = normalizeChatId(chatId);
  return key.allowed_chats.some((c) => normalizeChatId(c) === target);
}

/** Returns an error message, or null when the call is allowed. */
export function checkAccess(
  key: KeyScope,
  opts: { action?: AgentAction; accountId?: string; chatId?: string },
): string | null {
  if (key.revoked_at) return "API key has been revoked";
  if (opts.action && !hasAction(key, opts.action))
    return `This key lacks the '${opts.action}' permission`;
  if (opts.accountId && !canUseAccount(key, opts.accountId))
    return "This key is not allowed to use that account";
  if (opts.chatId && !canUseChat(key, opts.chatId))
    return "This key is not allowed to access that chat";
  return null;
}
