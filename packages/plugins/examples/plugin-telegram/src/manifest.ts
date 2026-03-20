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
      chatAgentId: {
        type: "string",
        title: "Chat Agent ID",
        description: "Agent ID to use for AI chat sessions (avoids heuristic selection)",
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
