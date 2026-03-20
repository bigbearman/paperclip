import { randomUUID } from "node:crypto";
import {
  definePlugin,
  runWorker,
  type PluginContext,
  type PluginEvent,
  type PluginWebhookInput,
} from "@paperclipai/plugin-sdk";
import { PLUGIN_ID } from "./manifest.js";
import { createTelegramClient, type TelegramClient } from "./telegram-client.js";
import { createRouter } from "./router.js";
import { createStartHandler } from "./commands/start.js";
import { createHelpHandler } from "./commands/help.js";
import { createStopHandler } from "./commands/stop.js";
import { createTaskHandler } from "./commands/task.js";
import { createStatusHandler } from "./commands/status.js";
import { createChatHandler } from "./commands/chat.js";
import { createNotifyHandler } from "./commands/notify.js";
import { createTaskManager } from "./task-manager.js";
import { createSessionManager } from "./session-manager.js";
import { createNotifier } from "./notifier.js";
import { parseIntent } from "./intent-parser.js";
import type { TgUpdate } from "./types.js";

const EVENT_TYPES = [
  "issue.created",
  "issue.updated",
  "agent.run.started",
  "agent.run.finished",
  "agent.run.failed",
  "agent.run.cancelled",
] as const;

interface PluginServices {
  telegram: TelegramClient;
  companyId: string;
  allowedChatIds: Set<string>;
  webhookSecretToken: string;
  router: ReturnType<typeof createRouter>;
  sessionMgr: ReturnType<typeof createSessionManager>;
  taskMgr: ReturnType<typeof createTaskManager>;
  notifier: ReturnType<typeof createNotifier>;
  ctx: PluginContext;
}

let services: PluginServices | null = null;

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info(`${PLUGIN_ID} plugin setup`);

    const config = (await ctx.config.get()) as Record<string, unknown>;
    const botTokenRef = config.botToken as string;
    const allowedChatIds = (config.allowedChatIds as string[]) ?? [];
    const companyId = config.companyId as string;
    const chatAgentId = config.chatAgentId as string | undefined;
    if (!companyId) throw new Error("companyId is required in plugin config");

    const telegram = createTelegramClient(ctx.http, ctx.secrets, botTokenRef);
    const webhookSecretToken = randomUUID();

    const taskMgr = createTaskManager(ctx.issues, ctx.agents, companyId);
    const sessionMgr = createSessionManager(
      ctx.state,
      ctx.agents.sessions,
      ctx.agents,
      companyId,
      chatAgentId,
    );
    const notifier = createNotifier(telegram, ctx.state, ctx.config, allowedChatIds);

    // Build router
    const router = createRouter(
      {
        start: createStartHandler(telegram),
        help: createHelpHandler(telegram),
        stop: createStopHandler(
          telegram,
          (chatId) => sessionMgr.getSession(chatId),
          (chatId) => sessionMgr.close(chatId),
        ),
        task: createTaskHandler(telegram, taskMgr),
        status: createStatusHandler(telegram, taskMgr),
        chat: createChatHandler(telegram, sessionMgr),
        notify: createNotifyHandler(telegram, notifier),
      },
      // onText: intent parse or forward to active session
      async (cmdCtx) => {
        const chatId = cmdCtx.chatId;
        const text = cmdCtx.text;

        const session = await sessionMgr.getSession(chatId);
        if (session) {
          if (session.status === "busy") {
            await telegram.sendMessage(chatId, "Agent đang xử lý. Dùng /stop để hủy.");
            return;
          }
          await sessionMgr.sendMessage(
            chatId,
            text,
            () => {},
            async () => {},
            async (msg) => { await telegram.sendMessage(chatId, `Error: ${msg}`); },
          );
          return;
        }

        const intent = parseIntent(text);
        if (intent) {
          switch (intent.action) {
            case "task.create":
              await createTaskHandler(telegram, taskMgr)({ ...cmdCtx, args: `create ${intent.params.title ?? ""}` });
              break;
            case "task.assign":
              await createTaskHandler(telegram, taskMgr)({ ...cmdCtx, args: `assign ${intent.params.taskId ?? ""} ${intent.params.agentName ?? ""}` });
              break;
            case "task.list":
              await createTaskHandler(telegram, taskMgr)({ ...cmdCtx, args: "list" });
              break;
            case "status":
              await createStatusHandler(telegram, taskMgr)(cmdCtx);
              break;
          }
          return;
        }

        await telegram.sendMessage(
          chatId,
          "Không hiểu. Dùng /help để xem commands hoặc /chat để chat với AI.",
        );
      },
      // onUnknownCommand
      async (cmdCtx) => {
        await telegram.sendMessage(cmdCtx.chatId, "Unknown command. Use /help");
      },
    );

    // Subscribe to domain events
    for (const eventType of EVENT_TYPES) {
      ctx.events.on(eventType, async (event: PluginEvent) => {
        await notifier.notify(eventType, (event.payload ?? {}) as Record<string, unknown>);
      });
    }

    services = {
      telegram,
      companyId,
      allowedChatIds: new Set(allowedChatIds),
      webhookSecretToken,
      router,
      sessionMgr,
      taskMgr,
      notifier,
      ctx,
    };
  },

  async onWebhook(input: PluginWebhookInput) {
    if (input.endpointKey !== "telegram-inbound") {
      throw new Error(`Unsupported webhook endpoint "${input.endpointKey}"`);
    }

    if (!services) {
      throw new Error("Plugin not initialized");
    }

    // Verify Telegram secret token header if present
    const secretToken = input.headers["x-telegram-bot-api-secret-token"];
    const expectedToken = services.webhookSecretToken;
    if (secretToken && expectedToken && secretToken !== expectedToken) {
      services.ctx.logger.warn("Webhook request with invalid secret token");
      return;
    }

    const update = input.parsedBody as TgUpdate;
    if (!update?.message) return;

    const chatId = String(update.message.chat.id);
    if (!services.allowedChatIds.has(chatId)) {
      services.ctx.logger.debug(`Ignoring message from non-whitelisted chat ${chatId}`);
      return;
    }

    const text = update.message.text ?? "";
    if (!text) return;

    await services.router.handle({
      chatId,
      messageId: update.message.message_id,
      text,
      companyId: services.companyId,
    });
  },

  async onHealth() {
    return {
      status: services ? "ok" : "error",
      message: services ? "ready" : "not initialized",
    };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
