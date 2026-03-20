# Telegram Bot Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Paperclip plugin that connects a Telegram bot for task management, AI chat, and notifications.

**Architecture:** Headless plugin (no UI) using Paperclip webhook ingress for Telegram Updates, `ctx.http.fetch()` for outbound Telegram Bot API calls, `ctx.agents.sessions` for AI chat, `ctx.events` for notifications. All state via `ctx.state`.

**Tech Stack:** TypeScript, Paperclip Plugin SDK (`@paperclipai/plugin-sdk`), Telegram Bot API, vitest

**Spec:** `docs/superpowers/specs/2026-03-19-telegram-plugin-design.md`

**Reference plugin:** `packages/plugins/examples/plugin-kitchen-sink-example/`

---

## File Map

| File | Responsibility | Phase |
|------|---------------|-------|
| `paperclip-plugin-telegram/package.json` | Package config, deps, scripts | 1 |
| `paperclip-plugin-telegram/tsconfig.json` | TypeScript config | 1 |
| `paperclip-plugin-telegram/vitest.config.ts` | Test config | 1 |
| `src/index.ts` | Re-export manifest + worker | 1 |
| `src/manifest.ts` | Plugin manifest with capabilities | 1 |
| `src/types.ts` | Shared types (TgUpdate, TgMessage, ChatSession, NotifyPrefs) | 1 |
| `src/telegram-client.ts` | Telegram Bot API wrapper over ctx.http.fetch() | 1 |
| `src/worker.ts` | definePlugin, setup(), onWebhook() | 1 |
| `src/router.ts` | Route Update → command / text handler | 2 |
| `src/commands/start.ts` | /start handler | 2 |
| `src/commands/help.ts` | /help handler | 2 |
| `src/commands/stop.ts` | /stop handler | 2 |
| `src/commands/task.ts` | /task create\|list\|assign\|view handler | 3 |
| `src/commands/status.ts` | /status handler | 3 |
| `src/task-manager.ts` | ctx.issues wrapper for CRUD + assign | 3 |
| `src/utils/html-escape.ts` | Escape `<`, `>`, `&` for Telegram HTML | 3 |
| `src/utils/splitter.ts` | Split text ≤4096 chars | 3 |
| `src/commands/chat.ts` | /chat handler | 4 |
| `src/session-manager.ts` | AI agent session lifecycle | 4 |
| `src/intent-parser.ts` | Regex + AI fallback intent parsing | 4 |
| `src/commands/notify.ts` | /notify handler | 5 |
| `src/notifier.ts` | Event subscription + Telegram delivery | 5 |
| `tests/telegram-client.test.ts` | TelegramClient unit tests | 1 |
| `tests/webhook.test.ts` | Webhook handler tests | 1 |
| `tests/router.test.ts` | Router unit tests | 2 |
| `tests/commands.test.ts` | Command handler tests | 2-3 |
| `tests/task-manager.test.ts` | TaskManager tests | 3 |
| `tests/splitter.test.ts` | Message splitter tests | 3 |
| `tests/session-manager.test.ts` | SessionManager tests | 4 |
| `tests/intent-parser.test.ts` | IntentParser tests | 4 |
| `tests/notifier.test.ts` | Notifier tests | 5 |

---

## Task 1: Scaffold Plugin Package

**Files:**
- Create: `paperclip-plugin-telegram/package.json`
- Create: `paperclip-plugin-telegram/tsconfig.json`
- Create: `paperclip-plugin-telegram/vitest.config.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@paperclipai/plugin-telegram",
  "version": "0.1.0",
  "description": "Telegram bot plugin for Paperclip — task management, AI chat, notifications",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "paperclipPlugin": {
    "manifest": "./dist/manifest.js",
    "worker": "./dist/worker.js"
  },
  "scripts": {
    "prebuild": "node ../../../../scripts/ensure-plugin-build-deps.mjs",
    "build": "tsc",
    "typecheck": "pnpm --filter @paperclipai/plugin-sdk build && tsc --noEmit",
    "test": "vitest run --config ./vitest.config.ts"
  },
  "dependencies": {
    "@paperclipai/plugin-sdk": "workspace:*",
    "@paperclipai/shared": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.3",
    "vitest": "^3.0.0"
  },
  "license": "MIT"
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  },
  "include": ["src"]
}
```

Check if `tsconfig.base.json` exists at repo root. If not, use standalone config with `target: "ES2022"`, `strict: true`, `esModuleInterop: true`.

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Install dependencies**

Run: `cd paperclip-plugin-telegram && pnpm install`

- [ ] **Step 5: Commit**

```bash
git add paperclip-plugin-telegram/package.json paperclip-plugin-telegram/tsconfig.json paperclip-plugin-telegram/vitest.config.ts
git commit -m "feat(telegram): scaffold plugin package"
```

---

## Task 2: Types + Manifest

**Files:**
- Create: `paperclip-plugin-telegram/src/types.ts`
- Create: `paperclip-plugin-telegram/src/manifest.ts`
- Create: `paperclip-plugin-telegram/src/index.ts`

- [ ] **Step 1: Write failing test for manifest**

Create `paperclip-plugin-telegram/tests/manifest.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import manifest from "../src/manifest.js";

describe("manifest", () => {
  it("has correct plugin id", () => {
    expect(manifest.id).toBe("paperclip-telegram");
  });

  it("declares webhooks.receive capability", () => {
    expect(manifest.capabilities).toContain("webhooks.receive");
  });

  it("declares telegram-inbound webhook endpoint", () => {
    expect(manifest.webhooks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ endpointKey: "telegram-inbound" }),
      ])
    );
  });

  it("requires companyId, botToken, and allowedChatIds in config", () => {
    expect(manifest.instanceConfigSchema?.required).toEqual(
      expect.arrayContaining(["companyId", "botToken", "allowedChatIds"])
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd paperclip-plugin-telegram && pnpm test -- tests/manifest.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create src/types.ts**

```typescript
// -- Telegram Bot API types (subset) --

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
}

export interface TgMessage {
  message_id: number;
  chat: TgChat;
  from?: TgUser;
  text?: string;
  date: number;
  entities?: TgMessageEntity[];
}

export interface TgChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
}

export interface TgUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export interface TgMessageEntity {
  type: "bot_command" | "mention" | "text_link" | string;
  offset: number;
  length: number;
}

export interface TgApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

// -- Plugin state types --

export interface ChatSession {
  chatId: string;
  companyId: string;
  agentSessionId: string;
  startedAt: string;
  lastActiveAt: string;
  status: "active" | "idle" | "busy";
}

export interface NotifyPrefs {
  chatId: string;
  subscriptions: Record<string, boolean>;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
}

// -- Command handler type --

export interface CommandContext {
  chatId: string;
  text: string;
  args: string;
  messageId: number;
  companyId: string;
}

