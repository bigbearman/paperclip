import type { TelegramClient } from "../telegram-client.js";
import type { TaskManager } from "../task-manager.js";
import type { CommandHandler } from "../types.js";

export function createStatusHandler(
  telegram: TelegramClient,
  taskManager: TaskManager,
): CommandHandler {
  return async (ctx) => {
    const tasks = await taskManager.list();
    if (tasks.length === 0) {
      await telegram.sendMessage(ctx.chatId, "No tasks found.");
      return;
    }

    const byStatus: Record<string, number> = {};
    const byAssignee: Record<string, number> = {};

    for (const t of tasks) {
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      const assignee = t.assigneeAgentId ?? "unassigned";
      byAssignee[assignee] = (byAssignee[assignee] ?? 0) + 1;
    }

    const statusLines = Object.entries(byStatus)
      .map(([s, c]) => `  ${s}: ${c}`)
      .join("\n");
    const assigneeLines = Object.entries(byAssignee)
      .map(([a, c]) => `  ${a}: ${c}`)
      .join("\n");

    const msg = [
      `<b>Task Summary</b> (${tasks.length} total)`,
      "",
      "<b>By Status:</b>",
      statusLines,
      "",
      "<b>By Assignee:</b>",
      assigneeLines,
    ].join("\n");

    await telegram.sendMessage(ctx.chatId, msg, { parseMode: "HTML" });
  };
}
