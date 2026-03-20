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
    sendMessage: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function mockAgents() {
  return {
    list: vi.fn().mockResolvedValue([
      { id: "agent-1", name: "Assistant", role: "general" },
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

    await sm.getOrCreate("123");
    sessions.create.mockClear();
    await sm.getOrCreate("123");
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it("uses chatAgentId when provided (skips agent list)", async () => {
    const state = mockState();
    const sessions = mockAgentSessions();
    const agents = mockAgents();
    const sm = createSessionManager(state as never, sessions as never, agents as never, "co-1", "fixed-agent-id");

    await sm.getOrCreate("123");
    expect(agents.list).not.toHaveBeenCalled();
    expect(sessions.create).toHaveBeenCalledWith("fixed-agent-id", "co-1", expect.any(Object));
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