export type CommandHandler = (ctx: CommandContext) => Promise<void>;
```

- [ ] **Step 4: Create src/manifest.ts**

```typescript
import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "paperclip-telegram";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Telegram Bot",
  description: "Telegram bot for task management, AI chat, and notifications",
  author: "Paperclip",
  categories: ["connector"],

  capabilities: [
    "webhooks.receive",
    "http.outbound",
    "plugin.state.read",
    "plugin.state.write",
    "secrets.read-ref",
    "events.subscribe",
    "agents.read",
    "agent.sessions.create",
    "agent.sessions.list",
    "agent.sessions.send",
    "agent.sessions.close",
    "issues.read",
    "issues.create",
    "issues.update",
    "activity.log.write",
  ],

  webhooks: [
    {
      endpointKey: "telegram-inbound",
      displayName: "Telegram Updates",
      description: "Receives Telegram Bot API webhook updates",
    },
  ],

  entrypoints: {
    worker: "./dist/worker.js",
  },

  instanceConfigSchema: {
    type: "object",
    properties: {
      companyId: {
        type: "string",
        title: "Company ID",
        description: "Paperclip company UUID this plugin instance serves",
      },
      botToken: {
        type: "string",
        title: "Bot Token",
        description: "Telegram Bot API token (secret ref)",
        format: "secret",
      },
      allowedChatIds: {
        type: "array",
        items: { type: "string" },
        title: "Allowed Chat IDs",
        description: "Telegram chat IDs allowed to interact with bot",
        default: [],
      },
      defaultNotifications: {
        type: "object",
        title: "Default Notification Settings",
        properties: {
          "issue.created": { type: "boolean", default: true },
          "issue.updated": { type: "boolean", default: true },
          "agent.run.finished": { type: "boolean", default: false },
          "agent.run.failed": { type: "boolean", default: true },
        },
      },
    },
    required: ["companyId", "botToken", "allowedChatIds"],
  },
};

export default manifest;
```

- [ ] **Step 5: Create src/index.ts**

```typescript
export { default as manifest } from "./manifest.js";
export { default as worker } from "./worker.js";
```

Note: `worker.ts` doesn't exist yet — that's Task 4. This file will cause import errors until then. That's expected.

- [ ] **Step 6: Run manifest test**

Run: `cd paperclip-plugin-telegram && pnpm test -- tests/manifest.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add paperclip-plugin-telegram/src/types.ts paperclip-plugin-telegram/src/manifest.ts paperclip-plugin-telegram/src/index.ts paperclip-plugin-telegram/tests/manifest.test.ts
git commit -m "feat(telegram): add types, manifest, and index"
```

---

## Task 3: TelegramClient

**Files:**
- Create: `paperclip-plugin-telegram/src/telegram-client.ts`
- Create: `paperclip-plugin-telegram/src/utils/html-escape.ts`
- Create: `paperclip-plugin-telegram/tests/telegram-client.test.ts`

- [ ] **Step 1: Write failing test for html-escape**

Create `paperclip-plugin-telegram/tests/html-escape.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { escapeHtml } from "../src/utils/html-escape.js";

describe("escapeHtml", () => {
  it("escapes <, >, &", () => {
    expect(escapeHtml("<b>test</b> & 'foo'")).toBe(
      "&lt;b&gt;test&lt;/b&gt; &amp; 'foo'"
    );
  });

  it("returns empty string for empty input", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("passes through safe text unchanged", () => {
    expect(escapeHtml("hello world 123")).toBe("hello world 123");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd paperclip-plugin-telegram && pnpm test -- tests/html-escape.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement html-escape**

Create `paperclip-plugin-telegram/src/utils/html-escape.ts`:

```typescript
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
```

- [ ] **Step 4: Run html-escape test**

Run: `cd paperclip-plugin-telegram && pnpm test -- tests/html-escape.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing test for TelegramClient**

Create `paperclip-plugin-telegram/tests/telegram-client.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { createTelegramClient } from "../src/telegram-client.js";

function mockHttpFetch(responseBody: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(responseBody),
    text: () => Promise.resolve(JSON.stringify(responseBody)),
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

    const body = JSON.parse(fetch.mock.calls[0][1].body as string);
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
      .mockResolvedValueOnce({ ok: false, status: 429, json: () => Promise.resolve(retryResponse), text: () => Promise.resolve(JSON.stringify(retryResponse)) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(successResponse), text: () => Promise.resolve(JSON.stringify(successResponse)) });

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
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd paperclip-plugin-telegram && pnpm test -- tests/telegram-client.test.ts`
Expected: FAIL

- [ ] **Step 7: Implement TelegramClient**

Create `paperclip-plugin-telegram/src/telegram-client.ts`:

```typescript
import type { PluginHttpClient, PluginSecretsClient } from "@paperclipai/plugin-sdk";
import type { TgApiResponse, TgMessage } from "./types.js";

interface SendMessageOpts {
  parseMode?: "HTML";
  replyToMessageId?: number;
}

export interface TelegramClient {
  sendMessage(chatId: string, text: string, opts?: SendMessageOpts): Promise<TgMessage>;
  editMessageText(chatId: string, messageId: number, text: string, opts?: { parseMode?: "HTML" }): Promise<TgMessage>;
  deleteMessage(chatId: string, messageId: number): Promise<boolean>;
  setWebhook(url: string, secretToken: string): Promise<boolean>;
  sendChatAction(chatId: string, action: "typing"): Promise<boolean>;
}

export function createTelegramClient(
  http: PluginHttpClient,
  secrets: PluginSecretsClient,
  botTokenRef: string,
): TelegramClient {
  async function callApi<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const token = await secrets.resolve(botTokenRef);
    const url = `https://api.telegram.org/bot${token}/${method}`;
    const response = await http.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    const data = (await response.json()) as TgApiResponse<T>;

    // Retry once on 429
    if (!response.ok && response.status === 429) {
      const retryAfter = data.parameters?.retry_after ?? 1;
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      const retry = await http.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const retryData = (await retry.json()) as TgApiResponse<T>;
      if (!retryData.ok) {
        throw new Error(`Telegram API ${method} failed after retry: ${retryData.description ?? "unknown"}`);
      }
      return retryData.result as T;
    }

    if (!data.ok) {
      throw new Error(`Telegram API ${method} failed: ${data.description ?? "unknown"} (${data.error_code ?? 0})`);
    }
    return data.result as T;
  }

  return {
    async sendMessage(chatId, text, opts) {
      return callApi<TgMessage>("sendMessage", {
        chat_id: chatId,
        text,
        ...(opts?.parseMode && { parse_mode: opts.parseMode }),
        ...(opts?.replyToMessageId && { reply_to_message_id: opts.replyToMessageId }),
      });
    },

    async editMessageText(chatId, messageId, text, opts) {
      return callApi<TgMessage>("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text,
        ...(opts?.parseMode && { parse_mode: opts.parseMode }),
      });
    },

    async deleteMessage(chatId, messageId) {
      return callApi<boolean>("deleteMessage", {
        chat_id: chatId,
        message_id: messageId,
      });
    },

    async setWebhook(url, secretToken) {
      return callApi<boolean>("setWebhook", {
        url,
        secret_token: secretToken,
      });
    },

    async sendChatAction(chatId, action) {
      return callApi<boolean>("sendChatAction", {
        chat_id: chatId,
        action,
      });
    },
  };
}
```

- [ ] **Step 8: Run tests**

Run: `cd paperclip-plugin-telegram && pnpm test -- tests/telegram-client.test.ts tests/html-escape.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add paperclip-plugin-telegram/src/telegram-client.ts paperclip-plugin-telegram/src/utils/html-escape.ts paperclip-plugin-telegram/tests/telegram-client.test.ts paperclip-plugin-telegram/tests/html-escape.test.ts
git commit -m "feat(telegram): add TelegramClient and HTML escape utility"
```

---

## Task 4: Worker + Webhook Handler

**Files:**
- Create: `paperclip-plugin-telegram/src/worker.ts`
- Create: `paperclip-plugin-telegram/tests/webhook.test.ts`

- [ ] **Step 1: Write failing test for webhook handler**

Create `paperclip-plugin-telegram/tests/webhook.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
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

    // Should not throw, just silently ignore
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

    // No sendMessage should have been called (chat 123 not in allowedChatIds [999])
  });

  it("processes messages from whitelisted chats", async () => {
    const harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities] });
    harness.setConfig({ companyId: "co-1", botToken: "secret:bot-token", allowedChatIds: ["123"] });

    // Mock http.fetch to avoid real Telegram API calls
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, result: { message_id: 1, chat: { id: 123 }, date: 0 } }),
      text: () => Promise.resolve('{"ok":true}'),
    });
    (harness.ctx.http as { fetch: typeof mockFetch }).fetch = mockFetch;

    await plugin.definition.setup(harness.ctx);

    // Should not throw for whitelisted chat
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

    // Verify bot attempted to respond (called Telegram API)
    expect(mockFetch).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd paperclip-plugin-telegram && pnpm test -- tests/webhook.test.ts`
Expected: FAIL — worker module not found

- [ ] **Step 3: Implement worker.ts**

Create `paperclip-plugin-telegram/src/worker.ts`:

```typescript
import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import type { PluginContext, PluginWebhookInput } from "@paperclipai/plugin-sdk";
import { PLUGIN_ID } from "./manifest.js";
import { createTelegramClient, type TelegramClient } from "./telegram-client.js";
import type { TgUpdate } from "./types.js";

