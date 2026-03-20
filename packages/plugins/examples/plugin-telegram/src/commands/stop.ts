import type { TelegramClient } from "../telegram-client.js";
import type { ChatSession, CommandHandler } from "../types.js";

export function createStopHandler(
  telegram: TelegramClient,
  getSession: (chatId: string) => Promise<ChatSession | null>,
  closeSession: (chatId: string) => Promise<void>,
): CommandHandler {
  return async (ctx) => {
    const session = await getSession(ctx.chatId);
    if (!session) {
      await telegram.sendMessage(ctx.chatId, "Hiện không có session nào đang active.");
      return;
    }
    await closeSession(ctx.chatId);
    await telegram.sendMessage(ctx.chatId, "Session đã dừng.");
  };
}
