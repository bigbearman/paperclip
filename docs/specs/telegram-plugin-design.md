# Paperclip Telegram Bot Plugin — Design Specification

**Date**: 2026-03-19
**Status**: Draft
**Approach**: Standalone plugin (Approach A)

---

## 1. Overview

Standalone Paperclip plugin that connects a Telegram bot to the Paperclip platform, enabling admins to manage tasks, chat with AI agents, and receive notifications — all from Telegram.

### Target Users

Admin/operators only. Bot responds exclusively in whitelisted Telegram chat IDs configured in plugin settings.

### Core Features

1. **Task management** — create, list, assign tasks via commands
2. **AI chat** — `/chat` opens agent session, text messages parsed for intent
3. **Notifications** — configurable event subscriptions (task lifecycle, agent status)

---

## 2. Architecture

```
┌─────────────┐     webhook POST      ┌──────────────────────────────┐
│  Telegram    │ ───────────────────→  │  Paperclip Host              │
│  Bot API     │                       │  /api/plugins/:id/webhooks/  │
│              │ ←───────────────────  │         telegram-inbound     │
└─────────────┘   ctx.http.fetch()     └──────────┬───────────────────┘
                  (sendMessage,                    │ JSON-RPC
                   editMessage,                    ▼
                   etc.)              ┌──────────────────────────────┐
                                      │  Plugin Worker               │
                                      │  paperclip-telegram          │
                                      │                              │
                                      │  ┌─────────┐ ┌────────────┐ │
                                      │  │ Router   │ │ Notifier   │ │
                                      │  │ (inbound)│ │ (outbound) │ │
                                      │  └────┬────┘ └─────┬──────┘ │
                                      │       │            │         │
                                      │  ┌────▼────────────▼──────┐ │
                                      │  │    Core Services        │ │
                                      │  │  - IntentParser         │ │
                                      │  │  - SessionManager       │ │
                                      │  │  - TaskManager          │ │
                                      │  │  - TelegramClient       │ │
                                      │  └────────────┬───────────┘ │
                                      │               │              │
                                      │  ┌────────────▼───────────┐ │
                                      │  │  Paperclip SDK APIs     │ │
                                      │  │  ctx.agents.sessions    │ │
                                      │  │  ctx.issues / ctx.state │ │
                                      │  │  ctx.events / ctx.http  │ │
                                      │  └────────────────────────┘ │
                                      └──────────────────────────────┘
```

### Components

| Component | Responsibility |
|-----------|---------------|
| **Router** | Parse Telegram Update, route to command handler / intent parser / session manager |
| **Notifier** | Subscribe domain events via `ctx.events.on()`, format and send to Telegram |
| **IntentParser** | Regex matching for clear patterns, AI agent fallback for ambiguous messages |
| **SessionManager** | Manage AI chat sessions (create/resume/stop), stream response → Telegram |
| **TaskManager** | Wrapper around `ctx.issues` for task CRUD + assign |
| **TelegramClient** | Wrapper around `ctx.http.fetch()` for Telegram Bot API calls |

### Context Injection Pattern

All services receive `PluginContext` via constructor injection during `setup()`. The `onWebhook()` lifecycle method does not receive `ctx` directly — it only receives `PluginWebhookInput`. Pattern:

```typescript
let services: Services;

const plugin = definePlugin({
  async setup(ctx) {
    services = createServices(ctx); // inject ctx into all services
    // register events, jobs, etc.
  },
  async onWebhook(input) {
    await services.router.handle(input); // services already have ctx
  },
});
```

### Company Resolution

Each plugin instance serves exactly one company. The `companyId` is provided as a required field in `instanceConfigSchema` and read during `setup()`. All SDK calls use this configured `companyId`. No `/link` command needed — the binding is explicit from plugin config.

---

## 3. Phased Roadmap

### Phase 1: Foundation — Bot skeleton + Webhook + Auth

> Bot receives message from Telegram and replies "pong"

