import type { TelegramClient } from "./telegram-client.js";
import type { NotifyPrefs } from "./types.js";
import { escapeHtml } from "./utils/html-escape.js";

const DEBOUNCE_MS = 5000;

interface StateClient {
  get(input: { scopeKind: string; stateKey: string }): Promise<unknown>;
  set(input: { scopeKind: string; stateKey: string }, value: unknown): Promise<void>;
}

interface ConfigClient {
  get(): Promise<unknown>;
}

function notifyKey(chatId: string): string {
  return `telegram:notify:${chatId}`;
}

export function createNotifier(
  telegram: TelegramClient,
  state: StateClient,
  config: ConfigClient,
  allowedChatIds: string[],
) {
  const lastSent = new Map<string, number>();
  const scopeKey = { scopeKind: "instance" as const };

  function isDebounced(eventType: string): boolean {
    const last = lastSent.get(eventType) ?? 0;
    const now = Date.now();
    if (now - last < DEBOUNCE_MS) return true;
    lastSent.set(eventType, now);
    return false;
  }

  async function getPrefs(chatId: string): Promise<NotifyPrefs | null> {
    const raw = await state.get({ ...scopeKey, stateKey: notifyKey(chatId) });
    return (raw as NotifyPrefs) ?? null;
  }

  async function isEnabled(chatId: string, eventType: string): Promise<boolean> {
    const prefs = await getPrefs(chatId);
    if (prefs?.subscriptions[eventType] !== undefined) {
      return prefs.subscriptions[eventType];
    }
    const cfg = (await config.get()) as Record<string, unknown>;
    const defaults = (cfg.defaultNotifications ?? {}) as Record<string, boolean>;
    return defaults[eventType] ?? false;
  }

  function formatEvent(eventType: string, payload: Record<string, unknown>): string {
    switch (eventType) {
      case "issue.created":
        return `📋 <b>Task created:</b> ${escapeHtml(String(payload.title ?? payload.issueId ?? "unknown"))}`;
      case "issue.updated":
        return `📝 <b>Task updated:</b> ${escapeHtml(String(payload.title ?? payload.issueId ?? "unknown"))}`;
      case "agent.run.started":
        return `🤖 <b>Agent started:</b> ${escapeHtml(String(payload.agentName ?? payload.agentId ?? "unknown"))}`;
      case "agent.run.finished":
        return `✅ <b>Agent finished:</b> ${escapeHtml(String(payload.agentName ?? payload.agentId ?? "unknown"))}`;
      case "agent.run.failed":
        return `❌ <b>Agent failed:</b> ${escapeHtml(String(payload.agentName ?? payload.agentId ?? "unknown"))}\n${escapeHtml(String(payload.error ?? ""))}`;
      case "agent.run.cancelled":
        return `⏹ <b>Agent cancelled:</b> ${escapeHtml(String(payload.agentName ?? payload.agentId ?? "unknown"))}`;
      default:
        return `🔔 <b>${escapeHtml(eventType)}:</b> ${escapeHtml(JSON.stringify(payload).slice(0, 200))}`;
    }
  }

  return {
    async notify(eventType: string, payload: Record<string, unknown>): Promise<void> {
      if (isDebounced(eventType)) return;

      const message = formatEvent(eventType, payload);

      for (const chatId of allowedChatIds) {
        const enabled = await isEnabled(chatId, eventType);
        if (!enabled) continue;

        try {
          await telegram.sendMessage(chatId, message, { parseMode: "HTML" });
        } catch {
          // Best effort
        }
      }
    },

    async setSubscription(chatId: string, eventType: string, enabled: boolean): Promise<void> {
      const prefs = (await getPrefs(chatId)) ?? {
        chatId,
        subscriptions: {},
        quietHoursStart: null,
        quietHoursEnd: null,
        timezone: "Asia/Ho_Chi_Minh",
      };
      prefs.subscriptions[eventType] = enabled;
      await state.set({ ...scopeKey, stateKey: notifyKey(chatId) }, prefs as unknown);
    },

    async getSubscriptions(chatId: string): Promise<Record<string, boolean>> {
      const prefs = await getPrefs(chatId);
      const cfg = (await config.get()) as Record<string, unknown>;
      const defaults = (cfg.defaultNotifications ?? {}) as Record<string, boolean>;
      return { ...defaults, ...(prefs?.subscriptions ?? {}) };
    },
  };
}
