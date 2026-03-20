import type { TelegramClient } from "../telegram-client.js";
import type { CommandHandler } from "../types.js";
import type { createNotifier } from "../notifier.js";

export function createNotifyHandler(
  telegram: TelegramClient,
  notifier: ReturnType<typeof createNotifier>,
): CommandHandler {
  return async (ctx) => {
    const parts = ctx.args.split(/\s+/).filter(Boolean);
    const eventType = parts[0];
    const toggle = parts[1]?.toLowerCase();

    if (!eventType) {
      const subs = await notifier.getSubscriptions(ctx.chatId);
      const lines = Object.entries(subs)
        .map(([type, enabled]) => `  ${enabled ? "✅" : "❌"} ${type}`)
        .join("\n");
      await telegram.sendMessage(
        ctx.chatId,
        `<b>Notification subscriptions:</b>\n\n${lines}\n\nUsage: /notify &lt;event&gt; on|off`,
        { parseMode: "HTML" },
      );
      return;
    }

    if (toggle !== "on" && toggle !== "off") {
      await telegram.sendMessage(ctx.chatId, "Usage: /notify <event> on|off");
      return;
    }

    await notifier.setSubscription(ctx.chatId, eventType, toggle === "on");
    await telegram.sendMessage(
      ctx.chatId,
      `Notification <b>${eventType}</b> ${toggle === "on" ? "enabled ✅" : "disabled ❌"}`,
      { parseMode: "HTML" },
    );
  };
}