interface Services {
  telegram: TelegramClient;
  companyId: string;
  allowedChatIds: Set<string>;
  webhookSecretToken: string | null;
  ctx: PluginContext;
}

let services: Services | null = null;

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info(`${PLUGIN_ID} plugin setup`);

    const config = await ctx.config.get();
    const botTokenRef = (config as Record<string, unknown>).botToken as string;
    const allowedChatIds = (config as Record<string, unknown>).allowedChatIds as string[];
    const companyId = (config as Record<string, unknown>).companyId as string;
    if (!companyId) throw new Error("companyId is required in plugin config");

    const telegram = createTelegramClient(ctx.http, ctx.secrets, botTokenRef);

    // Generate a random secret token for webhook verification
    const webhookSecretToken = crypto.randomUUID();

    services = {
      telegram,
      companyId,
      allowedChatIds: new Set(allowedChatIds),
      webhookSecretToken,
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

    // Verify Telegram secret token header (if configured)
    const secretToken = input.headers["x-telegram-bot-api-secret-token"];
    const expectedToken = services.webhookSecretToken;
    if (expectedToken && secretToken !== expectedToken) {
      services.ctx.logger.warn("Webhook request with invalid secret token");
      return;
    }

    const update = input.parsedBody as TgUpdate;
    if (!update?.message) return; // ignore non-message updates

    const chatId = String(update.message.chat.id);
    if (!services.allowedChatIds.has(chatId)) {
      services.ctx.logger.debug(`Ignoring message from non-whitelisted chat ${chatId}`);
      return;
    }

    // Phase 1: reply "pong" to any message
    // This will be replaced by Router in Task 5
    const text = update.message.text ?? "";
    if (text) {
      await services.telegram.sendMessage(chatId, "pong");
    }
  },

  async onHealth() {
    return { status: services ? "ok" : "error", message: services ? "ready" : "not initialized" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
```

- [ ] **Step 4: Run tests**

Run: `cd paperclip-plugin-telegram && pnpm test -- tests/webhook.test.ts`
Expected: PASS

- [ ] **Step 5: Run all tests so far**

Run: `cd paperclip-plugin-telegram && pnpm test`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add paperclip-plugin-telegram/src/worker.ts paperclip-plugin-telegram/tests/webhook.test.ts
git commit -m "feat(telegram): add worker with webhook handler and chat whitelist"
```

---

## Task 5: Router

**Files:**
- Create: `paperclip-plugin-telegram/src/router.ts`
- Create: `paperclip-plugin-telegram/tests/router.test.ts`
- Modify: `paperclip-plugin-telegram/src/worker.ts` — replace "pong" with router

- [ ] **Step 1: Write failing test for Router**

Create `paperclip-plugin-telegram/tests/router.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { createRouter } from "../src/router.js";

describe("Router", () => {
  it("routes /start to start handler", async () => {
    const startHandler = vi.fn();
    const router = createRouter({ start: startHandler });

    await router.handle({
      chatId: "123",
      messageId: 1,
      text: "/start",
      companyId: "co-1",
    });

    expect(startHandler).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "123", text: "/start", args: "" })
    );
  });

  it("routes /task create foo to task handler with args", async () => {
    const taskHandler = vi.fn();
    const router = createRouter({ task: taskHandler });

    await router.handle({
      chatId: "123",
      messageId: 1,
      text: "/task create fix login bug",
      companyId: "co-1",
    });

    expect(taskHandler).toHaveBeenCalledWith(
      expect.objectContaining({ args: "create fix login bug" })
    );
  });

  it("routes plain text to onText callback", async () => {
    const onText = vi.fn();
    const router = createRouter({}, onText);

    await router.handle({
      chatId: "123",
      messageId: 1,
      text: "hello world",
      companyId: "co-1",
    });

    expect(onText).toHaveBeenCalledWith(
      expect.objectContaining({ text: "hello world" })
    );
  });

  it("replies unknown command for unregistered commands", async () => {
    const onUnknown = vi.fn();
    const router = createRouter({}, undefined, onUnknown);

    await router.handle({
      chatId: "123",
      messageId: 1,
      text: "/foobar",
      companyId: "co-1",
    });

    expect(onUnknown).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd paperclip-plugin-telegram && pnpm test -- tests/router.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement Router**

Create `paperclip-plugin-telegram/src/router.ts`:

```typescript
import type { CommandContext, CommandHandler } from "./types.js";

interface RouterInput {
  chatId: string;
  messageId: number;
  text: string;
  companyId: string;
}

export function createRouter(
  commands: Record<string, CommandHandler>,
  onText?: CommandHandler,
  onUnknownCommand?: CommandHandler,
) {
  return {
    async handle(input: RouterInput): Promise<void> {
      const { chatId, messageId, text, companyId } = input;

      if (text.startsWith("/")) {
        const spaceIdx = text.indexOf(" ");
        const command = (spaceIdx === -1 ? text : text.slice(0, spaceIdx))
          .slice(1) // remove /
          .replace(/@\S+/, ""); // remove @botname suffix
        const args = spaceIdx === -1 ? "" : text.slice(spaceIdx + 1).trim();

        const ctx: CommandContext = { chatId, text, args, messageId, companyId };
        const handler = commands[command];

        if (handler) {
          await handler(ctx);
        } else if (onUnknownCommand) {
          await onUnknownCommand(ctx);
        }
      } else if (onText) {
        await onText({ chatId, text, args: text, messageId, companyId });
      }
    },
  };
}
```

- [ ] **Step 4: Run router test**

Run: `cd paperclip-plugin-telegram && pnpm test -- tests/router.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add paperclip-plugin-telegram/src/router.ts paperclip-plugin-telegram/tests/router.test.ts
git commit -m "feat(telegram): add message router with command parsing"
```

---

## Task 6: Basic Commands — /start, /help, /stop

**Files:**
- Create: `paperclip-plugin-telegram/src/commands/start.ts`
- Create: `paperclip-plugin-telegram/src/commands/help.ts`
- Create: `paperclip-plugin-telegram/src/commands/stop.ts`
- Create: `paperclip-plugin-telegram/tests/commands.test.ts`
- Modify: `paperclip-plugin-telegram/src/worker.ts` — wire router + commands

- [ ] **Step 1: Write failing tests for commands**

Create `paperclip-plugin-telegram/tests/commands.test.ts`:

```typescript
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd paperclip-plugin-telegram && pnpm test -- tests/commands.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement /start**

Create `paperclip-plugin-telegram/src/commands/start.ts`:

```typescript
import type { TelegramClient } from "../telegram-client.js";
import type { CommandHandler } from "../types.js";

export function createStartHandler(telegram: TelegramClient): CommandHandler {
  return async (ctx) => {
    const message = [
      "<b>Paperclip Telegram Bot</b>",
      "",
      "Available commands:",
      "/task create &lt;title&gt; — Create a new task",
      "/task list — List open tasks",
      "/task assign &lt;id&gt; &lt;agent&gt; — Assign task to agent",
      "/task view &lt;id&gt; — View task details",
      "/status — Task summary",
      "/chat &lt;message&gt; — Chat with AI agent",
      "/stop — Stop active AI session",
      "/notify — Configure notifications",
      "/help — Show this help",
    ].join("\n");

    await telegram.sendMessage(ctx.chatId, message, { parseMode: "HTML" });
  };
}
```

- [ ] **Step 4: Implement /help**

Create `paperclip-plugin-telegram/src/commands/help.ts`:

```typescript
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
```

- [ ] **Step 5: Implement /stop**

Create `paperclip-plugin-telegram/src/commands/stop.ts`:

```typescript
import type { TelegramClient } from "../telegram-client.js";
import type { ChatSession, CommandHandler } from "../types.js";

export function createStopHandler(
  telegram: TelegramClient,
  getSession: (chatId: string) => Promise<ChatSession | null>,
  closeSession: (chatId: string) => Promise<void>,
): CommandHandler {
  return async (ctx) => {
    const session = await getSession(ctx.chatId);
    if (!session) {
      await telegram.sendMessage(ctx.chatId, "Hiện không có session nào đang active.");
      return;
    }
    await closeSession(ctx.chatId);
    await telegram.sendMessage(ctx.chatId, "Session đã dừng.");
  };
}
```

- [ ] **Step 6: Run command tests**

Run: `cd paperclip-plugin-telegram && pnpm test -- tests/commands.test.ts`
Expected: PASS

- [ ] **Step 7: Wire router + commands into worker.ts**

Modify `paperclip-plugin-telegram/src/worker.ts` — replace the "pong" reply with router setup. Import createRouter, create command handlers in setup(), and call `router.handle()` in `onWebhook()`.

Key changes:
- In `setup()`: create router with start/help/stop handlers
- In `onWebhook()`: replace `sendMessage("pong")` with `router.handle()`
- Add `onText` handler that replies "Use /help to see commands" (placeholder for Phase 4)
- Add `onUnknownCommand` handler that replies "Unknown command. Use /help"

- [ ] **Step 8: Run all tests**

Run: `cd paperclip-plugin-telegram && pnpm test`
Expected: All PASS

- [ ] **Step 9: Commit**

```bash
git add paperclip-plugin-telegram/src/commands/ paperclip-plugin-telegram/tests/commands.test.ts paperclip-plugin-telegram/src/worker.ts
git commit -m "feat(telegram): add /start, /help, /stop commands with router"
```

---

## Task 7: Message Splitter Utility

**Files:**
- Create: `paperclip-plugin-telegram/src/utils/splitter.ts`
- Create: `paperclip-plugin-telegram/tests/splitter.test.ts`

- [ ] **Step 1: Write failing test**

Create `paperclip-plugin-telegram/tests/splitter.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { splitMessage } from "../src/utils/splitter.js";

describe("splitMessage", () => {
  it("returns single chunk for short message", () => {
    expect(splitMessage("hello", 4096)).toEqual(["hello"]);
  });

  it("splits at newline boundary when possible", () => {
    const line = "x".repeat(2000);
    const text = `${line}\n${line}\n${line}`;
    const chunks = splitMessage(text, 4096);
    expect(chunks.length).toBe(2);
    expect(chunks.every((c) => c.length <= 4096)).toBe(true);
  });

  it("hard splits at limit when no newline found", () => {
    const text = "x".repeat(5000);
    const chunks = splitMessage(text, 4096);
    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBe(4096);
    expect(chunks[1].length).toBe(904);
  });

  it("handles empty string", () => {
    expect(splitMessage("", 4096)).toEqual([""]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd paperclip-plugin-telegram && pnpm test -- tests/splitter.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement splitter**

Create `paperclip-plugin-telegram/src/utils/splitter.ts`:

```typescript
const DEFAULT_LIMIT = 4096;

export function splitMessage(text: string, limit: number = DEFAULT_LIMIT): string[] {
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > limit) {
    // Try to split at last newline within limit
    const slice = remaining.slice(0, limit);
    const lastNewline = slice.lastIndexOf("\n");
    const splitAt = lastNewline > 0 ? lastNewline : limit;

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt === lastNewline ? splitAt + 1 : splitAt);
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}
```

- [ ] **Step 4: Run test**

Run: `cd paperclip-plugin-telegram && pnpm test -- tests/splitter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add paperclip-plugin-telegram/src/utils/splitter.ts paperclip-plugin-telegram/tests/splitter.test.ts
git commit -m "feat(telegram): add message splitter utility for 4096 char limit"
```

---

## Task 8: TaskManager + /task Command

**Files:**
- Create: `paperclip-plugin-telegram/src/task-manager.ts`
- Create: `paperclip-plugin-telegram/src/commands/task.ts`
- Create: `paperclip-plugin-telegram/src/commands/status.ts`
- Create: `paperclip-plugin-telegram/tests/task-manager.test.ts`

- [ ] **Step 1: Write failing test for TaskManager**

Create `paperclip-plugin-telegram/tests/task-manager.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { createTaskManager } from "../src/task-manager.js";

function mockIssuesClient() {
  return {
    // SDK: create(patch, companyId) => Promise<Issue>
    create: vi.fn().mockResolvedValue({ id: "iss-1", title: "Test task", status: "open" }),
    // SDK: list(companyId) => Promise<Issue[]>
    list: vi.fn().mockResolvedValue([
      { id: "iss-1", title: "Task 1", status: "open", assigneeAgentId: null },
      { id: "iss-2", title: "Task 2", status: "in_progress", assigneeAgentId: "agent-1" },
    ]),
    // SDK: get(issueId, companyId) => Promise<Issue | null>
    get: vi.fn().mockResolvedValue({ id: "iss-1", title: "Task 1", status: "open", description: "Details" }),
    // SDK: update(issueId, patch, companyId) => Promise<Issue>
    update: vi.fn().mockResolvedValue({ id: "iss-1", assigneeAgentId: "agent-1" }),
  };
}

function mockAgentsClient() {
  return {
    list: vi.fn().mockResolvedValue([
      { id: "agent-1", name: "CodeBot", role: "general", status: "active" },
      { id: "agent-2", name: "Reviewer", role: "general", status: "active" },
    ]),
  };
}

describe("TaskManager", () => {
  it("creates a task", async () => {
    const issues = mockIssuesClient();
    const tm = createTaskManager(issues as never, mockAgentsClient() as never, "co-1");
    const result = await tm.create("Fix login bug");
    expect(issues.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Fix login bug" }),
      "co-1"
    );
    expect(result.id).toBe("iss-1");
  });

  it("lists tasks", async () => {
    const issues = mockIssuesClient();
    const tm = createTaskManager(issues as never, mockAgentsClient() as never, "co-1");
    const tasks = await tm.list();
    expect(tasks).toHaveLength(2);
  });

  it("assigns task to agent by name", async () => {
    const issues = mockIssuesClient();
    const agents = mockAgentsClient();
    const tm = createTaskManager(issues as never, agents as never, "co-1");
    await tm.assign("iss-1", "CodeBot");
    expect(issues.update).toHaveBeenCalledWith(
      "iss-1",
      expect.objectContaining({ assigneeAgentId: "agent-1" }),
      "co-1"
    );
  });

  it("throws if agent name not found", async () => {
    const tm = createTaskManager(mockIssuesClient() as never, mockAgentsClient() as never, "co-1");
    await expect(tm.assign("iss-1", "NonExistent")).rejects.toThrow("not found");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd paperclip-plugin-telegram && pnpm test -- tests/task-manager.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement TaskManager**

Create `paperclip-plugin-telegram/src/task-manager.ts`:

```typescript
import type { PluginIssuesClient, PluginAgentsClient } from "@paperclipai/plugin-sdk";

export interface TaskManager {
  create(title: string, description?: string): Promise<{ id: string; title: string }>;
  list(): Promise<Array<{ id: string; title: string; status: string; assigneeAgentId: string | null }>>;
  get(taskId: string): Promise<{ id: string; title: string; status: string; description: string | null; assigneeAgentId: string | null }>;
  assign(taskId: string, agentName: string): Promise<void>;
}

export function createTaskManager(
  issues: PluginIssuesClient,
  agents: PluginAgentsClient,
  companyId: string,
): TaskManager {
  return {
    async create(title, description) {
      const issue = await issues.create({ title, description }, companyId);
      return { id: issue.id, title: issue.title };
    },

    async list() {
      const result = await issues.list(companyId);
      return result.map((i) => ({
        id: i.id,
        title: i.title,
        status: i.status,
        assigneeAgentId: i.assigneeAgentId ?? null,
      }));
    },

    async get(taskId) {
      const issue = await issues.get(taskId, companyId);
      if (!issue) throw new Error(`Task "${taskId}" not found`);
      return {
        id: issue.id,
        title: issue.title,
        status: issue.status,
        description: issue.description ?? null,
        assigneeAgentId: issue.assigneeAgentId ?? null,
      };
    },

    async assign(taskId, agentName) {
      const allAgents = await agents.list({ companyId });
      const matches = allAgents.filter(
        (a) => a.name.toLowerCase() === agentName.toLowerCase()
      );

      if (matches.length === 0) {
        const available = allAgents.map((a) => a.name).join(", ");
        throw new Error(`Agent "${agentName}" not found. Available: ${available}`);
      }
      if (matches.length > 1) {
        throw new Error(`Multiple agents match "${agentName}". Be more specific.`);
      }

      await issues.update(taskId, { assigneeAgentId: matches[0].id }, companyId);
    },
  };
}
```

- [ ] **Step 4: Run TaskManager test**

Run: `cd paperclip-plugin-telegram && pnpm test -- tests/task-manager.test.ts`
Expected: PASS

- [ ] **Step 5: Implement /task command handler**

Create `paperclip-plugin-telegram/src/commands/task.ts`:

```typescript
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
          (t, i) => `${i + 1}. <b>${escapeHtml(t.title)}</b>\n   ID: <code>${t.id}</code> | Status: ${t.status}`
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
          ].filter(Boolean).join("\n");
          await telegram.sendMessage(ctx.chatId, msg, { parseMode: "HTML" });
        } catch (err) {
          await telegram.sendMessage(ctx.chatId, `Error: ${(err as Error).message}`);
        }
        break;
      }

      default:
        await telegram.sendMessage(
          ctx.chatId,
          "Usage: /task <create|list|assign|view> [args]"
        );
    }
  };
}
```

- [ ] **Step 6: Implement /status command handler**

Create `paperclip-plugin-telegram/src/commands/status.ts`:

```typescript
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
```

- [ ] **Step 7: Wire /task and /status into worker.ts**

Modify `paperclip-plugin-telegram/src/worker.ts`:
- Import `createTaskManager`, `createTaskHandler`, `createStatusHandler`
- In `setup()`: create TaskManager, add `task` and `status` handlers to router

- [ ] **Step 8: Run all tests**

Run: `cd paperclip-plugin-telegram && pnpm test`
Expected: All PASS

- [ ] **Step 9: Commit**

```bash
git add paperclip-plugin-telegram/src/task-manager.ts paperclip-plugin-telegram/src/commands/task.ts paperclip-plugin-telegram/src/commands/status.ts paperclip-plugin-telegram/tests/task-manager.test.ts paperclip-plugin-telegram/src/worker.ts
git commit -m "feat(telegram): add /task and /status commands with TaskManager"
```

---

## Task 9: SessionManager + /chat Command

**Files:**
- Create: `paperclip-plugin-telegram/src/session-manager.ts`
- Create: `paperclip-plugin-telegram/src/commands/chat.ts`
- Create: `paperclip-plugin-telegram/tests/session-manager.test.ts`

- [ ] **Step 1: Write failing test for SessionManager**

Create `paperclip-plugin-telegram/tests/session-manager.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { createSessionManager } from "../src/session-manager.js";

function mockState() {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn(({ stateKey }: { stateKey: string }) => Promise.resolve(store.get(stateKey) ?? null)),
    set: vi.fn(({ stateKey }: { stateKey: string }, value: unknown) => {
      store.set(stateKey, value);
      return Promise.resolve();
    }),
    delete: vi.fn(({ stateKey }: { stateKey: string }) => {
      store.delete(stateKey);
      return Promise.resolve();
    }),
  };
}

function mockAgentSessions() {
  return {
    create: vi.fn().mockResolvedValue({ sessionId: "sess-1" }),
    sendMessage: vi.fn().mockResolvedValue({ runId: "run-1" }),
    close: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
  };
}

function mockAgents() {
  return {
    list: vi.fn().mockResolvedValue([
      { id: "agent-1", name: "Assistant", adapterType: "claude_local", role: "general", status: "active" },
    ]),
  };
}

describe("SessionManager", () => {
  it("creates new session if none exists", async () => {
    const state = mockState();
    const sessions = mockAgentSessions();
    const agents = mockAgents();
    const sm = createSessionManager(state as never, sessions as never, agents as never, "co-1");

    const session = await sm.getOrCreate("123");
    expect(sessions.create).toHaveBeenCalled();
    expect(session.agentSessionId).toBe("sess-1");
  });

  it("reuses existing active session", async () => {
    const state = mockState();
    const sessions = mockAgentSessions();
    const agents = mockAgents();
    const sm = createSessionManager(state as never, sessions as never, agents as never, "co-1");

    // Create first
    await sm.getOrCreate("123");
    // Second call should not create again
    sessions.create.mockClear();
    await sm.getOrCreate("123");
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it("closes session and cleans up state", async () => {
    const state = mockState();
    const sessions = mockAgentSessions();
    const agents = mockAgents();
    const sm = createSessionManager(state as never, sessions as never, agents as never, "co-1");

    await sm.getOrCreate("123");
    await sm.close("123");
    expect(sessions.close).toHaveBeenCalled();
    expect(state.delete).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd paperclip-plugin-telegram && pnpm test -- tests/session-manager.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement SessionManager**

Create `paperclip-plugin-telegram/src/session-manager.ts`:

```typescript
import type { PluginStateClient, PluginAgentsClient } from "@paperclipai/plugin-sdk";
import type { ChatSession } from "./types.js";

interface AgentSessionsClient {
  create(agentId: string, companyId: string, opts: { reason: string }): Promise<{ sessionId: string }>;
  sendMessage(sessionId: string, companyId: string, opts: {
    prompt: string;
    reason: string;
    onEvent: (event: { eventType: string; stream: string | null; message: string | null; payload: Record<string, unknown> | null }) => void;
  }): Promise<{ runId: string }>;
  close(sessionId: string, companyId: string): Promise<void>;
}

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function sessionKey(chatId: string): string {
  return `telegram:session:${chatId}`;
}

export function createSessionManager(
  state: PluginStateClient,
  agentSessions: AgentSessionsClient,
  agents: PluginAgentsClient,
  companyId: string,
) {
  async function getSession(chatId: string): Promise<ChatSession | null> {
    const raw = await state.get({
      scopeKind: "instance",
      scopeId: "global",
      stateKey: sessionKey(chatId),
    });
    if (!raw) return null;
    const session = raw as ChatSession;

    // Lazy timeout check
    const idleMs = Date.now() - new Date(session.lastActiveAt).getTime();
    if (idleMs > SESSION_TIMEOUT_MS) {
      await close(chatId);
      return null;
    }
    return session;
  }

  async function saveSession(session: ChatSession): Promise<void> {
    await state.set(
      { scopeKind: "instance", scopeId: "global", stateKey: sessionKey(session.chatId) },
      session as unknown,
    );
  }

  async function close(chatId: string): Promise<void> {
    const session = await state.get({
      scopeKind: "instance",
      scopeId: "global",
      stateKey: sessionKey(chatId),
    }) as ChatSession | null;

    if (session) {
      try {
        await agentSessions.close(session.agentSessionId, companyId);
      } catch {
        // Session may already be closed
      }
    }
    await state.delete({
      scopeKind: "instance",
      scopeId: "global",
      stateKey: sessionKey(chatId),
    });
  }

  return {
    getSession,

    async getOrCreate(chatId: string): Promise<ChatSession> {
      const existing = await getSession(chatId);
      if (existing) return existing;

      // Find a suitable agent
      const allAgents = await agents.list({ companyId });
      const agent = allAgents.find((a) => a.name === "Chat Assistant")
        ?? allAgents.find((a) => a.role === "general")
        ?? allAgents[0];

      if (!agent) throw new Error("No agent available for chat");

      const { sessionId } = await agentSessions.create(agent.id, companyId, {
        reason: "Telegram plugin: new chat session",
      });

      const session: ChatSession = {
        chatId,
        companyId,
        agentSessionId: sessionId,
        startedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        status: "active",
      };
      await saveSession(session);
      return session;
    },

    async sendMessage(
      chatId: string,
      prompt: string,
      onChunk: (text: string) => void,
      onDone: () => void,
      onError: (msg: string) => void,
    ): Promise<void> {
      const session = await getSession(chatId);
      if (!session) throw new Error("No active session");

      session.status = "busy";
      session.lastActiveAt = new Date().toISOString();
      await saveSession(session);

      try {
        await agentSessions.sendMessage(session.agentSessionId, companyId, {
          prompt,
          reason: "Telegram plugin: user message",
          onEvent: (event) => {
            if (event.eventType === "chunk" && event.stream === "stdout" && event.message) {
              onChunk(event.message);
            }
            if (event.eventType === "done") {
              onDone();
            }
            if (event.eventType === "error") {
              onError(event.message ?? "Unknown error");
            }
          },
        });
      } finally {
        session.status = "active";
        session.lastActiveAt = new Date().toISOString();
        await saveSession(session);
      }
    },

    close,

    async isBusy(chatId: string): Promise<boolean> {
      const session = await getSession(chatId);
      return session?.status === "busy";
    },
  };
}
```

- [ ] **Step 4: Run SessionManager test**

Run: `cd paperclip-plugin-telegram && pnpm test -- tests/session-manager.test.ts`
Expected: PASS

- [ ] **Step 5: Implement /chat command handler**

Create `paperclip-plugin-telegram/src/commands/chat.ts`:

```typescript
import type { TelegramClient } from "../telegram-client.js";
import type { CommandHandler } from "../types.js";
import type { createSessionManager } from "../session-manager.js";
import { escapeHtml } from "../utils/html-escape.js";
import { splitMessage } from "../utils/splitter.js";

export function createChatHandler(
  telegram: TelegramClient,
  sessionMgr: ReturnType<typeof createSessionManager>,
): CommandHandler {
  return async (ctx) => {
    if (!ctx.args) {
      await telegram.sendMessage(ctx.chatId, "Usage: /chat <message>");
      return;
    }

    if (await sessionMgr.isBusy(ctx.chatId)) {
      await telegram.sendMessage(ctx.chatId, "Agent đang xử lý. Dùng /stop để hủy.");
      return;
    }

    await sessionMgr.getOrCreate(ctx.chatId);

    // Send placeholder
    const placeholder = await telegram.sendMessage(ctx.chatId, "⏳");
    let accumulated = "";
    let lastEditTime = 0;
    const EDIT_INTERVAL_MS = 1000;

    await sessionMgr.sendMessage(
      ctx.chatId,
      ctx.args,
      // onChunk
      (text: string) => {
        accumulated += text;
        const now = Date.now();
        if (now - lastEditTime > EDIT_INTERVAL_MS && accumulated.length > 0) {
          lastEditTime = now;
          const preview = accumulated.length > 4000
            ? accumulated.slice(-4000) + "..."
            : accumulated;
          telegram.editMessageText(
            ctx.chatId,
            placeholder.message_id,
            escapeHtml(preview),
            { parseMode: "HTML" },
          ).catch(() => { /* ignore edit failures during streaming */ });
        }
      },
      // onDone
      () => {
        if (accumulated.length === 0) return;
        const chunks = splitMessage(escapeHtml(accumulated));
        // Edit first chunk into placeholder
        telegram.editMessageText(
          ctx.chatId,
          placeholder.message_id,
          chunks[0],
          { parseMode: "HTML" },
        ).catch(() => {});
        // Send remaining chunks as new messages
        for (let i = 1; i < chunks.length; i++) {
          telegram.sendMessage(ctx.chatId, chunks[i], { parseMode: "HTML" }).catch(() => {});
        }
      },
      // onError
      (msg: string) => {
        telegram.editMessageText(
          ctx.chatId,
          placeholder.message_id,
          `Error: ${escapeHtml(msg)}`,
        ).catch(() => {});
      },
    );
  };
}
```

- [ ] **Step 6: Wire /chat into worker.ts and update /stop**

Modify `paperclip-plugin-telegram/src/worker.ts`:
- Import createSessionManager, createChatHandler
- Create sessionManager in `setup()`
- Add `chat` handler to router
- Update `/stop` handler to use sessionManager.close()
- Add `onText` handler: if session exists → forward to sessionManager, else → IntentParser (placeholder for Task 10)

- [ ] **Step 7: Run all tests**

Run: `cd paperclip-plugin-telegram && pnpm test`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add paperclip-plugin-telegram/src/session-manager.ts paperclip-plugin-telegram/src/commands/chat.ts paperclip-plugin-telegram/tests/session-manager.test.ts paperclip-plugin-telegram/src/worker.ts
git commit -m "feat(telegram): add SessionManager and /chat command with streaming"
```

---

## Task 10: IntentParser

**Files:**
- Create: `paperclip-plugin-telegram/src/intent-parser.ts`
- Create: `paperclip-plugin-telegram/tests/intent-parser.test.ts`
- Modify: `paperclip-plugin-telegram/src/worker.ts` — wire into onText

- [ ] **Step 1: Write failing test**

Create `paperclip-plugin-telegram/tests/intent-parser.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parseIntent } from "../src/intent-parser.js";

describe("parseIntent (regex)", () => {
  it("matches 'tạo task fix login bug'", () => {
    const result = parseIntent("tạo task fix login bug");
    expect(result).toEqual({ action: "task.create", params: { title: "fix login bug" } });
  });

  it("matches 'create task deploy v2'", () => {
    const result = parseIntent("create task deploy v2");
    expect(result).toEqual({ action: "task.create", params: { title: "deploy v2" } });
  });

  it("matches 'assign ISS-1 cho CodeBot'", () => {
    const result = parseIntent("assign ISS-1 cho CodeBot");
    expect(result).toEqual({ action: "task.assign", params: { taskId: "ISS-1", agentName: "CodeBot" } });
  });

  it("matches 'list tasks'", () => {
    const result = parseIntent("list tasks");
    expect(result).toEqual({ action: "task.list", params: {} });
  });

  it("matches 'danh sách task'", () => {
    const result = parseIntent("danh sách task");
    expect(result).toEqual({ action: "task.list", params: {} });
  });

  it("matches 'status'", () => {
    const result = parseIntent("status");
    expect(result).toEqual({ action: "status", params: {} });
  });

  it("returns null for unrecognized text", () => {
    const result = parseIntent("hello how are you");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd paperclip-plugin-telegram && pnpm test -- tests/intent-parser.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement IntentParser**

Create `paperclip-plugin-telegram/src/intent-parser.ts`:

```typescript
export interface ParsedIntent {
  action: string;
  params: Record<string, string>;
}

interface IntentPattern {
  pattern: RegExp;
  action: string;
  extract: (match: RegExpMatchArray) => Record<string, string>;
}

const PATTERNS: IntentPattern[] = [
  {
    pattern: /^(tạo|create)\s+task\s+(.+)/i,
    action: "task.create",
    extract: (m) => ({ title: m[2].trim() }),
  },
  {
    pattern: /^assign\s+(\S+)\s+(cho|to)\s+(.+)/i,
    action: "task.assign",
    extract: (m) => ({ taskId: m[1], agentName: m[3].trim() }),
  },
  {
    pattern: /^(list|danh sách)\s+tasks?/i,
    action: "task.list",
    extract: () => ({}),
  },
  {
    pattern: /^status$/i,
    action: "status",
    extract: () => ({}),
  },
];

export function parseIntent(text: string): ParsedIntent | null {
  for (const { pattern, action, extract } of PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return { action, params: extract(match) };
    }
  }
  return null;
}
```

- [ ] **Step 4: Run test**

Run: `cd paperclip-plugin-telegram && pnpm test -- tests/intent-parser.test.ts`
Expected: PASS

- [ ] **Step 5: Wire IntentParser into worker.ts onText handler**

Modify `paperclip-plugin-telegram/src/worker.ts`:
- Import `parseIntent`
- In `onText` handler:
  1. If active chat session → forward to sessionManager.sendMessage
  2. Else → parseIntent(text)
  3. If intent matched → execute action (task.create → taskManager.create, etc.)
  4. If no match → reply "Không hiểu. Dùng /help để xem commands hoặc /chat để chat với AI."

Note: AI fallback (Phase 4.8 in spec) is deferred — regex-only for now. Can add later by creating a short-lived agent session for ambiguous messages.

- [ ] **Step 6: Run all tests**

Run: `cd paperclip-plugin-telegram && pnpm test`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add paperclip-plugin-telegram/src/intent-parser.ts paperclip-plugin-telegram/tests/intent-parser.test.ts paperclip-plugin-telegram/src/worker.ts
git commit -m "feat(telegram): add intent parser with regex patterns for task commands"
```

---

## Task 11: Notifier + /notify Command

**Files:**
- Create: `paperclip-plugin-telegram/src/notifier.ts`
- Create: `paperclip-plugin-telegram/src/commands/notify.ts`
- Create: `paperclip-plugin-telegram/tests/notifier.test.ts`

- [ ] **Step 1: Write failing test for Notifier**

Create `paperclip-plugin-telegram/tests/notifier.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
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

function mockConfig() {
  return {
    get: vi.fn().mockResolvedValue({
      allowedChatIds: ["123", "456"],
      defaultNotifications: {
        "issue.created": true,
        "issue.updated": true,
        "agent.run.failed": true,
        "agent.run.finished": false,
      },
    }),
  };
}

describe("Notifier", () => {
  it("sends notification to all allowed chats for enabled event", async () => {
    const tg = mockTelegram();
    const notifier = createNotifier(
      tg as never,
      mockState() as never,
      mockConfig() as never,
      ["123", "456"],
    );

    await notifier.notify("issue.created", {
      issueId: "iss-1",
      title: "Bug fix",
    });

    expect(tg.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("respects per-chat subscription overrides", async () => {
    const tg = mockTelegram();
    const state = mockState();
    // Chat 123 disabled issue.created
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

    // Only chat 456 should receive (123 disabled it)
    expect(tg.sendMessage).toHaveBeenCalledTimes(1);
    expect(tg.sendMessage).toHaveBeenCalledWith("456", expect.any(String), expect.anything());
  });

  it("debounces rapid events of same type", async () => {
    const tg = mockTelegram();
    const notifier = createNotifier(tg as never, mockState() as never, mockConfig() as never, ["123"]);

    await notifier.notify("issue.created", { title: "Task 1" });
    await notifier.notify("issue.created", { title: "Task 2" }); // within 5s debounce
    await notifier.notify("issue.created", { title: "Task 3" }); // within 5s debounce

    // Only first should send immediately
    expect(tg.sendMessage).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd paperclip-plugin-telegram && pnpm test -- tests/notifier.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement Notifier**

Create `paperclip-plugin-telegram/src/notifier.ts`:

```typescript
import type { PluginStateClient, PluginConfigClient } from "@paperclipai/plugin-sdk";
import type { TelegramClient } from "./telegram-client.js";
import type { NotifyPrefs } from "./types.js";
import { escapeHtml } from "./utils/html-escape.js";

const DEBOUNCE_MS = 5000;

function notifyKey(chatId: string): string {
  return `telegram:notify:${chatId}`;
}

export function createNotifier(
  telegram: TelegramClient,
  state: PluginStateClient,
  config: PluginConfigClient,
  allowedChatIds: string[],
) {
  // Per-event-type debounce timestamps
  const lastSent = new Map<string, number>();

  function isDebounced(eventType: string): boolean {
    const last = lastSent.get(eventType) ?? 0;
    const now = Date.now();
    if (now - last < DEBOUNCE_MS) return true;
    lastSent.set(eventType, now);
    return false;
  }

  async function getPrefs(chatId: string): Promise<NotifyPrefs | null> {
    const raw = await state.get({
      scopeKind: "instance",
      scopeId: "global",
      stateKey: notifyKey(chatId),
    });
    return (raw as NotifyPrefs) ?? null;
  }

  async function isEnabled(chatId: string, eventType: string): Promise<boolean> {
    const prefs = await getPrefs(chatId);
    if (prefs?.subscriptions[eventType] !== undefined) {
      return prefs.subscriptions[eventType];
    }
    // Fall back to default config
    const cfg = await config.get() as Record<string, unknown>;
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
          // Best effort — don't fail the event handler
        }
      }
    },

    async setSubscription(chatId: string, eventType: string, enabled: boolean): Promise<void> {
      const prefs = await getPrefs(chatId) ?? {
        chatId,
        subscriptions: {},
        quietHoursStart: null,
        quietHoursEnd: null,
        timezone: "Asia/Ho_Chi_Minh",
      };
      prefs.subscriptions[eventType] = enabled;
      await state.set(
        { scopeKind: "instance", scopeId: "global", stateKey: notifyKey(chatId) },
        prefs as unknown,
      );
    },

    async getSubscriptions(chatId: string): Promise<Record<string, boolean>> {
      const prefs = await getPrefs(chatId);
      const cfg = await config.get() as Record<string, unknown>;
      const defaults = (cfg.defaultNotifications ?? {}) as Record<string, boolean>;
      return { ...defaults, ...(prefs?.subscriptions ?? {}) };
    },
  };
}
```

- [ ] **Step 4: Run test**

Run: `cd paperclip-plugin-telegram && pnpm test -- tests/notifier.test.ts`
Expected: PASS

- [ ] **Step 5: Implement /notify command**

Create `paperclip-plugin-telegram/src/commands/notify.ts`:

```typescript
import type { TelegramClient } from "../telegram-client.js";
import type { CommandHandler } from "../types.js";
import type { createNotifier } from "../notifier.js";

export function createNotifyHandler(
  telegram: TelegramClient,
  notifier: ReturnType<typeof createNotifier>,
): CommandHandler {
  return async (ctx) => {
    const parts = ctx.args.split(/\s+/);
    const eventType = parts[0];
    const toggle = parts[1]?.toLowerCase();

    // No args → show current subscriptions
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
```

- [ ] **Step 6: Wire Notifier + /notify into worker.ts**

Modify `paperclip-plugin-telegram/src/worker.ts`:
- Import createNotifier, createNotifyHandler
- In `setup()`: create notifier, add `notify` handler to router
- Subscribe to domain events:

```typescript
const EVENT_TYPES = ["issue.created", "issue.updated", "agent.run.started", "agent.run.finished", "agent.run.failed", "agent.run.cancelled"];

for (const eventType of EVENT_TYPES) {
  ctx.events.on(eventType, async (event) => {
    await notifier.notify(eventType, event.payload ?? {});
  });
}
```

- [ ] **Step 7: Run all tests**

Run: `cd paperclip-plugin-telegram && pnpm test`
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add paperclip-plugin-telegram/src/notifier.ts paperclip-plugin-telegram/src/commands/notify.ts paperclip-plugin-telegram/tests/notifier.test.ts paperclip-plugin-telegram/src/worker.ts
git commit -m "feat(telegram): add Notifier with event subscriptions and /notify command"
```

---

## Task 12: Final Integration + Build Verification

**Files:**
- Modify: `paperclip-plugin-telegram/src/worker.ts` — ensure all components wired
- No new files

- [ ] **Step 1: Run all tests**

Run: `cd paperclip-plugin-telegram && pnpm test`
Expected: All PASS

- [ ] **Step 2: Type check**

Run: `cd paperclip-plugin-telegram && pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Build**

Run: `cd paperclip-plugin-telegram && pnpm build`
Expected: `dist/` directory created with compiled JS files

- [ ] **Step 4: Verify dist output matches manifest entrypoints**

Check: `ls paperclip-plugin-telegram/dist/worker.js paperclip-plugin-telegram/dist/manifest.js`
Expected: Both files exist

- [ ] **Step 5: Commit final state**

```bash
git add -A paperclip-plugin-telegram/
git commit -m "feat(telegram): complete Telegram bot plugin v0.1.0

Implements:
- Webhook handler with chat whitelist
- Commands: /start, /help, /stop, /chat, /task, /status, /notify
- TelegramClient (sendMessage, editMessageText, setWebhook)
- TaskManager (CRUD + assign via ctx.issues)
- SessionManager (AI agent sessions with streaming)
- IntentParser (regex patterns for Vietnamese + English)
- Notifier (event subscriptions with debounce)
- Message splitting for 4096 char limit
- HTML parse mode for safe formatting"
```

---

## Summary

| Task | Component | Tests |
|------|-----------|-------|
| 1 | Package scaffold | — |
| 2 | Types + Manifest | manifest.test.ts |
| 3 | TelegramClient + HTML escape | telegram-client.test.ts, html-escape.test.ts |
| 4 | Worker + Webhook handler | webhook.test.ts |
| 5 | Router | router.test.ts |
| 6 | /start, /help, /stop | commands.test.ts |
| 7 | Message splitter | splitter.test.ts |
| 8 | TaskManager + /task, /status | task-manager.test.ts |
| 9 | SessionManager + /chat | session-manager.test.ts |
| 10 | IntentParser | intent-parser.test.ts |
| 11 | Notifier + /notify | notifier.test.ts |
| 12 | Integration + Build | — |

**Deferred to future iteration:**
- AI fallback for intent parsing (short-lived agent session)
- Quiet hours for notifications
- Webhook auto-setup in `setup()` (needs host URL resolution)
