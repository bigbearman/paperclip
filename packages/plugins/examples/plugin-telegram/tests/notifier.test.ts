import { describe, expect, it, vi } from "vitest";
import { createNotifier } from "../src/notifier.js";

function mockState() {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn(({ stateKey }: { stateKey: string }) => Promise.resolve(store.get(stateKey) ?? null)),
    set: vi.fn(({ stateKey }: { stateKey: string }, value: unknown) => {
      store.set(stateKey, value);
      return Promise.resolve();
    }),
  };
}

function mockTelegram() {
  return {
    sendMessage: vi.fn().mockResolvedValue({ message_id: 1, chat: { id: 123 }, date: 0 }),
  };
}

function mockConfig(defaults: Record<string, boolean> = { "issue.created": true, "issue.updated": true, "agent.run.failed": true, "agent.run.finished": false }) {
  return {
    get: vi.fn().mockResolvedValue({ allowedChatIds: ["123", "456"], defaultNotifications: defaults }),
  };
}

describe("Notifier", () => {
  it("sends notification to all allowed chats for enabled event", async () => {
    const tg = mockTelegram();
    const notifier = createNotifier(tg as never, mockState() as never, mockConfig() as never, ["123", "456"]);

    await notifier.notify("issue.created", { issueId: "iss-1", title: "Bug fix" });

    expect(tg.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("respects per-chat subscription overrides", async () => {
    const tg = mockTelegram();
    const state = mockState();
    state.get.mockImplementation(({ stateKey }: { stateKey: string }) => {
      if (stateKey === "telegram:notify:123") {
        return Promise.resolve({
          chatId: "123",
          subscriptions: { "issue.created": false },
          quietHoursStart: null,
          quietHoursEnd: null,
          timezone: "Asia/Ho_Chi_Minh",
        });
      }
      return Promise.resolve(null);
    });

    const notifier = createNotifier(tg as never, state as never, mockConfig() as never, ["123", "456"]);
    await notifier.notify("issue.created", { issueId: "iss-1", title: "Bug" });

    expect(tg.sendMessage).toHaveBeenCalledTimes(1);
    expect(tg.sendMessage).toHaveBeenCalledWith("456", expect.any(String), expect.anything());
  });

  it("debounces rapid events of same type", async () => {
    const tg = mockTelegram();
    const notifier = createNotifier(tg as never, mockState() as never, mockConfig() as never, ["123"]);

    await notifier.notify("issue.created", { title: "Task 1" });
    await notifier.notify("issue.created", { title: "Task 2" });
    await notifier.notify("issue.created", { title: "Task 3" });

    // Only first should send immediately
    expect(tg.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("does not send for disabled event type", async () => {
    const tg = mockTelegram();
    const notifier = createNotifier(tg as never, mockState() as never, mockConfig() as never, ["123"]);

    await notifier.notify("agent.run.finished", { agentName: "Bot" });

    expect(tg.sendMessage).not.toHaveBeenCalled();
  });
});
