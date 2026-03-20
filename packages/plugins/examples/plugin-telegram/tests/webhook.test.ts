import { describe, expect, it, vi } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

describe("onWebhook", () => {
  it("rejects unknown endpoint key", async () => {
    const harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities] });
    harness.setConfig({ companyId: "co-1", botToken: "secret:bot-token", allowedChatIds: ["123"] });
    await plugin.definition.setup(harness.ctx);

    await expect(
      plugin.definition.onWebhook!({
        endpointKey: "unknown",
        headers: {},
        rawBody: "{}",
        parsedBody: {},
        requestId: "req-1",
      })
    ).rejects.toThrow("Unsupported webhook endpoint");
  });

  it("ignores messages from non-whitelisted chats", async () => {
    const harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities] });
    harness.setConfig({ companyId: "co-1", botToken: "secret:bot-token", allowedChatIds: ["999"] });
    await plugin.definition.setup(harness.ctx);

    // Should not throw — just silently ignore
    await plugin.definition.onWebhook!({
      endpointKey: "telegram-inbound",
      headers: {},
      rawBody: JSON.stringify({
        update_id: 1,
        message: { message_id: 1, chat: { id: 123, type: "private" }, text: "hello", date: 0 },
      }),
      parsedBody: {
        update_id: 1,
        message: { message_id: 1, chat: { id: 123, type: "private" }, text: "hello", date: 0 },
      },
      requestId: "req-2",
    });
  });

  it("processes messages from whitelisted chats", async () => {
    const harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities] });
    harness.setConfig({ companyId: "co-1", botToken: "secret:bot-token", allowedChatIds: ["123"] });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, result: { message_id: 1, chat: { id: 123 }, date: 0 } }),
    });
    (harness.ctx.http as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;

    await plugin.definition.setup(harness.ctx);

    await plugin.definition.onWebhook!({
      endpointKey: "telegram-inbound",
      headers: {},
      rawBody: JSON.stringify({
        update_id: 1,
        message: { message_id: 1, chat: { id: 123, type: "private" }, text: "hello", date: 0 },
      }),
      parsedBody: {
        update_id: 1,
        message: { message_id: 1, chat: { id: 123, type: "private" }, text: "hello", date: 0 },
      },
      requestId: "req-3",
    });

    expect(mockFetch).toHaveBeenCalled();
  });
});