| Step | Description |
|------|-------------|
| 1.1 | Scaffold plugin package (`paperclip-plugin-telegram`) |
| 1.2 | Manifest — declare capabilities: `webhooks.receive`, `http.outbound`, `plugin.state.read/write`, `secrets.read-ref` |
| 1.3 | Plugin config schema — `botToken` (secret ref), `allowedChatIds` (string[]) |
| 1.4 | **TelegramClient** — wrapper `ctx.http.fetch()` for `sendMessage`, `editMessageText`, `deleteMessage`, `setWebhook` |
| 1.5 | **onWebhook handler** — receive Telegram Update, verify chat ID whitelist, reply "pong" |
| 1.6 | Webhook signature verification (Telegram secret token header) |
| 1.7 | **Auto-setup webhook** — call `setWebhook` in `setup()` to register webhook URL with Telegram on plugin start |
| 1.8 | Tests for TelegramClient + webhook handler |

**Exit criteria**: Type anything in Telegram chat → bot replies "pong"

### Phase 2: Commands — `/start`, `/help`, `/stop`

> Bot understands and responds to basic commands

| Step | Description |
|------|-------------|
| 2.1 | **Router** — parse incoming Update → classify: command / text message |
| 2.2 | **CommandHandler** registry — map command string → handler function |
| 2.3 | `/start` — welcome message with available commands |
| 2.4 | `/help` — list all available commands with descriptions |
| 2.5 | `/stop` — stop current AI chat session (if active) |
| 2.6 | Unknown command → reply "Unknown command. Type /help" |
| 2.7 | Tests for Router + each command handler |

**Exit criteria**: `/start`, `/help`, `/stop` → correct responses

### Phase 3: Task Management — `/task create|list|assign`

> Admin creates, views, assigns tasks via Telegram

| Step | Description |
|------|-------------|
| 3.1 | **TaskManager** — wrapper around `ctx.issues` (create, list, update, assign) |
| 3.2 | `/task create <title>` — create issue, reply with issue ID |
| 3.3 | `/task list` — list open tasks (paginated, max 10), Markdown format |
| 3.4 | `/task assign <taskId> <agentName>` — resolve agent by name via `ctx.agents.list()` + name match (error if 0 or >1 match), assign task, reply confirmation |
| 3.5 | `/task view <taskId>` — view task details (title, status, assignee, description) |
| 3.6 | `/status` — summary: total tasks by status, by assignee |
| 3.7 | Message splitting — handle Telegram 4096 char limit |
| 3.8 | Tests for TaskManager + each sub-command |

**Exit criteria**: Full task CRUD via Telegram

### Phase 4: AI Chat + Intent Parsing

> Admin chats with AI and free-text is parsed into actions

| Step | Description |
|------|-------------|
| 4.1 | **SessionManager** — create/resume/close agent sessions via `ctx.agents.sessions` |
| 4.2 | `/chat <message>` — open/resume AI session, send message |
| 4.3 | **Stream → Telegram** — handle `AgentSessionEvent` via `onEvent` callback: `chunk` (stream=stdout) → accumulate text + editMessageText every ~1s; `status` → update indicator; `done` → final edit; `error` → send error message |
| 4.4 | **Response formatter** — thinking (italic), tool calls (code block), tool results, final answer → Telegram HTML (simpler escaping than MarkdownV2 — only escape `<`, `>`, `&`) |
| 4.5 | Long response splitting — split >4096 chars into multiple messages |
| 4.6 | `/stop` integration — cancel running agent session |
| 4.7 | **IntentParser (regex)** — pattern matching for clear intents: "tạo task ...", "assign ... cho ...", "list tasks" |
| 4.8 | **IntentParser (AI fallback)** — dedicated short-lived agent session (not the `/chat` session) with system prompt listing available actions, return structured action result |
| 4.9 | Router update — plain text (not command) → IntentParser → action or AI chat |
| 4.10 | **Busy guard** — if session status is "busy" when new message arrives, reply "Agent đang xử lý. Dùng /stop để hủy." |
| 4.11 | Session timeout — lazy cleanup: check `lastActiveAt` on each incoming message, close if idle >30 min |
| 4.12 | Tests for SessionManager, IntentParser, formatter |

**Exit criteria**: `/chat explain this codebase` → streamed AI response. Type "tạo task fix bug login" → task created.

### Phase 5: Notifications — Subscribe + Deliver

> Admin receives real-time notifications about task/agent events

