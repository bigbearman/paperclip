interface IssuesClient {
  create(input: { companyId: string; title: string; description?: string }): Promise<{ id: string; title: string; status: string }>;
  list(input: { companyId: string; limit: number; offset: number }): Promise<Array<{ id: string; title: string; status: string; assigneeAgentId?: string | null }>>;
  get(id: string, companyId: string): Promise<{ id: string; title: string; status: string; description?: string | null; assigneeAgentId?: string | null } | null>;
  update(id: string, patch: { assigneeAgentId?: string; status?: "backlog" | "todo" | "in_progress" | "in_review" | "done" | "blocked" | "cancelled" }, companyId: string): Promise<{ id: string; assigneeAgentId?: string | null }>;
}

interface AgentsClient {
  list(input: { companyId: string; limit: number; offset: number }): Promise<Array<{ id: string; name: string }>>;
}

export interface Task {
  id: string;
  title: string;
  status: string;
  assigneeAgentId: string | null;
}

export interface TaskDetails extends Task {
  description: string | null;
}

export interface TaskManager {
  create(title: string, description?: string): Promise<{ id: string; title: string }>;
  list(): Promise<Task[]>;
  get(taskId: string): Promise<TaskDetails>;
  assign(taskId: string, agentName: string): Promise<void>;
}

export function createTaskManager(
  issues: IssuesClient,
  agents: AgentsClient,
  companyId: string,
): TaskManager {
  return {
    async create(title, description) {
      const issue = await issues.create({ companyId, title, description });
      return { id: issue.id, title: issue.title };
    },

    async list() {
      const result = await issues.list({ companyId, limit: 50, offset: 0 });
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
      const allAgents = await agents.list({ companyId, limit: 200, offset: 0 });
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

      await issues.update(taskId, { assigneeAgentId: matches[0]!.id }, companyId);
    },
  };
}
