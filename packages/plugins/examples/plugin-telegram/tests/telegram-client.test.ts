import { describe, expect, it, vi } from "vitest";
import { createTelegramClient } from "../src/telegram-client.js";

function mockHttpFetch(responseBody: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(responseBody),
  });
}

function mockSecrets(token = "test-bot-token") {
  return { resolve: vi.fn().mockResolvedValue(token) };
}

describe("TelegramClient", () => {
  it("sendMessage calls correct URL with params", async () => {
    const fetch = mockHttpFetch({ ok: true, result: { message_id: 1, chat: { id: 123 }, date: 0 } });
    const secrets = mockSecrets();
    const client = createTelegramClient(
      { fetch } as never,
      secrets as never,
      "botToken"
    );

    const msg = await client.sendMessage("123", "hello");

    expect(secrets.resolve).toHaveBeenCalledWith("botToken");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-bot-token/sendMessage",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(msg.message_id).toBe(1);
  });

  it("sendMessage with HTML parse mode", async () => {
    const fetch = mockHttpFetch({ ok: true, result: { message_id: 1, chat: { id: 123 }, date: 0 } });
    const client = createTelegramClient(
      { fetch } as never,
      mockSecrets() as never,
      "botToken"
    );

    await client.sendMessage("123", "<b>bold</b>", { parseMode: "HTML" });

    const body = JSON.parse(fetch.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.parse_mode).toBe("HTML");
  });

  it("retries once on 429 with Retry-After", async () => {
    const retryResponse = {
      ok: false,
      description: "Too Many Requests",
      parameters: { retry_after: 1 },
    };
    const successResponse = {
      ok: true,
      result: { message_id: 2, chat: { id: 123 }, date: 0 },
    };
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, json: () => Promise.resolve(retryResponse) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(successResponse) });

    const client = createTelegramClient(
      { fetch } as never,
      mockSecrets() as never,
      "botToken"
    );

    const msg = await client.sendMessage("123", "retry test");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(msg.message_id).toBe(2);
  });
});
