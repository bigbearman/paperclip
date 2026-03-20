import type { TelegramClient } from "../telegram-client.js";
import type { TaskManager } from "../task-manager.js";
import type { CommandHandler } from "../types.js";
import { escapeHtml } from "../utils/html-escape.js";
import { splitMessage } from "../utils/splitter.js";

export function createTaskHandler(
  telegram: TelegramClient,
  taskManager: TaskManager,
): CommandHandler {
  return async (ctx) => {
    const parts = ctx.args.split(/\s+/);
    const subcommand = parts[0]?.toLowerCase() ?? "";
    const rest = parts.slice(1).join(" ").trim();

    switch (subcommand) {
      case "create": {
        if (!rest) {
          await telegram.sendMessage(ctx.chatId, "Usage: /task create <title>");
          return;
        }
        const task = await taskManager.create(rest);
        await telegram.sendMessage(
          ctx.chatId,
          `Task created: <b>${escapeHtml(task.title)}</b>\nID: <code>${task.id}</code>`,
          { parseMode: "HTML" }
        );
        break;
      }

      case "list": {
        const tasks = await taskManager.list();
        if (tasks.length === 0) {
          await telegram.sendMessage(ctx.chatId, "No open tasks.");
          return;
        }
        const lines = tasks.slice(0, 10).map(
          (t, i) =>
            `${i + 1}. <b>${escapeHtml(t.title)}</b>\n   ID: <code>${t.id}</code> | Status: ${t.status}`
        );
        const text = lines.join("\n\n");
        for (const chunk of splitMessage(text)) {
          await telegram.sendMessage(ctx.chatId, chunk, { parseMode: "HTML" });
        }
        break;
      }

      case "assign": {
        const [taskId, ...agentParts] = rest.split(/\s+/);
        const agentName = agentParts.join(" ");
        if (!taskId || !agentName) {
          await telegram.sendMessage(ctx.chatId, "Usage: /task assign <taskId> <agentName>");
          return;
        }
        try {
          await taskManager.assign(taskId, agentName);
          await telegram.sendMessage(ctx.chatId, `Task ${taskId} assigned to ${escapeHtml(agentName)}.`);
        } catch (err) {
          await telegram.sendMessage(ctx.chatId, `Error: ${(err as Error).message}`);
        }
        break;
      }

      case "view": {
        if (!rest) {
          await telegram.sendMessage(ctx.chatId, "Usage: /task view <taskId>");
          return;
        }
        try {
          const task = await taskManager.get(rest);
          const msg = [
            `<b>${escapeHtml(task.title)}</b>`,
            `ID: <code>${task.id}</code>`,
            `Status: ${task.status}`,
            task.assigneeAgentId ? `Assignee: ${task.assigneeAgentId}` : "Assignee: unassigned",
            task.description ? `\n${escapeHtml(task.description)}` : "",
          ]
            .filter(Boolean)
            .join("\n");
          await telegram.sendMessage(ctx.chatId, msg, { parseMode: "HTML" });
        } catch (err) {
          await telegram.sendMessage(ctx.chatId, `Error: ${(err as Error).message}`);
        }
        break;
      }

      default:
        await telegram.sendMessage(ctx.chatId, "Usage: /task <create|list|assign|view> [args]");
    }
  };
}
