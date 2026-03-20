import type { TelegramClient } from "../telegram-client.js";
import type { CommandHandler } from "../types.js";

export function createHelpHandler(telegram: TelegramClient): CommandHandler {
  return async (ctx) => {
    const message = [
      "<b>Commands:</b>",
      "",
      "/task create &lt;title&gt; — Create a new task",
      "/task list — List open tasks",
      "/task assign &lt;taskId&gt; &lt;agentName&gt; — Assign task",
      "/task view &lt;taskId&gt; — View task details",
      "/status — Summary of tasks by status/assignee",
      "/chat &lt;message&gt; — Start/resume AI chat",
      "/stop — Stop active AI session",
      "/notify &lt;event&gt; on|off — Toggle notifications",
      "/help — Show this help",
    ].join("\n");

    await telegram.sendMessage(ctx.chatId, message, { parseMode: "HTML" });
  };
}
