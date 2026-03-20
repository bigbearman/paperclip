import { describe, expect, it, vi } from "vitest";
import { createTaskManager } from "../src/task-manager.js";

function mockIssuesClient() {
  return {
    create: vi.fn().mockResolvedValue({ id: "iss-1", title: "Test task", status: "open" }),
    list: vi.fn().mockResolvedValue([
      { id: "iss-1", title: "Task 1", status: "open", assigneeAgentId: null },
      { id: "iss-2", title: "Task 2", status: "in_progress", assigneeAgentId: "agent-1" },
    ]),
    get: vi.fn().mockResolvedValue({ id: "iss-1", title: "Task 1", status: "open", description: "Details" }),
    update: vi.fn().mockResolvedValue({ id: "iss-1", assigneeAgentId: "agent-1" }),
  };
}

function mockAgentsClient() {
  return {
    list: vi.fn().mockResolvedValue([
      { id: "agent-1", name: "CodeBot" },
      { id: "agent-2", name: "Reviewer" },
    ]),
  };
}

describe("TaskManager", () => {
  it("creates a task", async () => {
    const issues = mockIssuesClient();
    const tm = createTaskManager(issues as never, mockAgentsClient() as never, "co-1");
    const result = await tm.create("Fix login bug");
    expect(issues.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Fix login bug", companyId: "co-1" })
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
