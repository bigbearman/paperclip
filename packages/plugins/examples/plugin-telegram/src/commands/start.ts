import type { TelegramClient } from "../telegram-client.js";
import type { CommandHandler } from "../types.js";

export function createStartHandler(telegram: TelegramClient): CommandHandler {
  return async (ctx) => {
    const message = [
      "<b>Paperclip Telegram Bot</b>",
      "",
      "Available commands:",
      "/task create &lt;title&gt; — Create a new task",
      "/task list — List open tasks",
      "/task assign &lt;id&gt; &lt;agent&gt; — Assign task to agent",
      "/task view &lt;id&gt; — View task details",
      "/status — Task summary",
      "/chat &lt;message&gt; — Chat with AI agent",
      "/stop — Stop active AI session",
      "/notify — Configure notifications",
      "/help — Show this help",
    ].join("\n");

    await telegram.sendMessage(ctx.chatId, message, { parseMode: "HTML" });
  };
}
