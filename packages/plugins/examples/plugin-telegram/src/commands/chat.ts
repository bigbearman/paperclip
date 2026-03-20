import type { TelegramClient } from "../telegram-client.js";
import type { CommandHandler } from "../types.js";
import type { createSessionManager } from "../session-manager.js";
import { escapeHtml } from "../utils/html-escape.js";
import { splitMessage } from "../utils/splitter.js";

const EDIT_INTERVAL_MS = 1000;

export function createChatHandler(
  telegram: TelegramClient,
  sessionMgr: ReturnType<typeof createSessionManager>,
): CommandHandler {
  return async (ctx) => {
    if (!ctx.args) {
      await telegram.sendMessage(ctx.chatId, "Usage: /chat <message>");
      return;
    }

    if (await sessionMgr.isBusy(ctx.chatId)) {
      await telegram.sendMessage(ctx.chatId, "Agent đang xử lý. Dùng /stop để hủy.");
      return;
    }

    await sessionMgr.getOrCreate(ctx.chatId);

    const placeholder = await telegram.sendMessage(ctx.chatId, "⏳");
    let accumulated = "";
    let lastEditTime = 0;

    await sessionMgr.sendMessage(
      ctx.chatId,
      ctx.args,
      (text: string) => {
        accumulated += text;
        const now = Date.now();
        if (now - lastEditTime > EDIT_INTERVAL_MS && accumulated.length > 0) {
          lastEditTime = now;
          const preview = accumulated.length > 4000
            ? accumulated.slice(-4000) + "..."
            : accumulated;
          telegram.editMessageText(
            ctx.chatId,
            placeholder.message_id,
            escapeHtml(preview),
            { parseMode: "HTML" },
          ).catch(() => { /* ignore edit failures during streaming */ });
        }
      },
      () => {
        if (accumulated.length === 0) return;
        const chunks = splitMessage(escapeHtml(accumulated));
        telegram.editMessageText(
          ctx.chatId,
          placeholder.message_id,
          chunks[0]!,
          { parseMode: "HTML" },
        ).catch(() => {});
        for (let i = 1; i < chunks.length; i++) {
          telegram.sendMessage(ctx.chatId, chunks[i]!, { parseMode: "HTML" }).catch(() => {});
        }
      },
      (msg: string) => {
        telegram.editMessageText(
          ctx.chatId,
          placeholder.message_id,
          `Error: ${escapeHtml(msg)}`,
        ).catch(() => {});
      },
    );
  };
}
