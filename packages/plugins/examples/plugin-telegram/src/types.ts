// -- Telegram Bot API types (subset) --

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
}

export interface TgMessage {
  message_id: number;
  chat: TgChat;
  from?: TgUser;
  text?: string;
  date: number;
  entities?: TgMessageEntity[];
}

export interface TgChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
}

export interface TgUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export interface TgMessageEntity {
  type: "bot_command" | "mention" | "text_link" | string;
  offset: number;
  length: number;
}

export interface TgApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

// -- Plugin state types --

export interface ChatSession {
  chatId: string;
  companyId: string;
  agentSessionId: string;
  startedAt: string;
  lastActiveAt: string;
  status: "active" | "idle" | "busy";
}

export interface NotifyPrefs {
  chatId: string;
  subscriptions: Record<string, boolean>;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
}

// -- Command handler type --

export interface CommandContext {
  chatId: string;
  text: string;
  args: string;
  messageId: number;
  companyId: string;
}

export type CommandHandler = (ctx: CommandContext) => Promise<void>;
