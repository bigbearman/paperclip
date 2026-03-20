import type { TgApiResponse, TgMessage } from "./types.js";

interface HttpClient {
  fetch(url: string, opts: { method: string; headers: Record<string, string>; body: string }): Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
}

interface SecretsClient {
  resolve(ref: string): Promise<string>;
}

interface SendMessageOpts {
  parseMode?: "HTML";
  replyToMessageId?: number;
}

export interface TelegramClient {
  sendMessage(chatId: string, text: string, opts?: SendMessageOpts): Promise<TgMessage>;
  editMessageText(chatId: string, messageId: number, text: string, opts?: { parseMode?: "HTML" }): Promise<TgMessage>;
  deleteMessage(chatId: string, messageId: number): Promise<boolean>;
  setWebhook(url: string, secretToken: string): Promise<boolean>;
  sendChatAction(chatId: string, action: "typing"): Promise<boolean>;
}

export function createTelegramClient(
  http: HttpClient,
  secrets: SecretsClient,
  botTokenRef: string,
): TelegramClient {
  async function callApi<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const token = await secrets.resolve(botTokenRef);
    const url = `https://api.telegram.org/bot${token}/${method}`;
    const response = await http.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    const data = (await response.json()) as TgApiResponse<T>;

    // Retry once on 429
    if (!response.ok && response.status === 429) {
      const retryAfter = data.parameters?.retry_after ?? 1;
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      const retry = await http.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const retryData = (await retry.json()) as TgApiResponse<T>;
      if (!retryData.ok) {
        throw new Error(`Telegram API ${method} failed after retry: ${retryData.description ?? "unknown"}`);
      }
      return retryData.result as T;
    }

    if (!data.ok) {
      throw new Error(`Telegram API ${method} failed: ${data.description ?? "unknown"} (${data.error_code ?? 0})`);
    }
    return data.result as T;
  }

  return {
    async sendMessage(chatId, text, opts) {
      return callApi<TgMessage>("sendMessage", {
        chat_id: chatId,
        text,
        ...(opts?.parseMode && { parse_mode: opts.parseMode }),
        ...(opts?.replyToMessageId && { reply_to_message_id: opts.replyToMessageId }),
      });
    },

    async editMessageText(chatId, messageId, text, opts) {
      return callApi<TgMessage>("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text,
        ...(opts?.parseMode && { parse_mode: opts.parseMode }),
      });
    },

    async deleteMessage(chatId, messageId) {
      return callApi<boolean>("deleteMessage", {
        chat_id: chatId,
        message_id: messageId,
      });
    },

    async setWebhook(url, secretToken) {
      return callApi<boolean>("setWebhook", {
        url,
        secret_token: secretToken,
      });
    },

    async sendChatAction(chatId, action) {
      return callApi<boolean>("sendChatAction", {
        chat_id: chatId,
        action,
      });
    },
  };
}
