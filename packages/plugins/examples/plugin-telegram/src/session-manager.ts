import type { ChatSession } from "./types.js";

interface StateClient {
  get(input: { scopeKind: string; stateKey: string }): Promise<unknown>;
  set(input: { scopeKind: string; stateKey: string }, value: unknown): Promise<void>;
  delete(input: { scopeKind: string; stateKey: string }): Promise<void>;
}

interface AgentSessionsClient {
  create(agentId: string, companyId: string, opts: { reason: string }): Promise<{ sessionId: string }>;
  sendMessage(sessionId: string, companyId: string, opts: {
    prompt: string;
    reason: string;
    onEvent: (event: { eventType: string; stream: string | null; message: string | null; payload: Record<string, unknown> | null }) => void;
  }): Promise<unknown>;
  close(sessionId: string, companyId: string): Promise<void>;
}

interface AgentsClient {
  list(input: { companyId: string; limit: number; offset: number }): Promise<Array<{ id: string; name: string; role?: string }>>;
}

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

function sessionKey(chatId: string): string {
  return `telegram:session:${chatId}`;
}

export function createSessionManager(
  state: StateClient,
  agentSessions: AgentSessionsClient,
  agents: AgentsClient,
  companyId: string,
  chatAgentId?: string,
) {
  const scopeKey = { scopeKind: "instance" as const };

  async function getSession(chatId: string): Promise<ChatSession | null> {
    const raw = await state.get({ ...scopeKey, stateKey: sessionKey(chatId) });
    if (!raw) return null;
    const session = raw as ChatSession;

    const idleMs = Date.now() - new Date(session.lastActiveAt).getTime();
    if (idleMs > SESSION_TIMEOUT_MS) {
      await closeSession(chatId);
      return null;
    }
    return session;
  }

  async function saveSession(session: ChatSession): Promise<void> {
    await state.set({ ...scopeKey, stateKey: sessionKey(session.chatId) }, session as unknown);
  }

  async function closeSession(chatId: string): Promise<void> {
    const existing = await state.get({ ...scopeKey, stateKey: sessionKey(chatId) }) as ChatSession | null;
    if (existing) {
      try {
        await agentSessions.close(existing.agentSessionId, companyId);
      } catch {
        // Session may already be closed
      }
    }
    await state.delete({ ...scopeKey, stateKey: sessionKey(chatId) });
  }

  return {
    getSession,

    async getOrCreate(chatId: string): Promise<ChatSession> {
      const existing = await getSession(chatId);
      if (existing) return existing;

      let agentId = chatAgentId;
      if (!agentId) {
        const allAgents = await agents.list({ companyId, limit: 200, offset: 0 });
        const agent = allAgents.find((a) => a.name === "Chat Assistant")
          ?? allAgents.find((a) => a.role === "general")
          ?? allAgents[0];
        if (!agent) throw new Error("No agent available for chat");
        agentId = agent.id;
      }

      const { sessionId } = await agentSessions.create(agentId, companyId, {
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

    close: closeSession,

    async isBusy(chatId: string): Promise<boolean> {
      const session = await getSession(chatId);
      return session?.status === "busy";
    },
  };
}
