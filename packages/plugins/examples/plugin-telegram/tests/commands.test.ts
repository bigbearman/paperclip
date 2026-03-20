import { describe, expect, it, vi } from "vitest";
import { createStartHandler } from "../src/commands/start.js";
import { createHelpHandler } from "../src/commands/help.js";
import { createStopHandler } from "../src/commands/stop.js";
import type { TelegramClient } from "../src/telegram-client.js";

function mockTelegram(): TelegramClient {
  return {
    sendMessage: vi.fn().mockResolvedValue({ message_id: 1, chat: { id: 123 }, date: 0 }),
    editMessageText: vi.fn().mockResolvedValue({ message_id: 1, chat: { id: 123 }, date: 0 }),
    deleteMessage: vi.fn().mockResolvedValue(true),
    setWebhook: vi.fn().mockResolvedValue(true),
    sendChatAction: vi.fn().mockResolvedValue(true),
  };
}

describe("/start", () => {
  it("sends welcome message", async () => {
    const tg = mockTelegram();
    const handler = createStartHandler(tg);
    await handler({ chatId: "123", text: "/start", args: "", messageId: 1, companyId: "co-1" });

    expect(tg.sendMessage).toHaveBeenCalledWith(
      "123",
      expect.stringContaining("Paperclip Telegram Bot"),
      expect.objectContaining({ parseMode: "HTML" })
    );
  });
});

describe("/help", () => {
  it("lists available commands", async () => {
    const tg = mockTelegram();
    const handler = createHelpHandler(tg);
    await handler({ chatId: "123", text: "/help", args: "", messageId: 1, companyId: "co-1" });

    const message = (tg.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(message).toContain("/task");
    expect(message).toContain("/chat");
    expect(message).toContain("/status");
  });
});

describe("/stop", () => {
  it("replies no active session when none exists", async () => {
    const tg = mockTelegram();
    const getSession = vi.fn().mockResolvedValue(null);
    const handler = createStopHandler(tg, getSession, vi.fn());
    await handler({ chatId: "123", text: "/stop", args: "", messageId: 1, companyId: "co-1" });

    expect(tg.sendMessage).toHaveBeenCalledWith(
      "123",
      expect.stringContaining("không có session")
    );
  });

  it("closes session if one exists", async () => {
    const tg = mockTelegram();
    const session = { chatId: "123", companyId: "co-1", agentSessionId: "sess-1", startedAt: "", lastActiveAt: "", status: "active" as const };
    const getSession = vi.fn().mockResolvedValue(session);
    const closeSession = vi.fn().mockResolvedValue(undefined);
    const handler = createStopHandler(tg, getSession, closeSession);
    await handler({ chatId: "123", text: "/stop", args: "", messageId: 1, companyId: "co-1" });

    expect(closeSession).toHaveBeenCalledWith("123");
    expect(tg.sendMessage).toHaveBeenCalledWith("123", expect.stringContaining("dừng"));
  });
});