| Step | Description |
|------|-------------|
| 5.1 | **NotificationConfig** — plugin config schema for subscribable event types with defaults |
| 5.2 | **Notifier** — `ctx.events.on()` subscribe domain events |
| 5.3 | Task events — `issue.created`, `issue.updated` (filter payload for assignment/completion changes) → format message |
| 5.4 | Agent events — `agent.run.started`, `agent.run.finished`, `agent.run.failed`, `agent.run.cancelled` → format message |
| 5.5 | `/notify` command — toggle event types on/off (stored in `ctx.state`) |
| 5.6 | Rate limiting — debounce rapid events (max 1 msg/5s per event type) |
| 5.7 | Quiet hours — optional config for time range to suppress notifications |
| 5.8 | Tests for Notifier + rate limiter |

**Exit criteria**: Task assigned → Telegram notification. `/notify task.created off` → suppressed.

---

## 4. Data Model & State

Plugin uses `ctx.state` (scoped key-value store) — no separate database.

### State Keys

| Key Pattern | Scope | Description | Value Type |
|-------------|-------|-------------|------------|
| `telegram:session:{chatId}` | instance/global | Active AI agent session | `ChatSession` |
| `telegram:notify:{chatId}` | instance/global | Notification preferences | `NotifyPrefs` |

Chat whitelist is handled by `allowedChatIds` in plugin config — no separate `ChatBinding` state needed since companyId is resolved from plugin instance.

### State Key → SDK ScopeKey Mapping

```typescript
// Example: reading a session
ctx.state.get({
  scopeKind: "instance",
  scopeId: "global",
  stateKey: `telegram:session:${chatId}`,
});
```

### Types

```typescript
interface ChatSession {
  chatId: string;
  companyId: string;
  agentSessionId: string;
  startedAt: string;
  lastActiveAt: string;
  status: "active" | "idle" | "busy";
}

interface NotifyPrefs {
  chatId: string;
  /** event type → enabled */
  subscriptions: Record<string, boolean>;
  quietHoursStart: string | null;  // "22:00"
  quietHoursEnd: string | null;    // "07:00"
  timezone: string;                // "Asia/Ho_Chi_Minh"
}
```

### Design Notes

- **No message history stored** — Telegram keeps its own history, plugin only tracks active sessions
- **Session cleanup** — idle >30 min → auto close, delete state key
- **Lightweight** — ~2 keys per chat ID (session + notify prefs)

---

## 5. Webhook Flow & Router Logic

```
Telegram Update (POST)
       │
       ▼
  onWebhook()
       │
       ├─ Verify secret_token header
       ├─ Parse Update object
       ├─ Check chatId ∈ allowedChatIds → reject if not
       │
       ▼
    Router
       │
       ├─ /start, /help, /stop, /chat, /task, /status, /notify
       │     → CommandHandler
       │
       └─ Plain text
             │
             ├─ Active chat session exists?
             │     YES → forward to SessionManager
             │
             └─ NO → IntentParser
                   │
                   ├─ Regex match? → execute action
                   └─ No match → AI fallback
```

### Intent Regex Patterns

```typescript
const INTENT_PATTERNS = [
  { pattern: /^(tạo|create)\s+task\s+(.+)/i, action: "task.create" },
  { pattern: /^assign\s+(\S+)\s+(cho|to)\s+(.+)/i, action: "task.assign" },
  { pattern: /^(list|danh sách)\s+tasks?/i, action: "task.list" },
  { pattern: /^status$/i, action: "status" },
] as const;
```

Regex kept simple — only catch the most obvious patterns. Everything else falls back to AI.

### Telegram Response Strategy

| Scenario | Method |
|----------|--------|
| Short command reply | 1x `sendMessage` |
| Long task list | Split chunks ≤4096 chars, multiple `sendMessage` |
| AI streaming | `sendMessage` placeholder "⏳" → `editMessageText` every ~1s batching chunks → final edit when done |
| Tool call / thinking | Append to same message: `<i>thinking...</i>` → `<code>tool: readFile</code>` → final text |

---

## 6. TelegramClient API Surface

Thin wrapper around `ctx.http.fetch()`. Only methods needed for current phases.

```typescript
interface TelegramClient {
  // Phase 1
  sendMessage(chatId: string, text: string, opts?: {
    parseMode?: "HTML";
    replyToMessageId?: number;
  }): Promise<TgMessage>;

  editMessageText(chatId: string, messageId: number, text: string, opts?: {
    parseMode?: "HTML";
  }): Promise<TgMessage>;

  deleteMessage(chatId: string, messageId: number): Promise<boolean>;

  setWebhook(url: string, secretToken: string): Promise<boolean>;

  // Phase 3
  sendChatAction(chatId: string, action: "typing"): Promise<boolean>;
}

interface TgMessage {
  messageId: number;
  chat: { id: number };
  text?: string;
  date: number;
}
```

### Implementation Notes

- Base URL: `https://api.telegram.org/bot{token}/`
- Bot token resolved each call via `ctx.secrets.resolve()` (capability: `secrets.read-ref`)
- **HTML parse mode** (not MarkdownV2) — only need to escape `<`, `>`, `&`. MarkdownV2 requires escaping 20+ special chars and is a major source of bugs.
- Retry once on 429 respecting `Retry-After` header

### Error Handling

| Error | Behavior |
|-------|----------|
| 400 Bad Request (bad markup, message too long) | Strip HTML tags, retry as plain text |
| 403 Forbidden (bot blocked/kicked) | Log warning, disable chat binding |
| 429 Too Many Requests | Retry once after `Retry-After` seconds |
| Network timeout (>10s) | Log error, skip (best effort delivery) |
| Invalid bot token | Log error on `setup()`, set health to unhealthy |

---

## 7. Manifest & Capabilities

```typescript
const manifest: PaperclipPluginManifestV1 = {
  id: "paperclip-telegram",
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
          "issue.created":      { type: "boolean", default: true },
          "issue.updated":     { type: "boolean", default: true },
          "agent.run.finished": { type: "boolean", default: false },
          "agent.run.failed":  { type: "boolean", default: true },
        },
      },
    },
    required: ["companyId", "botToken", "allowedChatIds"],
  },
};
```

No UI slots — plugin is headless. All interaction via Telegram.

---

## 8. File Structure

```
paperclip-plugin-telegram/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # export manifest + worker
│   ├── manifest.ts           # plugin manifest
│   ├── worker.ts             # definePlugin + setup()
│   ├── types.ts              # shared types
│   ├── telegram-client.ts    # Telegram Bot API wrapper
│   ├── router.ts             # route Update → handler
│   ├── commands/
│   │   ├── start.ts
│   │   ├── help.ts
│   │   ├── stop.ts
│   │   ├── chat.ts
│   │   ├── task.ts
│   │   ├── status.ts
│   │   └── notify.ts
│   ├── intent-parser.ts      # regex + AI fallback
│   ├── session-manager.ts    # AI agent session lifecycle
│   ├── task-manager.ts       # ctx.issues wrapper
│   ├── notifier.ts           # event subscriptions → Telegram
│   └── utils/
│       ├── html-escape.ts    # HTML entity escaping for Telegram
│       └── splitter.ts       # split text ≤4096 chars
```

Each file has one clear responsibility, independently testable.

---

## 9. Constraints & Decisions

| Decision | Rationale |
|----------|-----------|
| Standalone plugin, not extending plugin-chat | plugin-chat value is in UI layer (React/SSE), not reusable for Telegram. Core logic (agent sessions, state) comes from SDK APIs. |
| No UI slots | Admin interacts exclusively via Telegram. Config via Paperclip web UI plugin settings. |
| `ctx.state` only, no database | Lightweight state (~3 keys per chat). No message history needed — Telegram stores its own. |
| Regex before AI for intent parsing | Fast path for obvious patterns, saves agent session costs. AI fallback for ambiguous messages. |
| `editMessageText` for streaming | Telegram has no SSE. Batch chunks and edit message every ~1s for typing effect. |
| Rate limit notifications 1 msg/5s | Telegram rate limits ~30 msg/s per bot. Debounce prevents spam on burst events. |
| Bot token via `ctx.secrets.resolve()` | Resolved fresh each call, never stored in memory. Plugin SDK security best practice. |
| HTML parse mode over MarkdownV2 | MarkdownV2 requires escaping 20+ special chars — major bug source. HTML only needs `<`, `>`, `&` escaped. |
| 1 plugin instance = 1 company | Simplifies companyId resolution — no `/link` command needed. CompanyId from instance info at setup. |
| Lazy session timeout (not cron) | Check `lastActiveAt` on each incoming message. Avoids needing scheduled jobs for simple cleanup. |
| Busy guard on active sessions | Reply "still processing" instead of queuing or canceling. Simplest UX for admin. |
| Dedicated agent session for AI intent fallback | Separate from `/chat` session — short-lived, closes after action resolved. |
| `/task assign` targets agents, not users | SDK `ctx.issues.update()` uses `assigneeAgentId`. Human assignment out of scope for v1. |
